import { COMMUNES, communeById } from '../domain/geo.js';
import { vehicleById } from '../domain/pricing.js';
import { t } from '../i18n.js';
import { esc, money, when } from '../ui.js';

const NEXT_KEY = 'lalewe.next';

// Remember where a signed-out visitor wanted to go, to return there after login.
export function setNext(path) {
  try { sessionStorage.setItem(NEXT_KEY, path); } catch { /* ignore */ }
}

export function takeNext() {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return next || '/';
  } catch {
    return '/';
  }
}

export const communeName = (id) => communeById(id)?.name || '';

export function communeOptions(selected) {
  return `<option value="">${esc(t('common.choose'))}</option>${COMMUNES.map(
    (c) => `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${esc(c.name)}</option>`,
  ).join('')}`;
}

export function stopLabel(index, count) {
  if (index === 0) return t('stop.pickup');
  return index === count - 1 ? t('stop.dropoff') : t('stop.stopN', { n: index });
}

export function stopDot(index, count) {
  const cls = index === 0 ? 'dot-pickup' : index === count - 1 ? 'dot-last' : '';
  return `<span class="dot ${cls}" aria-hidden="true">${index > 0 && index < count - 1 ? index : ''}</span>`;
}

export function statusChip(status) {
  return `<span class="chip chip-${esc(status)}">${esc(t(`status.${status}`))}</span>`;
}

export function vehicleThumb(id, cls = 'thumb') {
  return `<img class="${cls}" src="${esc(vehicleById(id)?.img || 'img/moto.png')}" alt="">`;
}

export function routeText(o) {
  return `${communeName(o.stops[0].commune)} → ${communeName(o.stops[o.stops.length - 1].commune)}`;
}

export function orderCard(o, extra = '') {
  const more = o.stops.length > 2 ? ` · ${t('activity.stops', { n: o.stops.length - 1 })}` : '';
  return `
    <a class="card order-card" href="#/order/${encodeURIComponent(o.id)}">
      <div class="row between"><strong>${esc(o.code)}</strong>${statusChip(o.status)}</div>
      <div class="row">
        ${vehicleThumb(o.vehicleType)}
        <div class="grow"><span class="route">${esc(routeText(o))}</span><span class="muted">${esc(when(o.createdAt) + more)}</span></div>
        <span class="price"><strong>${esc(money(o.priceTotal))}</strong>${extra}</span>
      </div>
    </a>`;
}

export function orderList(orders, emptyText, extra = () => '') {
  return orders.length ? orders.map((o) => orderCard(o, extra(o))).join('') : `<p class="empty">${esc(emptyText)}</p>`;
}
