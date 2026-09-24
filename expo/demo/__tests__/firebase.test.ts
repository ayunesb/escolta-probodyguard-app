const demo = jest.requireActual('../firebase');

describe('public demo isolation', () => {
  const realFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn(() => { throw new Error('Network must not be used'); }) as any; });
  afterEach(async () => { expect(global.fetch).not.toHaveBeenCalled(); global.fetch = realFetch; await demo.signOut(); });

  it('opens every sample role without contacting an identity service', async () => {
    for (const [email, role] of [['sofia@cliente.test','client'],['diego@escolta.test','guard'],['valeria@sentinela.test','company'],['andres@escoltapro.test','admin']]) {
      const result = await demo.signInWithEmailAndPassword(demo.getAuth(), email, 'EscoltaDev!2026');
      const profile = await demo.getDoc(demo.doc(demo.getFirestore(), 'users', result.user.uid));
      expect(profile.data().role).toBe(role);
      await expect(result.user.getIdToken()).rejects.toThrow('unavailable');
    }
  });

  it('refuses real accounts, account creation, file uploads and cloud functions', async () => {
    await expect(demo.signInWithEmailAndPassword({},'someone@example.com','password')).rejects.toThrow();
    await expect(demo.createUserWithEmailAndPassword()).rejects.toThrow('unavailable');
    await expect(demo.sendPasswordResetEmail()).rejects.toThrow('unavailable');
    await expect(demo.uploadBytes()).rejects.toThrow('unavailable');
    await expect(demo.httpsCallable()()).rejects.toThrow('unavailable');
  });

  it('filters the sample roster and keeps changes within the in-memory store', async () => {
    const q = demo.query(demo.collection(demo.getFirestore(),'users'), demo.where('role','==','guard'),demo.where('kycStatus','==','approved'),demo.where('availability','==',true));
    const snapshot = await demo.getDocs(q);
    expect(snapshot.size).toBe(3);
    expect(snapshot.docs.map((d: any)=>d.data().firstName)).toEqual(['Diego','Mariana','Tomás']);
    const booking = demo.ref(demo.getDatabase(),'bookings/demo-test');
    await demo.set(booking,{status:'pending'});
    await demo.update(booking,{status:'cancelled'});
    expect((await demo.get(booking)).val().status).toBe('cancelled');
    await demo.remove(booking);
    expect((await demo.get(booking)).exists()).toBe(false);
  });
});
