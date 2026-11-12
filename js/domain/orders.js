import { CONFIG } from '../config.js';
import { communeById, routeDistanceKm } from './geo.js';
import { commissionFor, quote } from './pricing.js';

export const STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export const ACTIVE_STATUSES = [STATUS.PENDING, STATUS.ACCEPTED, STATUS.PICKED_UP];

// Allowed transitions per role. Single source of truth for UI and adapters;
// Firestore rules enforce the same table server-side.
const TRANSITIONS = {
  merchant: { pending: ['cancelled'], accepted: ['cancelled'] },
  courier: { pending: ['accepted'], accepted: ['picked_up'], picked_up: ['delivered'] },
};

export function canTransition(role, from, to) {
  return Boolean(TRANSITIONS[role]?.[from]?.includes(to));
}

// Côte d'Ivoire numbers: 10 digits, optional +225 / 00225 prefix.
export function normalizePhone(input) {
  const digits = String(input || '').replace(/[\s.\-()]/g, '');
  const m = digits.match(/^(?:\+225|00225)?(\d{10})$/);
  return m ? `+225${m[1]}` : null;
}

function randomDigits(n) {
  const buf = new Uint32Array(n);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (x) => x % 10).join('');
}

export const generateOrderCode = () => `LW-${randomDigits(6)}`;
export const generateDeliveryCode = () => randomDigits(4);

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Proof-of-delivery hash: the driver must type the code given by the recipient.
export const podHashFor = (orderId, code) => sha256Hex(`${code}${orderId}`);

const clean = (v, max) => String(v || '').trim().slice(0, max);

function cleanStop(stop) {
  const out = {
    commune: clean(stop?.commune, 40),
    landmark: clean(stop?.landmark, 200),
    contactName: clean(stop?.contactName, 80),
    contactPhone: clean(stop?.contactPhone, 20),
  };
  if (Number.isFinite(stop?.lat) && Number.isFinite(stop?.lng)) {
    out.lat = stop.lat;
    out.lng = stop.lng;
  }
  return out;
}

// Stops: index 0 is the pickup, the last one is the final drop-off.
// Returns { errors, value, price }; errors maps "stops.1.landmark" -> message key.
export function validateOrderInput(input) {
  const errors = {};
  const stops = (Array.isArray(input?.stops) ? input.stops : []).slice(0, CONFIG.maxStops).map(cleanStop);
  const value = {
    stops,
    parcel: clean(input?.parcel, 200),
    note: clean(input?.note, 300),
    vehicleType: clean(input?.vehicleType, 20) || 'moto',
    serviceLevel: clean(input?.serviceLevel, 20) || 'standard',
    goodsAmount: Math.max(0, Math.round(Number(input?.goodsAmount) || 0)),
  };
  if (stops.length < 2) errors.stops = 'err.stops';
  stops.forEach((stop, i) => {
    const isLast = i === stops.length - 1;
    if (!communeById(stop.commune)) errors[`stops.${i}.commune`] = 'err.commune';
    if (stop.landmark.length < 3) errors[`stops.${i}.landmark`] = 'err.landmark';
    if (stop.contactPhone || (isLast && i > 0)) {
      const phone = normalizePhone(stop.contactPhone);
      if (phone) stop.contactPhone = phone;
      else errors[`stops.${i}.contactPhone`] = 'err.phone';
    }
  });
  if (value.goodsAmount > 5_000_000) errors.goodsAmount = 'err.amount';

  // The price only needs the communes, so it can show before the form is complete.
  let price = null;
  try {
    price = quote({
      vehicleId: value.vehicleType,
      serviceLevel: value.serviceLevel,
      distanceKm: routeDistanceKm(stops),
      extraStops: stops.length - 2,
    });
  } catch (e) {
    if (e.message === 'err.vehicle') errors.vehicleType = e.message;
  }
  if (!price && !Object.keys(errors).length) errors.stops = 'app.error';
  return { errors, value, price };
}

// Builds the order document shared by every data adapter.
export async function buildOrder(id, input, merchant) {
  const { errors, value, price } = validateOrderInput(input);
  if (Object.keys(errors).length) {
    const err = new Error(Object.values(errors)[0]);
    err.fields = errors;
    throw err;
  }
  if (!value.stops[0].contactPhone) value.stops[0].contactPhone = merchant.phone;
  const deliveryCode = generateDeliveryCode();
  const now = Date.now();
  const order = {
    id,
    code: generateOrderCode(),
    status: STATUS.PENDING,
    merchantId: merchant.uid,
    merchantName: merchant.businessName || merchant.name || '',
    merchantPhone: merchant.phone,
    courierId: null,
    courierName: null,
    courierPhone: null,
    vehicleType: value.vehicleType,
    serviceLevel: value.serviceLevel,
    stops: value.stops,
    parcel: value.parcel,
    note: value.note,
    // Goods price: the driver pays it to the merchant at pickup and collects
    // it from the recipient, together with the delivery fee.
    goodsAmount: value.goodsAmount,
    distanceKm: price.distanceKm,
    priceTotal: price.total,
    commission: commissionFor(price.total),
    paymentMethod: 'cash_on_delivery',
    podHash: await podHashFor(id, deliveryCode),
    createdAt: now,
    updatedAt: now,
  };
  return { order, deliveryCode };
}
