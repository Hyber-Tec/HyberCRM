#!/usr/bin/env node
/**
 * Publishing the phone app, one command per store (docs/publishing.md explains every step around them):
 *
 *   npm run publish:iphone     builds the App Store version of Hyber CRM, signed by HyberTec LLC's Apple team, and
 *                              uploads it to App Store Connect (TestFlight, then the App Store)
 *   npm run publish:android    builds the Google Play version (an Android App Bundle), signed with the upload key made
 *                              here the first time, and uploads it to a Google Play track
 *
 * Options, after `--` (npm run publish:android -- --track production):
 *   --dry-run          build and sign, but upload nothing (ends with "Ready to upload" and where the file is)
 *   --no-bump          keep the build number in mobile/release.json as it is (every upload normally raises it by one)
 *   --version 1.1.0    set the version people see (mobile/release.json) as well; Apple needs a new one per App Store release
 *   --track internal|closed|production   Android: which Google Play track gets the bundle (internal unless said)
 *   --draft            Android: leave the release as a draft in the Play Console instead of rolling it out (Google
 *                      takes only drafts until the app's first release has been published)
 *
 * What the commands need, in mobile/.publish/ (git-ignored; back the folder up, it holds keys nothing can replace):
 *   AuthKey_<KEY ID>.p8 and appstore.json { "keyId", "issuerId", "appleId" }   an App Store Connect API key, and the
 *                                                                            app's numeric Apple ID (docs/publishing.md, part 1)
 *   upload.keystore and keystore.json                                          Google Play's upload key: made here on the first Android run
 *   play-service-account.json                                                  a Google Cloud service account allowed to publish
 *                                                                            in the Play Console (docs/publishing.md, part 4)
 *
 * The native project is prepared by scripts/phone.mjs (`prepare`), exactly as for a phone: the same packages,
 * Firebase files, team and fingerprint. Logs go to mobile/.expo/logs/ as the phone commands' do.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobile = path.join(root, "mobile");
const bin = (name) => path.join(mobile, "node_modules", ".bin", name);
const stateDir = path.join(mobile, ".expo");
const logDir = path.join(stateDir, "logs");
/** What each command builds, kept where the native project's regeneration can't remove it. */
const buildDir = path.join(stateDir, "publish");
/** The keys and passwords only this Mac holds (git-ignored). */
const secrets = path.join(mobile, ".publish");
const releaseFile = path.join(mobile, "release.json");

const APP_ID = "com.hybertec.hybercrm";
const APP_NAME = "Hyber CRM";
/** The app's name in file names (no space). */
const FILE_NAME = "HyberCRM";
/** Where altool looks for an App Store Connect key. */
const ALTOOL_KEYS = path.join(os.homedir(), ".appstoreconnect", "private_keys");
/** Google Play's tracks, as the Play Console names them and as its API does ("Closed testing" is the alpha track). */
const TRACKS = { internal: "internal", closed: "alpha", production: "production" };
const TRACK_PAGE = { internal: "Test and release → Testing → Internal testing", closed: "Test and release → Testing → Closed testing", production: "Test and release → Production" };

const [command = "help", ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const option = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : null;
};
const dryRun = flags.has("--dry-run");
const noBump = flags.has("--no-bump");
const newVersion = option("--version");
const track = option("--track") ?? "internal";
const draft = flags.has("--draft");

const step = (text) => console.log(`\n▸ ${text}`);
const ok = (text) => console.log(`  ✓ ${text}`);
const note = (text) => console.log(`  • ${text}`);

/** A problem explained in plain words: printed as it is, then the command stops. */
class Stop extends Error {}
function stop(lines) {
  throw new Stop([lines].flat().join("\n"));
}

/** Runs a command with its output on screen; false when it fails, or stops with `problem`. */
function run(cmd, args, { cwd = root, env = process.env, problem } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: "inherit" });
  if (r.signal === "SIGINT" || r.status === 130) process.exit(130);
  if (r.status === 0) return true;
  if (problem) stop(problem);
  return false;
}

/** A command's output, or null when it fails. */
function read(cmd, args, { cwd = root, env = process.env, input } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, input, encoding: "utf8", stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
  return r.status === 0 ? r.stdout : null;
}

