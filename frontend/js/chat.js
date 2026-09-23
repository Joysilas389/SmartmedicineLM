/* Chat workspace: history, composer, retrieval → teaching controller → streaming render. */
import { state, saveSettings, POLICY_TOGGLES } from './state.js';
import { db } from './store.js';
import { $, $$, uid, escapeHtml, toast, confirmDialog, promptDialog, downloadText, debounce } from './ui.js';
import { renderMessage, handleDiagramAction, extractConceptBlock } from './render.js';
import { planFor, mergeLessonBlock, recordEvidence } from './knowledge-store.js';
import { enableHighlighting } from './highlights.js';
import { checkCitations } from './validators.js';
import { search } from './retrieval.js';
import { imageForModel, classifyFile } from './ingestion.js';
import { uploadFiles } from './library.js';
import { addCards } from './flashcards.js';

const els = {};
const composer = { images: [], pinned: null, uploads: new Map(), imageKind: 'auto', imageTask: 'explain' };

/* Phase 3: what kind of medical image is attached, and whether to explain it or practise reading it. */
const IMAGE_KIND_OPTIONS = [
  ['auto', 'Auto-detect'],
  ['ecg', 'ECG'],
  ['radiology', 'X-ray / CT / MRI'],
  ['histology', 'Histology'],
  ['pathology', 'Pathology'],
  ['clinical', 'Clinical photo'],
  ['diagram', 'Diagram / notes'],
];
let lastRequest = null;

const BRAND_SVG = document.querySelector('.brand-mark')?.innerHTML || '';
const MODE_LABEL = { auto: 'Auto', learn: 'Learn', review: 'Review', recall: 'Active recall' };
const KNOW_LABEL = { hybrid: 'Hybrid', library: 'My library', general: 'General' };
const TAG_LABEL = { learn: 'Learn', review: 'Review', recall: 'Active recall', concise: 'Direct answer', standard: 'Explain', image: 'Image', image_quiz: 'Image practice', image_eval: 'Image feedback', continue: 'Continued' };

export function currentChat() {
  return state.chats.find((c) => c.id === state.currentChatId) || null;
}

/* ============================== init ============================== */
export function initChat() {
  Object.assign(els, {
    thread: $('#thread'),
    empty: $('#emptyState'),
    form: $('#composer'),
    input: $('#prompt'),
    send: $('#sendBtn'),
    chips: $('#composerChips'),
    list: $('#chatList'),
    search: $('#chatSearch'),
    title: $('#topbarTitle'),
    menu: $('#chatMenu'),
    mic: $('#micBtn'),
    drop: $('#dropOverlay'),
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.streaming) stop();
    else send();
  });
  els.input.addEventListener('keydown', (e) => {
    const touch = matchMedia('(hover: none)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch) {
      e.preventDefault();
      if (!state.streaming) send();
    }
  });
  els.input.addEventListener('input', autosize);
  els.input.addEventListener('paste', onPaste);

  $$('#starters .starter').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.action === 'attach-image') return $('#fileImage').click();
      els.input.value = b.dataset.prompt;
      autosize();
      send();
    })
  );

  // attach menu
  $$('[data-attach]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.attach;
      if (t === 'pdf') $('#filePdf').click();
      if (t === 'image') $('#fileImage').click();
      if (t === 'doc') $('#fileDoc').click();
      if (t === 'library') openScopeModal();
    })
  );
  $('#filePdf').addEventListener('change', (e) => handleFiles(e.target.files, e.target));
  $('#fileDoc').addEventListener('change', (e) => handleFiles(e.target.files, e.target));
  $('#fileImage').addEventListener('change', (e) => handleFiles(e.target.files, e.target));

  // composer controls
  $$('input[name="mode"]').forEach((r) => r.addEventListener('change', () => saveSettings({ mode: r.value })));
  $$('input[name="depth"]').forEach((r) => r.addEventListener('change', () => saveSettings({ depth: r.value })));
  $$('input[name="knowledge"]').forEach((r) => r.addEventListener('change', () => saveSettings({ knowledgeMode: r.value })));
  buildPolicyMenu();
  syncControls();
  document.addEventListener('settings:changed', syncControls);

  // thread delegation: citations, sources, diagrams, flashcards, copy, retry
  els.thread.addEventListener('click', onThreadClick);
  // Interactive diagrams: turn a tapped diagram box or chain step into a follow-up question.
  els.thread.addEventListener('diagram:node', (e) => prefill(`In the diagram above, explain "${e.detail.label}": what causes it, and what does it lead to?`));
  els.thread.addEventListener('chain:step', (e) =>
    prefill(e.detail.prev ? `In the chain above, why does "${e.detail.prev}" lead to "${e.detail.step}"?` : `In the chain above, explain "${e.detail.step}" from first principles.`)
  );

  // sidebar list
  els.search.addEventListener('input', debounce(renderChatList, 120));
  $('#toggleArchived').addEventListener('click', (e) => {
    state.showArchived = !state.showArchived;
    e.target.textContent = state.showArchived ? 'Hide archived' : 'Show archived';
    renderChatList();
  });
  els.list.addEventListener('click', onChatListClick);

  // topbar chat menu
  $$('[data-chat-action]').forEach((b) => b.addEventListener('click', () => chatAction(b.dataset.chatAction, currentChat())));

  // scope modal
  $('#scopeSave').addEventListener('click', saveScope);
  $('#scopeAll').addEventListener('change', (e) => $$('#scopeList input').forEach((i) => (i.disabled = e.target.checked)));

  setupDragDrop();
  setupMic();
}

