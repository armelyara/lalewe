// Home = ordering in three questions, usable without an account:
// 1. pickup, 2. drop-off(s), 3. vehicle + price. The draft survives the login
// round trip and language switches (sessionStorage).
import { CONFIG } from '../config.js';
import { COMMUNES, nearestCommune, pointOf, routeDistanceKm } from '../domain/geo.js';
import { normalizePhone, validateOrderInput } from '../domain/orders.js';
import { SERVICE_LEVELS, VEHICLES } from '../domain/pricing.js';
import { footer, progressBar, question, recap } from '../flow.js';
import { t } from '../i18n.js';
import { createMap } from '../map.js';
import { fetchRoute, localPlaces, searchPlaces } from '../places.js';
import { esc, icon, money, run, toast } from '../ui.js';
import * as courier from './courier.js';
import { communeName, setNext, stopLabel } from './shared.js';

const DRAFT_KEY = 'lalewe.draft.v3';
const STEPS = 3;
const newStop = () => ({ landmark: '', detail: '', commune: '', contactPhone: '' });
const located = (stop) => Boolean(pointOf(stop));

function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    if (d && Array.isArray(d.stops) && d.stops.length >= 2) return d;
  } catch { /* no draft */ }
  return { step: 0, active: 1, stops: [newStop(), newStop()], vehicleType: 'moto', serviceLevel: 'standard', parcel: '', goodsAmount: '', note: '', routeKm: null };
}

