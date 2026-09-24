// Reglas de Firestore: perfiles (CONTRACT §5), chat, avisos, resenas, pagos.
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createEnv, UIDS } = require('./helpers.cjs');

let env;

const now = '2026-09-24T10:00:00.000Z';

function profile(role, overrides = {}) {
  return {
    email: `${role}@example.com`,
    role,
    firstName: 'Nombre',
    lastName: 'Apellido',
    phone: '+525500000000',
    language: 'es',
    kycStatus: 'pending',
    createdAt: now,
    isActive: true,
    emailVerified: false,
    updatedAt: now,
    ...overrides,
  };
}

const fsAs = (uid) => env.authenticatedContext(uid).firestore();

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

beforeAll(async () => {
  env = await createEnv({ firestore: true });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await db.doc(`users/${UIDS.admin}`).set(profile('admin', { kycStatus: 'approved' }));
    await db.doc(`users/${UIDS.client}`).set(profile('client'));
    await db.doc(`users/${UIDS.client2}`).set(profile('client'));
    await db.doc(`users/${UIDS.company}`).set(profile('company', { kycStatus: 'approved' }));
    await db.doc(`users/${UIDS.company2}`).set(profile('company', { kycStatus: 'approved' }));
    await db.doc(`users/${UIDS.guard}`).set(
      profile('guard', { companyId: UIDS.company, hourlyRate: 500, rating: 4.5, completedJobs: 3, photos: [] })
    );
    await db.doc(`users/${UIDS.guard2}`).set(profile('guard', { hourlyRate: 400 }));
    await db.doc(`users/${UIDS.guardOther}`).set(profile('guard', { companyId: UIDS.company2, hourlyRate: 450 }));
    await db.doc(`users/${UIDS.stranger}`).set(profile('client'));
    await db.doc(`users/${UIDS.guard}/private/kyc`).set({ governmentIdUrls: ['documents/company1/guard1/id.jpg'] });
    await db.doc('bookingParticipants/bk1').set({ clientId: UIDS.client, guardId: UIDS.guard, updatedAt: now });
  });
});

describe('users: alta del perfil', () => {
  test('un usuario nuevo crea su perfil de cliente pendiente', async () => {
    await assertSucceeds(fsAs('new1').doc('users/new1').set(profile('client')));
  });

  test('no puede darse de alta como admin', async () => {
    await assertFails(fsAs('new1').doc('users/new1').set(profile('admin')));
  });

  test('no puede darse de alta con KYC aprobado, inactivo-a-la-fuerza, reputacion o suspension', async () => {
    await assertFails(fsAs('new1').doc('users/new1').set(profile('guard', { kycStatus: 'approved' })));
    await assertFails(fsAs('new1').doc('users/new1').set(profile('guard', { rating: 5 })));
    await assertFails(fsAs('new1').doc('users/new1').set(profile('guard', { completedJobs: 200 })));
    await assertFails(fsAs('new1').doc('users/new1').set(profile('guard', { suspended: true })));
    await assertFails(fsAs('new1').doc('users/new1').set(profile('guard', { emailVerified: true })));
    await assertFails(fsAs('new1').doc('users/new1').set(profile('guard', { pushToken: 'ExponentPushToken[x]' })));
  });

  test('no puede crear el perfil de otro', async () => {
    await assertFails(fsAs('new1').doc('users/new2').set(profile('client')));
  });

  test('alta de escolta de empresa: companyId solo si apunta a una empresa real', async () => {
    await assertSucceeds(fsAs('new1').doc('users/new1').set(profile('guard', { companyId: UIDS.company })));
    await assertFails(fsAs('new2').doc('users/new2').set(profile('guard', { companyId: UIDS.client })));
    await assertFails(fsAs('new3').doc('users/new3').set(profile('client', { companyId: UIDS.company })));
  });

  test('las URLs KYC no van en el perfil publico', async () => {
    await assertFails(
      fsAs('new1').doc('users/new1').set(profile('guard', { governmentIdUrls: ['https://x/id.jpg'] }))
    );
    await assertSucceeds(fsAs('new2').doc('users/new2').set(profile('guard', { governmentIdUrls: [] })));
  });
});

