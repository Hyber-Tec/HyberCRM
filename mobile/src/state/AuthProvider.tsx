import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getIdToken,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
  updateProfile,
  type User,
} from "@react-native-firebase/auth";
import { type SignInMethods, signInMethods } from "@shared/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { callable } from "@/lib/api";
import { env } from "@/lib/env";
import { auth } from "@/lib/firebase";
import { signInWithGoogle, signOutOfGoogle } from "@/lib/googleSignIn";
import { forgetThisDevice } from "@/lib/push";

export type VerificationResult = "sent" | "throttled" | "verified";

export interface AuthState {
  /** Until Firebase says who is signed in on this phone. */
  loading: boolean;
  user: User | null;
  /** Lower-cased sign-in email. */
  email: string | null;
  /**
   * A password account whose email isn't confirmed yet: the rules trust verified emails only, so it can't reach any
   * center until the person opens the link we emailed (the app waits on the "Confirm your email" screen).
   */
  needsVerification: boolean;
  methods: SignInMethods;
  signInWithGoogle: () => Promise<boolean>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>;
  sendVerification: () => Promise<VerificationResult>;
  /** Asks Firebase whether the email was confirmed (on the website, in the mail app's browser); true once it is. */
  checkVerified: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Changes the password (password accounts), or adds one (Google accounts), after confirming who it is. */
  changePassword: (current: string | null, next: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const sendAccountEmail = callable<{ kind: "verify" | "reset"; email?: string; next?: string | null }, { sent: boolean; fallback?: boolean; throttled?: boolean; alreadyVerified?: boolean }>("sendAccountEmail");

/** Firebase's own emails, when ours can't go out, link back to the website. */
const actionSettings = (path: string) => ({ url: `${env.webUrl}${path}`, handleCodeInApp: false });

/** Who is signed in on this phone, and every way to sign in, out and recover (the website's web/src/auth/AuthProvider.tsx). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Mirrors user.emailVerified, which changes in place when the account is reloaded (no auth event fires).
  const [verified, setVerified] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setVerified(!!u?.emailVerified);
        setProviders(u?.providerData.map((p) => p.providerId) ?? []);
        setLoading(false);
      }),
    [],
  );

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const sendVerification = useCallback(async (): Promise<VerificationResult> => {
    const u = auth.currentUser;
    if (!u) throw new Error("Sign in first.");
    try {
      const r = await sendAccountEmail({ kind: "verify", next: null });
      if (r.alreadyVerified) return "verified";
      if (r.throttled) return "throttled";
      if (r.sent) return "sent";
    } catch {
      // Ours couldn't go out: Firebase's own, below.
    }
    await sendEmailVerification(u, actionSettings("/login"));
    return "sent";
  }, []);

  const signUp = useCallback(
    async ({ name, email, password }: { name: string; email: string; password: string }) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() }).catch(() => undefined);
      setProviders(cred.user.providerData.map((p) => p.providerId));
      await sendVerification().catch(() => undefined);
    },
    [sendVerification],
  );

  const checkVerified = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return false;
    await reload(u);
    const fresh = auth.currentUser;
    if (!fresh?.emailVerified) return false;
    // The rules read email_verified from the ID token: a fresh one carries it.
    await getIdToken(fresh, true);
    setUser(fresh);
    setVerified(true);
    return true;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const address = email.trim().toLowerCase();
    try {
      const r = await sendAccountEmail({ kind: "reset", email: address });
      if (r.sent || !r.fallback) return;
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      if (code.includes("invalid-argument")) throw Object.assign(new Error("invalid email"), { code: "auth/invalid-email" });
    }
    await sendPasswordResetEmail(auth, address, actionSettings(`/login?email=${encodeURIComponent(address)}`));
  }, []);

  const changePassword = useCallback(async (current: string | null, next: string) => {
    const u = auth.currentUser;
    if (!u?.email) throw new Error("Sign in first.");
    if (u.providerData.some((p) => p.providerId === "password")) {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current ?? ""));
      await updatePassword(u, next);
    } else {
      // A Google account gets a password too, for signing in where Google isn't handy.
      await linkWithCredential(u, EmailAuthProvider.credential(u.email, next));
      setProviders(auth.currentUser?.providerData.map((p) => p.providerId) ?? []);
    }
  }, []);

  const signOut = useCallback(async () => {
    // While still signed in, so this phone's push token can be removed: an old or shared phone gets nothing more.
    await forgetThisDevice();
    await signOutOfGoogle();
    await fbSignOut(auth);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      email: user?.email ? user.email.trim().toLowerCase() : null,
      needsVerification: !!user && !verified,
      methods: signInMethods(providers),
      signInWithGoogle: () => signInWithGoogle(),
      signInWithPassword,
      signUp,
      sendVerification,
      checkVerified,
      sendPasswordReset,
      changePassword,
      signOut,
    }),
    [loading, user, verified, providers, signInWithPassword, signUp, sendVerification, checkVerified, sendPasswordReset, changePassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
