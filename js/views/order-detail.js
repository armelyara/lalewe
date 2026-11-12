import { STATUS, canTransition } from '../domain/orders.js';
import { t } from '../i18n.js';
import { esc, icon, money, run, toast, when } from '../ui.js';
import { communeName, statusChip, stopDot, stopLabel, vehicleThumb } from './shared.js';

const STEPS = [['detail.created', 'createdAt'], ['detail.found', 'acceptedAt'], ['detail.picked', 'pickedUpAt'], ['detail.delivered', 'deliveredAt']];

const callLink = (phone) =>
  phone ? `<a class="call" href="tel:${esc(phone)}" aria-label="${esc(`${t('common.call')} ${phone}`)}">${icon('call')}${esc(t('common.call'))}</a>` : '';

export function mount(root, ctx, { id }) {
  const role = ctx.profile.role;
  let deliveryCode = null;
  let latest = null;
  let balance = null;

  function render(o) {
    if (!o) {
      root.innerHTML = `<section class="page stack"><p class="empty">${esc(t('detail.notFound'))}</p><a class="btn ghost" href="#/">${esc(t('common.back'))}</a></section>`;
      return;
    }
    const can = (to) => canTransition(role, o.status, to);
    const mine = o.courierId === ctx.user.uid;
    const open = o.status !== STATUS.DELIVERED && o.status !== STATUS.CANCELLED;
    const n = o.stops.length;
    const timeline = o.status === STATUS.CANCELLED
      ? `<li class="done">${esc(t('detail.cancelled'))} <span class="hint">${esc(when(o.cancelledAt))}</span></li>`
      : STEPS.map(([key, field]) => `<li class="${o[field] ? 'done' : ''}">${esc(t(key))} <span class="hint">${esc(when(o[field]))}</span></li>`).join('');
    const fact = (label, value) => `<dt>${esc(label)}</dt><dd>${value}</dd>`;
    const lowBalance = role === 'courier' && can(STATUS.ACCEPTED) && balance !== null && balance < o.commission;

    root.innerHTML = `
      <section class="page stack">
        <a class="back" href="#/${role === 'courier' ? '' : 'activity'}">${icon('arrow_back')}${esc(t('common.back'))}</a>
        <div class="row between"><h1>${esc(o.code)}</h1>${statusChip(o.status)}</div>
        ${role === 'merchant' && deliveryCode && open ? `
          <div class="card notice center">
            <span>${esc(t('detail.codeTitle'))}</span>
            <strong class="code">${esc(deliveryCode)}</strong>
            <span class="hint">${esc(t('detail.codeHelp'))}</span>
          </div>` : ''}
        <ol class="timeline card">${timeline}</ol>
        <div class="card stack">
          ${o.stops.map((s, i) => `
            <div class="stop-line">${stopDot(i, n)}
              <div class="grow"><span class="hint">${esc(stopLabel(i, n))}</span><strong>${esc(communeName(s.commune))}</strong><span>${esc(s.landmark)}</span>
                ${s.contactPhone && (role === 'courier' ? mine : true) ? `<span class="muted">${esc(s.contactPhone)}</span>` : ''}</div>
              ${role === 'courier' && mine && open ? callLink(s.contactPhone) : ''}
            </div>`).join('')}
        </div>
        ${role === 'merchant' && o.courierName ? `
          <div class="card row">${vehicleThumb(o.vehicleType)}
            <div class="grow"><strong>${esc(o.courierName)}</strong><span class="muted">${esc(t(`vehicle.${o.vehicleType}`))}${o.courierPlate ? ` · ${esc(o.courierPlate)}` : ''}</span></div>
            ${open ? callLink(o.courierPhone) : ''}
          </div>` : ''}
        <dl class="card facts">
          ${o.parcel ? fact(t('detail.parcel'), esc(o.parcel)) : ''}
          ${o.note ? fact(t('detail.note'), esc(o.note)) : ''}
          ${fact(t('detail.vehicle'), `${esc(t(`vehicle.${o.vehicleType}`))} · ${esc(t(`level.${o.serviceLevel}`))}`)}
          ${fact(t('detail.distance'), `${esc(o.distanceKm)} km`)}
          ${fact(t('detail.price'), `<strong>${esc(money(o.priceTotal))}</strong><br><span class="hint">${esc(t('detail.paidCash'))}</span>`)}
          ${o.goodsAmount ? fact(t('detail.goods'), `<strong>${esc(money(o.goodsAmount))}</strong>`) : ''}
          ${role === 'courier' ? `
            ${o.goodsAmount ? fact(t('detail.payMerchant'), esc(money(o.goodsAmount))) : ''}
            ${fact(t('detail.collect'), `<strong>${esc(money(o.priceTotal + o.goodsAmount))}</strong>`)}
            ${fact(t('detail.commission'), `− ${esc(money(o.commission))}`)}
            ${fact(t('detail.earn'), `<strong>${esc(money(o.priceTotal - o.commission))}</strong>`)}` : ''}
        </dl>
        ${role === 'merchant' && o.goodsAmount && open ? `<p class="hint">${icon('payments')}${esc(t('detail.merchantGoods', { amount: money(o.goodsAmount) }))}</p>` : ''}
        <div class="stack">
          ${role === 'courier' && can(STATUS.ACCEPTED) ? `
            <p class="hint">${icon('info')}${esc(t('detail.acceptNote', { amount: money(o.commission) }))}</p>
            ${lowBalance ? `<a class="btn ghost" href="#/wallet">${icon('account_balance_wallet')}${esc(t('detail.walletLow'))} ${esc(t('wallet.topUp'))}</a>` : ''}
            <button class="btn primary big" data-act="accept">${esc(t('detail.accept'))}</button>` : ''}
          ${role === 'courier' && mine && can(STATUS.PICKED_UP) ? `<button class="btn primary big" data-act="pickUp">${esc(t('detail.pickUp'))}</button>` : ''}
          ${role === 'courier' && mine && can(STATUS.DELIVERED) ? `
            <form id="deliver" class="stack card">
              <label>${esc(t('detail.codeInput'))}
                <input name="code" class="code-input" inputmode="numeric" maxlength="4" autocomplete="off" required>
              </label>
              <button class="btn primary big" type="submit">${esc(t('detail.confirm'))}</button>
            </form>` : ''}
          ${role === 'merchant' && can(STATUS.CANCELLED) ? `<button class="btn ghost danger" data-act="cancel">${esc(t('detail.cancel'))}</button>` : ''}
        </div>
      </section>`;

    root.querySelectorAll('[data-act]').forEach((btn) =>
      btn.addEventListener('click', () => run(btn, () => ctx.data.orders[btn.dataset.act](o.id))),
    );
    root.querySelector('#deliver')?.addEventListener('submit', (e) => {
      e.preventDefault();
      run(e.submitter, async () => {
        await ctx.data.orders.deliver(o.id, new FormData(e.target).get('code'));
        toast(t('detail.confirmed'));
      });
    });
  }

  const unsubs = [];
  if (role === 'merchant') {
    ctx.data.orders.getDeliveryCode(id).then((code) => {
      deliveryCode = code;
      if (latest) render(latest);
    });
  } else {
    unsubs.push(ctx.data.wallet.watch((w) => {
      const changed = balance !== w.balance;
      balance = w.balance;
      if (changed && latest) render(latest);
    }));
  }
  unsubs.push(ctx.data.orders.watch(id, (o) => {
    latest = o;
    render(o);
  }));
  return () => unsubs.forEach((fn) => fn());
}
