import { createData } from './data/index.js';
import { getLang, setLang, t } from './i18n.js';
import { createRouter } from './router.js';
import { esc, icon, toast } from './ui.js';
import * as account from './views/account.js';
import * as activity from './views/activity.js';
import * as driver from './views/driver.js';
import * as home from './views/home.js';
import * as login from './views/login.js';
import * as orderDetail from './views/order-detail.js';
import { setNext, takeNext } from './views/shared.js';
import * as wallet from './views/wallet.js';

const PUBLIC = ['/', '/login'];

async function main() {
  const data = await createData();
  const ctx = { data, user: null, profile: null, go: null, refreshProfile: null };
  const view = (mod) => (root, params) => mod.mount(root, ctx, params);

  const router = createRouter(
    [
      { path: '/', mount: view(home) },
      { path: '/login', mount: view(login) },
      { path: '/activity', mount: view(activity) },
      { path: '/order/:id', mount: view(orderDetail) },
      { path: '/wallet', mount: view(wallet) },
      { path: '/driver', mount: view(driver) },
      { path: '/account', mount: view(account) },
    ],
    // Guard: ordering is public; everything else needs an account.
    (path) => {
      if (!ctx.user && !PUBLIC.includes(path)) {
        setNext(path);
        return '/login';
      }
      if (ctx.user && path === '/login') return takeNext();
      const courier = ctx.profile?.role === 'courier';
      if (path === '/wallet' && !courier) return '/';
      if (path === '/activity' && courier) return '/';
      return null;
    },
    renderChrome,
  );
  ctx.go = router.go;
  ctx.refreshProfile = async () => {
    ctx.profile = ctx.user ? await data.auth.ensureProfile() : null;
    renderChrome(router.current());
  };

  // Header and navigation depend on the language, the account and the mode.
  function renderChrome(path) {
    const courier = ctx.profile?.role === 'courier';
    const items = courier
      ? [['/', 'two_wheeler', 'nav.jobs'], ['/wallet', 'account_balance_wallet', 'nav.wallet'], ['/account', 'person', 'nav.account']]
      : [['/', 'add_box', 'nav.order'], ['/activity', 'receipt_long', 'nav.activity'], ['/driver', 'two_wheeler', 'nav.driver'], ['/account', 'person', 'nav.account']];
    document.getElementById('tabbar').style.gridTemplateColumns = `repeat(${items.length}, minmax(0, 1fr))`;
    const link = ([href, name, key], long) =>
      `<a href="#${href}" ${href === path ? 'aria-current="page"' : ''}>${long ? '' : icon(name)}<span>${esc(t(long && key === 'nav.driver' ? 'nav.driverLong' : key))}</span></a>`;
    document.documentElement.lang = getLang();
    document.getElementById('topnav').innerHTML = items.map((i) => link(i, true)).join('');
    document.getElementById('tabbar').innerHTML = items.map((i) => link(i, false)).join('');
    document.getElementById('topnav').setAttribute('aria-label', t('nav.main'));
    document.getElementById('tabbar').setAttribute('aria-label', t('nav.main'));
    document.getElementById('top-actions').innerHTML = `
      ${data.mode === 'mock' ? `<span class="chip chip-demo">${esc(t('app.demo'))}</span>` : ''}
      <button type="button" class="pill" id="lang" aria-label="${esc(t('lang.switch'))}">${icon('language')}${getLang() === 'fr' ? 'EN' : 'FR'}</button>
      ${ctx.profile
        ? `<a class="pill" href="#/account">${icon('person')}<span class="pill-text">${esc(ctx.profile.name.split(' ')[0] || t('nav.account'))}</span></a>`
        : `<a class="pill solid" href="#/login">${esc(t('nav.login'))}</a>`}`;
    document.getElementById('lang').addEventListener('click', () => setLang(getLang() === 'fr' ? 'en' : 'fr'));
  }

  window.addEventListener('langchange', () => router.render());

  data.auth.onChange(async (user) => {
    ctx.user = user;
    try {
      // First sign-in creates a merchant profile, so a guest can order right away.
      ctx.profile = user ? await data.auth.ensureProfile() : null;
    } catch (e) {
      console.error(e);
      toast(t('app.serverError'));
    }
    router.render();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
}

main().catch((e) => {
  console.error(e);
  document.getElementById('view').textContent = t('app.startError');
});
