// Abidjan communes with approximate centroids. Used to place a stop on the
// map and price a trip until the user drags the marker to the exact spot.
// Coordinates are rough and must be refined before launch.
export const COMMUNES = [
  { id: 'abobo', name: 'Abobo', lat: 5.416, lng: -4.016 },
  { id: 'adjame', name: 'Adjamé', lat: 5.359, lng: -4.026 },
  { id: 'attecoube', name: 'Attécoubé', lat: 5.336, lng: -4.041 },
  { id: 'bingerville', name: 'Bingerville', lat: 5.355, lng: -3.885 },
  { id: 'cocody', name: 'Cocody', lat: 5.36, lng: -3.987 },
  { id: 'koumassi', name: 'Koumassi', lat: 5.297, lng: -3.948 },
  { id: 'marcory', name: 'Marcory', lat: 5.3, lng: -3.983 },
  { id: 'plateau', name: 'Plateau', lat: 5.3235, lng: -4.0235 },
  { id: 'port-bouet', name: 'Port-Bouët', lat: 5.256, lng: -3.926 },
  { id: 'treichville', name: 'Treichville', lat: 5.293, lng: -4.008 },
  { id: 'yopougon', name: 'Yopougon', lat: 5.339, lng: -4.089 },
];

const ROAD_FACTOR = 1.35; // straight line -> road distance
const MIN_KM = 2;

export function communeById(id) {
  return COMMUNES.find((c) => c.id === id) || null;
}

export function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Commune whose centroid is closest to a point picked on the map.
export function nearestCommune(point) {
  return COMMUNES.reduce((best, c) => (haversineKm(point, c) < haversineKm(point, best) ? c : best));
}

// Resolve a stop ({commune, lat?, lng?}) to a point: exact marker first, else centroid.
export function pointOf(stop) {
  if (Number.isFinite(stop?.lat) && Number.isFinite(stop?.lng)) return { lat: stop.lat, lng: stop.lng };
  const c = communeById(stop?.commune);
  return c ? { lat: c.lat, lng: c.lng } : null;
}

// Road distance estimate across every stop, in order. Null if a stop is unknown.
export function routeDistanceKm(stops) {
  const points = (stops || []).map(pointOf);
  if (points.length < 2 || points.some((p) => !p)) return null;
  let km = 0;
  for (let i = 1; i < points.length; i += 1) km += haversineKm(points[i - 1], points[i]) * ROAD_FACTOR;
  return Math.round(Math.max(MIN_KM, km) * 10) / 10;
}
