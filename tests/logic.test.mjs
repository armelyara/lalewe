// Run: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { nearestCommune, routeDistanceKm } from '../js/domain/geo.js';
import { commissionFor, quote } from '../js/domain/pricing.js';
import { canTransition, normalizePhone, validateOrderInput } from '../js/domain/orders.js';
import { createMockAdapter } from '../js/data/mock.js';
import { STRINGS } from '../js/i18n.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const rejectsWith = (fn, key) => assert.rejects(fn, (e) => e.message === key, `expected ${key}`);

// i18n: both languages define the same keys, and every key used in code exists.
assert.deepEqual(Object.keys(STRINGS.fr).sort(), Object.keys(STRINGS.en).sort());
const files = ['js/app.js', 'js/ui.js', 'js/map.js', 'js/domain/orders.js', 'js/domain/pricing.js', 'js/data/mock.js', 'js/data/firebase.js',
  ...readdirSync(new URL('../js/views/', import.meta.url)).map((f) => `js/views/${f}`)];
for (const file of files) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const used = [...src.matchAll(/(?:\bt|fail)\(\s*'([a-zA-Z0-9_.]+)'/g), ...src.matchAll(/'((?:err|app)\.[a-zA-Z]+)'/g)].map((m) => m[1]);
  for (const key of used) assert.ok(key in STRINGS.fr, `missing i18n key ${key} (${file})`);
}
for (const k of ['pending', 'accepted', 'picked_up', 'delivered', 'cancelled']) assert.ok(`status.${k}` in STRINGS.fr);
for (const k of ['topup', 'commission', 'commission_refund']) assert.ok(`tx.${k}` in STRINGS.fr);
for (const k of ['moto', 'tricycle', 'van', 'truck']) assert.ok(`vehicle.${k}` in STRINGS.fr && `vehicle.cap.${k}` in STRINGS.fr);

// Domain
assert.equal(normalizePhone('07 08 09 10 11'), '+2250708091011');
assert.equal(normalizePhone('+225 0708091011'), '+2250708091011');
assert.equal(normalizePhone('12345'), null);
assert.equal(nearestCommune({ lat: 5.34, lng: -4.09 }).id, 'yopougon');
assert.equal(routeDistanceKm([{ commune: 'cocody' }, { commune: 'cocody' }]), 2);
assert.equal(routeDistanceKm([{ commune: 'cocody' }, { commune: '' }]), null);
const two = routeDistanceKm([{ commune: 'cocody' }, { commune: 'yopougon' }]);
const three = routeDistanceKm([{ commune: 'cocody' }, { commune: 'marcory' }, { commune: 'yopougon' }]);
assert.ok(two > 10 && two < 20 && three > two);
assert.equal(quote({ vehicleId: 'moto', distanceKm: 2 }).total, 1000);
assert.equal(quote({ vehicleId: 'moto', distanceKm: 2, serviceLevel: 'express' }).total, 2000);
assert.equal(quote({ vehicleId: 'moto', distanceKm: 2, extraStops: 1 }).total, 1300);
assert.throws(() => quote({ vehicleId: 'truck', distanceKm: 5 }), /err\.vehicle/);
assert.equal(commissionFor(2900), 450);
assert.ok(canTransition('courier', 'pending', 'accepted'));
assert.ok(!canTransition('merchant', 'picked_up', 'cancelled'));
assert.equal(validateOrderInput({}).errors.stops, 'err.stops');
// The price shows as soon as the communes are known, before the form is complete.
const partial = validateOrderInput({ stops: [{ commune: 'cocody' }, { commune: 'yopougon' }] });
assert.ok(partial.price.total > 0 && partial.errors['stops.1.contactPhone']);

