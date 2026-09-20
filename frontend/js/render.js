/*
 * Renders the teaching engine's output. The model writes Markdown with a few
 * conventions (```chain, ```mermaid, ```flashcards, > [!MEMORY] callouts, [S#] citations);
 * this module turns them into the lesson components.
 */
import { escapeHtml } from './ui.js';
import { validateMermaid } from './validators.js';

let mermaidReady = false;
let diagramSeq = 0;

export function initMermaid() {
  if (!window.mermaid) return;
  const dark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'default',
    fontFamily: 'Instrument Sans, system-ui, sans-serif',
    flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: true },
  });
  mermaidReady = true;
}

if (globalThis.window?.marked) {
  window.marked.setOptions({ gfm: true, breaks: false });
}

const CALLOUTS = {
  MEMORY: { cls: 'memory', icon: 'bi-bookmark-star', title: 'Commit to memory' },
  HIGHYIELD: { cls: 'highyield', icon: 'bi-lightning-charge', title: 'Step 1 high yield' },
  ANCHOR: { cls: 'anchor', icon: 'bi-geo-alt', title: 'Spatial anchor' },
  CLINICAL: { cls: 'clinical', icon: 'bi-heart-pulse', title: 'Clinical pearl' },
  NOTE: { cls: 'note', icon: 'bi-info-circle', title: 'Note' },
  WARNING: { cls: 'clinical', icon: 'bi-exclamation-triangle', title: 'Caution' },
};

/**
 * Renders `text` into `el`. While streaming (final=false) heavy components show placeholders.
 * Returns { citedTags } for the citation validator.
 */
const TRUNC_RE = /\n*(\[\[SM:TRUNCATED\]\]|> \[!NOTE\]\n> This answer reached the length limit\.[^\n]*)\s*$/;
const SPECIAL_BLOCKS = ['mermaid', 'chain', 'flashcards', 'concepts'];

/**
 * Handles answers cut off by the model's output limit: removes the marker, and
 * if the cut happened inside a code block, closes it (or drops a half-written
 * diagram/chain/deck, which cannot render) so the rest of the answer displays.
 */
export function prepareText(raw = '') {
  let text = String(raw);
  const truncated = TRUNC_RE.test(text) || text.includes('[[SM:TRUNCATED]]');
  text = text.replace(TRUNC_RE, '').replace(/\[\[SM:TRUNCATED\]\]/g, '');
  let cutBlock = null;
  if (truncated) {
    const fences = [...text.matchAll(/^ {0,3}```([\w-]*)/gm)];
    if (fences.length % 2 === 1) {
      const open = fences[fences.length - 1];
      const lang = open[1].toLowerCase();
      if (SPECIAL_BLOCKS.includes(lang)) {
        text = text.slice(0, open.index).trimEnd();
        cutBlock = lang;
      } else text += '\n```';
    }
  }
  return { text, truncated, cutBlock };
}

export async function renderMessage(el, raw, { final = false, sources = [] } = {}) {
  const { text, truncated, cutBlock } = prepareText(raw);
  const html = window.marked ? window.marked.parse(text || '') : escapeHtml(text).replace(/\n/g, '<br>');
  el.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) : html;

  enhanceCallouts(el);
  enhanceTables(el);
  for (const code of el.querySelectorAll('pre > code')) {
    const lang = (code.className.match(/language-([\w-]+)/) || [])[1];
    const pre = code.parentElement;
    if (lang === 'concepts') pre.remove(); // machine-readable knowledge-graph block, not for display
    else if (lang === 'chain') pre.replaceWith(buildChain(code.textContent));
    else if (lang === 'flashcards') pre.replaceWith(final ? buildDeck(code.textContent) : pending('Building flashcards…'));
    else if (lang === 'mermaid') {
      if (!final) pre.replaceWith(pending('Drawing diagram…'));
      else {
        const host = document.createElement('div');
        pre.replaceWith(host);
        await renderDiagram(host, code.textContent);
      }
    }
  }
  const citedTags = enhanceCitations(el, sources);
  if (final && truncated && cutBlock !== 'concepts') {
    const what = { mermaid: 'a diagram', chain: 'a causal chain', flashcards: 'the flashcards' }[cutBlock];
    const box = document.createElement('div');
    box.className = 'callout callout-note truncated-note';
    box.innerHTML = `<div class="callout-title"><i class="bi bi-scissors"></i>Answer cut off</div>
      <p>This lesson reached the length limit${what ? ` while writing ${what}` : ''}. Continue to get the rest.</p>
      <button class="btn btn-sm btn-primary" data-action="continue" type="button"><i class="bi bi-arrow-down-circle me-1"></i>Continue</button>`;
    el.appendChild(box);
  }
  return { citedTags, truncated };
}

