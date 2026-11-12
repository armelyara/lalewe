// Home = the order form, usable without an account. The draft survives the
// login round trip and language switches (sessionStorage).
import { CONFIG } from '../config.js';
import { nearestCommune, pointOf } from '../domain/geo.js';
import { validateOrderInput } from '../domain/orders.js';
import { SERVICE_LEVELS, VEHICLES, vehicleById } from '../domain/pricing.js';
import { t } from '../i18n.js';
import { createMap } from '../map.js';
import { esc, icon, money, run, toast } from '../ui.js';
import * as courier from './courier.js';
import { communeName, communeOptions, setNext, stopDot, stopLabel } from './shared.js';

const DRAFT_KEY = 'lalewe.draft';
const emptyStop = () => ({ commune: '', landmark: '', contactName: '', contactPhone: '' });

function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    if (d && Array.isArray(d.stops) && d.stops.length >= 2) return d;
  } catch { /* no draft */ }
  return { stops: [emptyStop(), emptyStop()], vehicleType: 'moto', serviceLevel: 'standard', parcel: '', goodsAmount: '', note: '', active: 0 };
}

export function mount(root, ctx) {
  if (ctx.profile?.role === 'courier') return courier.mount(root, ctx);

  const state = loadDraft();
  if (!state.stops[0].commune && ctx.profile?.commune) state.stops[0].commune = ctx.profile.commune;
  const persist = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  };

  root.innerHTML = `
    <div class="order-layout">
      <div class="order-map" role="region" aria-label="${esc(t('home.mapLabel'))}">
        <div id="map"></div>
        <p class="map-hint">${icon('my_location')}${esc(t('home.mapHint'))}</p>
      </div>
      <form class="order-panel" id="order-form" novalidate>
        <h1>${esc(t('home.title'))}</h1>
        <div class="card stops" id="stops"></div>
        <fieldset class="plain">
          <legend>${esc(t('home.vehicle'))}</legend>
          <div class="vehicles">
            ${VEHICLES.map((v) => `
              <label class="vehicle ${v.available ? '' : 'soon'}">
                <input type="radio" name="vehicleType" value="${v.id}" ${v.id === state.vehicleType ? 'checked' : ''} ${v.available ? '' : 'disabled'}>
                <img src="${v.img}" alt="">
                <span class="vehicle-name">${esc(t(`vehicle.${v.id}`))}</span>
                ${v.available ? '' : `<span class="vehicle-soon">${esc(t('vehicle.soon'))}</span>`}
              </label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="plain">
          <legend>${esc(t('home.delay'))}</legend>
          <div class="segmented">
            ${SERVICE_LEVELS.map((s) => `
              <label><input type="radio" name="serviceLevel" value="${s.id}" ${s.id === state.serviceLevel ? 'checked' : ''}>
              ${esc(t(`level.${s.id}`))}${s.surcharge ? ` · +${esc(new Intl.NumberFormat('fr-FR').format(s.surcharge))}` : ''}</label>`).join('')}
          </div>
        </fieldset>
        <details class="card options" ${state.parcel || state.goodsAmount || state.note ? 'open' : ''}>
          <summary><img src="img/colis.png" alt=""><span>${esc(t('home.options'))} <span class="muted">${esc(t('common.optional'))}</span></span>${icon('chevron_right')}</summary>
          <div class="stack">
            <label>${esc(t('home.parcel'))}
              <input name="parcel" maxlength="200" placeholder="${esc(t('home.parcelPh'))}" value="${esc(state.parcel)}">
            </label>
            <label>${esc(t('home.goods'))} (${esc(CONFIG.currency)})
              <input name="goodsAmount" type="number" inputmode="numeric" min="0" step="100" placeholder="0" value="${esc(state.goodsAmount)}">
              <span class="hint">${esc(t('home.goodsHelp'))}</span>
            </label>
            <label>${esc(t('home.note'))}
              <input name="note" maxlength="300" placeholder="${esc(t('home.notePh'))}" value="${esc(state.note)}">
            </label>
          </div>
        </details>
        <div class="quote">
          <div><span class="hint">${esc(t('home.price'))}</span><strong id="quote" aria-live="polite">—</strong></div>
          <button class="btn primary big grow" type="submit">${esc(t('home.launch'))}</button>
        </div>
      </form>
    </div>`;

  const form = root.querySelector('#order-form');
  const stopsEl = root.querySelector('#stops');
  const quoteEl = root.querySelector('#quote');

  const map = createMap(root.querySelector('#map'), {
    // A tap on the map places the open stop there.
    onPick(point) {
      const stop = state.stops[state.active];
      if (!stop) return;
      Object.assign(stop, point, { commune: nearestCommune(point).id });
      renderStops();
      refresh();
    },
  });

  let mapKey = '';

  function summary(stop) {
    const parts = [communeName(stop.commune), stop.landmark].filter(Boolean);
    return parts.length ? parts.join(' · ') : t('stop.empty');
  }

  function renderStops() {
    const n = state.stops.length;
    stopsEl.innerHTML = state.stops.map((stop, i) => {
      const head = `${stopDot(i, n)}<span class="grow stop-text"><span class="hint">${esc(stopLabel(i, n))}</span><span class="stop-summary">${esc(summary(stop))}</span></span>`;
      if (i !== state.active) return `<button type="button" class="stop" data-open="${i}">${head}</button>`;
      return `
        <div class="stop open">
          <div class="stop-head">${head}
            ${i > 0 && n > 2 ? `<button type="button" class="icon-btn" data-remove="${i}" aria-label="${esc(t('home.removeStop'))}">${icon('delete')}</button>` : ''}
          </div>
          <div class="stack stop-fields">
            <label>${esc(t('stop.commune'))}<select data-field="commune">${communeOptions(stop.commune)}</select></label>
            <label>${esc(t('stop.landmark'))}<input data-field="landmark" maxlength="200" placeholder="${esc(t('stop.landmarkPh'))}" value="${esc(stop.landmark)}"></label>
            <label>${esc(t(i === 0 ? 'stop.phonePickup' : 'stop.phoneClient'))} ${i === 0 || i < n - 1 ? `<span class="muted">${esc(t('common.optional'))}</span>` : ''}
              <input data-field="contactPhone" type="tel" inputmode="tel" autocomplete="off" placeholder="07 00 00 00 00" value="${esc(stop.contactPhone)}"></label>
          </div>
        </div>`;
    }).join('') + (n < CONFIG.maxStops ? `<button type="button" class="add-stop" id="add-stop">${icon('add_circle')}${esc(t('home.addStop'))}</button>` : '');
  }

  // Updates price and map; called on every change.
  function refresh() {
    persist();
    const { price } = validateOrderInput(state);
    quoteEl.textContent = price ? money(price.total) : '—';
    // Redraw the map only when the route, the open stop or the vehicle changed.
    const points = state.stops.map(pointOf);
    const key = JSON.stringify([points, state.active, state.vehicleType]);
    if (key !== mapKey) {
      mapKey = key;
      map.setStops(points, state.active, vehicleById(state.vehicleType)?.img);
    }
  }

  stopsEl.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    const remove = e.target.closest('[data-remove]');
    if (open) state.active = Number(open.dataset.open);
    else if (remove) {
      state.stops.splice(Number(remove.dataset.remove), 1);
      state.active = Math.min(state.active, state.stops.length - 1);
    } else if (e.target.closest('#add-stop')) {
      // The new stop goes before the final drop-off.
      state.stops.splice(state.stops.length - 1, 0, emptyStop());
      state.active = state.stops.length - 2;
    } else return;
    renderStops();
    refresh();
  });
  stopsEl.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    const stop = state.stops[state.active];
    if (!field || !stop) return;
    stop[field] = e.target.value;
    if (field === 'commune') {
      // A new commune resets the exact point picked on the map.
      delete stop.lat;
      delete stop.lng;
    }
    const label = stopsEl.querySelector('.stop.open .stop-summary');
    if (label) label.textContent = summary(stop);
    refresh();
  });
  form.addEventListener('input', (e) => {
    if (!e.target.name) return;
    state[e.target.name] = e.target.value;
    refresh();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      const { errors } = validateOrderInput(state);
      const first = Object.keys(errors)[0];
      if (first) {
        const m = first.match(/^stops\.(\d+)\./);
        if (m) {
          state.active = Number(m[1]);
          renderStops();
          refresh();
        }
        throw new Error(errors[first]);
      }
      if (!ctx.user) {
        toast(t('home.loginToLaunch'));
        setNext('/');
        ctx.go('/login');
        return;
      }
      const order = await ctx.data.orders.create(state);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast(t('home.launched'));
      ctx.go(`/order/${order.id}`);
    });
  });

  renderStops();
  refresh();
  return () => map.destroy();
}
