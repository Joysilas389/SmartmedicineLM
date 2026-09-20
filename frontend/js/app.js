/* SmartMedicineLM entry point: hash router, theme, sidebar, model status. */
import { state, saveSettings } from './state.js';
import { requestPersistence } from './store.js';
import { $, $$, toast } from './ui.js';
import { initMermaid } from './render.js';
import { initChat, loadChats, renderChatList, openChat, startNewChat, updateTopbar, closeOffcanvas, currentChat } from './chat.js';
import { initLibrary, loadDocuments, renderLibrary, renderSourcesPage } from './library.js';
import { initViewer, openViewer } from './viewer.js';
import { renderFlashcards, updateDueBadge } from './flashcards.js';
import { initLearn } from './learn.js';
import { renderSettings, applyTheme } from './settings.js';
import { renderQuestions } from './questions.js';
import { renderProgress } from './progress.js';
import { renderKnowledge } from './knowledge.js';
import { loadKnowledge, reloadKnowledge } from './knowledge-store.js';
import { initAccount, renderAccountPill } from './account.js';
import { initLocalFiles, renderBackupPill } from './data-ui.js';
import { scheduleIndexing, invalidateVectors } from './embeddings.js';
import { renderWhiteboard } from './whiteboard.js';
import { invalidateIndex } from './retrieval.js';

const TITLES = { library: 'Library', learn: 'Learn', flashcards: 'Flashcards', sources: 'Sources', settings: 'Settings', questions: 'Questions', progress: 'Progress', knowledge: 'Knowledge', whiteboard: 'Whiteboard' };

function showView(name, nav = name) {
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${name}`));
  $$('.side-link[data-nav]').forEach((a) => {
    const on = a.dataset.nav === nav;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.dataset.view = name;
  if (name !== 'chat') $('#chatMenu').classList.add('d-none');
}

function setTitle(text) {
  $('#topbarTitle').textContent = text;
  document.title = text && text !== 'New chat' ? `${text} · SmartMedicineLM` : 'SmartMedicineLM';
}

async function route() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = (path || 'chat').split('/').map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(query));
  const [view, a, b] = parts;
  closeOffcanvas();

  switch (view) {
    case 'chat': {
      showView('chat');
      if (a) {
        if (a !== state.currentChatId) await openChat(a);
      } else if (state.currentChatId) {
        // Returning to the workspace keeps the open conversation; "New chat" resets explicitly.
        history.replaceState(null, '', `#/chat/${state.currentChatId}`);
      }
      updateTopbar();
      setTitle(currentChat()?.title || 'New chat');
      if (state.currentChatId) $('#chatMenu').classList.remove('d-none');
      break;
    }
    case 'viewer':
      showView('viewer', 'library');
      setTitle('Document');
      await openViewer(a, Number(b) || 1);
      setTitle(state.documents.find((d) => d.id === a)?.title || 'Document');
      break;
    case 'library':
      showView('library');
      setTitle(TITLES.library);
      renderLibrary();
      break;
    case 'learn':
      showView('learn');
      setTitle(TITLES.learn);
      break;
    case 'flashcards':
      showView('flashcards');
      setTitle(TITLES.flashcards);
      await renderFlashcards();
      break;
    case 'sources':
      showView('sources');
      setTitle(TITLES.sources);
      renderSourcesPage();
      break;
    case 'settings':
      showView('settings');
      setTitle(TITLES.settings);
      renderSettings();
      break;
    case 'questions':
      showView('questions');
      setTitle(TITLES.questions);
      await renderQuestions(params);
      break;
    case 'progress':
      showView('progress');
      setTitle(TITLES.progress);
      await renderProgress();
      break;
    case 'knowledge':
      showView('knowledge');
      setTitle(TITLES.knowledge);
      await renderKnowledge(a, params);
      break;
    case 'whiteboard':
      showView('whiteboard');
      setTitle(TITLES.whiteboard);
      await renderWhiteboard(a);
      break;
    default:
      location.replace('#/chat');
  }
  $('#main').scrollTop = 0;
}

/* ---------------- sidebar collapse (desktop rail) ---------------- */
function applySidebar() {
  const collapsed = !!state.settings.sidebarCollapsed;
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  const btn = $('#collapseSidebar');
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('data-bs-original-title', label);
  bootstrap.Tooltip.getInstance(btn)?.setContent({ '.tooltip-inner': label });
}

/* ---------------- model status pill ---------------- */
async function loadModelInfo() {
  const pill = $('#modelPill');
  const text = $('#modelPillText');
  try {
    const r = await fetch('/api/models', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    state.modelInfo = await r.json();
    const m = state.modelInfo;
    pill.classList.toggle('ok', m.configured);
    pill.classList.toggle('warn', !m.configured);
    text.textContent = m.configured ? m.model || m.name : 'Demo mode (no API key)';
    pill.title = m.configured ? `${m.name} · ${m.model}` : 'Add an API key in Vercel to connect a model';
  } catch {
    state.modelInfo = null;
    pill.classList.add('warn');
    text.textContent = 'API offline';
    pill.title = 'The /api routes are not reachable. Deploy to Vercel or run `vercel dev`.';
  }
  if (document.body.dataset.view === 'settings') renderSettings();
}

/* ---------------- boot ---------------- */
async function boot() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  applySidebar();

  $$('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el, { trigger: 'hover' }));
  $('#collapseSidebar').addEventListener('click', () => {
    saveSettings({ sidebarCollapsed: !state.settings.sidebarCollapsed });
    applySidebar();
  });
  $('#newChatBtn').addEventListener('click', () => {
    startNewChat();
    if (location.hash !== '#/chat') location.hash = '#/chat';
    closeOffcanvas();
  });
  // Close the mobile menu after any navigation tap.
  $$('.side-link').forEach((a) => a.addEventListener('click', closeOffcanvas));
  // Keyboard shortcut: Ctrl/Cmd+Shift+O = new chat (like most AI workspaces).
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      $('#newChatBtn').click();
    }
  });

  initMermaid();
  initChat();
  initLibrary();
  initViewer();
  initLearn();

  try {
    await Promise.all([loadChats(), loadDocuments(), loadKnowledge()]);
  } catch (err) {
    console.error(err);
    toast('Local storage is unavailable (private browsing?). Chats will not be saved.', 'danger', 8000);
  }
  renderChatList();
  updateDueBadge().catch(() => {});
  requestPersistence();
  loadModelInfo();
  await initAccount();
  await initLocalFiles();
  document.addEventListener('localfiles:status', renderBackupPill);
  document.addEventListener('localfiles:restored', async (e) => {
    await Promise.all([loadChats(), loadDocuments(), reloadKnowledge()]);
    invalidateIndex();
    renderChatList();
    updateDueBadge().catch(() => {});
    toast(`Restored ${e.detail.restored} records from your saved Excel file.`, 'success', 5000);
    route();
  });

  // Another device's changes arrived: refresh everything that reads from storage.
  document.addEventListener('sync:applied', async () => {
    await Promise.all([loadChats(), loadDocuments(), reloadKnowledge()]);
    invalidateIndex();
    invalidateVectors();
    renderChatList();
    updateDueBadge().catch(() => {});
    scheduleIndexing();
    if (!document.querySelector('#view-chat:not([hidden]) .msg') && !document.querySelector('.q-card')) route();
  });
  setTimeout(scheduleIndexing, 3000); // index existing documents by meaning in the background

  window.addEventListener('hashchange', route);
  await route();
  document.body.classList.add('ready');
}

boot().catch((err) => {
  console.error(err);
  toast(`Startup error: ${err.message}`, 'danger', 10000);
});
