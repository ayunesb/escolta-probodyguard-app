// Entorno compartido de las pruebas de reglas. Los puertos salen de las
// variables *_EMULATOR_HOST que exporta `firebase emulators:exec`; los valores
// por defecto coinciden con tests/rules/firebase.test.json.
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'demo-escolta';
const ROOT = path.resolve(__dirname, '../..');

function hostPort(envVar, fallbackPort) {
  const value = process.env[envVar];
  if (!value) return { host: '127.0.0.1', port: fallbackPort };
  const [host, port] = value.split(':');
  return { host, port: Number(port) };
}

async function createEnv({ firestore = false, database = false, storage = false } = {}) {
  const config = { projectId: PROJECT_ID };
  if (firestore) {
    config.firestore = {
      rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'),
      ...hostPort('FIRESTORE_EMULATOR_HOST', 8180),
    };
  }
  if (database) {
    config.database = {
      rules: fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8'),
      ...hostPort('FIREBASE_DATABASE_EMULATOR_HOST', 9100),
    };
  }
  if (storage) {
    config.storage = {
      rules: fs.readFileSync(path.join(ROOT, 'storage.rules'), 'utf8'),
      ...hostPort('FIREBASE_STORAGE_EMULATOR_HOST', 9399),
    };
  }
  return initializeTestEnvironment(config);
}

// Usuarios de prueba. uid == nombre para que los fallos se lean facil.
const UIDS = {
  admin: 'admin1',
  client: 'client1',
  client2: 'client2',
  guard: 'guard1',
  guard2: 'guard2',
  guardOther: 'guard3',
  company: 'company1',
  company2: 'company2',
  stranger: 'stranger1',
};

module.exports = { PROJECT_ID, UIDS, createEnv };