export function mount(root, ctx) {
  if (ctx.profile?.role === 'courier') return courier.mount(root, ctx);

  const state = loadDraft();
  const persist = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  };

  root.innerHTML = `
    <div class="order-layout">
      <div class="order-map empty" id="map-wrap" role="region" aria-label="${esc(t('home.mapLabel'))}">
        <div id="map"></div>
        <p class="map-hint">${icon('my_location')}${esc(t('home.mapHint'))}</p>
        <strong class="map-distance" id="distance" hidden></strong>
      </div>
      <form class="order-panel flow" id="flow" novalidate></form>
    </div>`;
  const form = root.querySelector('#flow');
  const mapWrap = root.querySelector('#map-wrap');
  const distanceEl = root.querySelector('#distance');

  let suggestions = [];
  let searchTimer = null;
  let searchAbort = null;
  let routeAbort = null;
  let routeKey = '';
  let routeCoords = null;

  // Index of the stop being edited in the current step, or -1 on the last step.
  const editing = () => (state.step === 0 ? 0 : state.step === 1 ? state.active : -1);

  const map = createMap(root.querySelector('#map'), {
    // A tap on the map places the stop being edited.
    onPick(point) {
      const stop = state.stops[editing()];
      if (!stop) return;
      const commune = nearestCommune(point);
      Object.assign(stop, point, { commune: commune.id });
      if (stop.landmark.trim().length < 2) stop.landmark = `${t('q.pinned')} · ${commune.name}`;
      render();
      refreshMap();
    },
  });

  function addressField(index) {
    const stop = state.stops[index];
    return `
      <div class="address">
        <input class="line" id="place" autocomplete="off" enterkeyhint="search" aria-label="${esc(stopLabel(index, state.stops.length))}"
          placeholder="${esc(t('q.placePh'))}" value="${esc(stop.landmark)}">
        <div id="located">${located(stop) ? locatedBlock(stop) : ''}</div>
        <div id="suggestions" class="suggestions" aria-live="polite"></div>
      </div>`;
  }

  const locatedBlock = (stop) => `
    <p class="found">${icon('place')}${esc(communeName(stop.commune) || nearestCommune(pointOf(stop)).name)} · ${esc(t('q.found'))}</p>
    <label class="sub"><span>${esc(t('q.detail'))} <span class="muted">${esc(t('common.optional'))}</span></span>
      <input class="line small" id="detail" maxlength="200" placeholder="${esc(t('q.detailPh'))}" value="${esc(stop.detail)}"></label>`;

  function tripText() {
    return state.stops.map((s) => communeName(s.commune) || s.landmark).join(' → ');
  }

  function render(focus = false) {
    const n = state.stops.length;
    let html = progressBar(state.step + 1, STEPS);
    if (state.step === 0) {
      html += question(1, STEPS, t('q.pickup'), t('q.placeHelp')) + addressField(0) + footer(t('flow.continue'), { back: false });
    } else if (state.step === 1) {
      const i = state.active;
      const others = state.stops.map((stop, k) => (k > 0 && k !== i && stop.landmark
        ? `<div class="recap">${icon('check_circle')}<span class="recap-text"><strong>${esc(stopLabel(k, n))}</strong> · ${esc(stop.landmark)}</span>
            <button type="button" class="link" data-edit="${k}">${esc(t('flow.edit'))}</button>
            ${n > 2 ? `<button type="button" class="icon-btn" data-remove="${k}" aria-label="${esc(t('home.removeStop'))}">${icon('delete')}</button>` : ''}</div>`
        : '')).join('');
      const isLast = i === n - 1;
      html += `<div class="recaps">${recap(t('stop.pickup'), state.stops[0].landmark, 'data-goto="0"')}${others}</div>
        ${question(2, STEPS, isLast ? t('q.dropoff') : t('q.stop', { n: i }), t('q.placeHelp'))}
        ${addressField(i)}
        <label class="sub"><span>${esc(t('stop.phoneClient'))} ${isLast ? '' : `<span class="muted">${esc(t('common.optional'))}</span>`}</span>
          <span class="phone-field"><span>+225</span><input class="line small" id="phone" type="tel" inputmode="tel" autocomplete="off"
            placeholder="07 00 00 00 00" value="${esc(state.stops[i].contactPhone)}"></span></label>
        ${n < CONFIG.maxStops ? `<button type="button" class="link add-stop" id="add-stop">${icon('add_circle')}${esc(t('home.addStop'))}</button>` : ''}
        ${footer(t('flow.continue'))}`;
    } else {
      html += `<div class="recaps">${recap(t('flow.trip'), tripText(), 'data-goto="1"')}</div>
        ${question(3, STEPS, t('q.vehicle'))}
        <div class="vehicles two">
          ${VEHICLES.map((v) => `
            <label class="vehicle ${v.available ? '' : 'soon'}">
              <input type="radio" name="vehicleType" value="${v.id}" ${v.id === state.vehicleType ? 'checked' : ''} ${v.available ? '' : 'disabled'}>
              <img src="${v.img}" alt="">
              <span class="vehicle-name">${esc(t(`vehicle.${v.id}`))}</span>
              <span class="hint">${esc(t(v.available ? `vehicle.cap.${v.id}` : 'vehicle.soon'))}</span>
            </label>`).join('')}
        </div>
        <div class="segmented">
          ${SERVICE_LEVELS.map((s) => `
            <label><input type="radio" name="serviceLevel" value="${s.id}" ${s.id === state.serviceLevel ? 'checked' : ''}>
            ${esc(t(`level.${s.id}`))}${s.surcharge ? ` · +${esc(new Intl.NumberFormat('fr-FR').format(s.surcharge))}` : ''}</label>`).join('')}
        </div>
        <details class="options" ${state.parcel || state.goodsAmount || state.note ? 'open' : ''}>
          <summary class="link">${icon('add_circle')}${esc(t('home.details'))}</summary>
          <div class="stack">
            <label class="sub">${esc(t('home.parcel'))}<input class="line small" name="parcel" maxlength="200" placeholder="${esc(t('home.parcelPh'))}" value="${esc(state.parcel)}"></label>
            <label class="sub">${esc(t('home.goods'))} (${esc(CONFIG.currency)})
              <input class="line small" name="goodsAmount" type="number" inputmode="numeric" min="0" step="100" placeholder="0" value="${esc(state.goodsAmount)}">
              <span class="hint">${esc(t('home.goodsHelp'))}</span></label>
            <label class="sub">${esc(t('home.note'))}<input class="line small" name="note" maxlength="300" placeholder="${esc(t('home.notePh'))}" value="${esc(state.note)}"></label>
          </div>
        </details>
        <div class="price-row">
          <span class="muted"><span id="km"></span><br>${esc(t('home.paidBy'))}</span>
          <strong id="quote" aria-live="polite">—</strong>
        </div>
        ${ctx.user ? '' : `<p class="hint">${icon('info')}${esc(t('home.guestHint'))}</p>`}
        ${footer(t('home.launch'))}`;
    }
    form.innerHTML = html;
    suggestions = [];
    updateQuote();
    persist();
    if (focus) form.querySelector('#place')?.focus();
  }

  // ---- Suggestions -------------------------------------------------------
  function showSuggestions(items, query) {
    const box = form.querySelector('#suggestions');
    if (!box) return;
    suggestions = items.slice(0, 6);
    if (!suggestions.length && query.trim().length >= 3) {
      // Nothing matched: keep the typed text and ask for the commune only.
      suggestions = COMMUNES.map((c) => ({ label: c.name, sub: '', commune: c.id, keepText: true }));
      box.innerHTML = `<p class="hint">${esc(t('q.whichCommune'))}</p>`;
    } else box.innerHTML = '';
    box.innerHTML += suggestions.map((s, i) => `
      <button type="button" class="suggestion" data-suggest="${i}">${icon('place')}<span><strong>${esc(s.label)}</strong>${s.sub ? ` <span class="muted">· ${esc(s.sub)}</span>` : ''}</span></button>`).join('');
  }

  function onPlaceInput(input) {
    const stop = state.stops[editing()];
    stop.landmark = input.value;
    // Typing again invalidates the point found earlier.
    delete stop.lat;
    delete stop.lng;
    stop.commune = '';
    form.querySelector('#located').innerHTML = '';
    const query = input.value;
    const local = localPlaces(query);
    showSuggestions(local, local.length ? query : '');
    clearTimeout(searchTimer);
    searchAbort?.abort();
    if (query.trim().length >= 3) {
      searchTimer = setTimeout(async () => {
        searchAbort = new AbortController();
        const remote = await searchPlaces(query, searchAbort.signal);
        if (form.querySelector('#place')?.value === query) showSuggestions([...remote, ...local], query);
      }, 350);
    }
    persist();
    refreshMap();
  }

  function pickSuggestion(s) {
    const stop = state.stops[editing()];
    if (!s.keepText) stop.landmark = s.sub && !s.commune ? `${s.label}, ${s.sub}` : s.label;
    delete stop.lat;
    delete stop.lng;
    if (Number.isFinite(s.lat) && !s.commune) Object.assign(stop, { lat: s.lat, lng: s.lng });
    stop.commune = s.commune || nearestCommune(s).id;
    render();
    refreshMap();
    form.querySelector(state.step === 1 && !state.stops[state.active].contactPhone ? '#phone' : '#detail')?.focus();
  }

  // ---- Map, route and price ---------------------------------------------
  function refreshMap() {
    const points = state.stops.map(pointOf);
    mapWrap.classList.toggle('empty', !points.some(Boolean));
    map.setStops(points, editing());
    const complete = points.length >= 2 && points.every(Boolean);
    const key = complete ? JSON.stringify(points) : '';
    if (key !== routeKey) {
      // The route changed: drop the old road distance and ask for a new one.
      routeKey = key;
      routeCoords = null;
      state.routeKm = null;
      routeAbort?.abort();
      if (complete) {
        routeAbort = new AbortController();
        fetchRoute(points, routeAbort.signal).then((route) => {
          if (!route || key !== routeKey) return;
          routeCoords = route.coords;
          state.routeKm = route.km;
          map.setRoute(routeCoords);
          updateQuote();
          persist();
        });
      }
    } else if (routeCoords) map.setRoute(routeCoords);
    updateQuote();
  }

  function updateQuote() {
    const estimate = routeDistanceKm(state.stops);
    const km = state.routeKm ?? estimate;
    const text = km ? `${state.routeKm ? '' : '≈ '}${new Intl.NumberFormat('fr-FR').format(km)} km` : '';
    distanceEl.textContent = text;
    distanceEl.hidden = !text;
    const kmEl = form.querySelector('#km');
    if (kmEl) kmEl.textContent = text;
    const quoteEl = form.querySelector('#quote');
    if (quoteEl) {
      const { price } = validateOrderInput(state);
      quoteEl.textContent = price ? money(price.total) : '—';
    }
  }

  // ---- Events ------------------------------------------------------------
  form.addEventListener('input', (e) => {
    const el = e.target;
    const stop = state.stops[editing()];
    if (el.id === 'place') return onPlaceInput(el);
    if (el.id === 'detail') stop.detail = el.value;
    else if (el.id === 'phone') stop.contactPhone = el.value;
    else if (el.name) state[el.name] = el.value;
    updateQuote();
    persist();
    return undefined;
  });

  form.addEventListener('click', (e) => {
    const hit = (sel) => e.target.closest(sel);
    let el;
    if ((el = hit('[data-suggest]'))) return pickSuggestion(suggestions[Number(el.dataset.suggest)]);
    if ((el = hit('[data-goto]'))) {
      state.step = Number(el.dataset.goto);
      if (state.step === 1) state.active = state.stops.length - 1;
    } else if ((el = hit('[data-edit]'))) state.active = Number(el.dataset.edit);
    else if ((el = hit('[data-remove]'))) {
      state.stops.splice(Number(el.dataset.remove), 1);
      state.active = Math.min(state.active, state.stops.length - 1);
    } else if (hit('#add-stop')) {
      const error = stopError(state.active, false);
      if (error) return toast(t(error));
      // The new point becomes the final drop-off; the previous one becomes a stop.
      state.stops.push(newStop());
      state.active = state.stops.length - 1;
    } else if (hit('[data-back]')) state.step = Math.max(0, state.step - 1);
    else return undefined;
    render(true);
    refreshMap();
    return undefined;
  });

  function stopError(index, needPhone) {
    const stop = state.stops[index];
    if (stop.landmark.trim().length < 2) return 'err.landmark';
    if (!located(stop)) return 'err.place';
    if ((needPhone || stop.contactPhone.trim()) && !normalizePhone(stop.contactPhone)) return 'err.phone';
    return null;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      if (state.step === 0) {
        const error = stopError(0, false);
        if (error) throw new Error(error);
        state.step = 1;
        state.active = state.stops.length - 1;
      } else if (state.step === 1) {
        for (let i = 1; i < state.stops.length; i += 1) {
          const error = stopError(i, i === state.stops.length - 1);
          if (error) {
            if (state.active !== i) {
              state.active = i;
              render(true);
            }
            throw new Error(error);
          }
        }
        state.step = 2;
      } else {
        const { errors } = validateOrderInput(state);
        const first = Object.values(errors)[0];
        if (first) throw new Error(first);
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
        return;
      }
      render(true);
      refreshMap();
    });
  });

  render();
  refreshMap();
  return () => {
    clearTimeout(searchTimer);
    searchAbort?.abort();
    routeAbort?.abort();
    map.destroy();
  };
}
