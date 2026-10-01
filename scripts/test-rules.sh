#!/usr/bin/env bash
# Runs the Firestore rules tests in the emulator. The emulator needs Java 21+.
set -euo pipefail
for home in /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; do
  if [ -x "$home/bin/java" ]; then export JAVA_HOME="$home"; export PATH="$home/bin:$PATH"; break; fi
done
exec firebase emulators:exec --only firestore --project demo-hyber "npx vitest run --root tests/rules"
