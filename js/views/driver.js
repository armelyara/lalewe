// Driver sign-up: pick the vehicle by image, then identity and papers.
import { VEHICLES } from '../domain/pricing.js';
import { t } from '../i18n.js';
import { esc, formData, icon, run, toast } from '../ui.js';
import { communeOptions, vehicleThumb } from './shared.js';

export function mount(root, ctx) {
  const p = ctx.profile;
  if (p.role === 'courier') {
    root.innerHTML = `
      <section class="page narrow stack">
        <h1>${esc(t('driver.title'))}</h1>
        <div class="card notice center">${vehicleThumb(p.vehicleType)}<strong>${esc(t('driver.already'))}</strong>
          <span class="muted">${esc(t(`vehicle.${p.vehicleType}`))} · ${esc(p.plate)}</span></div>
        <a class="btn primary big" href="#/">${esc(t('driver.open'))}</a>
      </section>`;
    return undefined;
  }

  root.innerHTML = `
    <section class="page stack">
      <div><h1>${esc(t('driver.title'))}</h1><p class="lead">${esc(t('driver.lead'))}</p></div>
      <form id="driver-form" class="stack" novalidate>
        <fieldset class="plain">
          <legend>${esc(t('driver.vehicle'))}</legend>
          <div class="vehicles two">
            ${VEHICLES.map((v, i) => `
              <label class="vehicle">
                <input type="radio" name="vehicleType" value="${v.id}" ${i === 0 ? 'checked' : ''}>
                <img src="${v.img}" alt="">
                <span class="vehicle-name">${esc(t(`vehicle.${v.id}`))}</span>
                <span class="hint">${esc(t(`vehicle.cap.${v.id}`))}</span>
              </label>`).join('')}
          </div>
        </fieldset>
        <label>${esc(t('account.name'))}<input name="name" autocomplete="name" maxlength="80" value="${esc(p.name)}" required></label>
        <label>${esc(t('account.commune'))}<select name="commune">${communeOptions(p.commune)}</select></label>
        <label>${esc(t('driver.plate'))}<input name="plate" maxlength="20" autocapitalize="characters" placeholder="${esc(t('driver.platePh'))}" required></label>
        <div class="grid2">
          ${['license', 'registration'].map((doc) => `
            <label class="upload">${icon('add_a_photo')}<span>${esc(t(`driver.${doc}`))}</span>
              <input type="file" accept="image/*" capture="environment" data-doc="${doc}"></label>`).join('')}
        </div>
        <button class="btn primary big" type="submit">${esc(t('driver.submit'))}</button>
        <p class="hint center">${esc(t('driver.note'))}</p>
      </form>
    </section>`;

  const form = root.querySelector('#driver-form');
  // Papers are only marked as chosen here; uploading them needs the server.
  form.querySelectorAll('[data-doc]').forEach((input) =>
    input.addEventListener('change', () => input.closest('.upload').classList.toggle('filled', input.files.length > 0)),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      await ctx.data.auth.becomeCourier(formData(form));
      await ctx.refreshProfile();
      toast(t('driver.done'));
      ctx.go('/');
    });
  });
  return undefined;
}