/* ============================== chat list ============================== */
export async function loadChats() {
  state.chats = (await db.all('chats')).sort((a, b) => b.updatedAt - a.updatedAt);
  renderChatList();
}

const CHAT_PAGE = 60;
let chatListLimit = CHAT_PAGE;

export function renderChatList() {
  const q = els.search.value.trim().toLowerCase();
  if (q !== renderChatList.lastQuery) {
    chatListLimit = CHAT_PAGE;
    renderChatList.lastQuery = q;
  }
  const chats = state.chats
    .filter((c) => (state.showArchived ? c.archived : !c.archived))
    .filter((c) => !q || c.title.toLowerCase().includes(q))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.updatedAt - a.updatedAt);
  if (!chats.length) {
    els.list.innerHTML = `<li class="chat-list-empty">${q ? 'No chats match your search.' : state.showArchived ? 'No archived chats.' : 'Your chats will appear here.'}</li>`;
    return;
  }
  const shown = chats.slice(0, chatListLimit);
  els.list.innerHTML = shown
    .map(
      (c) => `<li class="chat-item${c.id === state.currentChatId ? ' active' : ''}" data-id="${c.id}">
      <a href="#/chat/${c.id}" title="${escapeHtml(c.title)}">${c.favorite ? '<i class="bi bi-star-fill"></i>' : ''}${escapeHtml(c.title)}</a>
      <div class="dropdown">
        <button class="btn-icon" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Options for ${escapeHtml(c.title)}"><i class="bi bi-three-dots"></i></button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li><button class="dropdown-item" data-act="rename">Rename</button></li>
          <li><button class="dropdown-item" data-act="favorite">${c.favorite ? 'Remove from favourites' : 'Add to favourites'}</button></li>
          <li><button class="dropdown-item" data-act="export">Export</button></li>
          <li><button class="dropdown-item" data-act="archive">${c.archived ? 'Unarchive' : 'Archive'}</button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item text-danger" data-act="delete">Delete</button></li>
        </ul>
      </div></li>`
    )
    .join('');
  if (chats.length > shown.length)
    els.list.insertAdjacentHTML(
      'beforeend',
      `<li class="chat-more"><button type="button" class="btn btn-sm btn-link" id="moreChats">Show ${Math.min(CHAT_PAGE, chats.length - shown.length)} more of ${chats.length}</button></li>`
    );
}

function onChatListClick(e) {
  if (e.target.closest('#moreChats')) {
    chatListLimit += CHAT_PAGE;
    renderChatList();
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act) {
    const id = act.closest('.chat-item').dataset.id;
    chatAction(act.dataset.act, state.chats.find((c) => c.id === id));
    return;
  }
  if (e.target.closest('a')) closeOffcanvas();
}

export function closeOffcanvas() {
  const oc = bootstrap.Offcanvas.getInstance($('#sidebar'));
  if (oc && matchMedia('(max-width: 991.98px)').matches) oc.hide();
}

async function chatAction(action, chat) {
  if (!chat) return;
  if (action === 'rename') {
    const name = await promptDialog('Rename chat', chat.title, 'Chat name');
    if (name) await updateChat(chat, { title: name });
  } else if (action === 'favorite') {
    await updateChat(chat, { favorite: !chat.favorite }, false);
  } else if (action === 'archive') {
    await updateChat(chat, { archived: !chat.archived }, false);
    toast(chat.archived ? 'Chat archived.' : 'Chat restored.');
    if (chat.archived && chat.id === state.currentChatId) {
      startNewChat({ focus: false });
      location.hash = '#/chat';
    }
  } else if (action === 'export') {
    const msgs = await chatMessages(chat.id);
    const md = [`# ${chat.title}`, '', ...msgs.map((m) => `## ${m.role === 'user' ? 'You' : 'SmartMedicineLM'}\n\n${m.content}${sourcesMarkdown(m)}\n`)].join('\n');
    downloadText(`${chat.title.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'chat'}.md`, md);
  } else if (action === 'scope') {
    openScopeModal();
  } else if (action === 'delete') {
    if (!(await confirmDialog('Delete chat?', `"${chat.title}" and all its messages will be permanently deleted.`))) return;
    await db.delByIndex('messages', 'chatId', chat.id);
    await db.del('chats', chat.id);
    state.chats = state.chats.filter((c) => c.id !== chat.id);
    if (chat.id === state.currentChatId) {
      startNewChat({ focus: false });
      location.hash = '#/chat';
    }
    renderChatList();
    toast('Chat deleted.');
  }
  updateTopbar();
}

