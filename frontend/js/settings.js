/* Settings (spec §67) and the roadmap page for Phase 2 sections (spec §72). */
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
      <p class="page-sub">These control the teaching engine directly. They are stored on this device.</p>
    </div></div>

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
    </section>

    <section class="settings-section">
      <h3>Appearance</h3>
      ${row('setTheme', 'Theme', '', select('setTheme', s.theme, [['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']]))}
    </section>

    <section class="settings-section">
      <h3>Data on this device</h3>
      <p class="small text-body-secondary">Chats, documents and flashcards are stored in this browser only (Phase 1). Clearing browser data removes them.</p>
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
    if (!(await confirmDialog('Delete all local data?', 'This permanently removes every chat, document and flashcard stored in this browser.'))) return;
    await db.wipe();
    invalidateIndex();
    location.hash = '#/chat';
    location.reload();
  });
}

const ROADMAP = {
  questions: {
    title: 'Questions', icon: 'bi-ui-checks',
    lead: 'A USMLE-style question engine built on the same teaching controller.',
    items: ['Tutor, timed-block and exam modes with navigation and marking', 'Why the right answer is right, and why every distractor is wrong', 'What finding would make each distractor correct', 'Error classification (mechanism gap, misread clue, distractor trap…)', 'Missed questions become flashcards automatically'],
    now: 'Today you can type “Test me on …” in chat, or use “Generate questions” on any page in the viewer.',
  },
  progress: {
    title: 'Progress', icon: 'bi-graph-up',
    lead: 'A learner model that tracks understanding, recall and application separately.',
    items: ['Per-system mastery split into understanding / recall / application', 'Weakness map with prerequisite bottlenecks', 'Study plans built from your exam date and hours per day', 'Review forecast from the spaced-repetition scheduler'],
    now: 'Your flashcard review history is already being recorded for this.',
  },
  knowledge: {
    title: 'Knowledge', icon: 'bi-diagram-3',
    lead: 'A medical knowledge graph compiled from your library.',
    items: ['Concepts linked by causes, inhibits, presents with, treated by…', 'Prerequisite detection before each lesson', 'Mechanisms and clinical findings extracted from each source section', 'Source comparison across documents'],
    now: 'Detected topics already appear on each document in the Library.',
  },
};

export function renderSoon(key) {
  const r = ROADMAP[key] || ROADMAP.questions;
  $('#soonPage').innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title"><i class="bi ${r.icon} me-2"></i>${r.title}</h2>
      <p class="page-sub">${r.lead}</p>
    </div></div>
    <span class="badge text-bg-secondary mb-2">Phase 2</span>
    <ul class="roadmap">${r.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    <div class="alert alert-light border mt-4 mb-0"><i class="bi bi-lightbulb me-2"></i>${escapeHtml(r.now)}</div>`;
  return r.title;
}