function pending(label) {
  const d = document.createElement('div');
  d.className = 'diagram diagram-pending';
  d.textContent = label;
  return d;
}

function enhanceCallouts(root) {
  for (const bq of root.querySelectorAll('blockquote')) {
    const p = bq.querySelector('p');
    if (!p) continue;
    const m = p.innerHTML.match(/^\s*\[!([A-Z]+)\]\s*(<br\s*\/?>)?/i);
    if (!m) continue;
    const kind = CALLOUTS[m[1].toUpperCase()] || CALLOUTS.NOTE;
    p.innerHTML = p.innerHTML.slice(m[0].length).replace(/^\s+/, '');
    if (!p.textContent.trim() && !p.querySelector('img')) p.remove();
    const box = document.createElement('div');
    box.className = `callout callout-${kind.cls}`;
    box.innerHTML = `<div class="callout-title"><i class="bi ${kind.icon}"></i>${kind.title}</div>`;
    while (bq.firstChild) box.appendChild(bq.firstChild);
    bq.replaceWith(box);
  }
}

function enhanceTables(root) {
  for (const t of root.querySelectorAll('table')) {
    if (t.parentElement.classList.contains('table-wrap')) continue;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    t.replaceWith(wrap);
    wrap.appendChild(t);
  }
}

/* ---- causal chain ---- */
export function parseChain(src) {
  return src
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*•]\s+/, '').replace(/^(→|->|⇒)\s*/, ''))
    .filter((l) => !/^[↓⬇︎|]+$/.test(l)) // lone arrows between steps
    .map((l) => {
      const [node, ...why] = l.split(/\s+::\s+|\s+—\s+why:\s+/i);
      return { node: node.trim(), why: why.join(' ').trim() };
    });
}

/**
 * Interactive causal chain (spec §73 interactive diagrams): tap a step to ask why it
 * follows from the one before; "Test me" hides the steps so the learner rebuilds the
 * chain from memory, revealing one step at a time.
 */
function buildChain(src) {
  const steps = parseChain(src);
  const outer = document.createElement('div');
  outer.className = 'chain-wrap';
  const tools = document.createElement('div');
  tools.className = 'chain-tools';
  tools.innerHTML = `<button type="button" class="chain-quiz-btn"><i class="bi bi-eye-slash me-1"></i>Test me</button><span class="chain-tip">Tap a step to ask why</span>`;
  const wrap = document.createElement('div');
  wrap.className = 'chain';
  wrap.setAttribute('role', 'list');
  wrap.setAttribute('aria-label', 'Causal chain');
  steps.forEach((step, i) => {
    const row = document.createElement('div');
    row.className = 'chain-step';
    row.setAttribute('role', 'listitem');
    const node = escapeHtml(step.node)
      .replace(/^(↑+)/, '<span class="dir-up" aria-label="increased">$1</span>')
      .replace(/^(↓+)/, '<span class="dir-down" aria-label="decreased">$1</span>');
    row.innerHTML = `<div class="chain-node" tabindex="0" role="button">${node}</div>${step.why ? `<div class="chain-why">${escapeHtml(step.why)}</div>` : ''}`;
    const activate = () => {
      if (wrap.classList.contains('quiz') && i > 0 && !row.classList.contains('revealed')) {
        row.classList.add('revealed');
        if ([...wrap.children].every((r, j) => j === 0 || r.classList.contains('revealed'))) tools.querySelector('.chain-tip').textContent = 'Chain complete. How did you do?';
        return;
      }
      outer.dispatchEvent(new CustomEvent('chain:step', { bubbles: true, detail: { step: step.node, prev: i > 0 ? steps[i - 1].node : null } }));
    };
    const nodeEl = row.querySelector('.chain-node');
    nodeEl.addEventListener('click', activate);
    nodeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
    wrap.appendChild(row);
  });
  tools.querySelector('.chain-quiz-btn').addEventListener('click', (e) => {
    const on = !wrap.classList.contains('quiz');
    wrap.classList.toggle('quiz', on);
    wrap.querySelectorAll('.chain-step').forEach((r) => r.classList.remove('revealed'));
    e.currentTarget.innerHTML = on ? '<i class="bi bi-eye me-1"></i>Show all' : '<i class="bi bi-eye-slash me-1"></i>Test me';
    tools.querySelector('.chain-tip').textContent = on ? 'Say the next step out loud, then tap to check' : 'Tap a step to ask why';
  });
  if (steps.length >= 3) outer.appendChild(tools);
  outer.appendChild(wrap);
  return outer;
}

