// Reglas de Realtime Database: maquina de estados de reservas (CONTRACT §2, §3, §6).
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createEnv, UIDS } = require('./helpers.cjs');

let env;

const START_CODE = '482913';

function baseBooking(id, overrides = {}) {
  return {
    id,
    clientId: UIDS.client,
    guardId: UIDS.guard,
    status: 'pending',
    bookingType: 'scheduled',
    vehicleType: 'standard',
    protectionType: 'unarmed',
    dressCode: 'suit',
    numberOfProtectees: 1,
    numberOfProtectors: 1,
    scheduledDate: '2026-10-01',
    scheduledTime: '10:00',
    duration: 4,
    pickupAddress: 'Av. Reforma 1, CDMX',
    pickupLatitude: 19.43,
    pickupLongitude: -99.13,
    hourlyRate: 500,
    totalAmount: 2075.2,
    processingFee: 75.2,
    platformCut: 300,
    guardPayout: 1700,
    createdAt: '2026-09-24T10:00:00.000Z',
    ...overrides,
  };
}

// Escribe una reserva en un estado dado sin pasar por las reglas.
async function seedBooking(id, overrides = {}, { code = START_CODE } = {}) {
  const booking = baseBooking(id, overrides);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await db.ref().update({
      [`bookings/${id}`]: booking,
      [`bookingSecrets/${id}`]: { startCode: code },
      [`clientBookingIndex/${booking.clientId}/${id}`]: true,
      [`guardBookingIndex/${booking.guardId}/${id}`]: true,
    });
  });
  return booking;
}

const dbAs = (uid) => env.authenticatedContext(uid).database();

beforeAll(async () => {
  env = await createEnv({ database: true });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref('users').set({
      [UIDS.admin]: { role: 'admin' },
      [UIDS.client]: { role: 'client' },
      [UIDS.client2]: { role: 'client' },
      [UIDS.guard]: { role: 'guard', companyId: UIDS.company },
      [UIDS.guard2]: { role: 'guard' },
      [UIDS.guardOther]: { role: 'guard', companyId: UIDS.company2 },
      [UIDS.company]: { role: 'company' },
      [UIDS.company2]: { role: 'company' },
      [UIDS.stranger]: { role: 'client' },
    });
  });
});

describe('creacion de reserva', () => {
  test('el cliente crea una reserva pendiente con codigo e indices en una sola actualizacion', async () => {
    const id = 'bk_create_ok';
    await assertSucceeds(
      dbAs(UIDS.client).ref().update({
        [`bookings/${id}`]: baseBooking(id),
        [`bookingSecrets/${id}/startCode`]: START_CODE,
        [`clientBookingIndex/${UIDS.client}/${id}`]: true,
        [`guardBookingIndex/${UIDS.guard}/${id}`]: true,
      })
    );
  });

  test('no se puede crear sin el codigo de inicio en la misma actualizacion', async () => {
    const id = 'bk_no_secret';
    await assertFails(dbAs(UIDS.client).ref(`bookings/${id}`).set(baseBooking(id)));
  });

  test('no se puede crear ya confirmada', async () => {
    const id = 'bk_create_confirmed';
    await assertFails(
      dbAs(UIDS.client).ref().update({
        [`bookings/${id}`]: baseBooking(id, { status: 'confirmed' }),
        [`bookingSecrets/${id}/startCode`]: START_CODE,
      })
    );
  });

  test('no se puede crear a nombre de otro cliente', async () => {
    const id = 'bk_other_client';
    await assertFails(
      dbAs(UIDS.client2).ref().update({
        [`bookings/${id}`]: baseBooking(id),
        [`bookingSecrets/${id}/startCode`]: START_CODE,
      })
    );
  });

  test('startCode nunca va dentro de la reserva', async () => {
    const id = 'bk_code_inside';
    await assertFails(
      dbAs(UIDS.client).ref().update({
        [`bookings/${id}`]: baseBooking(id, { startCode: START_CODE }),
        [`bookingSecrets/${id}/startCode`]: START_CODE,
      })
    );
  });

  test('no se puede crear con transactionId (campo del servidor)', async () => {
    const id = 'bk_fake_tx';
    await assertFails(
      dbAs(UIDS.client).ref().update({
        [`bookings/${id}`]: baseBooking(id, { transactionId: 'pi_fake' }),
        [`bookingSecrets/${id}/startCode`]: START_CODE,
      })
    );
  });
});

