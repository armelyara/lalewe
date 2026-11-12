// Thin wrapper around Leaflet + OpenStreetMap tiles. Leaflet is loaded as a
// classic script (global L); if it is missing the app still works without a map.
import { CONFIG } from './config.js';
import { t } from './i18n.js';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function createMap(el, { onPick } = {}) {
  const L = globalThis.L;
  if (!L) {
    el.innerHTML = `<p class="map-fallback">${t('home.mapUnavailable')}</p>`;
    return { setStops() {}, setRoute() {}, destroy() {} };
  }
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(CONFIG.mapCenter, 12);
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  const pins = L.layerGroup().addTo(map);
  const line = L.layerGroup().addTo(map);
  let points = [];
  let lastKey = '';

  // The container gets its final size after the first layout (sticky desktop column).
  const resize = new ResizeObserver(() => map.invalidateSize());
  resize.observe(el);

  if (onPick) map.on('click', (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }));

  const dot = (cls, label) =>
    L.divIcon({ className: '', html: `<span class="pin ${cls}">${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

  function drawLine(coords, dashed) {
    line.clearLayers();
    if (coords.length > 1) L.polyline(coords, { color: '#1E1A16', weight: 5, dashArray: dashed ? '8 8' : null }).addTo(line);
  }

  return {
    // stops: [{ lat, lng } | null] in route order; active: index highlighted.
    // Draws a straight dashed line until setRoute() provides the road route.
    setStops(stops, active = -1) {
      pins.clearLayers();
      points = [];
      const last = stops.length - 1;
      stops.forEach((p, i) => {
        if (!p) return;
        const cls = `${i === 0 ? 'pin-pickup' : i === last ? 'pin-last' : ''}${i === active ? ' pin-active' : ''}`;
        L.marker([p.lat, p.lng], { icon: dot(cls, i === 0 || i === last ? '' : String(i)), keyboard: false }).addTo(pins);
        points.push([p.lat, p.lng]);
      });
      drawLine(points, true);
      // Re-frame only when the points themselves changed.
      const key = JSON.stringify(points);
      if (key !== lastKey && points.length) {
        lastKey = key;
        map.invalidateSize();
        if (points.length === 1) map.setView(points[0], 14, { animate: false });
        else map.fitBounds(points, { padding: [40, 40], maxZoom: 15, animate: false });
      }
    },
    // coords: [[lat, lng], ...] following the roads, or null to keep the straight line.
    setRoute(coords) {
      if (coords && coords.length > 1) drawLine(coords, false);
      else drawLine(points, true);
    },
    destroy() {
      resize.disconnect();
      map.remove();
    },
  };
}