function sourcesMarkdown(m) {
  if (!m.sources?.length) return '';
  return '\n\nSources:\n' + m.sources.map((s) => `- [${s.tag}] ${s.docName}${s.page ? `, p. ${s.page}` : ''}`).join('\n');
}

async function updateChat(chat, patch, touch = true) {
  Object.assign(chat, patch, touch ? { updatedAt: Date.now() } : {});
  await db.put('chats', chat);
  renderChatList();
  updateTopbar();
}

async function chatMessages(chatId) {
  return (await db.byIndex('messages', 'chatId', chatId)).sort((a, b) => a.createdAt - b.createdAt);
}

/* ============================== open / new ============================== */
export async function openChat(id) {
  if (state.streaming && state.currentChatId !== id) stop();
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) {
    location.hash = '#/chat';
    return;
  }
  state.currentChatId = id;
  const msgs = await chatMessages(id);
  els.thread.querySelectorAll('.msg').forEach((m) => m.remove());
  els.empty.hidden = msgs.length > 0;
  for (const m of msgs) await appendMessage(m);
  renderChatList();
  updateTopbar();
  renderChips();
  scrollToBottom(true);
}

export function startNewChat({ focus = true } = {}) {
  if (state.streaming) stop();
  state.currentChatId = null;
  state.pendingScope = null;
  composer.pinned = null;
  els.thread.querySelectorAll('.msg').forEach((m) => m.remove());
  els.empty.hidden = false;
  renderChatList();
  updateTopbar();
  renderChips();
  if (focus && matchMedia('(hover: hover)').matches) els.input.focus();
}

export function updateTopbar() {
  const chat = currentChat();
  els.title.textContent = chat ? chat.title : 'New chat';
  els.menu.classList.toggle('d-none', !chat);
  if (chat) {
    $('[data-chat-action="favorite"] span').textContent = chat.favorite ? 'Remove from favourites' : 'Add to favourites';
    $('[data-chat-action="archive"] span').textContent = chat.archived ? 'Unarchive' : 'Archive';
  }
}

/** Used by Learn, the viewer and the library to start a prompt programmatically. */
export async function composeAndSend(text, { pinned = null, images = [], newChat = true, docIds = null } = {}) {
  location.hash = '#/chat';
  await new Promise((r) => setTimeout(r, 0));
  if (newChat) startNewChat({ focus: false });
  if (docIds) state.pendingScope = docIds;
  composer.pinned = pinned;
  composer.images.push(...images);
  els.input.value = text;
  autosize();
  renderChips();
  send();
}

export function prefill(text, { pinned = null, images = [] } = {}) {
  location.hash = state.currentChatId ? `#/chat/${state.currentChatId}` : '#/chat';
  if (pinned) composer.pinned = pinned;
  composer.images.push(...images);
  els.input.value = text;
  autosize();
  renderChips();
  els.input.focus();
}

