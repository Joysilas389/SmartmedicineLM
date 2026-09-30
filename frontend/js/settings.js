/* Settings (spec §67) and the roadmap page for Phase 2 sections (spec §72). */
import { accountSectionHtml, accountAction } from './account.js';
import { semanticStatus } from './embeddings.js';
import { dataSectionHtml, dataAction } from './data-ui.js';
import { EXAMS } from './exams.js';
import { LEVELS } from './levels.js';
import { formatUsd } from './cost.js';

const ROTATIONS = [['none', 'No current rotation'], ['internal', 'Internal medicine'], ['surgery', 'Surgery'], ['pediatrics', 'Pediatrics'], ['obgyn', 'Obstetrics & gynecology'], ['psychiatry', 'Psychiatry'], ['emergency', 'Emergency medicine'], ['family', 'Family medicine'], ['neurology', 'Neurology']];
import { state, saveSettings, resetSettings, POLICY_TOGGLES } from './state.js';
import { db } from './store.js';
import { $, escapeHtml, toast, confirmDialog } from './ui.js';
import { invalidateIndex } from './retrieval.js';

export function applyTheme() {
  const t = state.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16141f' : '#fbfbfd');
}

const row = (id, label, hint, control) => `
  <div class="setting-row">
    <div><label for="${id}">${label}</label>${hint ? `<small>${hint}</small>` : ''}</div>
    ${control}
  </div>`;

const toggle = (id, checked) =>
  `<div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" id="${id}" ${checked ? 'checked' : ''}></div>`;

