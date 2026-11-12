import { CONFIG } from './config.js';
import { getLang, t } from './i18n.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape any user-provided string before injecting it into a template.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

const locale = () => (getLang() === 'en' ? 'en-GB' : 'fr-FR');

export function money(amount) {
  return `${new Intl.NumberFormat('fr-FR').format(amount || 0)} ${CONFIG.currency}`;
}

export function when(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
}

// Icon from the bundled icon font (vendor/fonts/icons.woff2). Only names in
// that subset render; add new ones to the font before using them.
export function icon(name) {
  return `<span class="icon" aria-hidden="true">${name}</span>`;
}

let toastTimer = null;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// Domain and data errors carry an i18n key as their message.
export function errorKey(e) {
  return /^(err|app)\.\w+$/.test(e?.message || '') ? e.message : null;
}

export function errorText(e) {
  return t(errorKey(e) || 'app.error');
}

// Runs an async action from a button: disables it and surfaces errors.
export async function run(button, action) {
  if (button) button.disabled = true;
  try {
    await action();
  } catch (e) {
    if (!errorKey(e)) console.error(e);
    toast(errorText(e));
  } finally {
    if (button) button.disabled = false;
  }
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}
