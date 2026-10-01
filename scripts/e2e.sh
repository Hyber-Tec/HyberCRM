#!/usr/bin/env bash
# Starts the Auth/Firestore/Storage/Functions emulators (Java 21+) and runs scripts/e2e.ts against them.
set -euo pipefail
for home in /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; do
  if [ -x "$home/bin/java" ]; then export JAVA_HOME="$home"; export PATH="$home/bin:$PATH"; break; fi
done
npm --prefix functions run build >/dev/null
exec firebase emulators:exec --only auth,firestore,storage,functions --project hyber-crm "npx tsx scripts/e2e.ts"
