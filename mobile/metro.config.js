// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The business logic the website and the Cloud Functions use (../shared/src, imported as @shared/...),
// built into the app as it is: one implementation of every rule (time zones, availability, logs, pay).
config.watchFolders = [path.resolve(__dirname, "../shared")];

module.exports = config;
