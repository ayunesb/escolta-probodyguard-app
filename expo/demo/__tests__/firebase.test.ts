import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
jest.mock('firebase/database', () => jest.requireActual('../firebase'));
jest.mock('firebase/firestore', () => jest.requireActual('../firebase'));
jest.mock('@/lib/firebase', () => ({ auth: () => jest.requireActual('../firebase').getAuth(), db: () => jest.requireActual('../firebase').getFirestore(), realtimeDb: () => jest.requireActual('../firebase').getDatabase() }));
const demo = jest.requireActual('../firebase');
const { bookingService } = jest.requireActual('../../services/bookingService');
const { userService } = jest.requireActual('../../services/userService');
const { calculatePrice } = jest.requireActual('../../utils/pricing');
const auth = () => demo.getAuth();
const signIn = (email = 'sofia@cliente.test') => demo.signInWithEmailAndPassword(auth(), email, 'EscoltaDev!2026');
const readBooking = async (id: string) => (await demo.get(demo.ref(`bookings/${id}`))).val();
async function newBooking() {
  await signIn();
  const price = calculatePrice({hourlyRate:450,duration:4,vehicleType:'armored',protectionType:'unarmed',numberOfProtectors:1});
  return bookingService.createBooking({clientId:'client',guardId:'guard',hourlyRate:450,scheduledDate:'2027-01-31',scheduledTime:'23:30',duration:4,vehicleType:'armored',protectionType:'unarmed',numberOfProtectors:1,numberOfProtectees:2,dressCode:'suit',pickupAddress:'Demo hotel',pickupLatitude:19.43,pickupLongitude:-99.19,totalAmount:price.total,processingFee:price.processingFee,platformCut:price.platformCut,guardPayout:price.guardPayout});
}
async function paidBooking() {
  const b=await newBooking(); const intent=await demo.demoSandbox.createPayment(b.id);
  await demo.demoSandbox.pay(intent.clientSecret,'success'); await demo.demoSandbox.confirmPayment(b.id); return b;
}
describe('functional sandbox with network forbidden', () => {
  const realFetch = global.fetch;
  beforeAll(() => { Object.defineProperty(globalThis, 'crypto', {value:webcrypto,configurable:true}); Object.defineProperty(globalThis,'TextEncoder',{value:TextEncoder,configurable:true}); });
  beforeEach(async () => { global.fetch = jest.fn(() => { throw new Error('Network must not be used'); }) as any; await demo.demoSandbox.reset(); global.localStorage.clear(); });
  afterEach(async () => { expect(global.fetch).not.toHaveBeenCalled(); global.fetch=realFetch; await demo.signOut(); });
  it.each([['sofia@cliente.test','client'],['diego@escolta.test','guard'],['valeria@sentinela.test','company'],['andres@escoltapro.test','admin']])('signs in %s locally',async(email,role)=>{
    const {user}=await signIn(email);expect((await demo.getDoc(demo.doc('users',user.uid))).data().role).toBe(role); await expect(user.getIdToken()).rejects.toThrow('unavailable');
  });
  it('rejects wrong credentials and cloud calls',async()=>{
    await expect(demo.signInWithEmailAndPassword(auth(),'sofia@cliente.test','wrong')).rejects.toMatchObject({code:'auth/invalid-credential'}); await expect(demo.httpsCallable()()).rejects.toThrow('unavailable');
  });
  it('creates, verifies and resets a local account',async()=>{
    const {user}=await demo.createUserWithEmailAndPassword(auth(),'new@demo.test','Sample!2026');expect(user.emailVerified).toBe(false);
    await demo.setDoc(demo.doc('users',user.uid),{email:user.email,firstName:'Demo',lastName:'User',role:'client'});await demo.sendEmailVerification(user);
    let snapshot=await demo.demoSandbox.snapshot();await demo.demoSandbox.verify(snapshot.inbox[0].id);
    await expect(demo.demoSandbox.verify(snapshot.inbox[0].id)).rejects.toThrow('already been used');await demo.signOut();
    expect((await demo.signInWithEmailAndPassword(auth(),user.email,'Sample!2026')).user.emailVerified).toBe(true);
    await demo.sendPasswordResetEmail(auth(),user.email);snapshot=await demo.demoSandbox.snapshot();await demo.demoSandbox.verify(snapshot.inbox[0].id,'Changed!2026');
    await expect(demo.signInWithEmailAndPassword(auth(),user.email,'Sample!2026')).rejects.toMatchObject({code:'auth/invalid-credential'});expect((await demo.signInWithEmailAndPassword(auth(),user.email,'Changed!2026')).user.uid).toBe(user.uid);
  });
  it('preserves the company session while inviting a guard',async()=>{
    await signIn('valeria@sentinela.test');const secondary=demo.getAuth(demo.initializeApp({},'company-test'));
    const {user}=await demo.createUserWithEmailAndPassword(secondary,'invited@demo.test','Temporary!2026');await demo.sendPasswordResetEmail(secondary,user.email);await demo.signOut(secondary);
    expect(auth().currentUser.uid).toBe('company');expect((await demo.demoSandbox.snapshot()).inbox[0].type).toBe('reset');
  });
  it('handles decline/retry, exact pricing/date and idempotent payment',async()=>{
    const b=await newBooking(),intent=await demo.demoSandbox.createPayment(b.id);expect(intent.breakdown.total).toBe(2800.20);
    await expect(demo.demoSandbox.confirmPayment(b.id)).rejects.toThrow();await expect(demo.demoSandbox.pay(intent.clientSecret,'decline')).rejects.toThrow('declined');expect((await readBooking(b.id)).status).toBe('pending');
    await demo.demoSandbox.pay(intent.clientSecret,'success');await demo.demoSandbox.confirmPayment(b.id);await demo.demoSandbox.confirmPayment(b.id);
    expect(await readBooking(b.id)).toMatchObject({status:'confirmed',scheduledDate:'2027-01-31',scheduledTime:'23:30',guardPayout:2295,totalAmount:2800.2});expect((await demo.getDocs(demo.collection('payments'))).size).toBe(1);
  });
  it('reprices pending bookings from the latest guard rate before payment',async()=>{
    const b=await newBooking();await demo.updateDoc(demo.doc('users','guard'),{hourlyRate:500});
    const intent=await demo.demoSandbox.createPayment(b.id);expect(intent.breakdown.total).toBe(3111);
    await demo.demoSandbox.pay(intent.clientSecret,'success');await demo.demoSandbox.confirmPayment(b.id);
    expect(await readBooking(b.id)).toMatchObject({hourlyRate:500,totalAmount:3111});
  });
  it('enforces roles and start code, completes service and rates exactly once',async()=>{
    const b=await paidBooking();await expect(bookingService.acceptBooking(b.id)).rejects.toThrow();await signIn('diego@escolta.test');await bookingService.acceptBooking(b.id);await bookingService.markEnRoute(b.id);
    await expect(bookingService.startBooking(b.id,'000000')).rejects.toThrow();expect((await readBooking(b.id)).status).toBe('en_route');expect((await readBooking(b.id)).startedAt).toBeUndefined();
    await bookingService.startBooking(b.id,b.startCode);await bookingService.completeBooking(b.id);expect((await demo.getDoc(demo.doc('users','guard'))).data().completedJobs).toBe(38);
    await signIn();const scores={professionalism:5,punctuality:4,communication:5,languageClarity:4};await bookingService.rateBooking(b.id,{rating:5,ratingBreakdown:scores,review:'Test review'});
    expect((await demo.getDoc(demo.doc('reviews',b.id))).data().ratingBreakdown).toEqual(scores);await expect(bookingService.rateBooking(b.id,{rating:4})).rejects.toThrow();expect((await demo.getDoc(demo.doc('users','guard'))).data().rating).toBe(5);
  });
  it('updates reassignment indexes and refunds paid cancellations',async()=>{
    const b=await paidBooking();await signIn('diego@escolta.test');await bookingService.rejectBooking(b.id,'Schedule conflict');await signIn();await bookingService.reassignGuard(b.id,'tomas');
    expect((await demo.get(demo.ref('guardBookingIndex/guard/'+b.id))).exists()).toBe(false);expect((await demo.get(demo.ref('guardBookingIndex/tomas/'+b.id))).val()).toBe(true);
    await bookingService.cancelBooking(b.id,'client','Plans changed');expect((await readBooking(b.id)).status).toBe('cancelled');
    const paid=await readBooking(b.id);await signIn('andres@escoltapro.test');await demo.demoSandbox.refund(paid.transactionId,b.id);expect((await readBooking(b.id)).paymentStatus).toBe('refunded');
  });
  it('supports roster queries, timestamp snapshots and suspension',async()=>{
    const q=demo.query(demo.collection('users'),demo.where('role','==','guard'),demo.where('kycStatus','==','approved'),demo.where('availability','==',true));expect((await demo.getDocs(q)).size).toBe(3);
    await demo.updateDoc(demo.doc('users','ivan'),{kycStatus:'approved',availability:true});expect((await demo.getDocs(q)).size).toBe(4);
    await userService.setSuspended('ivan',true);expect((await demo.getDoc(demo.doc('users','ivan'))).data().suspended).toBe(true);
    const ts=demo.Timestamp.now();await demo.setDoc(demo.doc('messages','one'),{timestamp:ts,participantIds:['client','guard'],text:'Hello'});
    const snap=await demo.getDocs(demo.query(demo.collection('messages'),demo.where('participantIds','array-contains','guard'),demo.orderBy('timestamp','desc')));expect(snap.docs[0].data().timestamp.toDate().getTime()).toBe(ts.toMillis());expect((await demo.getDocs(demo.query(demo.collection('users'),demo.where('__name__','==','ivan')))).size).toBe(1);
  });
  it('resets records and notifications',async()=>{
    await paidBooking();await demo.demoSandbox.record('contact','Simulated call','tel:911');await demo.demoSandbox.reset();expect((await demo.demoSandbox.snapshot()).inbox).toEqual([]);expect(auth().currentUser).toBe(null);expect(Object.keys((await demo.get(demo.ref('bookings'))).val())).toHaveLength(7);
  });
});