/* ============================== title ============================== */
export function autoTitle(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const fromZero = /absolute zero|from zero|from scratch|know nothing/i.test(t);
  const review = /\b\d+[- ]?min(ute)?s?\b|\breview\b|\brecap\b/i.test(t);
  const test = /\b(test|quiz) me\b/i.test(t);
  let core = t
    .replace(/^(hi|hello|hey)[,!.\s]+/i, '')
    .replace(/^(please\s+)?(can|could) you\s+/i, '')
    .replace(/^(please\s+)?(teach|explain|tell|give|show|help|describe)( me)?( about| on| with)?\s+/i, '')
    .replace(/^(test|quiz) me( on| about)?\s*/i, '')
    .replace(/^(a|an)\s+\d+[- ]?min(ute)?s?\s+(review|recap|summary)\s+(of|on)\s+/i, '')
    .replace(/\bi know nothing about\b/gi, '')
    .replace(/\b(from (absolute )?zero|from scratch|in detail|please)\b/gi, '')
    .replace(/[?.!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!core || core.length < 3) core = t.slice(0, 48) || 'New chat';
  core = core.charAt(0).toUpperCase() + core.slice(1);
  if (core.length > 46) core = core.slice(0, 44).replace(/\s\S*$/, '') + '…';
  const suffix = test ? ' — Recall' : fromZero ? ' — From zero' : review ? ' — Review' : '';
  return core + suffix;
}

/* ============================== sending ============================== */
async function send() {
  const text = els.input.value.trim();
  if (!text && !composer.images.length) return;
  if (composer.uploads.size) {
    toast('Wait for your files to finish processing, then send.', 'warning');
    return;
  }
  const practising = composer.images.length && composer.imageTask === 'quiz';
  const prompt = text || (practising ? 'I want to read this image myself first.' : 'Explain this image from absolute zero.');

  let chat = currentChat();
  if (!chat) {
    chat = {
      id: uid('chat'),
      title: autoTitle(prompt),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      favorite: false,
      archived: false,
      docIds: state.pendingScope,
    };
    state.pendingScope = null;
    state.chats.unshift(chat);
    await db.put('chats', chat);
    state.currentChatId = chat.id;
    history.replaceState(null, '', `#/chat/${chat.id}`);
    renderChatList();
    updateTopbar();
  }

  const images = composer.images.splice(0);
  const pinned = composer.pinned;
  composer.pinned = null;
  const imageKind = composer.imageKind;
  const imageTask = images.length ? composer.imageTask : null;
  composer.imageTask = 'explain';
  const userMsg = {
    id: uid('msg'),
    chatId: chat.id,
    role: 'user',
    content: prompt,
    images: images.map((i) => i.preview),
    // Full-size copies stay on this device so an image-practice answer can be checked against the image.
    imageData: images.length ? images.map(({ mediaType, data }) => ({ mediaType, data })) : undefined,
    imageKind: images.length ? imageKind : undefined,
    imageTask: imageTask || undefined,
    context: pinned
      ? `${pinned.title}, p. ${pinned.page}`
      : images.length && (imageKind !== 'auto' || imageTask === 'quiz')
      ? [IMAGE_KIND_OPTIONS.find(([k]) => k === imageKind)?.[1], imageTask === 'quiz' ? 'reading practice' : ''].filter((x) => x && x !== 'Auto-detect').join(' · ')
      : '',
    createdAt: Date.now(),
  };
  await db.put('messages', userMsg);
  els.input.value = '';
  autosize();
  renderChips();
  els.empty.hidden = true;
  await appendMessage(userMsg);
  scrollToBottom(true);

  await runAssistant(chat, userMsg, images, pinned);
}

async function runAssistant(chat, userMsg, images, pinned) {
  const s = state.settings;
  const aiMsg = { id: uid('msg'), chatId: chat.id, role: 'assistant', content: '', sources: [], createdAt: Date.now() };
  const node = await appendMessage(aiMsg, { streaming: true });
  const body = node.querySelector('.prose');
  scrollToBottom(true);

  // ---- retrieval ----
  let sources = [];
  if (s.knowledgeMode !== 'general') {
    try {
      const readyIds = new Set(state.documents.filter((d) => d.status === 'ready').map((d) => d.id));
      const scope = (chat.docIds || null)?.filter((id) => readyIds.has(id)) ?? null;
      const previousUser = [...els.thread.querySelectorAll('.msg-user .bubble')].slice(-2, -1)[0]?.textContent || '';
      const followUp = userMsg.content.split(/\s+/).length < 8;
      const query = followUp ? `${userMsg.content} ${chat.title.replace(/ — .*/, '')} ${previousUser}` : userMsg.content;
      const hits = await search(query, { docIds: scope, k: s.retrievalK, pinned });
      const titles = new Map(state.documents.map((d) => [d.id, d.title]));
      sources = hits.map((h, i) => ({
        tag: `S${i + 1}`,
        docId: h.chunk.docId,
        docName: titles.get(h.chunk.docId) || 'Document',
        page: h.chunk.page,
        section: h.chunk.section || '',
        text: h.chunk.text,
      }));
    } catch (err) {
      console.warn('Retrieval failed', err);
    }
  }

  // ---- request ----
  const earlier = (await chatMessages(chat.id)).filter((m) => m.id !== userMsg.id && !m.error && m.content).slice(-10);
  // Image practice: if the learner is answering an image question, resend that image so it can be checked.
  const lastAi = earlier.filter((m) => m.role === 'assistant').at(-1);
  const imageEval = !images.length && lastAi?.mode === 'image_quiz';
  const imageSource = imageEval ? earlier.filter((m) => m.role === 'user' && m.imageData?.length).at(-1) : null;
  const history = earlier.map((m) => ({
    role: m.role,
    content: m.role === 'assistant' ? m.content.slice(0, 6000) : m.content,
    ...(imageSource && m.id === imageSource.id ? { images: m.imageData } : {}),
  }));
  // ---- prerequisite engine (spec §29) ----
  let prereq = null;
  try {
    const found = await planFor(userMsg.content);
    if (found) {
      prereq = { concept: found.concept.name, items: found.plan.map(({ name, decision }) => ({ name, decision })) };
      aiMsg.prereq = { concept: found.concept.name, items: found.plan.filter((p) => p.decision !== 'skip').map(({ name, decision }) => ({ name, decision })) };
      renderPrereq(node, aiMsg);
    }
  } catch (err) {
    console.warn('Prerequisite engine failed', err);
  }

  const payload = {
    prerequisites: prereq,
    messages: [...history, { role: 'user', content: userMsg.content, images: images.map(({ mediaType, data }) => ({ mediaType, data })) }],
    sources: sources.map(({ tag, docName, page, section, text }) => ({ tag, docName, page, section, text })),
    controls: {
      mode: s.mode,
      depth: s.depth,
      knowledgeMode: s.knowledgeMode,
      exam: s.exam || 'step1',
      temperature: s.temperature,
      policy: { ...s.policy, ghana_context: s.ghanaContext },
      imageKind: userMsg.imageKind || imageSource?.imageKind || 'auto',
      imageTask: userMsg.imageTask || 'explain',
      imageEval,
    },
  };
  lastRequest = { chat, userMsg, images, pinned };

  const ac = new AbortController();
  state.streaming = ac;
  setSending(true);
  let text = '';
  let renderTimer = null;
  const paint = async (final) => {
    const stick = nearBottom();
    await renderMessage(body, text, { final, sources });
    if (stick) scrollToBottom();
  };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(s.accessCode ? { 'x-access-code': s.accessCode } : {}) },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) {
      let msg = `The request failed (${res.status}).`;
      try {
        const j = await res.json();
        msg = j.error || msg;
        if (j.code === 'ACCESS_CODE') msg += ' Open Settings to add it.';
        if (j.code === 'LOGIN') document.dispatchEvent(new CustomEvent('account:signedout'));
      } catch { /* not JSON */ }
      throw new Error(msg);
    }
    aiMsg.mode = res.headers.get('x-teaching-mode') || '';
    aiMsg.depth = res.headers.get('x-teaching-depth') || '';
    if (res.headers.get('x-source-locked')) sources = [];
    setModeTag(node, aiMsg.mode);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (!renderTimer)
        renderTimer = setTimeout(async () => {
          renderTimer = null;
          await paint(false);
        }, 70);
    }
    text += decoder.decode();
  } catch (err) {
    if (err.name === 'AbortError') {
      text += text ? '\n\n*Stopped.*' : '*Stopped before a response arrived.*';
    } else {
      aiMsg.error = err.message || 'Something went wrong.';
    }
  } finally {
    clearTimeout(renderTimer);
    state.streaming = null;
    setSending(false);
  }

  aiMsg.content = text;
  if (aiMsg.error && !text) {
    body.innerHTML = `<div class="msg-error"><strong>Couldn't get a response.</strong> ${escapeHtml(aiMsg.error)}
      <div class="mt-2"><button class="btn btn-sm btn-outline-primary" data-action="retry" type="button">Try again</button></div></div>`;
    await db.put('messages', aiMsg);
    return;
  }

  const { citedTags } = await renderMessage(body, text, { final: true, sources });
  const check = checkCitations(citedTags, sources);
  const used = sources.filter((s2) => check.valid.includes(s2.tag));
  aiMsg.sources = (used.length ? used : sources).map(({ tag, docId, docName, page, section, text: t }) => ({ tag, docId, docName, page, section, snippet: t.slice(0, 280) }));
  aiMsg.sourcesCited = used.length > 0;
  aiMsg.invalidCitations = check.invalid;
  renderSources(node, aiMsg);
  const block = extractConceptBlock(text);
  if (block) {
    const concept = mergeLessonBlock(block);
    if (concept) {
      aiMsg.concept = concept.name;
      aiMsg.system = concept.system;
    }
  }
  renderLessonCheck(node, aiMsg);
  enableHighlighting(node.querySelector('.prose'), `msg:${aiMsg.id}`);
  await db.put('messages', aiMsg);
  await updateChat(chat, {});
  if (nearBottom()) scrollToBottom();
}