function tail(file, lines = 25) {
  try {
    return fs.readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function logFile(name) {
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, name);
}

const secret = (file) => path.join(secrets, file);
const relative = (file) => path.relative(root, file);

// ---------------------------------------------------------------------------------------------------------------
// The version and build number (mobile/release.json), which app.config.ts puts in the native project.

function readRelease() {
  try {
    return JSON.parse(fs.readFileSync(releaseFile, "utf8"));
  } catch {
    return stop(`mobile/release.json is missing or unreadable. It should say, for example: { "version": "1.0.0", "build": 1 }`);
  }
}

/** Raises the build number (each upload needs a new one), and sets the version when --version says so. */
function bumpRelease() {
  const release = readRelease();
  if (newVersion) {
    if (!/^\d+\.\d+\.\d+$/.test(newVersion)) stop(`--version wants three numbers with dots, like 1.1.0 (not "${newVersion}").`);
    release.version = newVersion;
  }
  if (!noBump) release.build = Number(release.build) + 1;
  fs.writeFileSync(releaseFile, `${JSON.stringify(release, null, 2)}\n`);
  ok(`${APP_NAME} ${release.version} (build ${release.build})${noBump ? "" : ": the build number went up in mobile/release.json"}`);
  return release;
}

const bumpReminder = (release) =>
  `The version and build number (${release.version}, build ${release.build}) are in mobile/release.json: commit that file (ask Claude Code: "commit the release number"), so the next release counts on from here.`;

// ---------------------------------------------------------------------------------------------------------------
// The native project, prepared as for a phone (scripts/phone.mjs prepare).

function prepareNative(platform) {
  step(`Getting the ${platform === "ios" ? "iPhone" : "Android"} project ready (as for a phone)`);
  run("node", [path.join(root, "scripts", "phone.mjs"), "prepare", platform], { problem: `The project didn't get ready; the lines above say what to do.` });
  const file = path.join(stateDir, `publish-${platform}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return stop(`scripts/phone.mjs prepare ${platform} left no ${relative(file)}. Ask Claude Code: "npm run publish fails".`);
  }
}

/** xcodebuild with its output made readable on screen (Expo's formatter), and whole in `log`. */
function xcodebuild(args, { cwd, env, log }) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(log);
    const build = spawn("xcodebuild", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const pretty = fs.existsSync(bin("excpretty")) ? spawn(bin("excpretty"), [], { stdio: ["pipe", "inherit", "inherit"] }) : null;
    let status = null;
    let shown = !pretty;
    const done = () => status !== null && shown && file.end(() => resolve(status === 0));
    for (const stream of [build.stdout, build.stderr]) {
      stream.on("data", (chunk) => {
        file.write(chunk);
        if (pretty) pretty.stdin.write(chunk);
        else process.stdout.write(chunk);
      });
    }
    pretty?.on("close", () => {
      shown = true;
      done();
    });
    build.on("close", (code) => {
      status = code ?? 1;
      pretty?.stdin.end();
      done();
    });
  });
}

/** Runs a long build with its output on screen and whole in `log`; true when it succeeds. */
function streamed(cmd, args, { cwd, env, log }) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(log);
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        file.write(chunk);
        process.stdout.write(chunk);
      });
    }
    child.on("close", (code) => file.end(() => resolve(code === 0)));
  });
}

/** What a failed archive or export most likely needs from its person, from Xcode's words. */
function explainXcodeProblem(log) {
  const text = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter((l) => /error|fail|denied|unable|invalid|requires/i.test(l)).join("\n") : "";
  const known = [
    [/PLA Update|Program License Agreement|agreement.*(accept|updated)/i, "Apple needs HyberTec LLC's Account Holder to accept an updated agreement: sign in at https://developer.apple.com/account (or App Store Connect) and accept it. Then run this again."],
    [/No Accounts?\b|No account for team|not signed in|sign in with your Apple ID/i, "Xcode isn't signed in to the Apple ID on HyberTec LLC's team: Xcode → Settings… → Accounts → +. Then run this again."],
    // Apple's cloud-managed distribution certificate is used only by an Admin (a person or a key), or by someone given
    // "Access to Cloud Managed Distribution Certificate"; a key's rights are fixed when it is made.
    [/Cloud signing permission error|cloud-managed distribution certificates/i, `Apple refused to sign with HyberTec's cloud-managed App Store certificate: the Apple ID signed in to Xcode (Xcode → Settings… → Accounts) must be the Account Holder or an Admin of HyberTec LLC's team, or have "Access to Cloud Managed Distribution Certificate" ticked on its user in App Store Connect → Users and Access. Then run this again.`],
    [/Apple Distribution|distribution certificate|No signing certificate "iOS Distribution"|no.*Distribution.*certificate/i, `Xcode couldn't get an App Store signing certificate ("Apple Distribution") for HyberTec LLC. In Xcode: Settings… → Accounts → the Apple ID → HyberTec LLC → Manage Certificates… → + → Apple Distribution → Done. Then run this again.`],
    [/No profiles for|requires a provisioning profile|provisioning profile/i, `Xcode couldn't set up the App Store signing. Check that Xcode → Settings… → Accounts lists the Apple ID with HyberTec LLC's team, then run this again.`],
    [/authentication|Unable to authenticate|invalid API key|AuthKey|issuer/i, "App Store Connect refused the API key. Check mobile/.publish/appstore.json (keyId, issuerId) and that AuthKey_<keyId>.p8 is the key downloaded for it (docs/publishing.md, part 1)."],
    [/Bundle ID .* not (found|registered)|No App ID|application identifier .* not found/i, `App Store Connect has no app with the bundle id ${APP_ID} yet: create it first (docs/publishing.md, part 2, step 1), then run this again.`],
  ];
  const match = known.find(([pattern]) => pattern.test(text));
  return [...(match ? [match[1]] : ["The lines above say what went wrong."]), `The whole log: ${relative(log)}. Or ask Claude Code: "npm run publish:iphone fails", with that file.`];
}

// ---------------------------------------------------------------------------------------------------------------
// iPhone: archive, export for the App Store, upload to App Store Connect.

const API_KEY_STEPS = [
  "  1. Sign in at https://appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API → Team Keys → + .",
  '  2. Name it "Hyber CRM publishing", access App Manager, Generate. Click Download API Key (Apple offers it once only).',
  "  3. Move the downloaded AuthKey_XXXXXXXXXX.p8 into mobile/.publish/ (make the folder if it isn't there).",
  '  4. Create mobile/.publish/appstore.json with the Key ID, the Issuer ID (top of that page) and the app\'s Apple ID (App Store Connect → the app → App Information):',
  '     { "keyId": "XXXXXXXXXX", "issuerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "appleId": "1234567890" }',
  "  Then run this again. docs/publishing.md, part 1, has the same steps in more detail.",
];

/** The App Store Connect API key and the app's Apple ID from mobile/.publish, or null on a dry run without them. */
function appStoreCredentials() {
  const file = secret("appstore.json");
  if (!fs.existsSync(file)) {
    if (dryRun) {
      note("No App Store Connect key yet (mobile/.publish/appstore.json): fine for a dry run, which builds and signs with the Apple ID Xcode is signed in to and uploads nothing.");
      return null;
    }
    stop(["Uploading to App Store Connect needs an App Store Connect API key, made once:", ...API_KEY_STEPS]);
  }
  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    stop([`mobile/.publish/appstore.json isn't valid JSON. It should look like:`, API_KEY_STEPS[4]]);
  }
  const keyId = String(creds.keyId ?? "").trim();
  const issuerId = String(creds.issuerId ?? "").trim();
  const appleId = String(creds.appleId ?? "").trim();
  if (!keyId || !issuerId) stop(["mobile/.publish/appstore.json needs keyId and issuerId:", ...API_KEY_STEPS]);
  const key = secret(`AuthKey_${keyId}.p8`);
  if (!fs.existsSync(key)) stop([`The key file for ${keyId} is missing: it should be ${relative(key)} (the .p8 downloaded when the key was made; if it is lost, make a new key).`, ...API_KEY_STEPS]);
  if (!appleId && !dryRun) stop(['mobile/.publish/appstore.json needs "appleId": the app\'s numeric Apple ID, from App Store Connect → the app → App Information → General Information. Create the app there first if it isn\'t (docs/publishing.md, part 2, step 1).']);
  return { keyId, issuerId, appleId, key };
}