describe('users: el dueno no se autopromueve', () => {
  test('no puede cambiarse el rol a admin', async () => {
    await assertFails(fsAs(UIDS.client).doc(`users/${UIDS.client}`).update({ role: 'admin' }));
    await assertFails(fsAs(UIDS.client).doc(`users/${UIDS.client}`).set(profile('admin')));
  });

  test('no puede aprobar su propio KYC', async () => {
    await assertFails(fsAs(UIDS.guard2).doc(`users/${UIDS.guard2}`).update({ kycStatus: 'approved' }));
  });

  test('si puede volver su KYC a pending', async () => {
    await seed((db) => db.doc(`users/${UIDS.guard2}`).update({ kycStatus: 'rejected' }));
    await assertSucceeds(fsAs(UIDS.guard2).doc(`users/${UIDS.guard2}`).update({ kycStatus: 'pending' }));
  });

  test('no puede tocar campos bloqueados', async () => {
    const me = fsAs(UIDS.guard).doc(`users/${UIDS.guard}`);
    await assertFails(me.update({ isActive: false }));
    await assertFails(me.update({ suspended: false }));
    await assertFails(me.update({ companyId: UIDS.company2 }));
    await assertFails(me.update({ rating: 5 }));
    await assertFails(me.update({ completedJobs: 99 }));
    await assertFails(me.update({ ratingBreakdown: { professionalism: 5 } }));
    await assertFails(me.update({ emailVerified: true }));
    await assertFails(me.update({ pushToken: 'ExponentPushToken[x]' }));
  });

  test('si puede editar su perfil', async () => {
    await assertSucceeds(
      fsAs(UIDS.guard).doc(`users/${UIDS.guard}`).update({ bio: 'Ex militar', hourlyRate: 650, updatedAt: now })
    );
  });

  test('admin si puede aprobar KYC y suspender', async () => {
    await assertSucceeds(fsAs(UIDS.admin).doc(`users/${UIDS.guard2}`).update({ kycStatus: 'approved' }));
    await assertSucceeds(
      fsAs(UIDS.admin).doc(`users/${UIDS.client}`).update({ suspended: true, isActive: false })
    );
  });
});

describe('users: empresa', () => {
  test('no puede aprobar el KYC de su escolta', async () => {
    await assertFails(fsAs(UIDS.company).doc(`users/${UIDS.guard}`).update({ kycStatus: 'approved' }));
  });

  test('puede subir fotos y devolver el KYC a pending', async () => {
    await assertSucceeds(
      fsAs(UIDS.company).doc(`users/${UIDS.guard}`).update({ photos: ['photos/company1/guard1/a.jpg'], kycStatus: 'pending', updatedAt: now })
    );
  });

  test('puede quitar a su escolta (companyId -> borrado o null)', async () => {
    const { FieldValue } = require('firebase/compat/app').default.firestore;
    await assertSucceeds(
      fsAs(UIDS.company).doc(`users/${UIDS.guard}`).update({ companyId: FieldValue.delete(), updatedAt: now })
    );
  });

  test('puede quitar a su escolta poniendo companyId en null', async () => {
    await assertSucceeds(fsAs(UIDS.company).doc(`users/${UIDS.guard}`).update({ companyId: null }));
  });

  test('no puede pasar su escolta a otra empresa ni tocar campos bloqueados', async () => {
    const guard = fsAs(UIDS.company).doc(`users/${UIDS.guard}`);
    await assertFails(guard.update({ companyId: UIDS.company2 }));
    await assertFails(guard.update({ role: 'admin' }));
    await assertFails(guard.update({ isActive: false }));
    await assertFails(guard.update({ suspended: true }));
    await assertFails(guard.update({ rating: 5 }));
  });

  test('no puede editar escoltas ajenos', async () => {
    await assertFails(fsAs(UIDS.company).doc(`users/${UIDS.guardOther}`).update({ bio: 'x' }));
    await assertFails(fsAs(UIDS.company).doc(`users/${UIDS.guard2}`).update({ bio: 'x' }));
  });
});

