// Firebase adapter (Phone Auth + Firestore). Loaded only when
// CONFIG.dataMode === 'firebase', so the demo build never hits the network.
// Queries use a single equality filter and sort client-side: no composite
// index is required.
//
// NOT PRODUCTION-READY YET: money must never be moved by the client. Wallet
// top-ups and the commission debit on accept need Cloud Functions (see
// docs/ARCHITECTURE.md). Until then the wallet is read-only here and accept()
// does not charge the commission.
import { CONFIG } from '../config.js';
import { STATUS, buildOrder, normalizePhone, podHashFor } from '../domain/orders.js';
import { vehicleById } from '../domain/pricing.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const fail = (key) => { throw new Error(key); };
const text = (v, max) => String(v || '').trim().slice(0, max);

export async function createFirebaseAdapter() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(CONFIG.firebase);
  const fbAuth = A.getAuth(app);
  const db = F.getFirestore(app);

  const uid = () => fbAuth.currentUser?.uid || null;
  const userRef = () => F.doc(db, 'users', uid());
  const orderRef = (id) => F.doc(db, 'orders', id);
  const sorted = (snap) => snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt);
  const watchQuery = (field, value, cb, keep = () => true) =>
    F.onSnapshot(
      F.query(F.collection(db, 'orders'), F.where(field, '==', value), F.limit(100)),
      (snap) => cb(sorted(snap).filter(keep)),
      (err) => { console.error(err); cb([]); },
    );
  let profileCache = null;

  async function requireProfile() {
    const snap = await F.getDoc(userRef());
    return snap.exists() ? snap.data() : fail('err.login');
  }

  let recaptcha = null;

  const auth = {
    onChange(cb) {
      return A.onAuthStateChanged(fbAuth, (u) => {
        profileCache = null;
        cb(u ? { uid: u.uid, phone: u.phoneNumber } : null);
      });
    },
    async startPhoneSignIn(rawPhone) {
      const phone = normalizePhone(rawPhone) || fail('err.phone');
      // The login view must contain an element with id="recaptcha".
      recaptcha ||= new A.RecaptchaVerifier(fbAuth, 'recaptcha', { size: 'invisible' });
      const result = await A.signInWithPhoneNumber(fbAuth, phone, recaptcha);
      return {
        async confirm(code) {
          try {
            await result.confirm(String(code).trim());
          } catch {
            fail('err.code');
          }
        },
      };
    },
    signOut: () => A.signOut(fbAuth),
    async getProfile() {
      if (!uid()) return null;
      const snap = await F.getDoc(userRef());
      profileCache = snap.exists() ? snap.data() : null;
      return profileCache;
    },
    async ensureProfile() {
      const existing = await auth.getProfile();
      if (existing) return existing;
      const profile = {
        uid: uid(), phone: fbAuth.currentUser.phoneNumber, role: 'merchant', name: '', businessName: '', commune: '',
        courierStatus: null, vehicleType: null, plate: '', online: false, createdAt: Date.now(),
      };
      await F.setDoc(userRef(), profile);
      profileCache = profile;
      return profile;
    },
    async saveProfile(data) {
      const patch = { name: text(data.name, 80), businessName: text(data.businessName, 80), commune: text(data.commune, 40) };
      await F.updateDoc(userRef(), patch);
      return auth.getProfile();
    },
    async becomeCourier(data) {
      if (!vehicleById(data.vehicleType)) fail('err.vehicle');
      if (text(data.name, 80).length < 2) fail('err.name');
      if (text(data.plate, 20).length < 4) fail('err.plate');
      // Drivers start as 'pending'; an admin flips this to 'approved'.
      await F.updateDoc(userRef(), {
        role: 'courier', courierStatus: 'pending', name: text(data.name, 80), commune: text(data.commune, 40),
        vehicleType: data.vehicleType, plate: text(data.plate, 20).toUpperCase(),
      });
      return auth.getProfile();
    },
    setOnline: (online) => F.updateDoc(userRef(), { online: Boolean(online) }),
  };

  const orders = {
    async create(input) {
      const user = await requireProfile();
      const ref = F.doc(F.collection(db, 'orders'));
      const { order, deliveryCode } = await buildOrder(ref.id, input, user);
      const batch = F.writeBatch(db);
      batch.set(ref, order);
      batch.set(F.doc(db, 'orders', ref.id, 'private', 'secret'), { merchantId: user.uid, deliveryCode });
      await batch.commit();
      return order;
    },
    watch(id, cb) {
      return F.onSnapshot(orderRef(id), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
    },
    watchMine: (cb) => watchQuery('merchantId', uid(), cb),
    watchAvailable: (cb) => watchQuery('status', STATUS.PENDING, cb, (o) => o.vehicleType === profileCache?.vehicleType),
    watchJobs: (cb) => watchQuery('courierId', uid(), cb),
    async accept(id) {
      const user = await requireProfile();
      // Transaction: two drivers cannot take the same order.
      await F.runTransaction(db, async (tx) => {
        const snap = await tx.get(orderRef(id));
        if (!snap.exists() || snap.data().status !== STATUS.PENDING) fail('err.taken');
        const now = Date.now();
        tx.update(orderRef(id), {
          status: STATUS.ACCEPTED, courierId: user.uid, courierName: user.name, courierPhone: user.phone,
          courierPlate: user.plate, acceptedAt: now, updatedAt: now,
        });
      });
    },
    async pickUp(id) {
      const now = Date.now();
      await F.updateDoc(orderRef(id), { status: STATUS.PICKED_UP, pickedUpAt: now, updatedAt: now });
    },
    async deliver(id, code) {
      const podCode = String(code).trim();
      const snap = await F.getDoc(orderRef(id));
      // Friendly client check; the security rules re-verify the hash.
      if (!snap.exists() || (await podHashFor(id, podCode)) !== snap.data().podHash) fail('err.podCode');
      const now = Date.now();
      await F.updateDoc(orderRef(id), { status: STATUS.DELIVERED, podCode, deliveredAt: now, updatedAt: now });
    },
    async cancel(id) {
      const now = Date.now();
      await F.updateDoc(orderRef(id), { status: STATUS.CANCELLED, cancelledAt: now, updatedAt: now });
    },
    async getDeliveryCode(id) {
      try {
        const snap = await F.getDoc(F.doc(db, 'orders', id, 'private', 'secret'));
        return snap.exists() ? snap.data().deliveryCode : null;
      } catch {
        return null; // not the merchant: rules deny the read
      }
    },
  };

  const wallet = {
    watch(cb) {
      return F.onSnapshot(
        F.doc(db, 'wallets', uid()),
        (s) => cb(s.exists() ? { balance: s.data().balance || 0, tx: s.data().tx || [] } : { balance: 0, tx: [] }),
        () => cb({ balance: 0, tx: [] }),
      );
    },
    async topUp() {
      fail('err.serverOnly');
    },
  };

  return { mode: 'firebase', auth, orders, wallet };
}