describe('cliente', () => {
  test('no puede marcar su reserva como confirmada', async () => {
    await seedBooking('bk1');
    await assertFails(dbAs(UIDS.client).ref('bookings/bk1').update({ status: 'confirmed' }));
    await assertFails(
      dbAs(UIDS.client).ref('bookings/bk1').update({
        status: 'confirmed',
        transactionId: 'pi_x',
        confirmedAt: '2026-09-24T11:00:00Z',
      })
    );
  });

  test('puede cambiar importes y opciones mientras esta pendiente', async () => {
    await seedBooking('bk1');
    await assertSucceeds(
      dbAs(UIDS.client).ref('bookings/bk1').update({ duration: 6, totalAmount: 3100, guardPayout: 2550, platformCut: 450, processingFee: 100 })
    );
  });

  test('no puede cambiar importes despues de pendiente', async () => {
    await seedBooking('bk1', { status: 'confirmed', transactionId: 'pi_1', confirmedAt: 'x' });
    await assertFails(dbAs(UIDS.client).ref('bookings/bk1').update({ totalAmount: 10 }));
    await assertFails(dbAs(UIDS.client).ref('bookings/bk1').update({ duration: 12 }));
    await assertFails(dbAs(UIDS.client).ref('bookings/bk1/totalAmount').remove());
  });

  test('no puede extender la duracion de una reserva activa', async () => {
    await seedBooking('bk1', { status: 'active' });
    await assertFails(dbAs(UIDS.client).ref('bookings/bk1').update({ duration: 8, extensionCount: 1 }));
  });

  test('puede cancelar una reserva confirmada como client', async () => {
    await seedBooking('bk1', { status: 'confirmed' });
    await assertSucceeds(
      dbAs(UIDS.client).ref('bookings/bk1').update({
        status: 'cancelled',
        cancelledAt: '2026-09-24T12:00:00Z',
        cancelledBy: 'client',
        cancellationReason: 'Cambio de planes',
      })
    );
  });

  test('no puede cancelar diciendo que cancelo el escolta', async () => {
    await seedBooking('bk1', { status: 'confirmed' });
    await assertFails(
      dbAs(UIDS.client).ref('bookings/bk1').update({
        status: 'cancelled',
        cancelledAt: '2026-09-24T12:00:00Z',
        cancelledBy: 'guard',
      })
    );
  });

  test('no puede cancelar una reserva activa', async () => {
    await seedBooking('bk1', { status: 'active' });
    await assertFails(
      dbAs(UIDS.client).ref('bookings/bk1').update({ status: 'cancelled', cancelledAt: 'x', cancelledBy: 'client' })
    );
  });

  test('puede terminar una reserva activa', async () => {
    await seedBooking('bk1', { status: 'active' });
    await assertSucceeds(dbAs(UIDS.client).ref('bookings/bk1').update({ status: 'completed', completedAt: 'x' }));
  });

  test('califica una sola vez', async () => {
    await seedBooking('bk1', { status: 'completed' });
    const ref = dbAs(UIDS.client).ref('bookings/bk1');
    await assertSucceeds(
      ref.update({
        rating: 5,
        review: 'Excelente',
        ratingBreakdown: { professionalism: 5, punctuality: 5, communication: 5, languageClarity: 5 },
      })
    );
    await assertFails(ref.update({ rating: 1 }));
    await assertFails(ref.child('rating').remove());
  });

  test('reasigna rejected -> confirmed con otro escolta, mismos importes e indice nuevo', async () => {
    await seedBooking('bk1', {
      status: 'rejected',
      rejectedAt: 'x',
      rejectionReason: 'ocupado',
      transactionId: 'pi_1',
      confirmedAt: 'y',
    });
    await assertSucceeds(
      dbAs(UIDS.client).ref().update({
        'bookings/bk1/status': 'confirmed',
        'bookings/bk1/guardId': UIDS.guard2,
        'bookings/bk1/rejectedAt': null,
        'bookings/bk1/rejectionReason': null,
        [`guardBookingIndex/${UIDS.guard2}/bk1`]: true,
      })
    );
  });

  test('reasignar con importes distintos falla', async () => {
    await seedBooking('bk1', { status: 'rejected', rejectedAt: 'x' });
    await assertFails(
      dbAs(UIDS.client).ref().update({
        'bookings/bk1/status': 'confirmed',
        'bookings/bk1/guardId': UIDS.guard2,
        'bookings/bk1/totalAmount': 100,
        [`guardBookingIndex/${UIDS.guard2}/bk1`]: true,
      })
    );
  });

  test('reasignar al mismo escolta o sin indice falla', async () => {
    await seedBooking('bk1', { status: 'rejected', rejectedAt: 'x' });
    await assertFails(
      dbAs(UIDS.client).ref().update({
        'bookings/bk1/status': 'confirmed',
        [`guardBookingIndex/${UIDS.guard}/bk1`]: true,
      })
    );
    await assertFails(
      dbAs(UIDS.client).ref().update({
        'bookings/bk1/status': 'confirmed',
        'bookings/bk1/guardId': UIDS.guard2,
      })
    );
  });

  test('lee su codigo de inicio', async () => {
    await seedBooking('bk1', { status: 'confirmed' });
    await assertSucceeds(dbAs(UIDS.client).ref('bookingSecrets/bk1').once('value'));
  });

  test('no puede reescribir el codigo de inicio', async () => {
    await seedBooking('bk1');
    await assertFails(dbAs(UIDS.client).ref('bookingSecrets/bk1/startCode').set('111111'));
  });
});

