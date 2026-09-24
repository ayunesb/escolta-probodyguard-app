// Siembra el EMULADOR LOCAL con datos de prueba realistas para los 4 roles.
// Retratos de demostracion: public/demo/guards (servidos por la web de desarrollo).
//
//   npm run emulators:seed      (con los emuladores ya corriendo)
//
// Solo habla con el emulador del proyecto demo-escolta: las variables
// *_EMULATOR_HOST se fijan aqui mismo antes de inicializar firebase-admin, y un
// proyecto "demo-" no puede tocar ningun proyecto real de Firebase.
// Es idempotente: se puede correr las veces que haga falta.

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';

const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');
const { getDatabase } = await import('firebase-admin/database');
const { calculatePrice } = await import('../../utils/pricing.ts');
const { DEV_ACCOUNTS, DEV_PASSWORD } = await import('../../constants/devAccounts.ts');

const PROJECT_ID = 'demo-escolta';
const app = initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});
const auth = getAuth(app);
const fs = getFirestore(app);
const rtdb = getDatabase(app);

const now = new Date();
const iso = (d) => d.toISOString();
const daysFrom = (n, hour = 19, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d;
};
// Fecha y hora LOCALES, como las guarda la app
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

async function upsertAuthUser(email, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password: DEV_PASSWORD, emailVerified: true, displayName });
    return existing.uid;
  } catch {
    const created = await auth.createUser({ email, password: DEV_PASSWORD, emailVerified: true, displayName });
    return created.uid;
  }
}

const baseProfile = (email, firstName, lastName, role, extra = {}) => ({
  email,
  role,
  firstName,
  lastName,
  phone: '+52 984 000 0000',
  language: 'es',
  kycStatus: 'approved',
  createdAt: iso(daysFrom(-60)),
  updatedAt: iso(now),
  isActive: true,
  suspended: false,
  emailVerified: true,
  ...extra,
});

// ---------- Cuentas con acceso rapido ----------
const ids = {};
for (const [role, acct] of Object.entries(DEV_ACCOUNTS)) {
  ids[role] = await upsertAuthUser(acct.email, acct.name);
}

const COMPANY_NAME = 'Sentinela Protección Ejecutiva';

const guardProfile = (email, first, last, extra) =>
  baseProfile(email, first, last, 'guard', {
    availability: true,
    isFreelancer: false,
    companyId: ids.company,
    photos: [],
    outfitPhotos: [],
    certifications: [],
    languages: ['es', 'en'],
    height: 182,
    weight: 84,
    completedJobs: 0,
    rating: 0,
    ...extra,
  });

const profiles = {
  [ids.client]: baseProfile(DEV_ACCOUNTS.client.email, 'Sofía', 'Márquez', 'client', { phone: '+52 55 4187 2290', kycStatus: 'approved' }),
  [ids.company]: baseProfile(DEV_ACCOUNTS.company.email, 'Valeria', 'Ortiz', 'company', {
    companyName: COMPANY_NAME,
    guards: [],
    handlesPayouts: true,
    phone: '+52 998 214 7730',
  }),
  [ids.admin]: baseProfile(DEV_ACCOUNTS.admin.email, 'Andrés', 'Fuentes', 'admin', { phone: '+52 55 1029 4471' }),
  [ids.guard]: guardProfile(DEV_ACCOUNTS.guard.email, 'Diego', 'Ramírez', {
    bio: 'Former federal protection detail, 11 years. Discreet close protection for executives and families across the Riviera Maya.',
    hourlyRate: 450,
    rating: 4.9,
    completedJobs: 37,
    languages: ['es', 'en'],
    certifications: ['Close protection (SIA)', 'First aid & trauma', 'Defensive driving'],
    photos: ['/demo/guards/diego.jpg'],
    latitude: 20.6275,
    longitude: -87.0739,
    phone: '+52 984 118 4502',
  }),
};

