// Pruebas de reglas de seguridad (Firestore + Realtime Database) contra los
// emuladores locales. No usa el preset de jest-expo: son pruebas de Node puro.
//
// Correr (desde expo/). Usa puertos alternos (tests/rules/firebase.test.json)
// para no chocar con emuladores de desarrollo en los puertos estandar:
//   export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
//   npx -y firebase-tools@15.31.0 emulators:exec --config tests/rules/firebase.test.json \
//     --only firestore,database --project demo-escolta "npx jest --config tests/rules/jest.config.cjs"
// (agrega ",storage" a --only para correr tambien las pruebas de storage.rules)
//
// El proyecto demo-escolta (prefijo demo-) garantiza que nunca se toca un
// proyecto real de Firebase.
const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '../..'),
  roots: ['<rootDir>/tests/rules'],
  testEnvironment: 'node',
  testMatch: ['**/tests/rules/**/*.test.cjs'],
  moduleFileExtensions: ['js', 'cjs', 'json'],
  transform: {},
  setupFiles: ['<rootDir>/tests/rules/setup.cjs'],
  testTimeout: 30000,
  maxWorkers: 1,
};