describe('users: lectura y datos privados', () => {
  test('un cliente lee el perfil publico de un escolta, no el de otro cliente', async () => {
    await assertSucceeds(fsAs(UIDS.client).doc(`users/${UIDS.guard}`).get());
    await assertSucceeds(fsAs(UIDS.client).collection('users').where('role', '==', 'guard').get());
    await assertFails(fsAs(UIDS.client).doc(`users/${UIDS.client2}`).get());
  });

  test('private/kyc: dueno, su empresa y admin si; otros no', async () => {
    const path = `users/${UIDS.guard}/private/kyc`;
    await assertSucceeds(fsAs(UIDS.guard).doc(path).get());
    await assertSucceeds(fsAs(UIDS.guard).doc(path).set({ licenseUrls: ['documents/company1/guard1/lic.jpg'] }, { merge: true }));
    await assertSucceeds(fsAs(UIDS.company).doc(path).get());
    await assertSucceeds(fsAs(UIDS.company).doc(path).set({ insuranceUrls: ['x'] }, { merge: true }));
    await assertSucceeds(fsAs(UIDS.admin).doc(path).get());
    await assertFails(fsAs(UIDS.client).doc(path).get());
    await assertFails(fsAs(UIDS.company2).doc(path).get());
    await assertFails(fsAs(UIDS.guard2).doc(path).get());
  });
});

describe('bookingParticipants', () => {
  test('el cliente lo crea con su uid y puede cambiar el escolta', async () => {
    await assertSucceeds(
      fsAs(UIDS.client).doc('bookingParticipants/bk2').set({ clientId: UIDS.client, guardId: UIDS.guard, updatedAt: now })
    );
    await assertSucceeds(fsAs(UIDS.client).doc('bookingParticipants/bk2').update({ guardId: UIDS.guard2, updatedAt: now }));
  });

  test('nadie mas lo crea ni lo cambia', async () => {
    await assertFails(
      fsAs(UIDS.stranger).doc('bookingParticipants/bk2').set({ clientId: UIDS.client, guardId: UIDS.stranger, updatedAt: now })
    );
    await assertFails(fsAs(UIDS.guard).doc('bookingParticipants/bk1').update({ guardId: UIDS.guard2 }));
    await assertFails(fsAs(UIDS.client).doc('bookingParticipants/bk1').update({ clientId: UIDS.client2 }));
  });

  test('lo leen los participantes, no un extrano', async () => {
    await assertSucceeds(fsAs(UIDS.guard).doc('bookingParticipants/bk1').get());
    await assertSucceeds(fsAs(UIDS.client).doc('bookingParticipants/bk1').get());
    await assertFails(fsAs(UIDS.stranger).doc('bookingParticipants/bk1').get());
  });
});