describe('escolta', () => {
  test('no puede leer bookingSecrets', async () => {
    await seedBooking('bk1', { status: 'accepted' });
    await assertFails(dbAs(UIDS.guard).ref('bookingSecrets/bk1').once('value'));
    await assertFails(dbAs(UIDS.guard).ref('bookingSecrets/bk1/startCode').once('value'));
  });

  test('no ve reservas pendientes (sin pagar), si las confirmadas', async () => {
    await seedBooking('bkp');
    await seedBooking('bkc', { status: 'confirmed' });
    await assertFails(dbAs(UIDS.guard).ref('bookings/bkp').once('value'));
    await assertSucceeds(dbAs(UIDS.guard).ref('bookings/bkc').once('value'));
  });

  test('acepta solo cuando esta confirmada y asignada a el', async () => {
    await seedBooking('bkc', { status: 'confirmed' });
    await seedBooking('bkp');
    await assertFails(dbAs(UIDS.guard2).ref('bookings/bkc').update({ status: 'accepted', acceptedAt: 'x' }));
    await assertFails(dbAs(UIDS.guard).ref('bookings/bkp').update({ status: 'accepted', acceptedAt: 'x' }));
    await assertSucceeds(dbAs(UIDS.guard).ref('bookings/bkc').update({ status: 'accepted', acceptedAt: 'x' }));
  });

  test('rechaza solo cuando esta confirmada y asignada a el', async () => {
    await seedBooking('bkc', { status: 'confirmed' });
    await seedBooking('bka', { status: 'accepted' });
    await assertFails(dbAs(UIDS.guard2).ref('bookings/bkc').update({ status: 'rejected', rejectedAt: 'x' }));
    await assertFails(dbAs(UIDS.guard).ref('bookings/bka').update({ status: 'rejected', rejectedAt: 'x' }));
    await assertSucceeds(
      dbAs(UIDS.guard).ref('bookings/bkc').update({ status: 'rejected', rejectedAt: 'x', rejectionReason: 'ocupado' })
    );
  });

  test('no puede cambiar importes ni el escolta al aceptar', async () => {
    await seedBooking('bkc', { status: 'confirmed' });
    await assertFails(
      dbAs(UIDS.guard).ref('bookings/bkc').update({ status: 'accepted', acceptedAt: 'x', guardPayout: 99999 })
    );
    await assertFails(
      dbAs(UIDS.guard).ref('bookings/bkc').update({ status: 'accepted', acceptedAt: 'x', guardId: UIDS.guard2 })
    );
  });

  test('pending -> active falla siempre; accepted -> active falla con codigo equivocado y pasa con el correcto', async () => {
    await seedBooking('bkp');
    await assertFails(
      dbAs(UIDS.guard).ref('bookings/bkp').update({ status: 'active', startedAt: 'x', startCodeAttempt: START_CODE })
    );

    await seedBooking('bka', { status: 'accepted' });
    const ref = dbAs(UIDS.guard).ref('bookings/bka');
    await assertFails(ref.update({ status: 'active', startedAt: 'x', startCodeAttempt: '000000' }));
    await assertFails(ref.update({ status: 'active', startedAt: 'x' }));
    await assertSucceeds(ref.update({ status: 'active', startedAt: 'x', startCodeAttempt: START_CODE }));
  });

  test('en_route -> active con el codigo correcto', async () => {
    await seedBooking('bke', { status: 'en_route' });
    await assertSucceeds(
      dbAs(UIDS.guard).ref('bookings/bke').update({ status: 'active', startedAt: 'x', startCodeAttempt: START_CODE })
    );
  });

  test('sin codigo guardado nunca puede iniciar', async () => {
    const booking = baseBooking('bkn', { status: 'accepted' });
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('bookings/bkn').set(booking));
    await assertFails(dbAs(UIDS.guard).ref('bookings/bkn').update({ status: 'active', startedAt: 'x' }));
  });

  test('puede cancelar una aceptada como guard pero no como client', async () => {
    await seedBooking('bka', { status: 'accepted' });
    await assertFails(
      dbAs(UIDS.guard).ref('bookings/bka').update({ status: 'cancelled', cancelledAt: 'x', cancelledBy: 'client' })
    );
    await assertSucceeds(
      dbAs(UIDS.guard).ref('bookings/bka').update({
        status: 'cancelled',
        cancelledAt: 'x',
        cancelledBy: 'guard',
        cancellationReason: 'emergencia',
      })
    );
  });

  test('no puede confirmar un pago', async () => {
    await seedBooking('bkp');
    await assertFails(dbAs(UIDS.guard).ref('bookings/bkp').update({ status: 'confirmed' }));
  });
});

