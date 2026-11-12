// Home = the order form, one question per screen (Typeform style). Secondary
// fields (parcel, goods price, note, extra phone numbers) live in an optional
// modal reachable from the recap. Usable without an account: the draft,
// current step included, survives the login round trip and language
// switches (sessionStorage).
import { CONFIG } from '../config.js';
import { COMMUNES, nearestCommune, pointOf } from '../domain/geo.js';
import { normalizePhone, validateOrderInput } from '../domain/orders.js';
import { SERVICE_LEVELS, VEHICLES, vehicleById } from '../domain/pricing.js';
import { t } from '../i18n.js';
import { createMap } from '../map.js';
import { esc, icon, money, run, toast } from '../ui.js';
import * as courier from './courier.js';
import { communeName, setNext, stopDot, stopLabel } from './shared.js';

const DRAFT_KEY = 'lalewe.draft';
const MAX_GOODS = 5_000_000;
const emptyStop = () => ({ commune: '', landmark: '', contactName: '', contactPhone: '' });

function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    if (d && Array.isArray(d.stops) && d.stops.length >= 2) return { step: 0, ...d };
  } catch { /* no draft */ }
  return { stops: [emptyStop(), emptyStop()], vehicleType: 'moto', serviceLevel: 'standard', parcel: '', goodsAmount: '', note: '', step: 0 };
}

// Screens in order: every stop, the recipient's number, vehicle, delay, recap.
function stepsOf(state) {
  const n = state.stops.length;
  return [
    ...state.stops.map((_, i) => ({ type: 'stop', i })),
    { type: 'phone', i: n - 1 },
    { type: 'vehicle' },
    { type: 'level' },
    { type: 'recap' },
  ];
}