describe('messages', () => {
  function message(senderId, overrides = {}) {
    return {
      bookingId: 'bk1',
      senderId,
      senderRole: senderId === UIDS.client ? 'client' : 'guard',
      text: 'Hola',
      originalLanguage: 'es',
      timestamp: now,
      clientId: UIDS.client,
      guardId: UIDS.guard,
      participantIds: [UIDS.client, UIDS.guard],
      ...overrides,
    };
  }

  test('los participantes escriben en el chat de su reserva', async () => {
    await assertSucceeds(fsAs(UIDS.client).collection('messages').add(message(UIDS.client)));
    await assertSucceeds(fsAs(UIDS.guard).collection('messages').add(message(UIDS.guard)));
  });

  test('un no participante no puede escribir', async () => {
    await assertFails(
      fsAs(UIDS.stranger).collection('messages').add(
        message(UIDS.stranger, { clientId: UIDS.stranger, participantIds: [UIDS.stranger, UIDS.guard] })
      )
    );
    await assertFails(fsAs(UIDS.stranger).collection('messages').add(message(UIDS.stranger)));
    await assertFails(fsAs(UIDS.guard2).collection('messages').add(message(UIDS.guard2, { senderRole: 'guard' })));
  });

  test('no se puede suplantar al remitente ni colar a un tercero', async () => {
    await assertFails(fsAs(UIDS.client).collection('messages').add(message(UIDS.guard)));
    await assertFails(
      fsAs(UIDS.client).collection('messages').add(
        message(UIDS.client, { participantIds: [UIDS.client, UIDS.guard, UIDS.stranger] })
      )
    );
    await assertFails(fsAs(UIDS.client).collection('messages').add(message(UIDS.client, { senderRole: 'guard' })));
  });

  test('sin bookingParticipants no hay chat', async () => {
    await assertFails(
      fsAs(UIDS.client).collection('messages').add(message(UIDS.client, { bookingId: 'bk_missing' }))
    );
  });

  test('lectura: los participantes listan, un extrano no', async () => {
    await seed((db) => db.doc('messages/m1').set(message(UIDS.client)));
    await assertSucceeds(
      fsAs(UIDS.guard)
        .collection('messages')
        .where('bookingId', '==', 'bk1')
        .where('participantIds', 'array-contains', UIDS.guard)
        .get()
    );
    await assertFails(fsAs(UIDS.stranger).doc('messages/m1').get());
    await assertFails(fsAs(UIDS.stranger).collection('messages').where('bookingId', '==', 'bk1').get());
  });

  test('solo el destinatario marca como leido, y nada mas', async () => {
    await seed((db) => db.doc('messages/m1').set(message(UIDS.client)));
    await assertFails(fsAs(UIDS.client).doc('messages/m1').update({ read: true }));
    await assertFails(fsAs(UIDS.guard).doc('messages/m1').update({ read: true, text: 'editado' }));
    await assertFails(fsAs(UIDS.stranger).doc('messages/m1').update({ read: true }));
    await assertSucceeds(fsAs(UIDS.guard).doc('messages/m1').set({ read: true }, { merge: true }));
  });
});

describe('notifications', () => {
  function notification(senderId, userId, overrides = {}) {
    return {
      userId,
      senderId,
      type: 'new_message',
      bookingId: 'bk1',
      status: 'pending',
      createdAt: now,
      ...overrides,
    };
  }

  test('no se puede suplantar al remitente', async () => {
    await assertFails(fsAs(UIDS.client).collection('notifications').add(notification(UIDS.guard, UIDS.guard)));
    await assertFails(
      fsAs(UIDS.client).collection('notifications').add({ userId: UIDS.guard, type: 'new_message', bookingId: 'bk1', status: 'pending' })
    );
  });

  test('solo a la otra parte de una reserva compartida, o a uno mismo', async () => {
    await assertSucceeds(fsAs(UIDS.client).collection('notifications').add(notification(UIDS.client, UIDS.guard)));
    await assertSucceeds(
      fsAs(UIDS.client).collection('notifications').add(notification(UIDS.client, UIDS.client, { type: 'booking_created', bookingId: null }))
    );
    await assertFails(fsAs(UIDS.client).collection('notifications').add(notification(UIDS.client, UIDS.guard2)));
    await assertFails(fsAs(UIDS.stranger).collection('notifications').add(notification(UIDS.stranger, UIDS.guard)));
  });

  test('tipo desconocido o ya enviada: rechazada', async () => {
    await assertFails(
      fsAs(UIDS.client).collection('notifications').add(notification(UIDS.client, UIDS.guard, { type: 'phishing' }))
    );
    await assertFails(
      fsAs(UIDS.client).collection('notifications').add(notification(UIDS.client, UIDS.guard, { status: 'sent' }))
    );
  });

  test('el destinatario solo la marca como leida', async () => {
    await seed((db) => db.doc('notifications/n1').set({ ...notification(UIDS.client, UIDS.guard), read: false }));
    await assertSucceeds(fsAs(UIDS.guard).doc('notifications/n1').update({ read: true }));
    await assertFails(fsAs(UIDS.guard).doc('notifications/n1').update({ status: 'pending', body: 'x' }));
    await assertFails(fsAs(UIDS.client).doc('notifications/n1').update({ read: true }));
  });
});