const select = (id, value, options) =>
  `<select class="form-select form-select-sm" id="${id}">${options
    .map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`)
    .join('')}</select>`;

function providerBox() {
  const m = state.modelInfo;
  if (!m) return '<div class="provider-box">Could not reach <code>/api/models</code>. Check your deployment.</div>';
  const status = m.configured
    ? `<span class="text-success"><i class="bi bi-check-circle me-1"></i>Connected</span>`
    : `<span class="text-warning"><i class="bi bi-exclamation-triangle me-1"></i>Demo mode: no API key set</span>`;
  return `<div class="provider-box">
    <div class="d-flex justify-content-between flex-wrap gap-2"><b>${escapeHtml(m.name)}</b>${status}</div>
    <div class="text-body-secondary mt-1">Model: <code>${escapeHtml(m.model || 'n/a')}</code> · Images: ${m.vision ? 'supported' : 'not supported'}</div>
    ${m.configured ? '' : `<div class="mt-2">To connect a real model, add <code>ANTHROPIC_API_KEY</code> (or <code>OPENAI_API_KEY</code> + <code>OPENAI_BASE_URL</code>) in Vercel → Project → Settings → Environment Variables, then redeploy.</div>`}
  </div>`;
}

export function renderSettings() {
  const s = state.settings;
  const page = $('#settingsPage');
  page.innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">Settings</h2>
      <p class="page-sub">These control the teaching engine directly.${state.account?.user ? ' They sync with your account.' : ' They are stored on this device.'}</p>
    </div></div>

    ${dataSectionHtml()}

    ${accountSectionHtml()}

    <section class="settings-section">
      <h3>AI model</h3>
      ${providerBox()}
      ${state.modelInfo?.accessCodeRequired ? row('setAccess', 'Access code', 'This deployment is protected. Enter the code set in APP_ACCESS_CODE.',
        `<input type="password" class="form-control form-control-sm" id="setAccess" value="${escapeHtml(s.accessCode)}" autocomplete="off">`) : ''}
      ${row('setTemp', `Temperature <span class="text-body-secondary" id="tempVal">${s.temperature}</span>`, 'Lower is more precise; higher is more varied. Newer models manage this themselves and ignore it.',
        `<input type="range" class="form-range" style="max-width:220px" id="setTemp" min="0" max="1" step="0.1" value="${s.temperature}">`)}
    </section>

    <section class="settings-section">
      <h3>Teaching</h3>
      ${row('setExam', 'Exam you are preparing for', 'Changes what lessons and questions emphasise. ' + (EXAMS[s.exam] || EXAMS.step1).hint + '.',
        select('setExam', s.exam || 'step1', Object.entries(EXAMS).map(([k, v]) => [k, v.label])))}
      ${row('setLevel', 'Teach me as a', 'Sets how much is assumed and how deep the explanation goes. "Detect" reads it from how you ask.',
        select('setLevel', s.level || 'auto', LEVELS))}
      ${row('setRotation', 'Current clinical rotation', 'Adds a short "On the ward" note to lessons: bedside checks, what to present, and what the shelf exam asks.',
        select('setRotation', s.rotation || 'none', ROTATIONS))}
      ${row('setMode', 'Response mode', 'Auto adapts to how you ask (short question, from zero, review, test me).',
        select('setMode', s.mode, [['auto', 'Auto'], ['learn', 'Learn'], ['review', 'Review'], ['recall', 'Active recall']]))}
      ${row('setDepth', 'Default depth', 'Used when a full lesson is requested.',
        select('setDepth', s.depth, [['quick', 'Quick'], ['standard', 'Standard'], ['deep', 'Deep'], ['comprehensive', 'Comprehensive']]))}
      ${POLICY_TOGGLES.map((p) => row(`pol_${p.key}`, p.label, p.hint, toggle(`pol_${p.key}`, s.policy[p.key]))).join('')}
      ${row('setGhana', 'Ghana / resource-limited context', 'Adds local differentials and practical constraints when relevant. Never changes standard USMLE teaching.', toggle('setGhana', s.ghanaContext))}
    </section>

    <section class="settings-section">
      <h3>Sources</h3>
      ${row('setKnow', 'Knowledge mode', '“My library” is source-locked: answers only from your documents.',
        select('setKnow', s.knowledgeMode, [['library', 'My library (source-locked)'], ['hybrid', 'Hybrid'], ['general', 'General knowledge']]))}
      ${row('setK', 'Passages per answer', 'How many retrieved passages are sent to the model.',
        select('setK', s.retrievalK, [[4, '4'], [6, '6'], [8, '8'], [10, '10'], [12, '12']]))}
      ${row('setSem', 'Semantic search', 'Finds passages by meaning as well as by words (e.g. “why do the ankles swell” finds text about oncotic pressure). Downloads a 23 MB model once, then works offline in this browser.',
        toggle('setSem', s.semanticSearch))}
      <div class="small text-body-secondary mt-1" id="semStatus">${escapeHtml(semanticStatus())}</div>
    </section>

    <section class="settings-section">
      <h3>Cost of AI answers</h3>
      ${row('setShowCost', 'Show estimated cost under answers', 'An estimate from the length of what is sent and received (about 4 characters per token). Your provider\'s bill is the real figure.', toggle('setShowCost', s.showCost !== false))}
      <div class="price-row">
        <label class="small">Input $/million tokens <input class="form-control form-control-sm" id="setPriceIn" inputmode="decimal" value="${escapeHtml(String(s.prices?.input ?? 3))}"></label>
        <label class="small">Output $/million tokens <input class="form-control form-control-sm" id="setPriceOut" inputmode="decimal" value="${escapeHtml(String(s.prices?.output ?? 15))}"></label>
      </div>
      <p class="small text-body-secondary mt-2 mb-0" id="costTotal">Estimated spend: calculating…</p>
    </section>

    <section class="settings-section">
      <h3>Spaced repetition</h3>
      ${row('setSched', 'Scheduler', 'FSRS models each card’s difficulty and memory stability; SM-2 is the classic Anki-style algorithm.',
        select('setSched', s.scheduler, [['fsrs', 'FSRS (recommended)'], ['sm2', 'SM-2']]))}
    </section>

    <section class="settings-section">
      <h3>Appearance</h3>
      ${row('setTheme', 'Theme', '', select('setTheme', s.theme, [['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']]))}
    </section>

    <section class="settings-section">
      <h3>Data on this device</h3>
      <p class="small text-body-secondary">${state.account?.user ? 'Everything is kept in this browser and synced to your account.' : 'Chats, documents, flashcards, questions and progress are stored in this browser. Clearing browser data removes them.'}</p>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-outline-secondary btn-sm" id="resetSettings" type="button"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset settings</button>
        <button class="btn btn-outline-danger btn-sm" id="wipeData" type="button"><i class="bi bi-trash me-1"></i>Delete all local data</button>
      </div>
    </section>

    <section class="settings-section">
      <h3>About</h3>
      <p class="small text-body-secondary mb-0">SmartMedicineLM is an educational tool. It is not a substitute for professional clinical judgement, and it should not be used to make decisions about real patients.</p>
    </section>`;

  const on = (id, ev, fn) => $(`#${id}`)?.addEventListener(ev, fn);
  on('setAccess', 'change', (e) => saveSettings({ accessCode: e.target.value.trim() }));
  on('setTemp', 'input', (e) => {
    $('#tempVal').textContent = e.target.value;
    saveSettings({ temperature: Number(e.target.value) });
  });
  on('setMode', 'change', (e) => saveSettings({ mode: e.target.value }));
  on('setDepth', 'change', (e) => saveSettings({ depth: e.target.value }));
  on('setGhana', 'change', (e) => saveSettings({ ghanaContext: e.target.checked }));
  on('setKnow', 'change', (e) => saveSettings({ knowledgeMode: e.target.value }));
  on('setK', 'change', (e) => saveSettings({ retrievalK: Number(e.target.value) }));
  on('setSem', 'change', (e) => {
    saveSettings({ semanticSearch: e.target.checked });
    document.dispatchEvent(new CustomEvent('semantic:toggle'));
  });
  page.querySelectorAll('[data-acct]').forEach((b) => b.addEventListener('click', () => accountAction(b.dataset.acct, renderSettings)));
  page.querySelectorAll('[data-data]').forEach((b) => b.addEventListener('click', () => dataAction(b.dataset.data, renderSettings)));
  page.querySelector('#restoreFile')?.addEventListener('change', (e) => dataAction('restore', renderSettings, e.target.files?.[0]));
  on('setSched', 'change', (e) => saveSettings({ scheduler: e.target.value }));
  on('setLevel', 'change', (e) => saveSettings({ level: e.target.value }));
  on('setRotation', 'change', (e) => saveSettings({ rotation: e.target.value }));
  on('setShowCost', 'change', (e) => saveSettings({ showCost: e.target.checked }));
  const savePrices = () => {
    const input = Number(document.getElementById('setPriceIn').value.replace(',', '.'));
    const output = Number(document.getElementById('setPriceOut').value.replace(',', '.'));
    if (Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0) saveSettings({ prices: { input, output } });
  };
  on('setPriceIn', 'change', savePrices);
  on('setPriceOut', 'change', savePrices);
  db.all('messages').then((msgs) => {
    const month = new Date();
    month.setDate(1);
    month.setHours(0, 0, 0, 0);
    const withCost = msgs.filter((m) => m.cost);
    const sum = (list) => list.reduce((a, m) => a + (m.cost.usd || 0), 0);
    const el = document.getElementById('costTotal');
    if (el) el.textContent = withCost.length ? `Estimated spend: ${formatUsd(sum(withCost.filter((m) => m.createdAt >= month.getTime())))} this month, ${formatUsd(sum(withCost))} in total (${withCost.length} answers).` : 'No answers with a cost estimate yet.';
  });
  on('setExam', 'change', (e) => {
    saveSettings({ exam: e.target.value });
    renderSettings();
  });
  on('setTheme', 'change', (e) => {
    saveSettings({ theme: e.target.value });
    applyTheme();
  });
  POLICY_TOGGLES.forEach((p) =>
    on(`pol_${p.key}`, 'change', (e) => saveSettings({ policy: { ...state.settings.policy, [p.key]: e.target.checked } })));

  on('resetSettings', 'click', () => {
    resetSettings();
    applyTheme();
    renderSettings();
    toast('Settings reset.');
  });
  on('wipeData', 'click', async () => {
    if (!(await confirmDialog('Delete all local data?', 'This permanently removes every chat, document, flashcard, question and all progress data stored in this browser.'))) return;
    await db.wipe();
    invalidateIndex();
    location.hash = '#/chat';
    location.reload();
  });
}
