// Sign-in in two questions: phone number, then the SMS code.
import { CONFIG } from '../config.js';
import { footer, progressBar, question } from '../flow.js';
import { t } from '../i18n.js';
import { esc, run } from '../ui.js';

export function mount(root, ctx) {
  let pending = null;
  let phone = '';
  const demo = ctx.data.mode === 'mock';
  root.innerHTML = '<form class="page narrow flow" id="flow" novalidate></form>';
  const form = root.querySelector('#flow');

  function render() {
    form.innerHTML = pending
      ? `${progressBar(2, 2)}
        ${question(2, 2, t('login.codeQ'), t('login.sentTo', { phone: `+225 ${phone}` }))}
        <input class="line code-input" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="${esc(t('login.code'))}">
        ${demo ? `<p class="hint">${esc(t('login.demo', { code: CONFIG.demoOtp }))}</p>` : ''}
        ${footer(t('flow.continue'))}`
      : `${progressBar(1, 2)}
        ${question(1, 2, t('login.phoneQ'), t('login.phoneLead'))}
        <span class="phone-field"><span>+225</span><input class="line" id="phone" type="tel" inputmode="tel" autocomplete="tel-national"
          placeholder="07 00 00 00 00" value="${esc(phone)}" aria-label="${esc(t('login.phone'))}"></span>
        <a class="link" href="#/">${esc(t('login.guest'))}</a>
        <div id="recaptcha"></div>
        ${footer(t('login.send'), { back: false })}`;
    form.querySelector('input').focus();
  }

  form.addEventListener('click', (e) => {
    if (!e.target.closest('[data-back]')) return;
    pending = null;
    render();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      if (!pending) {
        phone = form.querySelector('#phone').value.trim();
        pending = await ctx.data.auth.startPhoneSignIn(phone);
        render();
      } else {
        // On success the auth listener in app.js navigates away.
        await pending.confirm(form.querySelector('#code').value);
      }
    });
  });

  render();
  return undefined;
}