describe('reviews', () => {
  function review(overrides = {}) {
    return {
      bookingId: 'bk1',
      guardId: UIDS.guard,
      clientId: UIDS.client,
      rating: 5,
      review: 'Muy profesional',
      createdAt: now,
      ...overrides,
    };
  }

  test('el cliente de la reserva crea una resena con rating entero 1..5', async () => {
    await assertSucceeds(fsAs(UIDS.client).collection('reviews').add(review()));
    await assertSucceeds(fsAs(UIDS.client).collection('reviews').add(review({ rating: 1 })));
  });

  test('rating fuera de rango o no entero: rechazada', async () => {
    await assertFails(fsAs(UIDS.client).collection('reviews').add(review({ rating: 6 })));
    await assertFails(fsAs(UIDS.client).collection('reviews').add(review({ rating: 0 })));
    await assertFails(fsAs(UIDS.client).collection('reviews').add(review({ rating: 4.5 })));
    await assertFails(fsAs(UIDS.client).collection('reviews').add(review({ rating: '5' })));
  });

  test('no se puede resenar a nombre de otro ni una reserva ajena', async () => {
    await assertFails(fsAs(UIDS.stranger).collection('reviews').add(review()));
    await assertFails(fsAs(UIDS.stranger).collection('reviews').add(review({ clientId: UIDS.stranger })));
    await assertFails(fsAs(UIDS.client).collection('reviews').add(review({ guardId: UIDS.guard2 })));
  });

  test('legibles por cualquier usuario con sesion; solo admin edita o borra', async () => {
    await seed((db) => db.doc('reviews/r1').set(review()));
    await assertSucceeds(fsAs(UIDS.stranger).doc('reviews/r1').get());
    await assertSucceeds(fsAs(UIDS.stranger).collection('reviews').where('guardId', '==', UIDS.guard).get());
    await assertFails(env.unauthenticatedContext().firestore().doc('reviews/r1').get());
    await assertFails(fsAs(UIDS.client).doc('reviews/r1').update({ rating: 1 }));
    await assertFails(fsAs(UIDS.client).doc('reviews/r1').delete());
    await assertSucceeds(fsAs(UIDS.admin).doc('reviews/r1').delete());
  });
});

describe('dinero y servidor', () => {
  test('un escolta no puede crear su propio pago (payout)', async () => {
    await seed((db) => db.doc(`users/${UIDS.guard}`).update({ kycStatus: 'approved' }));
    await assertFails(
      fsAs(UIDS.guard).collection('payouts').add({
        guardId: UIDS.guard,
        amount: 100000,
        bookingIds: ['bk1'],
        status: 'pending',
        createdAt: now,
      })
    );
  });

  test('nadie escribe webhook_logs ni webhook_events desde el cliente', async () => {
    await assertFails(env.unauthenticatedContext().firestore().collection('webhook_logs').add({ kind: 'x' }));
    await assertFails(fsAs(UIDS.client).collection('webhook_logs').add({ kind: 'x' }));
    await assertFails(fsAs(UIDS.client).doc('webhook_events/abc').set({ kind: 'x' }));
  });

  test('el ledger no lo escribe el escolta', async () => {
    await assertFails(
      fsAs(UIDS.guard).collection('ledger').add({ guardId: UIDS.guard, type: 'earning', amount: 1e6, createdAt: now })
    );
  });
});