describe('extranos, empresas y admin', () => {
  test('un extrano no puede leer ni escribir una reserva', async () => {
    await seedBooking('bk1', { status: 'confirmed' });
    await assertFails(dbAs(UIDS.stranger).ref('bookings/bk1').once('value'));
    await assertFails(dbAs(UIDS.stranger).ref('bookings/bk1').update({ status: 'cancelled' }));
    await assertFails(dbAs(UIDS.stranger).ref('bookings/bk1/pickupAddress').set('otra'));
    await assertFails(dbAs(UIDS.stranger).ref('bookings').once('value'));
    await assertFails(env.unauthenticatedContext().database().ref('bookings/bk1').once('value'));
  });

  test('un extrano no puede tocar el indice del escolta con una reserva ajena', async () => {
    await seedBooking('bk1', { status: 'confirmed' });
    await assertFails(dbAs(UIDS.stranger).ref(`guardBookingIndex/${UIDS.guard2}/bk1`).set(true));
    await assertFails(dbAs(UIDS.stranger).ref(`clientBookingIndex/${UIDS.client}/bk1`).set(true));
    await assertFails(dbAs(UIDS.stranger).ref(`guardBookingIndex/${UIDS.guard}`).once('value'));
  });

  test('la empresa lee las reservas de SUS escoltas, no las de otros', async () => {
    await seedBooking('bk1', { status: 'confirmed' });
    await assertSucceeds(dbAs(UIDS.company).ref('bookings/bk1').once('value'));
    await assertSucceeds(dbAs(UIDS.company).ref(`guardBookingIndex/${UIDS.guard}`).once('value'));
    await assertFails(dbAs(UIDS.company2).ref('bookings/bk1').once('value'));
    await assertFails(dbAs(UIDS.company2).ref(`guardBookingIndex/${UIDS.guard}`).once('value'));
  });

  test('admin puede confirmar y listar', async () => {
    await seedBooking('bk1');
    await assertSucceeds(
      dbAs(UIDS.admin).ref('bookings/bk1').update({ status: 'confirmed', transactionId: 'pi_1', confirmedAt: 'x' })
    );
    await assertSucceeds(dbAs(UIDS.admin).ref('bookings').once('value'));
    await assertSucceeds(dbAs(UIDS.admin).ref('bookingSecrets/bk1').once('value'));
  });

  test('chats esta cerrado', async () => {
    await assertFails(dbAs(UIDS.client).ref('chats/x').set({ text: 'hola' }));
    await assertFails(dbAs(UIDS.client).ref('chats').once('value'));
  });
});

