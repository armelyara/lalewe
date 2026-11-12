// localStorage adapter: lets the whole flow run as a static demo with no
// backend. The database is shared across tabs (localStorage) while the
// session is per tab (sessionStorage), so a merchant and a driver can be
// tested side by side in two tabs.
import { CONFIG } from '../config.js';
import { STATUS, buildOrder, canTransition, normalizePhone, podHashFor } from '../domain/orders.js';
import { vehicleById } from '../domain/pricing.js';

const DB_KEY = 'lalewe.db.v2';
const SESSION_KEY = 'lalewe.session.v1';
export const TOPUP_METHODS = ['orange', 'wave', 'mtn', 'moov'];

const fail = (key) => { throw new Error(key); };
const text = (v, max) => String(v || '').trim().slice(0, max);

export function createMockAdapter(storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  const listeners = new Set();
  const authListeners = new Set();

  const load = () => {
    try {
      const db = JSON.parse(storage.getItem(DB_KEY));
      if (db && db.users && db.orders && db.wallets) return db;
    } catch { /* corrupted demo data: start fresh */ }
    return { users: {}, orders: {}, secrets: {}, wallets: {} };
  };
  const notify = () => listeners.forEach((fn) => fn());
  const save = (db) => {
    storage.setItem(DB_KEY, JSON.stringify(db));
    notify();
  };
  const uid = () => session.getItem(SESSION_KEY);
  const currentUser = () => {
    const id = uid();
    return id ? { uid: id, phone: `+${id.slice(2)}` } : null;
  };
  const emitAuth = () => authListeners.forEach((fn) => fn(currentUser()));
  const me = (db) => db.users[uid()] || fail('err.login');
  const sorted = (list) => list.sort((a, b) => b.createdAt - a.createdAt);
  const subscribe = (compute, cb) => {
    const run = () => cb(compute(load()));
    listeners.add(run);
    run();
    return () => listeners.delete(run);
  };
  const walletOf = (db, id) => (db.wallets[id] ||= { balance: 0, tx: [] });
  const addTx = (db, id, type, amount, ref) => {
    const w = walletOf(db, id);
    w.balance += amount;
    w.tx.unshift({ id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type, amount, ref, at: Date.now() });
    w.tx = w.tx.slice(0, 100);
  };

  // Cross-tab sync.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === DB_KEY) notify();
    });
  }

  // Applies a status change after checking role, ownership and the transition table.
  function transition(db, id, role, to, patch = {}) {
    const order = db.orders[id] || fail('err.notFound');
    const user = me(db);
    if (user.role !== role || !canTransition(role, order.status, to)) fail('err.action');
    if (role === 'merchant' && order.merchantId !== user.uid) fail('err.action');
    if (role === 'courier' && to !== STATUS.ACCEPTED && order.courierId !== user.uid) fail('err.action');
    Object.assign(order, patch, { status: to, updatedAt: Date.now() });
    return order;
  }

  const auth = {
    onChange(cb) {
      authListeners.add(cb);
      cb(currentUser());
      return () => authListeners.delete(cb);
    },
    async startPhoneSignIn(rawPhone) {
      const phone = normalizePhone(rawPhone) || fail('err.phone');
      return {
        async confirm(code) {
          if (String(code).trim() !== CONFIG.demoOtp) fail('err.code');
          session.setItem(SESSION_KEY, `u_${phone.slice(1)}`);
          emitAuth();
        },
      };
    },
    async signOut() {
      session.removeItem(SESSION_KEY);
      emitAuth();
    },
    async getProfile() {
      return load().users[uid()] || null;
    },
    // First sign-in creates a merchant profile so a guest can order right away.
    async ensureProfile() {
      const user = currentUser() || fail('err.login');
      const db = load();
      if (!db.users[user.uid]) {
        db.users[user.uid] = {
          uid: user.uid, phone: user.phone, role: 'merchant', name: '', businessName: '', commune: '',
          courierStatus: null, vehicleType: null, plate: '', online: false, createdAt: Date.now(),
        };
        save(db);
      }
      return db.users[user.uid];
    },
    async saveProfile(data) {
      const db = load();
      Object.assign(me(db), {
        name: text(data.name, 80),
        businessName: text(data.businessName, 80),
        commune: text(data.commune, 40),
      });
      save(db);
      return db.users[uid()];
    },
    async becomeCourier(data) {
      const db = load();
      const user = me(db);
      if (!vehicleById(data.vehicleType)) fail('err.vehicle');
      if (text(data.name, 80).length < 2) fail('err.name');
      if (text(data.plate, 20).length < 4) fail('err.plate');
      Object.assign(user, {
        role: 'courier',
        name: text(data.name, 80),
        commune: text(data.commune, 40),
        vehicleType: data.vehicleType,
        plate: text(data.plate, 20).toUpperCase(),
        // Demo shortcut: drivers are approved instantly. Real approval is manual.
        courierStatus: 'approved',
      });
      walletOf(db, user.uid);
      save(db);
      return user;
    },
    async setOnline(online) {
      const db = load();
      const user = me(db);
      if (user.role !== 'courier') fail('err.action');
      user.online = Boolean(online);
      save(db);
    },
  };

  const orders = {
    async create(input) {
      const user = me(load());
      if (user.role !== 'merchant') fail('err.merchantOnly');
      const id = `o_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const { order, deliveryCode } = await buildOrder(id, input, user);
      const db = load();
      db.orders[id] = order;
      db.secrets[id] = deliveryCode;
      save(db);
      return order;
    },
    watch(id, cb) {
      return subscribe((db) => db.orders[id] || null, cb);
    },
    watchMine(cb) {
      return subscribe((db) => sorted(Object.values(db.orders).filter((o) => o.merchantId === uid())), cb);
    },
    // Drivers only see pending jobs for their own vehicle type.
    watchAvailable(cb) {
      return subscribe((db) => {
        const vehicle = db.users[uid()]?.vehicleType;
        return sorted(Object.values(db.orders).filter((o) => o.status === STATUS.PENDING && o.vehicleType === vehicle));
      }, cb);
    },
    watchJobs(cb) {
      return subscribe((db) => sorted(Object.values(db.orders).filter((o) => o.courierId === uid())), cb);
    },
    // Accepting debits the platform commission from the driver wallet.
    async accept(id) {
      const db = load();
      const user = me(db);
      const order = db.orders[id] || fail('err.notFound');
      if (user.courierStatus !== 'approved') fail('err.pendingCourier');
      if (order.vehicleType !== user.vehicleType) fail('err.action');
      if (order.status !== STATUS.PENDING) fail('err.taken');
      if (walletOf(db, user.uid).balance < order.commission) fail('err.balance');
      transition(db, id, 'courier', STATUS.ACCEPTED, {
        courierId: user.uid, courierName: user.name, courierPhone: user.phone, courierPlate: user.plate, acceptedAt: Date.now(),
      });
      addTx(db, user.uid, 'commission', -order.commission, order.code);
      save(db);
      return order;
    },
    async pickUp(id) {
      const db = load();
      const order = transition(db, id, 'courier', STATUS.PICKED_UP, { pickedUpAt: Date.now() });
      save(db);
      return order;
    },
    async deliver(id, code) {
      const db = load();
      const existing = db.orders[id] || fail('err.notFound');
      if ((await podHashFor(id, String(code).trim())) !== existing.podHash) fail('err.podCode');
      const order = transition(db, id, 'courier', STATUS.DELIVERED, { deliveredAt: Date.now() });
      save(db);
      return order;
    },
    // Cancelling an accepted job gives the commission back to the driver.
    async cancel(id) {
      const db = load();
      const before = db.orders[id] || fail('err.notFound');
      const courierId = before.status === STATUS.ACCEPTED ? before.courierId : null;
      const order = transition(db, id, 'merchant', STATUS.CANCELLED, { cancelledAt: Date.now() });
      if (courierId) addTx(db, courierId, 'commission_refund', order.commission, order.code);
      save(db);
      return order;
    },
    async getDeliveryCode(id) {
      const db = load();
      return db.orders[id]?.merchantId === uid() ? db.secrets[id] || null : null;
    },
  };

  const wallet = {
    watch(cb) {
      return subscribe((db) => {
        const w = db.wallets[uid()] || { balance: 0, tx: [] };
        return { balance: w.balance, tx: w.tx };
      }, cb);
    },
    // Demo: credits instantly. Production goes through a Mobile Money payment.
    async topUp(amount, method) {
      const value = Math.round(Number(amount));
      if (!Number.isFinite(value) || value < 500 || value > 500000) fail('err.amount');
      if (!TOPUP_METHODS.includes(method)) fail('app.error');
      const db = load();
      addTx(db, me(db).uid, 'topup', value, method);
      save(db);
    },
  };

  return {
    mode: 'mock',
    auth,
    orders,
    wallet,
    resetDemo() {
      storage.removeItem(DB_KEY);
      notify();
    },
  };
}
