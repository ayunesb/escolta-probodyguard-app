// Fictional, browser-only demonstration data. No production identifiers.
import { calculatePrice } from '../utils/pricing';
export function createSeed() {
  const now = new Date();
  const iso = (day, hour = 19) => { const d = new Date(now); d.setDate(d.getDate() + day); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  const profile = (role, firstName, lastName, email, extra = {}) => ({ role, firstName, lastName, email, phone: '', language: 'en', kycStatus: 'approved', createdAt: iso(-60), updatedAt: now.toISOString(), isActive: true, emailVerified: true, ...extra });
  const guard = (first, last, key, rate, rating, jobs, extra = {}) => profile('guard', first, last, `${key}@escolta.test`, { companyId: 'company', availability: true, isFreelancer: false, hourlyRate: rate, rating, completedJobs: jobs, languages: ['es', 'en'], height: 182, weight: 84, photos: [`/demo/guards/${key}.jpg`], outfitPhotos: [], certifications: ['Close protection', 'First aid', 'Defensive driving'], bio: 'Fictional profile for exploring executive protection, secure transport and event coverage.', latitude: 20.6275, longitude: -87.0739, ...extra });
  const users = {
    client: profile('client', 'Sofía', 'Márquez', 'sofia@cliente.test'),
    company: profile('company', 'Valeria', 'Ortiz', 'valeria@sentinela.test', { companyName: 'Sentinela Protección Ejecutiva', guards: ['guard', 'mariana', 'tomas', 'ivan'], handlesPayouts: true }),
    admin: profile('admin', 'Andrés', 'Fuentes', 'andres@escoltapro.test'),
    guard: guard('Diego', 'Ramírez', 'diego', 450, 4.9, 37),
    mariana: guard('Mariana', 'Solís', 'mariana', 520, 4.8, 52, { languages: ['es', 'en', 'fr'], latitude: 20.6342, longitude: -87.0668 }),
    tomas: guard('Tomás', 'Beltrán', 'tomas', 380, 4.7, 24, { languages: ['es'], latitude: 20.6211, longitude: -87.0801 }),
    ivan: guard('Iván', 'Castañeda', 'ivan', 350, 0, 0, { kycStatus: 'pending', availability: false }),
  };
  const docs = {};
  Object.entries(users).forEach(([id, value]) => { docs[`users/${id}`] = value; if (value.role === 'guard') docs[`users/${id}/private/kyc`] = { governmentIdUrls: [], licenseUrls: [], vehicleDocUrls: [], insuranceUrls: [], updatedAt: now.toISOString() }; });
  const root = { users: {}, bookings: {}, bookingSecrets: {}, clientBookingIndex: { client: {} }, guardBookingIndex: {}, bookingLocations: {} };
  Object.entries(users).forEach(([id, u]) => { root.users[id] = { role: u.role, ...(u.companyId ? { companyId: u.companyId } : {}) }; });
  const rows = [['confirmed', 'guard', 1, 4, 'armored'], ['accepted', 'guard', 3, 6, 'standard'], ['active', 'mariana', 0, 3, 'armored'], ['completed', 'guard', -6, 5, 'standard'], ['completed', 'tomas', -14, 2, 'armored'], ['cancelled', 'mariana', -3, 4, 'standard'], ['pending', 'guard', 5, 3, 'standard']];
  rows.forEach(([status, guardId, day, duration, vehicleType], i) => {
    const id = `demo-booking-${i + 1}`;
    const scheduled = new Date(iso(day));
    const price = calculatePrice({ hourlyRate: users[guardId].hourlyRate, duration, vehicleType, protectionType: 'unarmed', numberOfProtectors: 1 });
    const { subtotal, processingFee } = price;
    const b = { id, clientId: 'client', guardId, companyId: 'company', status, bookingType: 'scheduled', vehicleType, protectionType: 'unarmed', dressCode: 'suit', numberOfProtectees: 1, numberOfProtectors: 1, scheduledDate: `${scheduled.getFullYear()}-${String(scheduled.getMonth()+1).padStart(2,'0')}-${String(scheduled.getDate()).padStart(2,'0')}`, scheduledTime: '19:00', duration, pickupAddress: 'Quinta Avenida y Calle 12, Playa del Carmen', pickupCity: 'Playa del Carmen', pickupLatitude: 20.6269, pickupLongitude: -87.073, hourlyRate: users[guardId].hourlyRate, totalAmount: subtotal + processingFee, processingFee, platformCut: price.platformCut, guardPayout: price.guardPayout, createdAt: iso(day - 3), ...(status === 'pending' ? {} : { confirmedAt: iso(day - 3), transactionId: `demo-${id}`, paymentIntentId: `demo-${id}` }), ...(['accepted', 'active', 'completed'].includes(status) ? { acceptedAt: iso(day - 2) } : {}), ...(['active', 'completed'].includes(status) ? { startedAt: iso(day) } : {}), ...(status === 'completed' ? { completedAt: iso(day, 23) } : {}), ...(status === 'cancelled' ? { cancelledAt: iso(day - 1), cancelledBy: 'client', cancellationReason: 'Plans changed' } : {}) };
    if (i === 4) { b.rating = 5; b.review = 'Punctual and discreet. Sample review.'; docs[`reviews/${id}`] = { guardId, bookingId: id, clientId: 'client', rating: 5, review: b.review, createdAt: b.completedAt }; }
    root.bookings[id] = b;
    root.bookingSecrets[id] = { startCode: ['482913','730564','215908','664127','908341','377205','541862'][i] };
    root.clientBookingIndex.client[id] = true;
    root.guardBookingIndex[guardId] ??= {};
    root.guardBookingIndex[guardId][id] = true;
    docs[`bookingParticipants/${id}`] = { clientId: 'client', guardId, updatedAt: now.toISOString() };
    if (status === 'active') root.bookingLocations[id] = { latitude: 20.6301, longitude: -87.0712, accuracy: 8, heading: 40, speed: 0, timestamp: Date.now() };
  });
  return { docs, root };
}
