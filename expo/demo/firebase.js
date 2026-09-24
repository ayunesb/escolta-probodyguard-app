// Build-time Firebase substitute for the PUBLIC_DEMO web export. No network.
// IndexedDB holds this browser's sandbox, including uploaded test documents.
import { createSeed } from './seed';
import { calculatePrice } from '../utils/pricing';
import { PUBLIC_DEMO } from '../constants/demo';

export class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  toDate() { return new Date(this.toMillis()); }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
  valueOf() { return this.toMillis(); }
  static now() { return Timestamp.fromDate(new Date()); }
  static fromDate(d) { return new Timestamp(Math.floor(d.getTime() / 1000), (d.getTime() % 1000) * 1e6); }
}
const KEY = 'escolta-sandbox-v2';
const clone = (v) => v == null ? v : v instanceof Timestamp ? new Timestamp(v.seconds, v.nanoseconds) : Array.isArray(v) ? v.map(clone) : typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
const encode = (v) => JSON.stringify(v, (_, x) => x instanceof Timestamp ? { ...x, __timestamp: true } : x);
const decode = (v) => JSON.parse(v, (_, x) => x?.__timestamp ? new Timestamp(x.seconds, x.nanoseconds) : x);
const fresh = () => ({ ...createSeed(), accounts: {}, uploads: {}, inbox: [], intents: {}, version: 2 });
let state = fresh();
const listeners = new Set();
const observers = new Set();
const apps = [];
const auths = new Map();
let storage;
const ready = (async () => {
  if (!PUBLIC_DEMO || typeof indexedDB === 'undefined') return;
  storage = await new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sandbox');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const saved = await readSaved();
  if (saved?.version === 2) state = saved;
})();
async function readSaved() {
  if (!storage) return null;
  return new Promise((resolve, reject) => {
    const request = storage.transaction('sandbox').objectStore('sandbox').get('state');
    request.onsuccess = () => resolve(request.result ? decode(request.result) : null);
    request.onerror = () => reject(request.error);
  });
}
async function persist() {
  if (storage) {
    const data = encode(state);
    await new Promise((resolve, reject) => {
      const tx = storage.transaction('sandbox', 'readwrite');
      tx.objectStore('sandbox').put(data, 'state');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Could not save demo data.'));
    });
    try { localStorage.setItem(KEY, String(Date.now()) + Math.random()); } catch { /* private browser */ }
  }
  for (const cb of observers) cb();
}
const emit = (kind, p = '') => {
  for (const l of [...listeners]) if (l.kind === kind && (!p || p.startsWith(l.path) || l.path.startsWith(p))) queueMicrotask(() => { if (listeners.has(l)) l.run(); });
};
if (PUBLIC_DEMO && typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', async (event) => {
  if (event.key !== KEY) return;
  await ready;
  const saved = await readSaved();
  if (!saved) return;
  state = saved;
  for (const auth of auths.values()) if (auth.currentUser && (!account(auth.currentUser.uid) || state.docs[`users/${auth.currentUser.uid}`]?.suspended)) session(auth, null);
  emit('fs'); emit('db');
  for (const cb of observers) cb();
});
const id = () => `demo-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const path = (...parts) => parts.flatMap(p => typeof p === 'string' ? p.split('/') : p?.path?.split('/') || []).filter(Boolean).join('/');
const reference = (kind, ...parts) => { const p = path(...parts); return { kind, path: p, id: p.split('/').pop(), key: p.split('/').pop() || null }; };
const read = (p, root = state.root) => p.split('/').filter(Boolean).reduce((v, k) => v?.[k], root);
const put = (p, value, root = state.root) => {
  const keys = p.split('/').filter(Boolean);
  let node = root;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  if (value === null) delete node[keys.at(-1)]; else node[keys.at(-1)] = clone(value);
};
const denied = (message = 'Cloud access is unavailable in the local demo.') => Object.assign(new Error(message), { code: 'permission-denied' });
const authError = (code) => Object.assign(new Error(code), { code });
const account = (uid) => state.accounts[uid] || (state.docs[`users/${uid}`] ? { email: state.docs[`users/${uid}`].email, verified: true, sample: true } : null);
const makeUser = (uid) => ({ uid, email: account(uid).email, emailVerified: account(uid).verified, getIdToken: async () => { throw denied(); } });
const announceAuth = (auth) => { for (const cb of auth.listeners) queueMicrotask(() => cb(auth.currentUser)); };
function session(auth, uid) {
  auth.currentUser = uid ? makeUser(uid) : null;
  if (auth.name === '[DEFAULT]') try { if (uid) sessionStorage.setItem(KEY, uid); else sessionStorage.removeItem(KEY); } catch { /* tests/private mode */ }
  announceAuth(auth);
}
async function passwordHash(password) {
  if (!globalThis.crypto?.subtle) throw new Error('Open the demo using HTTPS or localhost.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`escolta-demo:${password}`));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
}
function inbox(type, title, body, extra = {}) {
  state.inbox.unshift({ id: id(), type, title, body, createdAt: new Date().toISOString(), ...extra });
  state.inbox = state.inbox.slice(0, 300);
}
export const initializeApp = (options = {}, name = '[DEFAULT]') => { const app = { name, options: { projectId: 'demo-escolta-public' } }; apps.push(app); return app; };
export const getApps = () => apps;
export const getApp = (name = '[DEFAULT]') => apps.find(a => a.name === name) || initializeApp({}, name);
export function getAuth(app = getApp()) {
  if (!auths.has(app.name)) {
    const auth = { name: app.name, currentUser: null, listeners: new Set() };
    auths.set(app.name, auth);
    auth.loaded = ready.then(() => {
      if (app.name === '[DEFAULT]') try { const uid = sessionStorage.getItem(KEY); if (uid && account(uid)) auth.currentUser = makeUser(uid); } catch { /* no session storage */ }
    });
  }
  return auths.get(app.name);
}
export const initializeAuth = getAuth;
export const browserLocalPersistence = {};
export const inMemoryPersistence = {};
export const connectAuthEmulator = () => {};
export const onAuthStateChanged = (auth, cb) => { auth.listeners.add(cb); auth.loaded.then(() => { if (auth.listeners.has(cb)) cb(auth.currentUser); }); return () => auth.listeners.delete(cb); };
export async function signInWithEmailAndPassword(auth, email, password) {
  await ready; await auth.loaded;
  const normalized = email.trim().toLowerCase();
  const uid = [...new Set([...Object.keys(state.accounts), ...Object.keys(state.docs).filter(p => /^users\/[^/]+$/.test(p)).map(p => p.split('/')[1])])].find(uid => account(uid)?.email.toLowerCase() === normalized);
  const a = uid && account(uid);
  if (!a || (a.sample ? password !== 'EscoltaDev!2026' : a.hash !== await passwordHash(password))) throw authError('auth/invalid-credential');
  session(auth, uid);
  return { user: auth.currentUser };
}
export async function signOut(auth = getAuth()) { await auth.loaded; session(auth, null); }
export async function createUserWithEmailAndPassword(auth, email, password) {
  await ready;
  email = email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError('auth/invalid-email');
  if (!password || password.length < 6) throw authError('auth/weak-password');
  if (Object.values(state.docs).some(u => u.email?.toLowerCase() === email) || Object.values(state.accounts).some(u => u.email === email)) throw authError('auth/email-already-in-use');
  const uid = id();
  state.accounts[uid] = { email, hash: await passwordHash(password), verified: false };
  await persist();
  session(auth, uid);
  return { user: auth.currentUser };
}
export async function sendEmailVerification(user) {
  await ready;
  if (!user?.uid || !account(user.uid)) throw authError('auth/user-not-found');
  inbox('verification', 'Verify your demo email', user.email, { uid: user.uid });
  await persist();
}
export async function sendPasswordResetEmail(_auth, email) {
  await ready;
  const uid = [...Object.keys(state.accounts), ...Object.keys(state.docs).filter(p => /^users\/[^/]+$/.test(p)).map(p => p.split('/')[1])].find(uid => account(uid)?.email.toLowerCase() === email?.trim().toLowerCase());
  // Same non-disclosing response as the real reset flow.
  if (uid) { inbox('reset', 'Set a demo password', email, { uid }); await persist(); }
}
export const getFirestore = () => ({ kind: 'firestore' });
export const connectFirestoreEmulator = () => {};
export const doc = (...parts) => reference('doc', ...parts);
export const collection = (...parts) => reference('collection', ...parts);
export const query = (ref, ...constraints) => ({ ...ref, constraints });
export const where = (field, op, value) => ({ type: 'where', field, op, value });
export const orderBy = (field, direction = 'asc') => ({ type: 'order', field, direction });
export const limit = (n) => ({ type: 'limit', n });
const fieldValue = (data, field) => field.split('.').reduce((v, k) => v?.[k], data);
const matches = (v, op, x) => { switch (op) { case '==': return v === x; case '!=': return v !== x; case 'in': return x.includes(v); case 'array-contains': return v?.includes(x); case '>': return v > x; case '>=': return v >= x; case '<': return v < x; case '<=': return v <= x; default: throw new Error(`Unsupported demo query: ${op}`); } };
const docSnap = (p) => { const data = clone(state.docs[p]); return { id: p.split('/').pop(), ref: doc(p), exists: () => data !== undefined, data: () => clone(data), get: (f) => clone(fieldValue(data, f)) }; };
const querySnap = (q) => {
  let rows = Object.keys(state.docs).filter(p => p.startsWith(q.path + '/') && p.split('/').length === q.path.split('/').length + 1).map(docSnap);
  for (const c of q.constraints || []) {
    if (c.type === 'where') rows = rows.filter(d => matches(c.field === '__name__' ? d.id : fieldValue(d.data(), c.field), c.op, c.value));
    if (c.type === 'order') rows.sort((a, b) => { const x = fieldValue(a.data(), c.field), y = fieldValue(b.data(), c.field); return (x < y ? -1 : x > y ? 1 : 0) * (c.direction === 'desc' ? -1 : 1); });
  }
  for (const c of q.constraints || []) if (c.type === 'limit') rows = rows.slice(0, c.n);
  return { docs: rows, size: rows.length, empty: !rows.length, forEach: cb => rows.forEach(cb), docChanges: () => rows.map(d => ({ type: 'added', doc: d })) };
};
export const getDoc = async (r) => { await ready; return docSnap(r.path); };
export const getDocs = async (q) => { await ready; return querySnap(q); };
export const getCountFromServer = async (q) => { await ready; const count = querySnap(q).size; return { data: () => ({ count }) }; };
function firestoreEffects(p, previous) {
  const data = state.docs[p];
  if (/^users\/[^/]+$/.test(p) && data?.suspended) {
    for (const auth of auths.values()) if (auth.currentUser?.uid === p.split('/')[1]) session(auth, null);
  }
  if (p.startsWith('reviews/')) {
    const reviews = Object.entries(state.docs).filter(([k, v]) => k.startsWith('reviews/') && v.guardId === data.guardId).map(([, v]) => v);
    const guard = state.docs[`users/${data.guardId}`];
    if (guard) { guard.rating = reviews.reduce((n, r) => n + r.rating, 0) / reviews.length; guard.totalReviews = reviews.length; }
  }
  if (!previous && p.startsWith('messages/')) inbox('message', 'New demo message', data.text, { bookingId: data.bookingId });
  if (!previous && p.startsWith('emergencyAlerts/')) inbox('alert', 'Demo SOS received', 'Open the admin dashboard to review and resolve this simulated alert.', { alertId: p.split('/')[1] });
  if (previous?.kycStatus !== data?.kycStatus && data?.kycStatus) inbox('status', 'Document review updated', `${data.firstName || 'Protector'}: ${data.kycStatus}`);
}
export async function setDoc(r, value, options = {}) { await ready; const previous = state.docs[r.path]; state.docs[r.path] = options.merge ? { ...previous, ...clone(value) } : clone(value); firestoreEffects(r.path, previous); await persist(); emit('fs'); }
export async function updateDoc(r, value) {
  await ready; const data = state.docs[r.path]; if (!data) throw new Error('Demo document not found');
  const previous = clone(data);
  for (const [k, v] of Object.entries(value)) { const keys = k.split('.'); let target = data; for (const key of keys.slice(0, -1)) target = target[key] ??= {}; target[keys.at(-1)] = clone(v); }
  firestoreEffects(r.path, previous); await persist(); emit('fs');
}
export async function addDoc(c, value) { const r = doc(c, id()); await setDoc(r, value); return r; }
export async function deleteDoc(r) { await ready; delete state.docs[r.path]; await persist(); emit('fs', r.path); }
export const onSnapshot = (q, cb) => { const l = { kind: 'fs', path: q.path, run: () => cb(q.kind === 'doc' ? docSnap(q.path) : querySnap(q)) }; listeners.add(l); ready.then(() => { if (listeners.has(l)) l.run(); }); return () => listeners.delete(l); };
export const serverTimestamp = () => Timestamp.now();
export const getDatabase = () => ({ kind: 'database' });
export const connectDatabaseEmulator = () => {};
export const ref = (...parts) => reference(parts[0]?.kind === 'storage' ? 'storage' : 'database', ...parts);
const dataSnap = (p) => { const value = clone(read(p)); return { key: p.split('/').pop(), val: () => value ?? null, exists: () => value != null, child: k => dataSnap(path(p, k)), forEach: cb => { for (const k of Object.keys(value || {})) if (cb(dataSnap(path(p, k))) === true) return true; return false; } }; };
export const get = async (r) => { await ready; return dataSnap(r.path); };
export const onValue = (r, cb) => { const l = { kind: 'db', path: r.path, run: () => cb(dataSnap(r.path)) }; listeners.add(l); ready.then(() => { if (listeners.has(l)) l.run(); }); return () => listeners.delete(l); };
async function writeDatabase(changes) {
  await ready;
  // Validate against a copy, so an incorrect start code never partially starts a service.
  const next = clone(state.root);
  for (const [p, v] of Object.entries(changes)) put(p, v, next);
  for (const [key, b] of Object.entries(next.bookings || {})) {
    const previous = state.root.bookings[key];
    if (!previous) continue;
    if (b.status === 'active' && previous.status !== 'active' && b.startCodeAttempt !== next.bookingSecrets[key]?.startCode) throw denied('The start code does not match.');
    if (previous.guardId !== b.guardId) {
      delete next.guardBookingIndex[previous.guardId]?.[key];
      b.companyId = state.docs[`users/${b.guardId}`]?.companyId || null;
    }
    if (previous.status !== b.status) {
      inbox('booking', `Booking ${b.status.replace('_', ' ')}`, `${b.pickupAddress} · ${b.scheduledDate} ${b.scheduledTime}`, { bookingId: key });
      if (b.status === 'completed') {
        const guard = state.docs[`users/${b.guardId}`];
        if (guard) guard.completedJobs = (guard.completedJobs || 0) + 1;
      }

    }
  }
  state.root = next; await persist(); emit('db'); emit('fs');
}
export async function set(r, value) { return writeDatabase({ [r.path]: value }); }
export async function update(r, value) { return writeDatabase(Object.fromEntries(Object.entries(value).map(([k, v]) => [path(r.path, k), v]))); }
export function push(r, value) { const next = ref(r, id()); if (value !== undefined) void set(next, value); return next; }
export async function remove(r) { return set(r, null); }
export const getStorage = () => ({ kind: 'storage' });
export const connectStorageEmulator = () => {};
export async function uploadBytes(r, blob) {
  await ready;
  if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('Choose a test file under 5 MB.');
  const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  state.uploads[r.path] = url; await persist(); return { ref: r };
}
export async function getDownloadURL(r) { await ready; if (!state.uploads[r.path]) throw new Error('Demo file not found'); return state.uploads[r.path]; }
export const getFunctions = () => ({ kind: 'functions' });
export const connectFunctionsEmulator = () => {};
export const httpsCallable = () => async () => { throw denied(); };

// Local counterparts of the app's server-owned actions, used ONLY in demo mode.
export const demoSandbox = {
  async snapshot() { await ready; return { inbox: clone(state.inbox), accounts: Object.entries(state.docs).filter(([p, v]) => /^users\/[^/]+$/.test(p) && v.role).map(([p, v]) => ({ uid: p.split('/')[1], name: `${v.firstName} ${v.lastName}`, role: v.role, email: v.email })) }; },
  subscribe(cb) { observers.add(cb); return () => observers.delete(cb); },
  async reset() { await ready; state = fresh(); await persist(); for (const auth of auths.values()) session(auth, null); emit('fs'); emit('db'); },
  async record(type, title, body) { await ready; inbox(type, title, body); await persist(); },
  async verify(messageId, password) {
    await ready; const message = state.inbox.find(m => m.id === messageId);
    if (!message || message.used || !['reset', 'verification'].includes(message.type)) throw new Error('This demo link has already been used.');
    const a = { ...account(message.uid) };
    if (message.type === 'reset') {
      if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) throw new Error('Use 8+ characters with uppercase, lowercase, a number and a symbol.');
      a.hash = await passwordHash(password); a.sample = false;
    }
    a.verified = true; state.accounts[message.uid] = a;
    if (state.docs[`users/${message.uid}`]) state.docs[`users/${message.uid}`].emailVerified = true;
    message.used = true; await persist(); emit('fs');
  },
  async switchAccount(uid) { await ready; if (state.docs[`users/${uid}`]?.suspended) throw new Error('This demo account is suspended. Reinstate it in the admin view.'); if (!account(uid)?.verified) throw new Error('Verify this account using the demo inbox first.'); session(getAuth(), uid); },
  async createPayment(bookingId) {
    await ready;
    const b = state.root.bookings[bookingId];
    if (!b || b.clientId !== getAuth().currentUser?.uid) throw denied();
    if (!['pending', 'confirmed'].includes(b.status)) throw new Error('This booking cannot be paid.');
    const guard = state.docs[`users/${b.guardId}`];
    if (!guard || guard.suspended || guard.kycStatus !== 'approved' || !guard.availability) throw new Error('This protector is unavailable. Choose another protector.');
    const breakdown = calculatePrice({ ...b, hourlyRate: guard.hourlyRate });
    const prior = state.intents[bookingId];
    const intent = prior?.status === 'succeeded' ? prior : { id: prior?.id || id(), bookingId, breakdown, hourlyRate: guard.hourlyRate, status: 'requires_payment_method' };
    state.intents[bookingId] = intent; await persist();
    return { clientSecret: intent.id, paymentIntentId: intent.id, breakdown: intent.breakdown };
  },
  async pay(secret, outcome) {
    await ready;
    const intent = Object.values(state.intents).find(p => p.id === secret);
    if (!intent || state.root.bookings[intent.bookingId]?.clientId !== getAuth().currentUser?.uid) throw denied();
    if (state.root.bookings[intent.bookingId].status !== 'pending' && intent.status !== 'succeeded') throw new Error('This booking is no longer awaiting payment.');
    if (intent.status === 'succeeded') return { paymentIntentId: intent.id, status: 'succeeded' };
    if (outcome === 'decline') { inbox('payment', 'Demo card declined', 'No charge was made. Choose the successful test card to retry.'); await persist(); throw new Error('Your test card was declined. Choose the successful test card and try again.'); }
    intent.status = 'succeeded'; await persist(); return { paymentIntentId: intent.id, status: 'succeeded' };
  },
  async confirmPayment(bookingId) {
    await ready;
    const intent = state.intents[bookingId], b = state.root.bookings[bookingId];
    if (!b || b.clientId !== getAuth().currentUser?.uid || intent?.status !== 'succeeded') throw denied('Complete the demo payment first.');
    if (b.transactionId === intent.id) return { status: 'confirmed' };
    if (b.status !== 'pending') throw new Error('This booking is no longer awaiting payment.');
    const p = intent.breakdown;
    state.docs[`payments/${intent.id}`] = { userId: b.clientId, bookingId, transactionId: intent.id, amount: p.total, currency: 'MXN', status: 'completed', createdAt: Timestamp.now(), paymentMethod: 'test-card' };
    await update(ref('bookings', bookingId), { status: 'confirmed', confirmedAt: new Date().toISOString(), transactionId: intent.id, paymentIntentId: intent.id, paymentStatus: 'paid', hourlyRate: intent.hourlyRate, totalAmount: p.total, processingFee: p.processingFee, platformCut: p.platformCut, guardPayout: p.guardPayout, companyId: state.docs[`users/${b.guardId}`]?.companyId || null });
    return { status: 'confirmed' };
  },
  async refund(transactionId, bookingId) {
    await ready; const b = state.root.bookings[bookingId];
    if (!b || b.transactionId !== transactionId) return { success: false, error: 'Demo payment not found.' };
    if (state.docs[`users/${getAuth().currentUser?.uid}`]?.role !== 'admin' || !['cancelled', 'rejected'].includes(b.status)) return { success: false, error: 'Only an admin can refund a cancelled or declined booking.' };
    b.paymentStatus = 'refunded'; b.status = 'cancelled'; b.cancelledAt ||= new Date().toISOString(); const payment = state.docs[`payments/${transactionId}`]; if (payment) payment.status = 'refunded';
    inbox('payment', 'Demo refund completed', 'The simulated charge was refunded. No money moved.', { bookingId });
    await persist(); emit('fs'); emit('db'); return { success: true, transactionId: `refund-${transactionId}` };
  },
};