function stop() {
  state.streaming?.abort();
}

function setSending(on) {
  els.send.classList.toggle('stop', on);
  els.send.innerHTML = on ? '<i class="bi bi-stop-fill"></i>' : '<i class="bi bi-arrow-up"></i>';
  els.send.setAttribute('aria-label', on ? 'Stop generating' : 'Send');
}

/* ============================== message DOM ============================== */
async function appendMessage(m, { streaming = false } = {}) {
  const el = document.createElement('div');
  el.className = `msg msg-${m.role === 'user' ? 'user' : 'ai'}`;
  el.dataset.id = m.id;
  if (m.role === 'user') {
    el.innerHTML = `${m.images?.length ? `<div class="msg-images">${m.images.map((src) => `<img src="${src}" alt="Attached image">`).join('')}</div>` : ''}
      <div class="bubble"></div>${m.context ? `<div class="msg-context"><i class="bi bi-pin-angle me-1"></i>${escapeHtml(m.context)}</div>` : ''}`;
    el.querySelector('.bubble').textContent = m.content;
  } else {
    el.innerHTML = `<div class="msg-head"><span class="brand-mark">${BRAND_SVG}</span>SmartMedicineLM<span class="mode-tag d-none"></span></div>
      <div class="msg-prereq"></div>
      <div class="prose">${streaming ? '<div class="thinking" aria-label="Thinking"><span></span><span></span><span></span></div>' : ''}</div>
      <div class="msg-sources"></div>
      <div class="msg-check"></div>
      <div class="msg-actions"><button class="btn-icon" data-action="copy" type="button" aria-label="Copy response" title="Copy"><i class="bi bi-copy"></i></button></div>`;
    setModeTag(el, m.mode);
    if (!streaming) {
      const body = el.querySelector('.prose');
      if (m.error && !m.content) body.innerHTML = `<div class="msg-error"><strong>Couldn't get a response.</strong> ${escapeHtml(m.error)}</div>`;
      else await renderMessage(body, m.content, { final: true, sources: m.sources || [] });
      renderSources(el, m);
      renderPrereq(el, m);
      renderLessonCheck(el, m);
      if (m.role === 'assistant' && !m.error) enableHighlighting(body, `msg:${m.id}`);
    }
  }
  els.thread.appendChild(el);
  return el;
}