/* ---- flashcards ---- */
export function parseFlashcards(src) {
  const cards = [];
  let cur = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    const qm = line.match(/^(Q|Question|Front)\s*[:.)]\s*(.*)$/i);
    const am = line.match(/^(A|Answer|Back)\s*[:.)]\s*(.*)$/i);
    const tm = line.match(/^(Type)\s*:\s*(.*)$/i);
    if (qm) {
      if (cur?.q && cur?.a) cards.push(cur);
      cur = { q: qm[2], a: '', type: '' };
    } else if (am && cur) cur.a = am[2];
    else if (tm && cur) cur.type = tm[2];
    else if (line && cur) {
      if (cur.a) cur.a += ' ' + line;
      else cur.q += ' ' + line;
    }
  }
  if (cur?.q && cur?.a) cards.push(cur);
  return cards;
}

function buildDeck(src) {
  const cards = parseFlashcards(src);
  const deck = document.createElement('div');
  deck.className = 'fc-deck';
  if (!cards.length) {
    deck.innerHTML = `<pre>${escapeHtml(src)}</pre>`;
    return deck;
  }
  deck._cards = cards;
  deck.innerHTML = `<div class="fc-deck-head"><strong><i class="bi bi-stack me-1"></i>${cards.length} flashcards · tap a card to flip</strong>
    <button class="btn btn-sm btn-outline-primary" data-action="save-cards" type="button"><i class="bi bi-plus-lg me-1"></i>Add to my deck</button></div>
    <div class="fc-grid"></div>`;
  const grid = deck.querySelector('.fc-grid');
  cards.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fc';
    b.setAttribute('aria-label', `Flashcard ${i + 1}. Tap to flip.`);
    b.innerHTML = `<div class="fc-inner"><div class="fc-face fc-front"><small>Card ${i + 1}${c.type ? ' · ' + escapeHtml(c.type) : ''}</small>${escapeHtml(c.q)}</div><div class="fc-face fc-back"><small>Answer</small>${escapeHtml(c.a)}</div></div>`;
    b.addEventListener('click', () => b.classList.toggle('flipped'));
    grid.appendChild(b);
  });
  return deck;
}

/* ---- Mermaid diagrams ---- */
async function renderDiagram(host, code) {
  host.className = 'diagram';
  host.innerHTML = `<div class="diagram-bar"><span><i class="bi bi-diagram-2 me-1"></i>Diagram</span>
    <span><button class="btn-icon" type="button" data-diagram="expand" aria-label="Expand diagram"><i class="bi bi-arrows-fullscreen"></i></button>
    <button class="btn-icon" type="button" data-diagram="code" aria-label="Show diagram source"><i class="bi bi-code-slash"></i></button>
    <button class="btn-icon" type="button" data-diagram="collapse" aria-label="Collapse diagram"><i class="bi bi-chevron-up"></i></button></span></div>
    <div class="diagram-body"><div class="diagram-pending">Drawing diagram…</div></div>`;
  const body = host.querySelector('.diagram-body');
  host._source = code;
  if (!mermaidReady) initMermaid();
  const v = await validateMermaid(code);
  if (!v.ok) {
    body.innerHTML = `<div class="diagram-pending">This diagram couldn't be drawn automatically. Its source is below.</div><pre class="text-start">${escapeHtml(code)}</pre>`;
    return;
  }
  const id = `smd${Date.now().toString(36)}${diagramSeq++}`;
  try {
    const { svg } = await window.mermaid.render(id, v.source);
    body.innerHTML = svg;
    fitDiagram(body);
    makeNodesInteractive(host, body);
    host._source = v.source;
    if (v.repaired) host.querySelector('.diagram-bar span').insertAdjacentHTML('beforeend', ' <small class="ms-1">(auto-repaired)</small>');
  } catch {
    body.innerHTML = `<div class="diagram-pending">This diagram couldn't be drawn automatically. Its source is below.</div><pre class="text-start">${escapeHtml(code)}</pre>`;
  } finally {
    // Remove only Mermaid's temporary render nodes. The finished SVG carries the
    // same id, so never delete an element that now lives inside the diagram.
    for (const tmpId of [id, 'd' + id]) {
      const tmp = document.getElementById(tmpId);
      if (tmp && !body.contains(tmp)) tmp.remove();
    }
  }
}