describe('bookingLocations', () => {
  const loc = { latitude: 19.4, longitude: -99.1, heading: 90, timestamp: 1727170000000 };

  test('solo el escolta asignado escribe, y solo en accepted/en_route/active', async () => {
    await seedBooking('bka', { status: 'accepted' });
    await seedBooking('bkc', { status: 'confirmed' });
    await assertSucceeds(dbAs(UIDS.guard).ref('bookingLocations/bka').set(loc));
    await assertFails(dbAs(UIDS.guard).ref('bookingLocations/bkc').set(loc));
    await assertFails(dbAs(UIDS.guard2).ref('bookingLocations/bka').set(loc));
    await assertFails(dbAs(UIDS.client).ref('bookingLocations/bka').set(loc));
  });

  test('el cliente de la reserva lee, un extrano no', async () => {
    await seedBooking('bka', { status: 'active' });
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('bookingLocations/bka').set(loc));
    await assertSucceeds(dbAs(UIDS.client).ref('bookingLocations/bka').once('value'));
    await assertSucceeds(dbAs(UIDS.guard).ref('bookingLocations/bka').once('value'));
    await assertFails(dbAs(UIDS.stranger).ref('bookingLocations/bka').once('value'));
    await assertFails(dbAs(UIDS.guard2).ref('bookingLocations/bka').once('value'));
  });

  test('guardLocations ya no se lee por clientes', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(`guardLocations/${UIDS.guard}`).set(loc));
    await assertFails(dbAs(UIDS.client).ref(`guardLocations/${UIDS.guard}`).once('value'));
    await assertSucceeds(dbAs(UIDS.guard).ref(`guardLocations/${UIDS.guard}`).set(loc));
  });
});

describe('espejo de rol users/{uid}', () => {
  test('el dueno lo crea una vez como client/guard/company, nunca admin', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('users').remove());
    await assertFails(dbAs('newuser').ref('users/newuser').set({ role: 'admin' }));
    await assertSucceeds(dbAs('newuser').ref('users/newuser').set({ role: 'client' }));
    await assertFails(dbAs('newuser').ref('users/newuser/role').set('company'));
    await assertFails(dbAs('newuser').ref('users/newuser/role').set('admin'));
    await assertFails(dbAs('newuser').ref('users/newuser').remove());
  });

  test('un cliente no puede autoasignarse a una empresa ni escribir el espejo de otro', async () => {
    await assertFails(dbAs(UIDS.client).ref(`users/${UIDS.client}/companyId`).set(UIDS.company));
    await assertFails(dbAs(UIDS.client).ref(`users/${UIDS.client2}`).set({ role: 'client' }));
  });

  test('la empresa puede quitar a su escolta (companyId -> null)', async () => {
    await assertSucceeds(dbAs(UIDS.company).ref(`users/${UIDS.guard}/companyId`).remove());
    await assertFails(dbAs(UIDS.company).ref(`users/${UIDS.guard}/role`).set('company'));
  });
});
