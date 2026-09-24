#!/usr/bin/env bash
# Modo de pruebas local: emuladores de Firebase + datos sembrados + la app web
# con acceso rapido por rol. Nada de esto toca el proyecto real.
#
#   npm run dev:emulated
#
# Requiere Java 21+ (los emuladores de Firestore y Realtime Database corren en
# la JVM). En macOS: brew install openjdk@21
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! java -version >/dev/null 2>&1; then
  for candidate in /opt/homebrew/opt/openjdk@21/bin /usr/local/opt/openjdk@21/bin /opt/homebrew/opt/openjdk/bin; do
    if [ -x "$candidate/java" ]; then export PATH="$candidate:$PATH"; break; fi
  done
fi
java -version >/dev/null 2>&1 || { echo "Java 21+ is required for the Firebase emulators (brew install openjdk@21)."; exit 1; }

PROJECT=demo-escolta
LOG=.emulators.log

echo "Starting Firebase emulators ($PROJECT)..."
npx -y firebase-tools@15.31.0 emulators:start --only auth,firestore,database,storage --project "$PROJECT" > "$LOG" 2>&1 &
EMU_PID=$!
trap 'echo "Stopping emulators..."; kill $EMU_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 90); do
  if grep -q "All emulators ready" "$LOG" 2>/dev/null; then break; fi
  if ! kill -0 $EMU_PID 2>/dev/null; then echo "Emulators failed to start:"; tail -30 "$LOG"; exit 1; fi
  sleep 1
done
grep -q "All emulators ready" "$LOG" || { echo "Emulators did not become ready in time:"; tail -30 "$LOG"; exit 1; }

node scripts/emulator/seed.mjs

EXPO_PUBLIC_USE_EMULATORS=1 npx expo start --web --port "${PORT:-8081}"
