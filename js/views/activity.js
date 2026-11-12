// Merchant activity: ongoing and finished deliveries. Requires an account.
import { ACTIVE_STATUSES } from '../domain/orders.js';
import { t } from '../i18n.js';
import { esc } from '../ui.js';
import { orderList } from './shared.js';

export function mount(root, ctx) {
  let tab = 'active';
  let orders = [];
  root.innerHTML = `
    <section class="page stack">
      <h1>${esc(t('activity.title'))}</h1>
      <div class="segmented" role="tablist">
        <button type="button" role="tab" data-tab="active"></button>
        <button type="button" role="tab" data-tab="done"></button>
      </div>
      <div id="orders" class="stack" aria-live="polite"></div>
      <a class="btn primary big" href="#/">${esc(t('home.title'))}</a>
    </section>`;
  const list = root.querySelector('#orders');
  const tabs = [...root.querySelectorAll('[data-tab]')];

  function render() {
    const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
    const done = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));
    tabs.forEach((btn) => {
      const isActive = btn.dataset.tab === 'active';
      btn.textContent = `${t(isActive ? 'activity.active' : 'activity.done')} · ${(isActive ? active : done).length}`;
      btn.setAttribute('aria-selected', String(btn.dataset.tab === tab));
    });
    list.innerHTML = tab === 'active' ? orderList(active, t('activity.emptyActive')) : orderList(done, t('activity.emptyDone'));
  }
  tabs.forEach((btn) => btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    render();
  }));
  return ctx.data.orders.watchMine((next) => {
    orders = next;
    render();
  });
}
