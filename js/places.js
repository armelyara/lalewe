// Address search and road routing on OpenStreetMap data. Both services are
// public demo servers: fine for a prototype, to be replaced by a paid or
// self-hosted provider before a commercial launch. Every call fails soft, so
// the app keeps working offline with commune suggestions and an estimate.
import { COMMUNES } from './domain/geo.js';
import { getLang } from './i18n.js';

const PHOTON = 'https://photon.komoot.io/api/';
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const ABIDJAN_BBOX = '-4.25,5.15,-3.70,5.55'; // minLon,minLat,maxLon,maxLat
const TIMEOUT_MS = 5000;

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function getJson(url, signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Instant, offline suggestions: the communes matching the typed text.
export function localPlaces(query) {
  const q = fold(query).trim();
  const hits = q ? COMMUNES.filter((c) => fold(c.name).includes(q) || q.includes(fold(c.name))) : [];
  return hits.map((c) => ({ label: c.name, sub: 'Abidjan', lat: c.lat, lng: c.lng, commune: c.id }));
}

// Remote suggestions inside Abidjan. Returns [] on any failure.
export async function searchPlaces(query, signal) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  try {
    const params = new URLSearchParams({ q, limit: '6', bbox: ABIDJAN_BBOX, lang: getLang() === 'en' ? 'en' : 'fr' });
    const data = await getJson(`${PHOTON}?${params}`, signal);
    const seen = new Set();
    return (data.features || []).flatMap((f) => {
      const [lng, lat] = f.geometry?.coordinates || [];
      const p = f.properties || {};
      const label = String(p.name || p.street || '').slice(0, 80);
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const sub = [p.district || p.suburb, p.city].filter((x) => x && x !== label).join(', ').slice(0, 80);
      const key = fold(`${label}|${sub}`);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ label, sub, lat, lng }];
    });
  } catch {
    return [];
  }
}

// Road route through every point, in order. Returns { km, coords } or null.
export async function fetchRoute(points, signal) {
  if (points.length < 2) return null;
  try {
    const path = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const data = await getJson(`${OSRM}${path}?overview=full&geometries=geojson`, signal);
    const route = data.code === 'Ok' ? data.routes?.[0] : null;
    if (!route || !Number.isFinite(route.distance)) return null;
    return {
      km: Math.round(route.distance / 100) / 10,
      coords: (route.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]),
    };
  } catch {
    return null;
  }
}
