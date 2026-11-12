import { t } from '../i18n.js';
import { esc, formData, icon, run, toast } from '../ui.js';
import { communeOptions } from './shared.js';

export function mount(root, ctx) {
  const p = ctx.profile;
  const courier = p.role === 'courier';
  root.innerHTML = `
    <section class="page narrow stack">
      <h1>${esc(t('account.title'))}</h1>
      <dl class="card facts">
        <dt>${esc(t('login.phone'))}</dt><dd>${esc(ctx.user.phone)}</dd>
        <dt>${esc(t('account.role'))}</dt><dd>${esc(t(courier ? 'account.courier' : 'account.merchant'))}</dd>
      </dl>
      <form id="account-form" class="stack" novalidate>
        <label>${esc(t('account.name'))}<input name="name" autocomplete="name" maxlength="80" value="${esc(p.name)}"></label>
        ${courier ? '' : `<label>${esc(t('account.shop'))}<input name="businessName" maxlength="80" value="${esc(p.businessName)}"></label>`}
        <label>${esc(t('account.commune'))}<select name="commune">${communeOptions(p.commune)}</select></label>
        <button class="btn primary big" type="submit">${esc(t('common.save'))}</button>
      </form>
      ${courier ? '' : `<a class="btn ghost" href="#/driver">${icon('two_wheeler')}${esc(t('nav.driverLong'))}</a>`}
      <button class="btn ghost" id="signout">${icon('logout')}${esc(t('account.signOut'))}</button>
    </section>`;

  root.querySelector('#account-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.submitter, async () => {
      await ctx.data.auth.saveProfile({ businessName: p.businessName, ...formData(e.target) });
      await ctx.refreshProfile();
      toast(t('account.saved'));
    });
  });
  root.querySelector('#signout').addEventListener('click', (e) => run(e.currentTarget, () => ctx.data.auth.signOut()));
  return undefined;
}
