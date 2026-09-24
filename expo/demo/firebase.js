// A build-time replacement for Firebase in the public web demo ONLY.
// All data stays in memory; there is no networking, credential, or live backend.
import { createSeed } from './seed';
const { docs, root } = createSeed();
const listeners = new Set();
const apps = [];
const authListeners = new Set();
let sequence = 0;
const auth = { currentUser: null };
const id = () => `demo-local-${++sequence}`;
const clone = (v) => v == null ? v : v instanceof Timestamp ? new Timestamp(v.seconds, v.nanoseconds) : Array.isArray(v) ? v.map(clone) : typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])) : v;
const path = (...parts) => parts.flatMap(p => typeof p === 'string' ? p.split('/') : p?.path?.split('/') || []).filter(Boolean).join('/');
const reference = (kind, ...parts) => { const p = path(...parts); return { kind, path: p, id: p.split('/').pop(), key: p.split('/').pop() || null }; };
const read = (p) => p.split('/').filter(Boolean).reduce((v, k) => v?.[k], root);
const put = (p, value) => { const keys = p.split('/').filter(Boolean); let node = root; for (const key of keys.slice(0,-1)) node = node[key] ??= {}; if (value === null) delete node[keys.at(-1)]; else node[keys.at(-1)] = clone(value); };
const emit = (kind, p) => { for (const l of [...listeners]) if (l.kind === kind && (p.startsWith(l.path) || l.path.startsWith(p))) queueMicrotask(l.run); };
const denied = () => Object.assign(new Error('This action is unavailable in the public demo.'), { code: 'permission-denied' });
export const initializeApp = (options = {}, name = '[DEFAULT]') => { const app = { name, options: { projectId: 'demo-escolta-public' } }; apps.push(app); return app; };
export const getApps = () => apps;
export const getApp = () => apps[0] || initializeApp();
export const initializeAuth = () => auth;
export const getAuth = () => auth;
export const browserLocalPersistence = {};
export const inMemoryPersistence = {};
export const connectAuthEmulator = () => {};
export const onAuthStateChanged = (_, cb) => { authListeners.add(cb); queueMicrotask(() => cb(auth.currentUser)); return () => authListeners.delete(cb); };
export async function signInWithEmailAndPassword(_, email, password) {
  const entry = Object.entries(docs).find(([p, u]) => p.split('/').length === 2 && p.startsWith('users/') && u.email === email);
  if (!entry || password !== 'EscoltaDev!2026') throw Object.assign(new Error('Choose a sample role to explore the demo.'), { code: 'auth/invalid-credential' });
  auth.currentUser = { uid: entry[0].split('/')[1], email, emailVerified: true, getIdToken: async () => { throw denied(); } };
  for (const cb of authListeners) queueMicrotask(() => cb(auth.currentUser));
  return { user: auth.currentUser };
}
export async function signOut() { auth.currentUser = null; for (const cb of authListeners) queueMicrotask(() => cb(null)); }
export async function createUserWithEmailAndPassword() { throw denied(); }
export async function sendEmailVerification() { throw denied(); }
export async function sendPasswordResetEmail() { throw denied(); }
export const getFirestore = () => ({ kind: 'firestore' });
export const connectFirestoreEmulator = () => {};
export const doc = (...parts) => reference('doc', ...parts);
export const collection = (...parts) => reference('collection', ...parts);
export const query = (ref, ...constraints) => ({ ...ref, constraints });
export const where = (field, op, value) => ({ type: 'where', field, op, value });
export const orderBy = (field, direction = 'asc') => ({ type: 'order', field, direction });
export const limit = (n) => ({ type: 'limit', n });
const fieldValue = (data, field) => field.split('.').reduce((v,k)=>v?.[k], data);
const matches = (v, op, x) => { switch(op) { case '==': return v === x; case '!=': return v !== x; case 'in': return x.includes(v); case 'array-contains': return v?.includes(x); case '>': return v > x; case '>=': return v >= x; case '<': return v < x; case '<=': return v <= x; default: throw new Error(`Unsupported demo query: ${op}`); } };
const docSnap = (p) => ({ id: p.split('/').pop(), ref: doc(p), exists: () => docs[p] !== undefined, data: () => clone(docs[p]), get: (f) => clone(fieldValue(docs[p],f)) });
const querySnap = (q) => {
  let rows = Object.keys(docs).filter(p => p.startsWith(q.path + '/') && p.split('/').length === q.path.split('/').length + 1).map(docSnap);
  for (const c of q.constraints || []) {
    if (c.type === 'where') rows = rows.filter(d => matches(fieldValue(d.data(), c.field), c.op, c.value));
    if (c.type === 'order') rows.sort((a,b) => { const x=fieldValue(a.data(),c.field),y=fieldValue(b.data(),c.field);return (x<y?-1:x>y?1:0)*(c.direction==='desc'?-1:1); });
    if (c.type === 'limit') rows = rows.slice(0,c.n);
  }
  return { docs: rows, size: rows.length, empty: !rows.length, forEach: cb => rows.forEach(cb), docChanges: () => rows.map(d=>({type:'added',doc:d})) };
};
export const getDoc = async (r) => docSnap(r.path);
export const getDocs = async (q) => querySnap(q);
export const getCountFromServer = async (q) => ({ data: () => ({ count: querySnap(q).size }) });
export async function setDoc(r, value, options = {}) { docs[r.path] = options.merge ? { ...docs[r.path], ...clone(value) } : clone(value); emit('fs',r.path); }
export async function updateDoc(r, value) { const data = docs[r.path]; if (!data) throw new Error('Demo document not found'); for(const [k,v] of Object.entries(value)) { const keys=k.split('.');let target=data;for(const key of keys.slice(0,-1)) target=target[key]??={};target[keys.at(-1)]=clone(v); } emit('fs',r.path); }
export async function addDoc(c, value) { const r=doc(c,id()); await setDoc(r,value); return r; }
export async function deleteDoc(r) { delete docs[r.path]; emit('fs',r.path); }
export const onSnapshot = (q, cb) => { const l={kind:'fs',path:q.path,run:()=>cb(q.kind==='doc'?docSnap(q.path):querySnap(q))};listeners.add(l);queueMicrotask(l.run);return()=>listeners.delete(l); };
export class Timestamp { constructor(seconds,nanoseconds=0){this.seconds=seconds;this.nanoseconds=nanoseconds;}toDate(){return new Date(this.toMillis());}toMillis(){return this.seconds*1000+this.nanoseconds/1e6;}static now(){return Timestamp.fromDate(new Date());}static fromDate(d){return new Timestamp(Math.floor(d.getTime()/1000),(d.getTime()%1000)*1e6);} }
export const serverTimestamp = () => Timestamp.now();
export const getDatabase = () => ({kind:'database'});
export const connectDatabaseEmulator = () => {};
export const ref = (...parts) => reference(parts[0]?.kind === 'storage' ? 'storage' : 'database', ...parts);
const dataSnap = (p) => { const value=clone(read(p));return { key:p.split('/').pop(),val:()=>value??null,exists:()=>value!=null,child:k=>dataSnap(path(p,k)),forEach:cb=>{for(const k of Object.keys(value||{})){if(cb(dataSnap(path(p,k)))===true)return true;}return false;} }; };
export const get = async (r) => dataSnap(r.path);
export const onValue = (r, cb) => {const l={kind:'db',path:r.path,run:()=>cb(dataSnap(r.path))};listeners.add(l);queueMicrotask(l.run);return()=>listeners.delete(l);};
export async function set(r,value){put(r.path,value);emit('db',r.path);}
export async function update(r,value){for(const [k,v] of Object.entries(value))put(path(r.path,k),v);emit('db',r.path);}
export function push(r,value){const next=ref(r,id());if(value!==undefined)void set(next,value);return next;}
export async function remove(r){return set(r,null);}
export const getStorage = () => ({kind:'storage'});
export const connectStorageEmulator = () => {};
export async function uploadBytes(){throw denied();}
export async function getDownloadURL(){throw denied();}
export const getFunctions = () => ({kind:'functions'});
export const connectFunctionsEmulator = () => {};
export const httpsCallable = () => async () => {throw denied();};
