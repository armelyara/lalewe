// One-question-at-a-time screens shared by ordering, login and driver sign-up.
import { t } from './i18n.js';
import { esc, icon } from './ui.js';

export function progressBar(done, total) {
  const pct = Math.round((done / total) * 100);
  return `<div class="flow-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>`;
}

// A previous answer, shown above the current question with a way back to it.
export function recap(label, value, attrs = '') {
  return `<div class="recap">${icon('check_circle')}<span class="recap-text"><strong>${esc(label)}</strong> · ${esc(value)}</span>
    <button type="button" class="link" ${attrs}>${esc(t('flow.edit'))}</button></div>`;
}

export function question(step, total, title, help = '') {
  return `<div class="question">
    <span class="flow-step">${esc(t('flow.step', { n: step, total }))}</span>
    <h1>${esc(title)}</h1>
    ${help ? `<p class="lead">${esc(help)}</p>` : ''}
  </div>`;
}

// Footer: optional "previous" and the main action. The main action submits the form.
export function footer(primary, { back = true } = {}) {
  return `<div class="flow-footer">
    ${back ? `<button type="button" class="link back-btn" data-back>${icon('arrow_back')}${esc(t('flow.back'))}</button>` : ''}
    <button class="btn primary big grow" type="submit">${esc(primary)}</button>
  </div>`;
}

export function summaryLine(label, value) {
  return `<div class="line"><span>${esc(label)}</span><strong>${value}</strong></div>`;
}
