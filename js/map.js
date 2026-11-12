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
    return { setStops() {}, destroy() {} };
  }
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(CONFIG.mapCenter, 12);
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let frame = 0;
  let lastKey = '';

  // The container gets its final size after the first layout (sticky desktop column).
  const resize = new ResizeObserver(() => map.invalidateSize());
  resize.observe(el);

  if (onPick) map.on('click', (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }));

  const dot = (cls, label) =>
    L.divIcon({ className: '', html: `<span class="pin ${cls}">${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

  // Moves the vehicle image back and forth along the route.
  function animate(points, marker) {
    const legs = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const len = map.distance(points[i - 1], points[i]);
      legs.push({ a: points[i - 1], b: points[i], len });
      total += len;
    }
    if (!total) return;
    const duration = 6000;
    const start = performance.now();
    const step = (now) => {
      const phase = ((now - start) % (duration * 2)) / duration;
      let d = (phase <= 1 ? phase : 2 - phase) * total;
      for (const leg of legs) {
        if (d <= leg.len || leg === legs[legs.length - 1]) {
          const k = leg.len ? Math.min(1, d / leg.len) : 0;
          marker.setLatLng([leg.a[0] + (leg.b[0] - leg.a[0]) * k, leg.a[1] + (leg.b[1] - leg.a[1]) * k]);
          break;
        }
        d -= leg.len;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  return {
    // stops: [{ lat, lng } | null], in route order; active: index highlighted.
    setStops(stops, active = -1, vehicleImage = 'img/moto.png') {
      cancelAnimationFrame(frame);
      layer.clearLayers();
      const points = [];
      stops.forEach((p, i) => {
        if (!p) return;
        const cls = `${i === 0 ? 'pin-pickup' : 'pin-drop'}${i === active ? ' pin-active' : ''}`;
        L.marker([p.lat, p.lng], { icon: dot(cls, i === 0 ? '' : String(i)), keyboard: false }).addTo(layer);
        points.push([p.lat, p.lng]);
      });
      if (points.length > 1) {
        L.polyline(points, { color: '#1E1A16', weight: 4, dashArray: '8 8' }).addTo(layer);
        const vehicle = L.marker(points[0], {
          icon: L.divIcon({ className: '', html: `<img class="map-vehicle" src="${vehicleImage}" alt="">`, iconSize: [48, 48], iconAnchor: [24, 34] }),
          interactive: false,
          keyboard: false,
        }).addTo(layer);
        if (!reduceMotion) animate(points, vehicle);
      }
      // Re-frame only when the route itself changed, not on every keystroke.
      const key = JSON.stringify(points);
      if (key !== lastKey && points.length) {
        lastKey = key;
        map.invalidateSize();
        if (points.length === 1) map.setView(points[0], 13, { animate: false });
        else map.fitBounds(points, { padding: [40, 40], maxZoom: 14, animate: false });
      }
    },
    destroy() {
      resize.disconnect();
      cancelAnimationFrame(frame);
      map.remove();
    },
  };
}