// Escoltas adicionales del padron de la empresa (sin acceso rapido)
const extraGuards = [
  {
    key: 'mariana', email: 'mariana@escolta.test', first: 'Mariana', last: 'Solís',
    extra: {
      bio: 'Executive protection specialist, trilingual. Advance work, secure transport and event coverage.',
      hourlyRate: 520, rating: 4.8, completedJobs: 52, languages: ['es', 'en', 'fr'],
      certifications: ['Executive protection (ICP)', 'Tactical medicine'],
      photos: ['/demo/guards/mariana.jpg'],
      latitude: 20.6342, longitude: -87.0668, phone: '+52 984 220 1983',
    },
  },
  {
    key: 'tomas', email: 'tomas@escolta.test', first: 'Tomás', last: 'Beltrán',
    extra: {
      bio: 'Armored vehicle operator and protection driver. Airport and cross-city transfers.',
      hourlyRate: 380, rating: 4.7, completedJobs: 24, languages: ['es'],
      certifications: ['Evasive driving', 'Armored vehicle operation'],
      photos: ['/demo/guards/tomas.jpg'],
      latitude: 20.6211, longitude: -87.0801, phone: '+52 984 331 0442',
    },
  },
  {
    key: 'ivan', email: 'ivan@escolta.test', first: 'Iván', last: 'Castañeda',
    extra: {
      bio: 'New to the Sentinela roster. Verification in progress.',
      hourlyRate: 350, languages: ['es', 'en'], kycStatus: 'pending', availability: false,
      photos: ['/demo/guards/ivan.jpg'],
    },
  },
];
for (const g of extraGuards) {
  const uid = await upsertAuthUser(g.email, `${g.first} ${g.last}`);
  ids[g.key] = uid;
  profiles[uid] = guardProfile(g.email, g.first, g.last, g.extra);
}
profiles[ids.company].guards = [ids.guard, ids.mariana, ids.tomas, ids.ivan];

const batch = fs.batch();
for (const [uid, data] of Object.entries(profiles)) {
  batch.set(fs.doc(`users/${uid}`), data);
  if (data.role === 'guard') {
    batch.set(fs.doc(`users/${uid}/private/kyc`), {
      governmentIdUrls: ['https://placehold.co/1200x800/1c1b19/c9a45c.png?text=INE'],
      licenseUrls: ['https://placehold.co/1200x800/1c1b19/c9a45c.png?text=Licencia+SSPC'],
      vehicleDocUrls: [],
      insuranceUrls: data.kycStatus === 'approved' ? ['https://placehold.co/1200x800/1c1b19/c9a45c.png?text=Poliza'] : [],
      updatedAt: iso(now),
    });
  }
}

// Espejo del rol en Realtime Database (lo usan sus reglas)
const rtdbUsers = {};
for (const [uid, data] of Object.entries(profiles)) {
  rtdbUsers[uid] = data.companyId ? { role: data.role, companyId: data.companyId } : { role: data.role };
}

// ---------- Reservas en todos los estados ----------
const PICKUPS = [
  { address: 'Hotel Xcaret Arte, Carretera Chetumal-Puerto Juárez km 282', lat: 20.5836, lng: -87.1203, city: 'Playa del Carmen' },
  { address: 'Aeropuerto Internacional de Cancún, Terminal 4', lat: 21.0417, lng: -86.8740, city: 'Cancún' },
  { address: 'Quinta Avenida y Calle 12, Playa del Carmen', lat: 20.6269, lng: -87.0730, city: 'Playa del Carmen' },
  { address: 'Rosewood Mayakoba, Carretera Federal 307 km 298', lat: 20.6931, lng: -87.0283, city: 'Playa del Carmen' },
];

let seq = 0;
const bookingId = () => `-Nseed${String(++seq).padStart(3, '0')}${Math.random().toString(36).slice(2, 8)}`;

function makeBooking({ guardKey, status, when, duration, vehicleType, protectionType, protectors = 1, pickup, extra = {} }) {
  const guardUid = ids[guardKey];
  const guard = profiles[guardUid];
  const price = calculatePrice({
    hourlyRate: guard.hourlyRate,
    duration,
    vehicleType,
    protectionType,
    numberOfProtectors: protectors,
  });
  const id = bookingId();
  const createdAt = new Date(when.getTime() - 3 * 24 * 3600 * 1000);
  const booking = {
    id,
    clientId: ids.client,
    guardId: guardUid,
    companyId: guard.companyId ?? null,
    status,
    bookingType: 'scheduled',
    vehicleType,
    protectionType,
    dressCode: 'suit',
    numberOfProtectees: 1,
    numberOfProtectors: protectors,
    scheduledDate: localDate(when),
    scheduledTime: localTime(when),
    duration,
    pickupAddress: pickup.address,
    pickupLatitude: pickup.lat,
    pickupLongitude: pickup.lng,
    pickupCity: pickup.city,
    hourlyRate: guard.hourlyRate,
    totalAmount: price.total,
    processingFee: price.processingFee,
    platformCut: price.platformCut,
    guardPayout: price.guardPayout,
    createdAt: iso(createdAt),
    ...extra,
  };
  if (status !== 'pending') {
    booking.confirmedAt = iso(new Date(createdAt.getTime() + 60_000));
    booking.transactionId = `pi_seed_${id.slice(-6)}`;
    booking.paymentIntentId = booking.transactionId;
  }
  return booking;
}