// Full flow on the mock adapter: one shared DB, two sessions.
const db = memory();
const merchant = createMockAdapter(db, memory());
const driver = createMockAdapter(db, memory());
const signIn = async (api, phone) => {
  await (await api.auth.startPhoneSignIn(phone)).confirm('0000');
  return api.auth.ensureProfile();
};
await rejectsWith(async () => (await merchant.auth.startPhoneSignIn('0700000001')).confirm('9999'), 'err.code');
assert.equal((await signIn(merchant, '0700000001')).role, 'merchant');
await signIn(driver, '0500000002');
await rejectsWith(() => driver.auth.becomeCourier({ name: 'Koffi', vehicleType: 'moto', plate: '' }), 'err.plate');
const courier = await driver.auth.becomeCourier({ name: 'Koffi Yao', vehicleType: 'moto', plate: '1234 ab 01', commune: 'adjame' });
assert.equal(courier.role, 'courier');
assert.equal(courier.plate, '1234 AB 01');

const input = {
  stops: [
    { commune: 'cocody', landmark: 'Face pharmacie' },
    { commune: 'marcory', landmark: 'Zone 4, supermarché' },
    { commune: 'yopougon', landmark: 'Niangon, portail vert', contactPhone: '0100000003' },
  ],
  parcel: 'Chaussures', vehicleType: 'moto', serviceLevel: 'standard', goodsAmount: '15000',
};
await rejectsWith(() => driver.orders.create(input), 'err.merchantOnly');
await rejectsWith(() => merchant.orders.create({ ...input, vehicleType: 'truck' }), 'err.vehicle');
await rejectsWith(() => merchant.orders.create({ ...input, stops: input.stops.slice(0, 1) }), 'err.stops');
const order = await merchant.orders.create(input);
assert.equal(order.status, 'pending');
assert.equal(order.stops.length, 3);
assert.equal(order.stops[0].contactPhone, '+2250700000001'); // pickup defaults to the merchant number
assert.equal(order.goodsAmount, 15000);
assert.equal(order.commission, commissionFor(order.priceTotal));

let available = [];
driver.orders.watchAvailable((list) => { available = list; });
assert.equal(available.length, 1);
const code = await merchant.orders.getDeliveryCode(order.id);
assert.match(code, /^\d{4}$/);
assert.equal(await driver.orders.getDeliveryCode(order.id), null);

// Wallet: accepting needs enough balance and debits the commission.
let wallet = null;
driver.wallet.watch((w) => { wallet = w; });
await rejectsWith(() => driver.orders.accept(order.id), 'err.balance');
await rejectsWith(() => driver.wallet.topUp(100, 'wave'), 'err.amount');
await driver.wallet.topUp(2000, 'wave');
assert.equal(wallet.balance, 2000);
await rejectsWith(() => driver.orders.pickUp(order.id), 'err.action'); // not accepted yet
await driver.orders.accept(order.id);
assert.equal(wallet.balance, 2000 - order.commission);
assert.equal(wallet.tx[0].type, 'commission');
assert.equal(available.length, 0);
await rejectsWith(() => driver.orders.accept(order.id), 'err.taken');
await driver.orders.pickUp(order.id);
await rejectsWith(() => merchant.orders.cancel(order.id), 'err.action'); // too late
await rejectsWith(() => driver.orders.deliver(order.id, code === '0000' ? '1111' : '0000'), 'err.podCode');
assert.equal((await driver.orders.deliver(order.id, code)).status, 'delivered');

// Cancelling an accepted job refunds the commission.
const second = await merchant.orders.create(input);
await driver.orders.accept(second.id);
const afterAccept = wallet.balance;
await merchant.orders.cancel(second.id);
driver.wallet.watch((w) => { wallet = w; }); // adapters only sync across tabs in a browser
assert.equal(wallet.balance, afterAccept + second.commission);
assert.equal(wallet.tx[0].type, 'commission_refund');
let mine = [];
merchant.orders.watchMine((list) => { mine = list; });
assert.deepEqual(mine.map((o) => o.status).sort(), ['cancelled', 'delivered']);
console.log('All logic tests passed');
