import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { esc, formData, run } from '../ui.js';

export function mount(root, ctx) {
  let pending = null;
  const demo = ctx.data.mode === 'mock';

  function renderPhone() {
    root.innerHTML = `
      <section class="page narrow stack">
        <div><h1>${esc(t('login.phoneTitle'))}</h1><p class="lead">${esc(t('login.phoneLead'))}</p></div>
        <form id="phone-form" class="stack" novalidate>
          <label>${esc(t('login.phone'))}
            <span class="phone-field"><span>+225</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="07 00 00 00 00" required></span>
          </label>
          <button class="btn primary big" type="submit">${esc(t('login.send'))}</button>
          <a class="btn ghost" href="#/">${esc(t('login.guest'))}</a>
          <div id="recaptcha"></div>
        </form>
      </section>`;
    root.querySelector('#phone-form').addEventListener('submit', (e) => {
      e.preventDefault();
      run(e.submitter, async () => {
        pending = await ctx.data.auth.startPhoneSignIn(formData(e.target).phone);
        renderCode();
      });
    });
  }

  function renderCode() {
    root.innerHTML = `
      <section class="page narrow stack">
        <h1>${esc(t('login.codeTitle'))}</h1>
        <form id="code-form" class="stack" novalidate>
          <label>${esc(t('login.code'))}
            <input name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
          </label>
          ${demo ? `<p class="hint">${esc(t('login.demo', { code: CONFIG.demoOtp }))}</p>` : ''}
          <button class="btn primary big" type="submit">${esc(t('login.continue'))}</button>
          <button class="btn ghost" type="button" id="back">${esc(t('login.change'))}</button>
        </form>
      </section>`;
    root.querySelector('#back').addEventListener('click', renderPhone);
    root.querySelector('#code-form').addEventListener('submit', (e) => {
      e.preventDefault();
      // On success the auth listener in app.js navigates away.
      run(e.submitter, () => pending.confirm(formData(e.target).code));
    });
    root.querySelector('[name="code"]').focus();
  }

  renderPhone();
  return undefined;
}