/** Tap or press Enter on a box to ask about it (the page decides what "ask" means). */
function makeNodesInteractive(host, body) {
  const nodes = body.querySelectorAll('g.node');
  if (!nodes.length) return;
  nodes.forEach((n) => {
    const label = n.textContent.replace(/\s+/g, ' ').trim();
    n.classList.add('node-ask');
    n.setAttribute('tabindex', '0');
    n.setAttribute('role', 'button');
    n.setAttribute('aria-label', `Ask about ${label}`);
    const fire = () => host.dispatchEvent(new CustomEvent('diagram:node', { bubbles: true, detail: { label } }));
    n.addEventListener('click', fire);
    n.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fire();
      }
    });
  });
  host.querySelector('.diagram-bar > span')?.insertAdjacentHTML('beforeend', ' <small class="ms-1 diagram-tip">· tap a box to ask about it</small>');
}

/**
 * Mermaid scales wide diagrams down to the container, which makes labels
 * unreadable on phones. Keep text at >= ~70% size and let the box scroll sideways.
 */
function fitDiagram(body) {
  const svg = body.querySelector('svg');
  const vb = svg?.viewBox?.baseVal;
  if (!vb || !vb.width) return;
  const readable = vb.width * 0.7;
  const avail = body.clientWidth || 320;
  if (readable > avail) {
    svg.style.maxWidth = 'none';
    svg.style.width = `${Math.round(readable)}px`;
    svg.style.height = 'auto';
    body.classList.add('diagram-scroll');
    requestAnimationFrame(() => (body.scrollLeft = (body.scrollWidth - body.clientWidth) / 2));
    body.insertAdjacentHTML('afterend', '<div class="diagram-hint"><i class="bi bi-arrows"></i> Swipe to explore, or tap <i class="bi bi-arrows-fullscreen"></i> for full screen</div>');
  }
}

/** Diagram toolbar actions (event delegation from the thread). */
export function handleDiagramAction(btn) {
  const host = btn.closest('.diagram');
  const action = btn.dataset.diagram;
  if (action === 'collapse') {
    host.classList.toggle('collapsed');
    btn.querySelector('i').className = host.classList.contains('collapsed') ? 'bi bi-chevron-down' : 'bi bi-chevron-up';
  } else if (action === 'code') {
    const body = host.querySelector('.diagram-body');
    const existing = body.querySelector('pre.diagram-src');
    if (existing) existing.remove();
    else body.insertAdjacentHTML('beforeend', `<pre class="diagram-src text-start mt-2">${escapeHtml(host._source || '')}</pre>`);
  } else if (action === 'expand') {
    const svg = host.querySelector('.diagram-body svg');
    if (!svg) return;
    const full = document.getElementById('diagramFull');
    full.innerHTML = '';
    const clone = svg.cloneNode(true);
    clone.removeAttribute('style');
    clone.style.maxWidth = 'none';
    clone.style.minWidth = 'min(1100px, 100%)';
    full.appendChild(clone);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('diagramModal')).show();
  }
}

/* ---- citations ---- */
const CITE_RE = /\[(S\d{1,2}(?:\s*[,;]\s*S\d{1,2})*)\]/g;
const CITE_TEST = /\[S\d{1,2}(?:\s*[,;]\s*S\d{1,2})*\]/;

function enhanceCitations(root, sources) {
  const known = new Map(sources.map((s) => [s.tag, s]));
  const cited = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement.closest('pre, code')
        ? NodeFilter.FILTER_REJECT
        : CITE_TEST.test(n.nodeValue)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    CITE_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    const text = node.nodeValue;
    while ((m = CITE_RE.exec(text))) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      for (const tag of m[1].split(/\s*[,;]\s*/)) {
        cited.push(tag);
        const s = known.get(tag);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = s ? 'cite' : 'cite cite-invalid';
        b.textContent = tag.slice(1);
        b.dataset.tag = tag;
        b.title = s ? `${s.docName}${s.page ? ', p. ' + s.page : ''}` : 'This citation does not match any retrieved source';
        b.setAttribute('aria-label', s ? `Source ${tag}: ${b.title}` : `Unverified citation ${tag}`);
        frag.appendChild(b);
      }
      last = m.index + m[0].length;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  }
  CITE_RE.lastIndex = 0;
  return cited;
}

/** Reads the hidden ```concepts JSON block a lesson ends with (null if absent or invalid). */
export function extractConceptBlock(text = '') {
  const m = String(text).match(/```concepts\s*\n([\s\S]*?)```/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1].trim());
    return obj && typeof obj.concept === 'string' ? obj : null;
  } catch {
    return null;
  }
}