const DECISION_LABEL = { teach: 'teaching first', review: 'quick review' };

function renderPrereq(el, m) {
  const box = el.querySelector('.msg-prereq');
  if (!box || !m.prereq?.items?.length) return;
  box.innerHTML = `<i class="bi bi-diagram-3 me-1"></i>Prerequisites for ${escapeHtml(m.prereq.concept)}: ${m.prereq.items
    .map((i) => `<span class="prereq-chip prereq-${i.decision}">${escapeHtml(i.name)} · ${DECISION_LABEL[i.decision] || i.decision}</span>`)
    .join(' ')}`;
}

/** "How well did this make sense?" after a lesson feeds the learner model's understanding score. */
function renderLessonCheck(el, m) {
  const box = el.querySelector('.msg-check');
  if (!box || !m.concept || !['learn', 'continue', 'standard'].includes(m.mode)) return;
  const opts = [
    ['lost', 'Lost me', 'bi-emoji-frown'],
    ['partly', 'Partly', 'bi-emoji-neutral'],
    ['got', 'Got it', 'bi-emoji-smile'],
  ];
  box.innerHTML = `<div class="lesson-check"><span>How well did <b>${escapeHtml(m.concept)}</b> make sense?</span>
    <div class="btn-group btn-group-sm" role="group">${opts
      .map(([k, label, icon]) => `<button type="button" class="btn ${m.rating === k ? 'btn-primary' : 'btn-outline-secondary'}" data-action="rate" data-rating="${k}"><i class="bi ${icon} me-1"></i>${label}</button>`)
      .join('')}</div>
    ${m.rating ? `<a class="small ms-1" href="#/questions?concept=${encodeURIComponent(m.concept)}">Test yourself on it →</a>` : ''}</div>`;
}

function setModeTag(el, mode) {
  const tag = el.querySelector('.mode-tag');
  if (!tag || !mode) return;
  tag.textContent = TAG_LABEL[mode] || mode;
  tag.classList.remove('d-none');
}

function renderSources(el, m) {
  const box = el.querySelector('.msg-sources');
  if (!box) return;
  const list = m.sources || [];
  let html = '';
  if (list.length) {
    const cid = `src-${m.id}`;
    html += `<button class="sources-toggle" type="button" data-bs-toggle="collapse" data-bs-target="#${cid}" aria-expanded="false" aria-controls="${cid}">
        <i class="bi bi-journal-text"></i>${m.sourcesCited ? 'Sources' : 'Retrieved passages'} (${list.length})<i class="bi bi-chevron-down small"></i></button>
      <div class="collapse" id="${cid}"><ul class="sources-list">${list
        .map(
          (s) => `<li><button type="button" data-open-source="${s.docId}" data-page="${s.page || 1}" title="${escapeHtml(s.snippet || '')}">
            <span class="tag">${s.tag}</span><span><span class="d-block">${escapeHtml(s.docName)}</span><span class="where">${s.page ? `Page ${s.page}` : ''}${s.section ? ` · ${escapeHtml(s.section)}` : ''}</span></span></button></li>`
        )
        .join('')}</ul></div>`;
  }
  if (m.invalidCitations?.length)
    html += `<div class="validation-note"><i class="bi bi-exclamation-triangle me-1"></i>${m.invalidCitations.length} citation${m.invalidCitations.length > 1 ? 's' : ''} (${m.invalidCitations.join(', ')}) didn't match a retrieved passage and ${m.invalidCitations.length > 1 ? 'are' : 'is'} marked as unverified.</div>`;
  box.innerHTML = html;
}

async function onThreadClick(e) {
  const cite = e.target.closest('.cite');
  if (cite) {
    const msgEl = cite.closest('.msg');
    const msg = await db.get('messages', msgEl.dataset.id);
    const s = msg?.sources?.find((x) => x.tag === cite.dataset.tag);
    if (s) location.hash = `#/viewer/${s.docId}/${s.page || 1}`;
    else toast('That citation does not match any passage that was retrieved for this answer.', 'warning');
    return;
  }
  const src = e.target.closest('[data-open-source]');
  if (src) {
    location.hash = `#/viewer/${src.dataset.openSource}/${src.dataset.page}`;
    return;
  }
  const d = e.target.closest('[data-diagram]');
  if (d) return handleDiagramAction(d);
  const act = e.target.closest('[data-action]');
  if (!act) return;
  if (act.dataset.action === 'copy') {
    const msg = await db.get('messages', act.closest('.msg').dataset.id);
    try {
      await navigator.clipboard.writeText(msg?.content || '');
      toast('Copied.');
    } catch {
      toast('Copying isn’t allowed in this browser.', 'warning');
    }
  } else if (act.dataset.action === 'save-cards') {
    const deck = act.closest('.fc-deck');
    const msg = await db.get('messages', act.closest('.msg').dataset.id);
    const n = await addCards(deck._cards || [], {
      chatId: state.currentChatId,
      topic: currentChat()?.title?.replace(/ — .*/, '') || '',
      concept: msg?.concept || '',
      system: msg?.system || '',
      source: 'lesson',
    });
    act.disabled = true;
    act.innerHTML = `<i class="bi bi-check2 me-1"></i>Added ${n}`;
    toast(`${n} card${n === 1 ? '' : 's'} added to your deck.`, 'success');
  } else if (act.dataset.action === 'rate') {
    const node = act.closest('.msg');
    const msg = await db.get('messages', node.dataset.id);
    if (!msg?.concept) return;
    const first = !msg.rating;
    msg.rating = act.dataset.rating;
    await db.put('messages', msg);
    if (first) await recordEvidence(msg.concept, { kind: 'lesson', rating: msg.rating }, msg.system);
    renderLessonCheck(node, msg);
    toast(first ? 'Noted. Your progress map is updated.' : 'Rating changed.', 'success', 2500);
  } else if (act.dataset.action === 'continue') {
    if (state.streaming) return;
    act.disabled = true;
    els.input.value = 'Continue';
    autosize();
    send();
  } else if (act.dataset.action === 'retry' && lastRequest) {
    act.closest('.msg').remove();
    const { chat, userMsg, images, pinned } = lastRequest;
    await runAssistant(chat, userMsg, images, pinned);
  }
}