async function iphone() {
  step("The version and build number");
  const release = bumpRelease();
  const creds = appStoreCredentials();
  const prepared = prepareNative("ios");
  const env = { ...process.env, ...prepared.env };
  const iosDir = path.join(mobile, "ios");
  fs.mkdirSync(buildDir, { recursive: true });
  const archive = path.join(buildDir, `${FILE_NAME}.xcarchive`);
  const exportDir = path.join(buildDir, "ios");
  fs.rmSync(archive, { recursive: true, force: true });
  fs.rmSync(exportDir, { recursive: true, force: true });
  // Signing goes through the Apple ID Xcode is signed in to, as `npm run iphone` does: as HyberTec's Account Holder (or
  // an Admin) it may use Apple's cloud-managed App Store certificate, so there is no certificate to make or install.
  // The API key is for the upload: an App Manager key may upload but not cloud-sign. It signs only when Xcode's account
  // can't (a Mac with no Apple ID in Xcode), and then needs the Admin role.
  const keyAuth = creds ? ["-authenticationKeyPath", creds.key, "-authenticationKeyID", creds.keyId, "-authenticationKeyIssuerID", creds.issuerId] : [];
  const signed = async (args, log) => {
    if (await xcodebuild(args, { cwd: iosDir, env, log })) return { ok: true, log };
    if (!creds) return { ok: false, log };
    note("Xcode's Apple ID couldn't do it; trying again with the App Store Connect key.");
    const keyLog = log.replace(/\.log$/, "-key.log");
    return { ok: await xcodebuild([...args, ...keyAuth], { cwd: iosDir, env, log: keyLog }), log };
  };

  step(`Building ${APP_NAME} ${release.version} (build ${release.build}) for the App Store, signed by ${prepared.team.name} (10 to 20 minutes the first time)`);
  const archived = await signed(
    ["-workspace", prepared.workspace, "-scheme", prepared.scheme, "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", archive,
      "-derivedDataPath", path.join(stateDir, "iphone-build"), "-allowProvisioningUpdates", `DEVELOPMENT_TEAM=${prepared.team.id}`, "CODE_SIGN_STYLE=Automatic", "COMPILER_INDEX_STORE_ENABLE=NO", "archive"],
    logFile("publish-ios-archive.log"),
  );
  if (!archived.ok) stop([`The App Store build didn't finish.`, ...explainXcodeProblem(archived.log)]);
  ok(`Archived: ${relative(archive)}`);

  step("Signing it for the App Store (the .ipa Apple takes)");
  const options = path.join(buildDir, "ExportOptions.plist");
  fs.writeFileSync(
    options,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>${prepared.team.id}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
`,
  );
  const exported = await signed(["-exportArchive", "-archivePath", archive, "-exportPath", exportDir, "-exportOptionsPlist", options, "-allowProvisioningUpdates"], logFile("publish-ios-export.log"));
  const ipa = fs.existsSync(exportDir) ? fs.readdirSync(exportDir).find((f) => f.endsWith(".ipa")) : null;
  if (!exported.ok || !ipa) stop([`The build didn't get signed for the App Store.`, ...explainXcodeProblem(exported.log)]);
  const file = path.join(exportDir, ipa);
  ok(`Signed: ${relative(file)}`);

  if (dryRun) {
    console.log(`\n✓ Ready to upload: ${relative(file)} (${APP_NAME} ${release.version}, build ${release.build}). Nothing was sent to Apple (--dry-run).`);
    console.log(`  ${bumpReminder(release)}\n`);
    return;
  }

  step("Uploading it to App Store Connect");
  // altool finds the key by its id in this folder.
  fs.mkdirSync(ALTOOL_KEYS, { recursive: true });
  fs.copyFileSync(creds.key, path.join(ALTOOL_KEYS, path.basename(creds.key)));
  const uploadLog = logFile("publish-ios-upload.log");
  const upload = spawnSync(
    "xcrun",
    ["altool", "--upload-package", file, "--type", "ios", "--apple-id", creds.appleId, "--bundle-id", APP_ID, "--bundle-version", String(release.build), "--bundle-short-version-string", release.version,
      "--api-key", creds.keyId, "--api-issuer", creds.issuerId, "--output-format", "json"],
    { env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  fs.writeFileSync(uploadLog, `${upload.stdout ?? ""}\n${upload.stderr ?? ""}`);
  let result = null;
  try {
    result = JSON.parse(upload.stdout);
  } catch {
    /* not JSON: the log has it */
  }
  const errors = result?.["product-errors"] ?? [];
  if (upload.status !== 0 || errors.length) {
    const messages = errors.map((e) => e.message ?? JSON.stringify(e));
    const known = messages.find((m) => /already been used|bundle version must be higher|previously uploaded/i.test(m))
      ? "Apple already has a build with this number: run the command again without --no-bump, so the build number goes up."
      : messages.find((m) => /No suitable application records|could not find|not found/i.test(m))
        ? `App Store Connect has no app for this Apple ID (${creds.appleId}) and bundle id: check "appleId" in mobile/.publish/appstore.json against App Store Connect → the app → App Information.`
        : messages.find((m) => /authentic|API key|issuer|unauthorized|403|401/i.test(m))
          ? "App Store Connect refused the API key: check keyId and issuerId in mobile/.publish/appstore.json, and that the key has App Manager access."
          : null;
    stop([`The upload to App Store Connect didn't go through:`, ...messages.map((m) => `  ${m}`), ...(known ? [known] : []), tail(uploadLog, 6), `The whole answer: ${relative(uploadLog)}. Or ask Claude Code: "npm run publish:iphone fails".`]);
  }
  console.log(`\n✓ Uploaded ${APP_NAME} ${release.version} (build ${release.build}) to App Store Connect. In 10–30 minutes it appears under TestFlight; Apple emails when it is ready.`);
  console.log(`  ${bumpReminder(release)}\n`);
}

// ---------------------------------------------------------------------------------------------------------------
// Android: the upload key, the bundle, the Google Play Developer API.

/** Java 17's tools (keytool), as scripts/phone.mjs builds with: Homebrew's, JAVA_HOME's, or Android Studio's own. */
function javaHome() {
  const home = ["/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home", process.env.JAVA_HOME, "/Applications/Android Studio.app/Contents/jbr/Contents/Home"].find((j) => j && fs.existsSync(path.join(j, "bin", "keytool")));
  if (!home) stop("Java 17 wasn't found. Run npm run phone:setup, which installs it (docs/running-the-apps.md), then run this again.");
  return home;
}

/** Google Play's upload key, made once and kept in mobile/.publish (its password in keystore.json). */
function ensureUploadKey(java) {
  const store = secret("upload.keystore");
  const file = secret("keystore.json");
  const keytool = path.join(java, "bin", "keytool");
  if (fs.existsSync(store) && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  if (fs.existsSync(store) !== fs.existsSync(file)) {
    stop([`Only one of mobile/.publish/upload.keystore and keystore.json is there; the two belong together.`, `Restore the missing one from your backup, or move both away to make a new key (only before the first upload to Google Play: after it, Google only accepts this key).`]);
  }
  step("Making Google Play's upload key, once (it signs every upload from now on)");
  fs.mkdirSync(secrets, { recursive: true });
  // One password for the store and the key: a PKCS12 keystore (Java's kind) keeps only one, and Gradle asks with both.
  const password = crypto.randomBytes(18).toString("base64url").replace(/[^A-Za-z0-9]/g, "x");
  const key = { storeFile: "upload.keystore", storePassword: password, keyAlias: "upload", keyPassword: password };
  run(
    keytool,
    ["-genkeypair", "-v", "-storetype", "PKCS12", "-keystore", store, "-alias", key.keyAlias, "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-storepass", key.storePassword, "-keypass", key.keyPassword, "-dname", "CN=Hyber CRM, O=HyberTec LLC, C=US"],
    { problem: "Making the upload key failed (the lines above say why)." },
  );
  fs.writeFileSync(file, `${JSON.stringify(key, null, 2)}\n`);
  ok(`Made ${relative(store)}, with its password in ${relative(file)}`);
  console.log("  BACK BOTH FILES UP NOW (a password manager, or another safe place): without them no further update can be uploaded until Google resets the key, which takes a form and a few days.");
  return key;
}

/** The upload key's certificate fingerprints, which Firebase's "Add fingerprint" and the Play Console show. */
function keyFingerprints(java, key) {
  const out = read(path.join(java, "bin", "keytool"), ["-list", "-v", "-keystore", secret(key.storeFile ?? "upload.keystore"), "-alias", key.keyAlias, "-storepass", key.storePassword]) ?? "";
  return { sha1: /SHA1: ([0-9A-F:]+)/.exec(out)?.[1] ?? "?", sha256: /SHA256: ([0-9A-F:]+)/.exec(out)?.[1] ?? "?" };
}

/**
 * Gradle keeps the app's last JavaScript bundle while no file of the app changed, though what the app is told (which
 * copy of Hyber CRM it talks to) is inside it, and the last one may be a screenshots build's, made for the practice
 * copy. Removed before the build, so Google Play gets a bundle made for the real Hyber CRM (scripts/phone.mjs does the
 * same).
 */
function freshJsBundle() {
  for (const dir of ["generated/assets/react/release", "generated/res/react/release"]) {
    fs.rmSync(path.join(mobile, "android", "app", "build", dir), { recursive: true, force: true });
  }
}

const SERVICE_ACCOUNT_STEPS = [
  "  1. Google Cloud console (https://console.cloud.google.com), project hyber-crm → IAM & Admin → Service Accounts → Create service account,",
  '     name "play-publisher", no roles → Done. Open it → Keys → Add key → Create new key → JSON. A .json file downloads.',
  "  2. Play Console → Users and permissions → Invite new users → the service account's email (it ends in iam.gserviceaccount.com) →",
  '     App permissions → Hyber CRM → tick "Release apps to testing tracks" and "Release to production, exclude devices, and use Play App Signing" → Invite user.',
  "  3. Move the downloaded .json to mobile/.publish/play-service-account.json. Then run this again. (docs/publishing.md, part 4)",
];

/** The service account that may publish, from mobile/.publish, or null on a dry run without one. */
function playCredentials() {
  const file = secret("play-service-account.json");
  if (!fs.existsSync(file)) {
    if (dryRun) {
      note("No Google Play service account yet (mobile/.publish/play-service-account.json): fine for a dry run.");
      return null;
    }
    stop(["Uploading to Google Play needs a service account key, made once:", ...SERVICE_ACCOUNT_STEPS]);
  }
  let account;
  try {
    account = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    stop("mobile/.publish/play-service-account.json isn't the JSON key file Google Cloud downloads. Make a new key (its Keys tab) and put that file there.");
  }
  if (!account.client_email || !account.private_key) stop("mobile/.publish/play-service-account.json is missing client_email or private_key: it isn't a service account's key file. Make a new key in the Google Cloud console (the account's Keys tab).");
  return account;
}

/** An access token for the Play Developer API, from the service account's key (a signed JWT, no packages needed). */
async function playToken(account) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: account.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) stop([`Google didn't accept the service account's key (${r.status}): ${body.error_description ?? body.error ?? "no details"}.`, "Make a new key for the account in the Google Cloud console (its Keys tab) and put the file at mobile/.publish/play-service-account.json."]);
  return body.access_token;
}

/** One call to the Play Developer API (androidpublisher v3), with Google's error in plain words when it refuses. */
async function play(token, method, url, { body, contentType = "application/json" } = {}) {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": contentType } : {}) }, body });
  const text = await r.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!r.ok) {
    const message = json.error?.message ?? json.raw ?? `HTTP ${r.status}`;
    const hint = /not found|does not exist|Package not found/i.test(message)
      ? `Google Play doesn't know ${APP_ID} under this account yet: the app's very first bundle has to be uploaded by hand in the Play Console (docs/publishing.md, part 4, "The first upload"). After that, this command does every upload.`
      : /Only releases with status draft/i.test(message)
        ? "Google takes only draft releases until the app's first release has been published: run the command again with --draft, then finish the release in the Play Console."
        : /permission|forbidden|403|not authorized/i.test(message)
          ? "The service account isn't allowed to publish this app: Play Console → Users and permissions → the account → App permissions (Hyber CRM) with the release permissions ticked."
          : /draft|store listing|declaration|content rating|questionnaire|privacy policy|app access/i.test(message)
            ? "Google accepts a release only once the app's setup in the Play Console is done (store listing, content rating, data safety, privacy policy, app access, target audience): finish those pages, or run this again with --draft, which leaves the release for you to roll out there."
            : /apk|bundle|version code|already exists|superseded|lower than/i.test(message)
              ? "Google already has a build with this number, or a newer one: run the command again without --no-bump so the build number goes up."
              : null;
    stop([`Google Play answered: ${message}`, ...(hint ? [hint] : []), 'Or ask Claude Code: "npm run publish:android fails", with that line.']);
  }
  return json;
}

async function android() {
  if (!(track in TRACKS)) stop(`--track can be internal, closed or production (not "${track}").`);
  step("The version and build number");
  const release = bumpRelease();
  const account = playCredentials();
  // The key first: app.config.ts signs release builds with it, and phone.mjs fingerprints it, so the project is made with it.
  const java = javaHome();
  const key = ensureUploadKey(java);
  const prepared = prepareNative("android");
  const env = { ...process.env, ...prepared.env };
  const prints = keyFingerprints(java, key);
  note(`The upload key's certificate: SHA-1 ${prints.sha1}, SHA-256 ${prints.sha256} (Firebase → Project settings → the Android app → Add fingerprint takes these, for Google sign-in: docs/publishing.md, part 4).`);

  step(`Building ${APP_NAME} ${release.version} (build ${release.build}) for Google Play, signed with the upload key (5 to 15 minutes)`);
  const androidDir = path.join(mobile, "android");
  freshJsBundle();
  const log = logFile("publish-android-build.log");
  const built = await streamed("./gradlew", [":app:bundleRelease", "--console=plain"], { cwd: androidDir, env, log });
  if (!built) {
    stop([`The Google Play build didn't finish. The end of its log:`, tail(log, 20), `The whole log: ${relative(log)}. docs/running-the-apps.md, "When a build fails", has what to try; or ask Claude Code: "npm run publish:android fails".`]);
  }
  const output = path.join(androidDir, "app", "build", "outputs", "bundle", "release", "app-release.aab");
  if (!fs.existsSync(output)) stop(`The build finished but left no bundle at ${relative(output)}. Ask Claude Code: "npm run publish:android fails".`);
  const signedBy = read(path.join(java, "bin", "keytool"), ["-printcert", "-jarfile", output]) ?? "";
  if (!signedBy.includes(prints.sha256)) stop(["The bundle isn't signed with the upload key (the project was made before the key existed?). Run: npm run publish:android -- --no-bump, once more."]);
  // Kept outside mobile/android, which is made again when something native changes, so it stays findable.
  fs.mkdirSync(path.join(buildDir, "android"), { recursive: true });
  const bundle = path.join(buildDir, "android", `${FILE_NAME}-${release.version}-${release.build}.aab`);
  fs.copyFileSync(output, bundle);
  ok(`Built and signed: ${relative(bundle)} (${(fs.statSync(bundle).size / 1e6).toFixed(1)} MB)`);

  if (dryRun) {
    console.log(`\n✓ Ready to upload: ${relative(bundle)} (${APP_NAME} ${release.version}, build ${release.build}). Nothing was sent to Google (--dry-run).`);
    console.log(`  ${bumpReminder(release)}\n`);
    return;
  }

  step(`Uploading it to Google Play (${track === "closed" ? "the closed testing track" : `the ${track} track`})`);
  const token = await playToken(account);
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}`;
  const edit = await play(token, "POST", `${base}/edits`);
  const trackName = TRACKS[track];
  const uploaded = await play(token, "POST", `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${APP_ID}/edits/${edit.id}/bundles?uploadType=media`, { body: fs.readFileSync(bundle), contentType: "application/octet-stream" });
  ok(`Google has the bundle (version code ${uploaded.versionCode ?? release.build})`);
  await play(token, "PUT", `${base}/edits/${edit.id}/tracks/${encodeURIComponent(trackName)}`, {
    body: JSON.stringify({ track: trackName, releases: [{ name: `${release.version} (${release.build})`, versionCodes: [String(uploaded.versionCode ?? release.build)], status: draft ? "draft" : "completed" }] }),
  });
  await play(token, "POST", `${base}/edits/${edit.id}:commit`);
  console.log(`\n✓ Uploaded ${APP_NAME} ${release.version} (build ${release.build}) to Google Play's ${track} track${draft ? ", as a draft" : ""}.`);
  console.log(
    draft
      ? `  Finish the release in the Play Console: ${TRACK_PAGE[track]} → the new release → Next → Save → (Publishing overview) Send for review.`
      : track === "internal"
        ? `  The internal testers get it within minutes, without a review: Play Store → Hyber CRM → Update. The Play Console: ${TRACK_PAGE[track]}.`
        : `  Google reviews it (hours to a few days; the first time up to a week), then the people on that track get it. The Play Console: ${TRACK_PAGE[track]}.`,
  );
  console.log(`  ${bumpReminder(release)}\n`);
}

function help() {
  const header = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0];
  console.log(header.replace(/^#!.*\n\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
}

try {
  if (process.platform !== "darwin") stop("Publishing runs on a Mac (Xcode).");
  if (command === "iphone" || command === "ios") await iphone();
  else if (command === "android") await android();
  else help();
} catch (e) {
  if (!(e instanceof Stop)) throw e;
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