const bookings = [
  makeBooking({ guardKey: 'guard', status: 'confirmed', when: daysFrom(1, 20, 30), duration: 4, vehicleType: 'armored', protectionType: 'armed', pickup: PICKUPS[0] }),
  makeBooking({ guardKey: 'guard', status: 'accepted', when: daysFrom(3, 9, 0), duration: 6, vehicleType: 'standard', protectionType: 'unarmed', pickup: PICKUPS[1], extra: { acceptedAt: iso(daysFrom(-1, 12)) } }),
  makeBooking({ guardKey: 'mariana', status: 'active', when: new Date(now.getTime() - 60 * 60 * 1000), duration: 3, vehicleType: 'armored', protectionType: 'unarmed', pickup: PICKUPS[2], extra: { acceptedAt: iso(daysFrom(-1, 10)), startedAt: iso(new Date(now.getTime() - 55 * 60 * 1000)) } }),
  makeBooking({ guardKey: 'guard', status: 'completed', when: daysFrom(-6, 18, 0), duration: 5, vehicleType: 'standard', protectionType: 'armed', pickup: PICKUPS[3], extra: { acceptedAt: iso(daysFrom(-8)), startedAt: iso(daysFrom(-6, 18, 5)), completedAt: iso(daysFrom(-6, 23, 5)) } }),
  makeBooking({ guardKey: 'tomas', status: 'completed', when: daysFrom(-14, 7, 30), duration: 2, vehicleType: 'armored', protectionType: 'unarmed', pickup: PICKUPS[1], extra: { acceptedAt: iso(daysFrom(-16)), startedAt: iso(daysFrom(-14, 7, 35)), completedAt: iso(daysFrom(-14, 9, 35)), rating: 5, review: 'Punctual, discreet and the car was immaculate. Will book again.' } }),
  makeBooking({ guardKey: 'mariana', status: 'cancelled', when: daysFrom(-3, 21, 0), duration: 4, vehicleType: 'standard', protectionType: 'unarmed', pickup: PICKUPS[0], extra: { cancelledAt: iso(daysFrom(-4)), cancelledBy: 'client', cancellationReason: 'Plans changed' } }),
  makeBooking({ guardKey: 'guard', status: 'pending', when: daysFrom(5, 13, 0), duration: 3, vehicleType: 'standard', protectionType: 'unarmed', pickup: PICKUPS[2] }),
];

const rtdbRoot = { users: rtdbUsers, bookings: {}, bookingSecrets: {}, clientBookingIndex: { [ids.client]: {} }, guardBookingIndex: {}, bookingLocations: {} };
const codes = ['482913', '730564', '215908', '664127', '908341', '377205', '541862'];
bookings.forEach((b, i) => {
  rtdbRoot.bookings[b.id] = b;
  rtdbRoot.bookingSecrets[b.id] = { startCode: codes[i] };
  rtdbRoot.clientBookingIndex[ids.client][b.id] = true;
  rtdbRoot.guardBookingIndex[b.guardId] ??= {};
  rtdbRoot.guardBookingIndex[b.guardId][b.id] = true;
  batch.set(fs.doc(`bookingParticipants/${b.id}`), { clientId: b.clientId, guardId: b.guardId, updatedAt: iso(now) });
  if (b.rating) {
    batch.set(fs.doc(`reviews/seed-${b.id}`), { guardId: b.guardId, bookingId: b.id, clientId: b.clientId, rating: b.rating, review: b.review ?? '', createdAt: b.completedAt });
  }
});
// Posicion en vivo del servicio activo
const active = bookings.find((b) => b.status === 'active');
rtdbRoot.bookingLocations[active.id] = { latitude: 20.6301, longitude: -87.0712, heading: 40, speed: 0, accuracy: 8, timestamp: Date.now() };

await batch.commit();
await rtdb.ref('/').set(rtdbRoot);

console.log('\nEmulator seeded (project demo-escolta):');
for (const [role, acct] of Object.entries(DEV_ACCOUNTS)) console.log(`  ${role.padEnd(8)} ${acct.email}`);
console.log(`  password for all: ${DEV_PASSWORD}`);
console.log(`  ${bookings.length} bookings: ${bookings.map((b) => b.status).join(', ')}\n`);
process.exit(0);
