import { CONFIG } from '../config.js';

// Pricing table (FCFA). Only vehicles with available:true can be booked; the
// others are displayed as "coming soon". Drivers can register for any of them.
export const VEHICLES = [
  { id: 'moto', img: 'img/moto.png', base: 500, perKm: 150, min: 1000, stopFee: 300, available: true },
  { id: 'car', img: 'img/voiture.png', base: 1500, perKm: 250, min: 2500, stopFee: 500, available: false },
  { id: 'van', img: 'img/fourgon.png', base: 5000, perKm: 500, min: 8000, stopFee: 1000, available: false },
  { id: 'truck', img: 'img/camion.png', base: 15000, perKm: 900, min: 20000, stopFee: 2000, available: false },
];

export const SERVICE_LEVELS = [
  { id: 'standard', surcharge: 0 },
  { id: 'express', surcharge: 1000 },
];

const ROUND_TO = 100;

export function vehicleById(id) {
  return VEHICLES.find((v) => v.id === id) || null;
}

// extraStops = number of stops beyond pickup + one drop-off.
export function quote({ vehicleId, serviceLevel = 'standard', distanceKm, extraStops = 0 }) {
  const vehicle = vehicleById(vehicleId);
  const level = SERVICE_LEVELS.find((s) => s.id === serviceLevel);
  if (!vehicle || !vehicle.available) throw new Error('err.vehicle');
  if (!level) throw new Error('app.error');
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new Error('app.error');
  const raw =
    Math.max(vehicle.min, vehicle.base + vehicle.perKm * distanceKm) +
    vehicle.stopFee * Math.max(0, extraStops) +
    level.surcharge;
  return { vehicleId, serviceLevel, distanceKm, total: Math.ceil(raw / ROUND_TO) * ROUND_TO };
}

// Platform fee debited from the driver wallet when the job is accepted.
export function commissionFor(total) {
  return Math.round((total * CONFIG.commissionRate) / 50) * 50;
}