/* ============================== composer ============================== */
function autosize() {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, window.innerHeight * 0.4) + 'px';
}

function nearBottom() {
  const t = els.thread;
  return t.scrollHeight - t.scrollTop - t.clientHeight < 140;
}

function scrollToBottom(force = false) {
  const t = els.thread;
  if (force || nearBottom()) t.scrollTop = t.scrollHeight;
}

function syncControls() {
  const s = state.settings;
  $$('input[name="mode"]').forEach((r) => (r.checked = r.value === s.mode));
  $$('input[name="depth"]').forEach((r) => (r.checked = r.value === s.depth));
  $$('input[name="knowledge"]').forEach((r) => (r.checked = r.value === s.knowledgeMode));
  $('#modeLabel').textContent = MODE_LABEL[s.mode] || 'Auto';
  $('#knowledgeLabel').textContent = KNOW_LABEL[s.knowledgeMode] || 'Hybrid';
  $$('#policyMenu input[data-policy]').forEach((i) => (i.checked = Boolean(s.policy[i.dataset.policy])));
}

function buildPolicyMenu() {
  const menu = $('#policyMenu');
  menu.insertAdjacentHTML(
    'beforeend',
    POLICY_TOGGLES.map(
      (p) => `<label class="menu-option"><input class="form-check-input" type="checkbox" data-policy="${p.key}"><span><strong>${p.label}</strong><small>${p.hint}</small></span></label>`
    ).join('')
  );
  menu.addEventListener('change', (e) => {
    const k = e.target.dataset.policy;
    if (k) saveSettings({ policy: { ...state.settings.policy, [k]: e.target.checked } });
  });
}

