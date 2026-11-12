// Driver wallet: the cash box the platform commission is taken from.
import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { esc, icon, money, run, toast, when } from '../ui.js';

const AMOUNTS = [1000, 2000, 5000, 10000];
const METHODS = [['orange', 'Orange Money'], ['wave', 'Wave'], ['mtn', 'MTN MoMo'], ['moov', 'Moov Money']];
const METHOD_NAMES = Object.fromEntries(METHODS);

export function mount(root, ctx) {
  root.innerHTML = `
    <section class="page stack">
      <h1>${esc(t('wallet.title'))}</h1>
      <div class="balance-card">
        <div class="row between"><span>${esc(t('wallet.balance'))}</span>${icon('lock')}</div>
        <strong id="balance" aria-live="polite">—</strong>
        <span class="balance-hint">${esc(t('wallet.courierHint', { rate: Math.round(CONFIG.commissionRate * 100) }))}</span>
      </div>
      <form id="topup" class="stack">
        <fieldset class="plain">
          <legend>${esc(t('wallet.amount'))}</legend>
          <div class="segmented wrap">
            ${AMOUNTS.map((a, i) => `<label><input type="radio" name="amount" value="${a}" ${i === 1 ? 'checked' : ''}>${esc(money(a))}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="plain">
          <legend>${esc(t('wallet.with'))}</legend>
          <div class="segmented wrap">
            ${METHODS.map(([id, name]) => `<button type="submit" value="${id}">${esc(name)}</button>`).join('')}
          </div>
        </fieldset>
      </form>
      <h2>${esc(t('wallet.history'))}</h2>
      <div id="history" class="card list" aria-live="polite"></div>
    </section>`;

  const form = root.querySelector('#topup');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      await ctx.data.wallet.topUp(new FormData(form).get('amount'), e.submitter.value);
      toast(t('wallet.done'));
    });
  });

  const balance = root.querySelector('#balance');
  const history = root.querySelector('#history');
  return ctx.data.wallet.watch((w) => {
    balance.textContent = money(w.balance);
    history.innerHTML = w.tx.length
      ? w.tx.map((x) => {
        const plus = x.amount > 0;
        const ref = x.type === 'topup' ? METHOD_NAMES[x.ref] || '' : x.ref;
        return `
          <div class="row tx">
            <span class="tx-icon ${plus ? 'plus' : ''}">${icon(x.type === 'topup' ? 'add' : 'two_wheeler')}</span>
            <span class="grow"><strong>${esc(t(`tx.${x.type}`))} ${esc(ref)}</strong><span class="muted">${esc(when(x.at))}</span></span>
            <strong class="${plus ? 'amount-plus' : ''}">${plus ? '+' : '−'} ${esc(money(Math.abs(x.amount)))}</strong>
          </div>`;
      }).join('')
      : `<p class="empty">${esc(t('wallet.empty'))}</p>`;
  });
}
