// Reglas de Storage. Solo corren si el emulador de Storage esta arriba
// (agrega ",storage" a --only); usan firestore.get() cruzado, asi que
// necesitan tambien el emulador de Firestore.
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createEnv, UIDS } = require('./helpers.cjs');

const describeIfStorage = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? describe : describe.skip;

describeIfStorage('storage.rules', () => {
  let env;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const meta = { contentType: 'image/png' };

  beforeAll(async () => {
    env = await createEnv({ firestore: true, storage: true });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`users/${UIDS.admin}`).set({ role: 'admin' });
      await db.doc(`users/${UIDS.company}`).set({ role: 'company' });
      await db.doc(`users/${UIDS.company2}`).set({ role: 'company' });
      await db.doc(`users/${UIDS.guard}`).set({ role: 'guard', companyId: UIDS.company });
      await db.doc(`users/${UIDS.client}`).set({ role: 'client' });
      await db.doc(`users/${UIDS.stranger}`).set({ role: 'client' });
      await db.doc('bookingParticipants/bk1').set({ clientId: UIDS.client, guardId: UIDS.guard });
      const st = ctx.storage();
      await st.ref(`documents/${UIDS.company}/${UIDS.guard}/id.png`).put(png, meta);
      await st.ref('bookings/bk1/photo.png').put(png, meta);
    });
  });

  const st = (uid) => env.authenticatedContext(uid).storage();

  test('KYC: dueno, su empresa y admin leen; otros no aunque inventen el scopeId', async () => {
    const path = `documents/${UIDS.company}/${UIDS.guard}/id.png`;
    await assertSucceeds(st(UIDS.guard).ref(path).getMetadata());
    await assertSucceeds(st(UIDS.company).ref(path).getMetadata());
    await assertSucceeds(st(UIDS.admin).ref(path).getMetadata());
    await assertFails(st(UIDS.client).ref(path).getMetadata());
    await assertFails(st(UIDS.company2).ref(path).getMetadata());
    // Antes bastaba con poner el propio uid como scopeId.
    await assertFails(st(UIDS.stranger).ref(`documents/${UIDS.stranger}/${UIDS.guard}/x.png`).put(png, meta));
  });

  test('archivos de reserva: solo participantes', async () => {
    await assertSucceeds(st(UIDS.client).ref('bookings/bk1/photo.png').getMetadata());
    await assertSucceeds(st(UIDS.guard).ref('bookings/bk1/new.png').put(png, meta));
    await assertFails(st(UIDS.stranger).ref('bookings/bk1/photo.png').getMetadata());
    await assertFails(st(UIDS.stranger).ref('bookings/bk1/x.png').put(png, meta));
  });
});
