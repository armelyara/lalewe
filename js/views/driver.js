// Driver sign-up in four questions (vehicle, name, phone, papers), then a
// summary. Open to visitors: the phone question doubles as the sign-in.
import { CONFIG } from '../config.js';
import { VEHICLES, vehicleById } from '../domain/pricing.js';
import { footer, progressBar, question, recap, summaryLine } from '../flow.js';
import { t } from '../i18n.js';
import { esc, icon, run, toast } from '../ui.js';
import { vehicleThumb } from './shared.js';

const DRAFT_KEY = 'lalewe.driver.v1';
const STEPS = 4;

function loadDraft(profile) {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    if (d && vehicleById(d.vehicleType)) return d;
  } catch { /* no draft */ }
  return { step: 0, vehicleType: 'moto', name: profile?.name || '', plate: '', phone: '' };
}

export function mount(root, ctx) {
  const p = ctx.profile;
  if (p?.role === 'courier') {
    root.innerHTML = `
      <section class="page narrow stack">
        <h1>${esc(t('driver.title'))}</h1>
        <div class="notice center">${vehicleThumb(p.vehicleType)}<strong>${esc(t('driver.already'))}</strong>
          <span class="muted">${esc(t(`vehicle.${p.vehicleType}`))}${p.plate ? ` · ${esc(p.plate)}` : ''}</span></div>
        <a class="btn primary big" href="#/">${esc(t('driver.open'))}</a>
      </section>`;
    return undefined;
  }

  const state = loadDraft(p);
  let pending = null; // SMS code request in progress
  let hasLicense = false; // the photo itself is not kept: uploading needs the server
  const persist = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  };
  const strict = () => state.vehicleType !== 'moto';
  const optional = () => (strict() ? '' : ` <span class="muted">${esc(t('common.optional'))}</span>`);

  root.innerHTML = '<form class="page narrow flow" id="flow" novalidate></form>';
  const form = root.querySelector('#flow');

  function render(focus = true) {
    const vehicle = recap(t('home.vehicle'), t(`vehicle.${state.vehicleType}`), 'data-goto="0"');
    const name = recap(t('account.name'), state.name, 'data-goto="1"');
    let html = progressBar(Math.min(state.step + 1, STEPS), STEPS);
    if (state.step === 0) {
      html += `${question(1, STEPS, t('driver.vehicle'), t('driver.lead'))}
        <div class="vehicles two">
          ${VEHICLES.map((v) => `
            <label class="vehicle">
              <input type="radio" name="vehicleType" value="${v.id}" ${v.id === state.vehicleType ? 'checked' : ''}>
              <img src="${v.img}" alt="">
              <span class="vehicle-name">${esc(t(`vehicle.${v.id}`))}</span>
              <span class="hint">${esc(t(`vehicle.cap.${v.id}`))}</span>
            </label>`).join('')}
        </div>${footer(t('flow.continue'), { back: false })}`;
    } else if (state.step === 1) {
      html += `<div class="recaps">${vehicle}</div>${question(2, STEPS, t('driver.qName'), t('driver.nameHelp'))}
        <input class="line" id="name" autocomplete="name" maxlength="80" value="${esc(state.name)}" aria-label="${esc(t('account.name'))}">
        ${footer(t('flow.continue'))}`;
    } else if (state.step === 2) {
      html += `<div class="recaps">${vehicle}${name}</div>`;
      if (ctx.user) {
        html += `${question(3, STEPS, t('login.phoneQ'))}<p class="answer">${esc(ctx.user.phone)}</p>
          <p class="found">${icon('check_circle')}${esc(t('driver.phoneKnown'))}</p>${footer(t('flow.continue'))}`;
      } else if (pending) {
        html += `${question(3, STEPS, t('login.codeQ'), t('login.sentTo', { phone: `+225 ${state.phone}` }))}
          <input class="line code-input" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="${esc(t('login.code'))}">
          ${ctx.data.mode === 'mock' ? `<p class="hint">${esc(t('login.demo', { code: CONFIG.demoOtp }))}</p>` : ''}
          ${footer(t('flow.continue'))}`;
      } else {
        html += `${question(3, STEPS, t('login.phoneQ'), t('login.phoneLead'))}
          <span class="phone-field"><span>+225</span><input class="line" id="phone" type="tel" inputmode="tel" autocomplete="tel-national"
            placeholder="07 00 00 00 00" value="${esc(state.phone)}" aria-label="${esc(t('login.phone'))}"></span>
          <div id="recaptcha"></div>${footer(t('login.send'))}`;
      }
    } else if (state.step === 3) {
      html += `<div class="recaps">${vehicle}${name}</div>
        ${question(4, STEPS, t('driver.qPapers'), t(strict() ? 'driver.papersRequired' : 'driver.papersOptional'))}
        <label class="sub"><span>${esc(t('driver.plate'))}${optional()}</span>
          <input class="line" id="plate" maxlength="20" autocapitalize="characters" placeholder="${esc(t('driver.platePh'))}" value="${esc(state.plate)}"></label>
        <label class="upload ${hasLicense ? 'filled' : ''}">${icon(hasLicense ? 'check_circle' : 'add_a_photo')}
          <span id="license-label">${esc(t(hasLicense ? 'driver.licenseAdded' : 'driver.license'))}</span>${hasLicense ? '' : optional()}
          <input type="file" accept="image/*" capture="environment" id="license"></label>
        ${ctx.data.mode === 'mock' ? `<p class="hint">${icon('info')}${esc(t('driver.docsDemo'))}</p>` : ''}
        ${footer(t('flow.continue'))}`;
    } else {
      html += `<h1>${esc(t('driver.review'))}</h1>
        <div class="row">${vehicleThumb(state.vehicleType, 'thumb big')}<div class="grow"><strong class="answer">${esc(t(`vehicle.${state.vehicleType}`))}</strong>
          <span class="muted">${esc(t(`vehicle.cap.${state.vehicleType}`))}</span></div></div>
        <div class="lines">
          ${summaryLine(t('account.name'), esc(state.name))}
          ${summaryLine(t('login.phone'), esc(ctx.user?.phone || ''))}
          ${summaryLine(t('driver.plate'), esc(state.plate.toUpperCase() || '—'))}
          ${summaryLine(t('driver.license'), esc(hasLicense ? t('driver.licenseAdded') : '—'))}
        </div>
        <p class="hint">${esc(t('driver.note'))}</p>${footer(t('driver.submit'))}`;
    }
    form.innerHTML = html;
    persist();
    if (focus) form.querySelector('input.line')?.focus();
  }

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.name === 'vehicleType') state.vehicleType = el.value;
    else if (el.id === 'name') state.name = el.value;
    else if (el.id === 'plate') state.plate = el.value;
    else if (el.id === 'phone') state.phone = el.value;
    else if (el.id === 'license') {
      hasLicense = el.files.length > 0;
      render(false);
    }
    persist();
  });

  form.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) state.step = Number(goto.dataset.goto);
    else if (e.target.closest('[data-back]')) {
      if (state.step === 2 && pending) pending = null;
      else state.step = Math.max(0, state.step - 1);
    } else return;
    render();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      if (state.step === 1 && state.name.trim().length < 2) throw new Error('err.name');
      if (state.step === 2 && !ctx.user) {
        if (!pending) {
          pending = await ctx.data.auth.startPhoneSignIn(state.phone);
          render();
          return;
        }
        // Signing in re-mounts this view: save the next step first.
        state.step = 3;
        persist();
        try {
          await pending.confirm(form.querySelector('#code').value);
        } catch (err) {
          state.step = 2;
          persist();
          throw err;
        }
        return;
      }
      if (state.step === 3) {
        const plate = state.plate.trim();
        if (plate.length < 4 && (strict() || plate)) throw new Error('err.plate');
        if (strict() && !hasLicense) throw new Error('err.license');
      }
      if (state.step < 4) {
        state.step += 1;
        render();
        return;
      }
      if (strict() && !hasLicense) {
        // The photo is lost when the page re-renders (e.g. language switch).
        state.step = 3;
        render();
        throw new Error('err.license');
      }
      await ctx.data.auth.becomeCourier({ ...state, hasLicense });
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      await ctx.refreshProfile();
      toast(t('driver.done'));
      ctx.go('/');
    });
  });

  render(false);
  return undefined;
}