export function mount(root, ctx) {
  if (ctx.profile?.role === 'courier') return courier.mount(root, ctx);

  const state = loadDraft();
  if (!state.stops[0].commune && ctx.profile?.commune) state.stops[0].commune = ctx.profile.commune;
  // True when a screen was opened from the recap: "OK" then returns there.
  let editing = false;
  let advanceTimer = 0;
  let mapKey = '';
  const desktop = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

  const persist = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  };

  root.innerHTML = `
    <div class="order-layout">
      <div class="order-map" role="region" aria-label="${esc(t('home.mapLabel'))}">
        <div id="map"></div>
        <p class="map-hint" id="map-hint">${icon('my_location')}${esc(t('home.mapHint'))}</p>
      </div>
      <section class="order-panel wizard" aria-live="polite">
        <div class="wiz-top">
          <button type="button" class="wiz-back" id="wiz-back">${icon('arrow_back')}<span>${esc(t('common.back'))}</span></button>
          <span class="wiz-count" id="wiz-count"></span>
          <span class="wiz-price" id="wiz-price" hidden></span>
        </div>
        <div class="wiz-progress" aria-hidden="true"><span id="wiz-bar"></span></div>
        <form id="wiz-form" novalidate></form>
      </section>
    </div>
    <dialog class="sheet" id="details" aria-labelledby="details-title"></dialog>`;

  const form = root.querySelector('#wiz-form');
  const dialog = root.querySelector('#details');
  const backBtn = root.querySelector('#wiz-back');
  const priceEl = root.querySelector('#wiz-price');

  const map = createMap(root.querySelector('#map'), {
    // A tap on the map places the stop being edited there.
    onPick(point) {
      const step = stepsOf(state)[state.step];
      if (step.type !== 'stop') return;
      Object.assign(state.stops[step.i], point, { commune: nearestCommune(point).id });
      markChoice('commune', state.stops[step.i].commune);
      hideError();
      refresh();
    },
  });

  const summary = (stop) => [communeName(stop.commune), stop.landmark].filter(Boolean).join(' · ') || t('stop.empty');

  function stepError(step) {
    if (step.type === 'stop') {
      const stop = state.stops[step.i];
      if (!stop.commune) return 'err.commune';
      if (stop.landmark.trim().length < 3) return 'err.landmark';
    }
    if (step.type === 'phone' && !normalizePhone(state.stops[step.i].contactPhone)) return 'err.phone';
    if (step.type === 'vehicle' && !vehicleById(state.vehicleType)?.available) return 'err.vehicle';
    return null;
  }

  const firstInvalid = () => {
    const steps = stepsOf(state);
    const i = steps.findIndex((s) => stepError(s));
    return i === -1 ? steps.length - 1 : i;
  };

  const detailsCount = () =>
    [state.parcel, Number(state.goodsAmount) > 0, state.note, ...state.stops.slice(0, -1).map((s) => s.contactPhone)].filter(Boolean).length;

  // ---------- Screens ----------
  const okButton = () => `
    <div class="wiz-actions">
      <button class="btn primary big" type="submit">${esc(t('wiz.ok'))}</button>
      ${desktop ? `<span class="hint">${esc(t('wiz.enter'))}</span>` : ''}
    </div>`;
  const errorSlot = '<p class="wiz-error" id="wiz-error" role="alert" hidden></p>';

  function stopScreen({ i }) {
    const n = state.stops.length;
    const stop = state.stops[i];
    const question = i === 0 ? t('wiz.pickupQ') : i === n - 1 ? t('wiz.dropQ') : t('wiz.stopQ', { n: i });
    return `
      <p class="wiz-kicker">${stopDot(i, n)}${esc(stopLabel(i, n))}</p>
      <h1 class="wiz-q">${esc(question)}</h1>
      <div class="chips" role="group" aria-label="${esc(t('stop.commune'))}">
        ${COMMUNES.map((c) => `<button type="button" class="chip-btn" data-commune="${c.id}" aria-pressed="${c.id === stop.commune}">${esc(c.name)}</button>`).join('')}
      </div>
      <label class="wiz-field">${esc(t('stop.landmark'))}
        <input name="landmark" maxlength="200" autocomplete="off" placeholder="${esc(t('stop.landmarkPh'))}" value="${esc(stop.landmark)}">
      </label>
      ${errorSlot}${okButton()}`;
  }

  function phoneScreen({ i }) {
    return `
      <p class="wiz-kicker">${stopDot(i, state.stops.length)}${esc(t('stop.dropoff'))}</p>
      <h1 class="wiz-q">${esc(t('wiz.phoneQ'))}</h1>
      <p class="lead">${esc(t('wiz.phoneHelp'))}</p>
      <label class="wiz-field">${esc(t('stop.phoneClient'))}
        <span class="phone-field"><span>+225</span><input name="contactPhone" type="tel" inputmode="tel" autocomplete="off" placeholder="07 00 00 00 00" value="${esc(state.stops[i].contactPhone)}"></span>
      </label>
      ${errorSlot}${okButton()}`;
  }

  function vehicleScreen() {
    return `
      <h1 class="wiz-q">${esc(t('wiz.vehicleQ'))}</h1>
      <div class="choices">
        ${VEHICLES.map((v, k) => `
          <button type="button" class="choice" data-vehicle="${v.id}" aria-pressed="${v.id === state.vehicleType}" ${v.available ? '' : 'disabled'}>
            ${desktop ? `<kbd>${k + 1}</kbd>` : ''}<img src="${v.img}" alt="">
            <span class="grow"><strong>${esc(t(`vehicle.${v.id}`))}</strong><span class="hint">${esc(t(`vehicle.cap.${v.id}`))}</span></span>
            ${v.available ? '' : `<span class="vehicle-soon">${esc(t('vehicle.soon'))}</span>`}
          </button>`).join('')}
      </div>
      ${errorSlot}${okButton()}`;
  }

  function levelScreen() {
    return `
      <h1 class="wiz-q">${esc(t('wiz.levelQ'))}</h1>
      <div class="choices">
        ${SERVICE_LEVELS.map((s, k) => `
          <button type="button" class="choice" data-level="${s.id}" aria-pressed="${s.id === state.serviceLevel}">
            ${desktop ? `<kbd>${k + 1}</kbd>` : ''}
            <span class="grow"><strong>${esc(t(`level.${s.id}`))}</strong><span class="hint">${esc(t(`wiz.level.${s.id}`))}</span></span>
            ${s.surcharge ? `<span class="choice-extra">+ ${esc(money(s.surcharge))}</span>` : ''}
          </button>`).join('')}
      </div>
      ${errorSlot}${okButton()}`;
  }

  function recapScreen() {
    const n = state.stops.length;
    const vehicle = vehicleById(state.vehicleType);
    const count = detailsCount();
    const row = (goto, lead, label, value) => `
      <button type="button" class="recap-line" data-goto="${goto}" aria-label="${esc(`${t('wiz.edit')} : ${label}`)}">
        ${lead}<span class="grow"><span class="hint">${esc(label)}</span><strong>${esc(value)}</strong></span>${icon('chevron_right')}
      </button>`;
    return `
      <h1 class="wiz-q">${esc(t('wiz.recapQ'))}</h1>
      <div class="card stops">
        ${state.stops.map((stop, i) => `
          <div class="recap-row">
            <button type="button" class="stop" data-goto="${i}" aria-label="${esc(`${t('wiz.edit')} : ${stopLabel(i, n)}`)}">
              ${stopDot(i, n)}<span class="grow stop-text"><span class="hint">${esc(stopLabel(i, n))}</span><span class="stop-summary">${esc(summary(stop))}</span></span>
            </button>
            ${i > 0 && i < n - 1 ? `<button type="button" class="icon-btn" data-remove="${i}" aria-label="${esc(t('home.removeStop'))}">${icon('delete')}</button>` : ''}
          </div>`).join('')}
        ${n < CONFIG.maxStops ? `<button type="button" class="add-stop" id="add-stop">${icon('add_circle')}${esc(t('home.addStop'))}</button>` : ''}
      </div>
      <div class="card list">
        ${row(n, icon('call'), t('stop.phoneClient'), state.stops[n - 1].contactPhone)}
        ${row(n + 1, `<img class="thumb small" src="${esc(vehicle?.img || 'img/moto.png')}" alt="">`, t('home.vehicle'), t(`vehicle.${state.vehicleType}`))}
        ${row(n + 2, icon('hourglass_top'), t('home.delay'), t(`level.${state.serviceLevel}`))}
      </div>
      <button type="button" class="card details-btn ${count ? 'filled' : ''}" id="open-details">
        <img src="img/colis.png" alt="">
        <span class="grow"><strong>${esc(t('wiz.details'))} <span class="muted">${esc(t('common.optional'))}</span></strong>
        <span class="hint">${esc(count ? t('wiz.detailsCount', { n: count }) : t('wiz.detailsHint'))}</span></span>
        ${icon('chevron_right')}
      </button>
      ${errorSlot}
      <div class="quote">
        <div><span class="hint">${esc(t('home.price'))}</span><strong id="quote">—</strong></div>
        <button class="btn primary big grow" type="submit">${esc(t('home.launch'))}</button>
      </div>`;
  }

  const SCREENS = { stop: stopScreen, phone: phoneScreen, vehicle: vehicleScreen, level: levelScreen, recap: recapScreen };

  function render(dir = 1) {
    clearTimeout(advanceTimer);
    const steps = stepsOf(state);
    state.step = Math.max(0, Math.min(state.step, steps.length - 1));
    const step = steps[state.step];
    form.innerHTML = `<div class="wiz-anim ${dir < 0 ? 'back' : ''}" data-type="${step.type}">${SCREENS[step.type](step)}</div>`;
    backBtn.classList.toggle('invisible', state.step === 0);
    root.querySelector('#wiz-count').textContent = t('wiz.step', { n: state.step + 1, total: steps.length });
    root.querySelector('#wiz-bar').style.width = `${((state.step + 1) / steps.length) * 100}%`;
    root.querySelector('#map-hint').hidden = step.type !== 'stop';
    refresh();
    // Desktop: type straight away. Mobile: don't pop the keyboard over the map.
    const input = form.querySelector('input');
    if (input && (desktop || step.type === 'phone')) input.focus({ preventScroll: true });
    if (!desktop) root.querySelector('.order-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function go(index, dir = index >= state.step ? 1 : -1) {
    state.step = index;
    persist();
    render(dir);
  }

  function next() {
    const steps = stepsOf(state);
    const err = stepError(steps[state.step]);
    if (err) return showError(err);
    const target = editing ? firstInvalid() : state.step + 1;
    if (target === steps.length - 1) editing = false;
    return go(target, 1);
  }

  // Updates price, map and draft; called on every change.
  function refresh() {
    persist();
    const { price } = validateOrderInput(state);
    const text = price ? money(price.total) : '';
    if (priceEl.textContent !== text) {
      priceEl.textContent = text;
      priceEl.hidden = !text;
      priceEl.classList.remove('pop');
      void priceEl.offsetWidth; // restart the animation
      priceEl.classList.add('pop');
    }
    const quoteEl = form.querySelector('#quote');
    if (quoteEl) quoteEl.textContent = text || '—';
    const step = stepsOf(state)[state.step];
    const active = step.type === 'stop' || step.type === 'phone' ? step.i : -1;
    const points = state.stops.map(pointOf);
    const key = JSON.stringify([points, active, state.vehicleType]);
    if (key !== mapKey) {
      mapKey = key;
      map.setStops(points, active, vehicleById(state.vehicleType)?.img);
    }
  }

  function showError(key) {
    const el = form.querySelector('#wiz-error');
    if (el) {
      el.textContent = t(key);
      el.hidden = false;
    }
    const anim = form.querySelector('.wiz-anim');
    anim.classList.remove('shake', 'back');
    void anim.offsetWidth;
    anim.classList.add('shake');
  }

  function hideError() {
    const el = form.querySelector('#wiz-error');
    if (el) el.hidden = true;
  }

  function markChoice(attr, value) {
    form.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
  }

  // A tap on a choice selects it and moves on, Typeform style.
  function choose(attr, value) {
    state[attr === 'vehicle' ? 'vehicleType' : 'serviceLevel'] = value;
    markChoice(attr, value);
    hideError();
    refresh();
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(next, 280);
  }

  // ---------- Optional details (modal) ----------
  function openDetails() {
    const n = state.stops.length;
    const phone = (i, label) => `
      <label>${esc(label)}
        <input data-stop="${i}" type="tel" inputmode="tel" autocomplete="off" placeholder="07 00 00 00 00" value="${esc(state.stops[i].contactPhone)}">
      </label>`;
    dialog.innerHTML = `
      <form class="stack" id="details-form" novalidate>
        <div class="row between">
          <h2 id="details-title">${esc(t('wiz.detailsTitle'))}</h2>
          <button type="button" class="close-btn" id="close-details" aria-label="${esc(t('wiz.close'))}">×</button>
        </div>
        <p class="hint">${esc(t('wiz.detailsLead'))}</p>
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
        ${phone(0, t('stop.phonePickup'))}
        ${state.stops.slice(1, -1).map((_, k) => phone(k + 1, t('wiz.stopPhone', { n: k + 1 }))).join('')}
        <p class="wiz-error" id="details-error" role="alert" hidden></p>
        <button class="btn primary big" type="submit">${esc(t('common.save'))}</button>
      </form>`;
    void n;
    const detailsForm = dialog.querySelector('#details-form');
    detailsForm.addEventListener('input', (e) => {
      if (e.target.dataset.stop) state.stops[Number(e.target.dataset.stop)].contactPhone = e.target.value;
      else if (e.target.name) state[e.target.name] = e.target.value;
      refresh();
    });
    detailsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = [...detailsForm.querySelectorAll('[data-stop]')].find((el) => el.value.trim() && !normalizePhone(el.value));
      const amount = Number(state.goodsAmount) || 0;
      const err = bad ? 'err.phone' : amount < 0 || amount > MAX_GOODS ? 'err.amount' : null;
      if (err) {
        const el = dialog.querySelector('#details-error');
        el.textContent = t(err);
        el.hidden = false;
        (bad || detailsForm.goodsAmount).focus();
        return;
      }
      dialog.close();
    });
    dialog.querySelector('#close-details').addEventListener('click', () => dialog.close());
    dialog.showModal();
  }

  dialog.addEventListener('close', () => {
    if (stepsOf(state)[state.step].type === 'recap') render(0);
  });
  // A click on the backdrop closes the modal.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  // ---------- Events ----------
  backBtn.addEventListener('click', () => {
    editing = false;
    go(state.step - 1, -1);
  });

  form.addEventListener('click', (e) => {
    const commune = e.target.closest('[data-commune]');
    const vehicle = e.target.closest('[data-vehicle]');
    const level = e.target.closest('[data-level]');
    const goto = e.target.closest('[data-goto]');
    const remove = e.target.closest('[data-remove]');
    if (commune) {
      const stop = state.stops[stepsOf(state)[state.step].i];
      stop.commune = commune.dataset.commune;
      // A new commune resets the exact point picked on the map.
      delete stop.lat;
      delete stop.lng;
      markChoice('commune', stop.commune);
      hideError();
      refresh();
      form.querySelector('[name="landmark"]').focus();
    } else if (vehicle && !vehicle.disabled) choose('vehicle', vehicle.dataset.vehicle);
    else if (level) choose('level', level.dataset.level);
    else if (goto) {
      editing = true;
      go(Number(goto.dataset.goto), -1);
    } else if (remove) {
      state.stops.splice(Number(remove.dataset.remove), 1);
      state.step = stepsOf(state).length - 1;
      render(0);
    } else if (e.target.closest('#add-stop')) {
      // The new stop goes before the final drop-off.
      const at = state.stops.length - 1;
      state.stops.splice(at, 0, emptyStop());
      editing = true;
      go(at, 1);
    } else if (e.target.closest('#open-details')) openDetails();
  });

  form.addEventListener('input', (e) => {
    const step = stepsOf(state)[state.step];
    if (e.target.name === 'landmark') state.stops[step.i].landmark = e.target.value;
    else if (e.target.name === 'contactPhone') state.stops[step.i].contactPhone = e.target.value;
    else return;
    hideError();
    refresh();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (stepsOf(state)[state.step].type !== 'recap') {
      next();
      return;
    }
    run(e.submitter, async () => {
      const { errors } = validateOrderInput(state);
      const first = Object.keys(errors)[0];
      if (first) {
        const n = state.stops.length;
        const m = first.match(/^stops\.(\d+)\.(\w+)$/);
        if (m && m[2] === 'contactPhone' && Number(m[1]) < n - 1) openDetails();
        else if (m) {
          editing = true;
          go(m[2] === 'contactPhone' ? n : Number(m[1]), -1);
        } else if (first === 'goodsAmount') openDetails();
        else if (first === 'vehicleType') go(n + 1, -1);
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

  // Keys 1-9 pick a choice on the vehicle and delay screens.
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || dialog.open || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = Number(e.key);
    if (!k) return;
    const choice = form.querySelectorAll('.choice')[k - 1];
    if (choice && !choice.disabled) choice.click();
  };
  window.addEventListener('keydown', onKey);

  // A restored draft never lands past an unfinished screen.
  state.step = Math.min(state.step, firstInvalid());
  render(0);

  return () => {
    clearTimeout(advanceTimer);
    window.removeEventListener('keydown', onKey);
    if (dialog.open) dialog.close();
    map.destroy();
  };
}
