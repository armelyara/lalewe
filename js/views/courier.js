// Driver home: wallet summary, availability switch, open jobs, own jobs.
import { CONFIG } from '../config.js';
import { vehicleById } from '../domain/pricing.js';
import { t } from '../i18n.js';
import { esc, icon, money, run } from '../ui.js';
import { orderList, vehicleThumb } from './shared.js';

export function mount(root, ctx) {
  const p = ctx.profile;
  const approved = p.courierStatus === 'approved';
  const bookable = Boolean(vehicleById(p.vehicleType)?.available);
  root.innerHTML = `
    <section class="page stack">
      <div class="row">${vehicleThumb(p.vehicleType)}<h1>${esc(t('courier.hello', { name: p.name.split(' ')[0] }))}</h1></div>
      <a class="card row between wallet-mini" href="#/wallet">
        <span class="row">${icon('account_balance_wallet')}<span class="grow"><strong id="balance">—</strong><span class="hint">${esc(t('wallet.courierHint', { rate: Math.round(CONFIG.commissionRate * 100) }))}</span></span></span>
        ${icon('chevron_right')}
      </a>
      ${!approved ? `<p class="card notice">${icon('hourglass_top')}${esc(t('courier.pending'))}</p>` : ''}
      ${approved && !bookable ? `<p class="card notice">${icon('info')}${esc(t('courier.soon'))}</p>` : ''}
      ${approved && bookable ? `
        <label class="card row between switch"><span>${esc(t('courier.online'))}</span><input type="checkbox" id="online" ${p.online ? 'checked' : ''}></label>
        <h2>${esc(t('courier.available'))}</h2>
        <div id="available" class="stack" aria-live="polite"></div>` : ''}
      <h2>${esc(t('nav.jobs'))}</h2>
      <div id="jobs" class="stack" aria-live="polite"></div>
    </section>`;

  const commission = (o) => `<span class="hint">${esc(t('courier.commission', { amount: money(o.commission) }))}</span>`;
  const unsubs = [];
  const balance = root.querySelector('#balance');
  unsubs.push(ctx.data.wallet.watch((w) => { balance.textContent = money(w.balance); }));
  const jobs = root.querySelector('#jobs');
  unsubs.push(ctx.data.orders.watchJobs((orders) => { jobs.innerHTML = orderList(orders, t('courier.none')); }));

  const toggle = root.querySelector('#online');
  if (toggle) {
    const available = root.querySelector('#available');
    let stop = null;
    const sync = () => {
      stop?.();
      stop = null;
      if (toggle.checked) {
        stop = ctx.data.orders.watchAvailable((orders) => { available.innerHTML = orderList(orders, t('courier.none'), commission); });
      } else {
        available.innerHTML = `<p class="empty">${icon('bedtime')}<br>${esc(t('courier.offline'))}</p>`;
      }
    };
    toggle.addEventListener('change', () =>
      run(toggle, async () => {
        await ctx.data.auth.setOnline(toggle.checked);
        p.online = toggle.checked;
        sync();
      }),
    );
    sync();
    unsubs.push(() => stop?.());
  }
  return () => unsubs.forEach((fn) => fn());
}