describe('incidentReports', () => {
  test('los participantes de la reserva listan sus reportes; otra empresa no', async () => {
    await seed((db) =>
      db.doc('incidentReports/i1').set({
        bookingId: 'bk1',
        reportedBy: UIDS.client,
        type: 'other',
        severity: 'low',
        status: 'open',
        timestamp: now,
      })
    );
    await assertSucceeds(fsAs(UIDS.guard).collection('incidentReports').where('bookingId', '==', 'bk1').get());
    await assertSucceeds(fsAs(UIDS.client).collection('incidentReports').where('reportedBy', '==', UIDS.client).get());
    await assertFails(fsAs(UIDS.company2).doc('incidentReports/i1').get());
    await assertFails(fsAs(UIDS.stranger).collection('incidentReports').where('bookingId', '==', 'bk1').get());
  });
});

// Escrituras exactas del cliente tras la revision (AuthContext, pushNotificationService, consentService).
describe('forma real de las escrituras del cliente', () => {
  test('alta desde sign-up con consentimientos (AuthContext.signUp)', async () => {
    const uid = 'nuevo-registro';
    await assertSucceeds(
      fsAs(uid).doc(`users/${uid}`).set({
        ...profile('guard'),
        email: 'nuevo@example.com',
        consents: { terms: now, privacy: now, dataProcessing: now, marketing: false, recordedAt: now },
      })
    );
  });

  test('alta desde sign-up nunca como admin ni con KYC aprobado', async () => {
    await assertFails(fsAs('x1').doc('users/x1').set(profile('admin')));
    await assertFails(fsAs('x2').doc('users/x2').set(profile('client', { kycStatus: 'approved' })));
  });

  test('deviceTokens con id determinista: alta y re-registro con merge; ajeno no', async () => {
    const path = `deviceTokens/${UIDS.client}_abc123`;
    const data = { userId: UIDS.client, token: 'ExponentPushToken[abc123]', platform: 'ios', role: 'client', active: true, lastUsedAt: now };
    await assertSucceeds(fsAs(UIDS.client).doc(path).set(data, { merge: true }));
    await assertSucceeds(fsAs(UIDS.client).doc(path).set({ ...data, lastUsedAt: '2026-09-25T00:00:00.000Z' }, { merge: true }));
    await assertFails(fsAs(UIDS.stranger).doc(path).set({ ...data, userId: UIDS.stranger }, { merge: true }));
  });

  test('aviso encolado con la forma nueva entre participantes de la reserva', async () => {
    const ok = { userId: UIDS.guard, senderId: UIDS.client, type: 'new_message', bookingId: 'bk1', status: 'pending', read: false, createdAt: now };
    await assertSucceeds(fsAs(UIDS.client).collection('notifications').add(ok));
    // la forma vieja (sin remitente ni tipo) ya no pasa
    await assertFails(
      fsAs(UIDS.client).collection('notifications').add({ userId: UIDS.guard, title: 'Tu pago fallo', body: 'x', status: 'pending', createdAt: now })
    );
    // ni a alguien que no comparte la reserva
    await assertFails(fsAs(UIDS.client).collection('notifications').add({ ...ok, userId: UIDS.guard2 }));
  });

  test('consents: cada quien los suyos; historial de solo alta', async () => {
    const mine = `consents/${UIDS.client}`;
    await assertSucceeds(fsAs(UIDS.client).doc(mine).set({ marketing: true, updatedAt: now }, { merge: true }));
    await assertSucceeds(fsAs(UIDS.client).doc(mine).get());
    await assertSucceeds(fsAs(UIDS.client).doc(`${mine}/history/1`).set({ marketing: true, at: now }));
    await assertFails(fsAs(UIDS.client).doc(`${mine}/history/1`).set({ marketing: false, at: now }));
    await assertFails(fsAs(UIDS.stranger).doc(mine).get());
    await assertFails(fsAs(UIDS.stranger).doc(mine).set({ marketing: false }));
    await assertSucceeds(fsAs(UIDS.admin).doc(mine).get());
  });
});
