// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  // Generated: the native projects, Expo's route types and web exports.
  { ignores: ["android/*", "ios/*", ".expo/*", "dist/*"] },
]);
