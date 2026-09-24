// Migra los datos existentes al modelo de seguridad nuevo. Correr UNA vez,
// justo despues de desplegar las reglas nuevas (ver HANDOFF.md).
//
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/migrate-security-model.mjs --project escolta-pro-fe90e            (simulacro)
//   ... --apply                                                                        (escribe)
//
// Contra el emulador local:  node scripts/migrate-security-model.mjs --emulator [--apply]
//
// Que hace, por cada users/{uid} de Firestore:
//  1. Escribe el espejo de rol en Realtime Database (users/{uid} = {role, companyId?}).
//     Las reglas nuevas lo usan para reconocer admins y empresas, y ya no dejan
//     que el propio usuario lo cree como admin.
//  2. Mueve los documentos KYC (governmentIdUrls, licenseUrls, vehicleDocUrls,
//     insuranceUrls) del perfil publico a users/{uid}/private/kyc.
//  3. Quita pushToken/pushTokenUpdatedAt/devicePlatform del perfil publico.
//  4. Reporta (sin tocar) roles invalidos, escoltas sin tarifa y `availability`
//     que no es booleano: esos escoltas no aparecen a los clientes.
// Es idempotente: correrlo dos veces no cambia nada la segunda.

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const EMULATOR = args.includes('--emulator');
const projectArg = args[args.indexOf('--project') + 1];
const PROJECT_ID = EMULATOR ? 'demo-escolta' : args.includes('--project') ? projectArg : undefined;

if (!PROJECT_ID) {
  console.error('Usage: node scripts/migrate-security-model.mjs --project <id> [--apply]   |   --emulator [--apply]');
  process.exit(1);
}
if (EMULATOR) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { getDatabase } = await import('firebase-admin/database');

const app = initializeApp({
  projectId: PROJECT_ID,
  ...(EMULATOR ? {} : { credential: applicationDefault() }),
  databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});
const fs = getFirestore(app);
const rtdb = getDatabase(app);

const VALID_ROLES = new Set(['client', 'guard', 'company', 'admin']);
const KYC_FIELDS = ['governmentIdUrls', 'licenseUrls', 'vehicleDocUrls', 'insuranceUrls'];
const PUSH_FIELDS = ['pushToken', 'pushTokenUpdatedAt', 'devicePlatform'];

const report = { users: 0, mirrorsWritten: 0, kycMoved: 0, pushCleared: 0, invalidRole: [], guardNoRate: [], guardAvailabilityNotBoolean: [] };

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} on project ${PROJECT_ID}${EMULATOR ? ' (emulator)' : ''}\n`);

const snap = await fs.collection('users').get();
for (const docSnap of snap.docs) {
  report.users++;
  const uid = docSnap.id;
  const data = docSnap.data();
  const role = data.role;

  if (!VALID_ROLES.has(role)) {
    report.invalidRole.push(`${uid} (${JSON.stringify(role)})`);
    continue;
  }

  // 1. Espejo de rol
  const wanted = data.companyId && role === 'guard' ? { role, companyId: data.companyId } : { role };
  const current = (await rtdb.ref(`users/${uid}`).get()).val();
  if (!current || current.role !== wanted.role || (current.companyId ?? null) !== (wanted.companyId ?? null)) {
    report.mirrorsWritten++;
    console.log(`  mirror   ${uid}  ${JSON.stringify(current)} -> ${JSON.stringify(wanted)}`);
    if (APPLY) await rtdb.ref(`users/${uid}`).set(wanted);
  }

  // 2. KYC fuera del perfil publico
  const kyc = Object.fromEntries(KYC_FIELDS.filter((f) => f in data).map((f) => [f, data[f]]));
  if (Object.keys(kyc).length) {
    report.kycMoved++;
    console.log(`  kyc      ${uid}  moving ${Object.keys(kyc).join(', ')} -> users/${uid}/private/kyc`);
    if (APPLY) {
      await fs.doc(`users/${uid}/private/kyc`).set({ ...kyc, migratedAt: new Date().toISOString() }, { merge: true });
      await docSnap.ref.update(Object.fromEntries(Object.keys(kyc).map((f) => [f, FieldValue.delete()])));
    }
  }

  // 3. Token de avisos fuera del perfil publico
  const push = PUSH_FIELDS.filter((f) => f in data);
  if (push.length) {
    report.pushCleared++;
    console.log(`  push     ${uid}  removing ${push.join(', ')}`);
    if (APPLY) await docSnap.ref.update(Object.fromEntries(push.map((f) => [f, FieldValue.delete()])));
  }

  // 4. Solo reporte
  if (role === 'guard') {
    if (!(Number(data.hourlyRate) > 0)) report.guardNoRate.push(uid);
    if (typeof data.availability !== 'boolean') report.guardAvailabilityNotBoolean.push(uid);
  }
}

console.log('\nSummary');
console.log(`  users scanned:            ${report.users}`);
console.log(`  role mirrors to write:    ${report.mirrorsWritten}`);
console.log(`  KYC docs to move:         ${report.kycMoved}`);
console.log(`  push tokens to clear:     ${report.pushCleared}`);
console.log(`  invalid roles (skipped):  ${report.invalidRole.length ? report.invalidRole.join(', ') : 'none'}`);
console.log(`  guards without a rate:    ${report.guardNoRate.length ? report.guardNoRate.join(', ') : 'none'}  (hidden from clients until set)`);
console.log(`  guards w/ non-boolean availability: ${report.guardAvailabilityNotBoolean.length ? report.guardAvailabilityNotBoolean.join(', ') : 'none'}  (hidden until they toggle "Available" in Account)`);
if (!APPLY) console.log('\nNothing was written. Re-run with --apply to migrate.');
process.exit(0);