export function renderChips() {
  const chips = [];
  for (const [id, u] of composer.uploads)
    chips.push(`<span class="chip" data-chip="upload" data-id="${id}"><span class="spinner-border" role="status"></span><span>${escapeHtml(u.name)} · ${Math.round(u.progress * 100)}%</span></span>`);
  composer.images.forEach((img, i) =>
    chips.push(`<span class="chip"><img src="${img.preview}" alt=""><span>${escapeHtml(img.name || 'Image')}</span><button type="button" data-remove-image="${i}" aria-label="Remove image"><i class="bi bi-x"></i></button></span>`)
  );
  if (composer.images.length)
    chips.push(`<div class="image-opts">
      <label class="visually-hidden" for="imgKind">Image type</label>
      <select class="form-select form-select-sm" id="imgKind">${IMAGE_KIND_OPTIONS.map(([k, l]) => `<option value="${k}" ${composer.imageKind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="btn-group btn-group-sm" role="group" aria-label="What to do with the image">
        <button type="button" class="btn ${composer.imageTask === 'explain' ? 'btn-primary' : 'btn-outline-secondary'}" data-img-task="explain">Explain it</button>
        <button type="button" class="btn ${composer.imageTask === 'quiz' ? 'btn-primary' : 'btn-outline-secondary'}" data-img-task="quiz">Let me read it first</button>
      </div></div>`);
  if (composer.pinned)
    chips.push(`<span class="chip"><i class="bi bi-pin-angle"></i><span>${escapeHtml(composer.pinned.title)}, p. ${composer.pinned.page}</span><button type="button" data-remove-pin aria-label="Remove pinned page"><i class="bi bi-x"></i></button></span>`);
  const scope = currentChat()?.docIds ?? state.pendingScope;
  if (scope?.length)
    chips.push(`<span class="chip"><i class="bi bi-collection"></i><span>${scope.length} document${scope.length > 1 ? 's' : ''} selected</span><button type="button" data-remove-scope aria-label="Use whole library"><i class="bi bi-x"></i></button></span>`);
  els.chips.innerHTML = chips.join('');
  els.chips.querySelector('#imgKind')?.addEventListener('change', (e) => (composer.imageKind = e.target.value));
  els.chips.querySelectorAll('[data-img-task]').forEach((b) =>
    b.addEventListener('click', () => {
      composer.imageTask = b.dataset.imgTask;
      renderChips();
    })
  );
  els.chips.querySelectorAll('[data-remove-image]').forEach((b) =>
    b.addEventListener('click', () => {
      composer.images.splice(Number(b.dataset.removeImage), 1);
      renderChips();
    })
  );
  els.chips.querySelector('[data-remove-pin]')?.addEventListener('click', () => {
    composer.pinned = null;
    renderChips();
  });
  els.chips.querySelector('[data-remove-scope]')?.addEventListener('click', async () => {
    const chat = currentChat();
    if (chat) await updateChat(chat, { docIds: null }, false);
    else state.pendingScope = null;
    renderChips();
  });
}

async function handleFiles(fileList, input) {
  const files = Array.from(fileList || []);
  if (input) input.value = '';
  if (!files.length) return;
  const images = files.filter((f) => classifyFile(f) === 'image');
  const docs = files.filter((f) => classifyFile(f) && classifyFile(f) !== 'image');
  const unknown = files.filter((f) => !classifyFile(f));
  unknown.forEach((f) => toast(`${f.name}: this file type isn't supported.`, 'danger'));

  for (const f of images.slice(0, 4 - composer.images.length)) {
    if (f.size > 15 * 1024 * 1024) {
      toast(`${f.name} is larger than 15 MB.`, 'danger');
      continue;
    }
    try {
      const img = await imageForModel(f);
      composer.images.push({ ...img, name: f.name });
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
  if (images.length > 4) toast('Up to 4 images can be attached to one message.', 'warning');
  renderChips();

  if (docs.length) {
    const added = await uploadFiles(docs, {
      onProgress: (doc, p, tempId) => {
        if (p >= 1) composer.uploads.delete(tempId);
        else composer.uploads.set(tempId, { name: doc.title, progress: p });
        renderChips();
      },
    });
    const ok = added.filter((d) => d.status === 'ready');
    if (ok.length) {
      const chat = currentChat();
      const current = chat ? chat.docIds : state.pendingScope;
      if (current) {
        const next = [...new Set([...current, ...ok.map((d) => d.id)])];
        if (chat) await updateChat(chat, { docIds: next }, false);
        else state.pendingScope = next;
      }
      toast(`${ok.length === 1 ? ok[0].title : ok.length + ' documents'} ready. Ask me anything about ${ok.length === 1 ? 'it' : 'them'}.`, 'success');
    }
    renderChips();
  }
  els.input.focus();
}

async function onPaste(e) {
  const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  await handleFiles(files);
}

function setupDragDrop() {
  const view = $('#view-chat');
  let depth = 0;
  view.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    depth++;
    els.drop.classList.add('show');
  });
  view.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  view.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) els.drop.classList.remove('show');
  });
  view.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    els.drop.classList.remove('show');
    handleFiles(e.dataTransfer.files);
  });
}

function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  els.mic.classList.remove('d-none');
  let rec = null;
  els.mic.addEventListener('click', () => {
    if (rec) {
      rec.stop();
      return;
    }
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    const base = els.input.value ? els.input.value.trimEnd() + ' ' : '';
    rec.onresult = (ev) => {
      els.input.value = base + Array.from(ev.results).map((r) => r[0].transcript).join('');
      autosize();
    };
    rec.onend = () => {
      rec = null;
      els.mic.classList.remove('listening');
    };
    rec.onerror = () => toast('Voice input stopped. Check microphone permission.', 'warning');
    els.mic.classList.add('listening');
    rec.start();
  });
}

/* ============================== scope modal ============================== */
function openScopeModal() {
  const chat = currentChat();
  const scope = chat ? chat.docIds : state.pendingScope;
  const docs = state.documents.filter((d) => d.status === 'ready' && d.chunkCount > 0);
  $('#scopeAll').checked = !scope;
  $('#scopeList').innerHTML = docs.length
    ? docs
        .map(
          (d) => `<div class="form-check"><input class="form-check-input" type="checkbox" value="${d.id}" id="sc-${d.id}" ${scope?.includes(d.id) ? 'checked' : ''} ${!scope ? 'disabled' : ''}>
        <label class="form-check-label" for="sc-${d.id}">${escapeHtml(d.title)} <small class="text-body-secondary">· ${d.pageCount} p.</small></label></div>`
        )
        .join('')
    : '<p class="text-body-secondary mb-0">No searchable documents yet. Upload PDFs or notes in the Library.</p>';
  bootstrap.Modal.getOrCreateInstance($('#scopeModal')).show();
}

async function saveScope() {
  const all = $('#scopeAll').checked;
  const ids = all ? null : $$('#scopeList input:checked').map((i) => i.value);
  const value = ids && ids.length ? ids : null;
  const chat = currentChat();
  if (chat) await updateChat(chat, { docIds: value }, false);
  else state.pendingScope = value;
  bootstrap.Modal.getInstance($('#scopeModal'))?.hide();
  renderChips();
}
