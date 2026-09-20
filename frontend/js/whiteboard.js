/*
 * Whiteboard (spec §73). Vector strokes in a fixed logical coordinate space, so boards
 * look the same on a phone and a laptop, undo is exact, and they sync compactly.
 * The drawing can be sent to the model to explain or to grade a mechanism drawn from memory.
 */
import { db } from './store.js';
import { $, $$, escapeHtml, uid, toast, confirmDialog, promptDialog, formatDate } from './ui.js';
import { composeAndSend } from './chat.js';
import { graph, loadKnowledge } from './knowledge-store.js';

const COLORS = ['#1f1b2d', '#4a3f8f', '#c2456f', '#2f6f9f', '#2e7d52', '#b7790d'];
const SIZES = { S: 3, M: 6, L: 12 };
const TOOLS = [
  ['pen', 'bi-pencil', 'Pen'],
  ['highlighter', 'bi-highlighter', 'Highlighter'],
  ['arrow', 'bi-arrow-up-right', 'Arrow'],
  ['line', 'bi-slash-lg', 'Line'],
  ['rect', 'bi-square', 'Box'],
  ['text', 'bi-fonts', 'Text'],
  ['eraser', 'bi-eraser', 'Eraser'],
];

let board = null;
let tool = { name: 'pen', color: COLORS[0], size: 'M' };
let undoStack = [];
let redoStack = [];
let drawing = null;
let bgImage = null;
let saveTimer = null;
let resizeObs = null;

export async function renderWhiteboard(id) {
  resizeObs?.disconnect();
  if (id) {
    const b = await db.get('boards', id);
    if (b) return openBoard(b);
  }
  return renderList();
}

/* ============================== board list ============================== */
async function renderList() {
  board = null;
  const boards = (await db.all('boards')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  $('#whiteboardPage').innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">Whiteboard</h2>
      <p class="page-sub">Sketch mechanisms, annotate an ECG or X-ray, and ask SmartMedicineLM to explain or check your drawing. Drawing a mechanism from memory is one of the strongest ways to learn it.</p>
    </div>
    <div class="d-flex flex-wrap gap-2">
      <button class="btn btn-outline-primary" data-wb="challenge"><i class="bi bi-trophy me-1"></i>Draw from memory</button>
      <button class="btn btn-primary" data-wb="new"><i class="bi bi-plus-lg me-1"></i>New board</button>
    </div></div>
    ${
      boards.length
        ? `<div class="wb-grid">${boards
            .map(
              (b) => `<div class="wb-card"><a href="#/whiteboard/${b.id}" class="wb-thumb">${b.thumb ? `<img src="${b.thumb}" alt="">` : '<i class="bi bi-easel"></i>'}</a>
              <div class="wb-meta"><a href="#/whiteboard/${b.id}" class="text-truncate">${escapeHtml(b.title)}</a>
              <button class="btn-icon" data-wb="delete" data-id="${b.id}" aria-label="Delete board"><i class="bi bi-trash"></i></button></div>
              <small class="text-body-secondary">${formatDate(b.updatedAt)}${b.challenge ? ' · challenge' : ''}</small></div>`
            )
            .join('')}</div>`
        : `<div class="empty-block"><i class="bi bi-easel"></i><p class="mb-1 fw-semibold">No boards yet</p><p class="mb-0">Start a blank board, or take the challenge: draw a mechanism from memory and get it checked.</p></div>`
    }`;
  $$('[data-wb]', $('#whiteboardPage')).forEach((b) =>
    b.addEventListener('click', async () => {
      const a = b.dataset.wb;
      if (a === 'new') return newBoard({ title: `Board ${new Date().toLocaleDateString()}` });
      if (a === 'challenge') return startChallenge();
      if (a === 'delete') {
        if (!(await confirmDialog('Delete board?', 'This drawing will be removed.'))) return;
        await db.del('boards', b.dataset.id);
        renderList();
      }
    })
  );
}

async function newBoard({ title, challenge = null }) {
  const wide = ($('#main')?.clientWidth || innerWidth) >= 700;
  const b = { id: uid('board'), title, challenge, w: wide ? 1600 : 1000, h: wide ? 1000 : 1400, strokes: [], bg: null, createdAt: Date.now(), updatedAt: Date.now() };
  await db.put('boards', b);
  location.hash = `#/whiteboard/${b.id}`;
}

async function startChallenge() {
  await loadKnowledge();
  const suggestions = graph
    .all()
    .filter((c) => c.system !== 'Foundations')
    .sort(() => Math.random() - 0.5)
    .slice(0, 1)
    .map((c) => c.name);
  const topic = await promptDialog('Draw from memory', suggestions[0] || '', 'Which mechanism will you draw? (edit the suggestion or type your own)');
  if (!topic) return;
  newBoard({ title: `Draw: ${topic}`, challenge: topic });
}

/* ============================== editor ============================== */
async function openBoard(b) {
  board = b;
  undoStack = [];
  redoStack = [];
  bgImage = null;
  if (b.bg) bgImage = await loadImg(b.bg).catch(() => null);
  const page = $('#whiteboardPage');
  page.innerHTML = `
    <div class="wb-head">
      <a class="btn btn-icon" href="#/whiteboard" aria-label="All boards"><i class="bi bi-arrow-left"></i></a>
      <button class="wb-title" id="wbTitle" title="Rename">${escapeHtml(b.title)}</button>
      <div class="dropdown ms-auto">
        <button class="btn btn-primary btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-stars me-1"></i>Ask SmartMedicine</button>
        <ul class="dropdown-menu dropdown-menu-end">
          ${b.challenge ? `<li><button class="dropdown-item" data-ask="grade"><i class="bi bi-check2-circle me-2"></i>Check my drawing of ${escapeHtml(b.challenge)}</button></li><li><hr class="dropdown-divider"></li>` : ''}
          <li><button class="dropdown-item" data-ask="explain"><i class="bi bi-lightbulb me-2"></i>Explain what I drew</button></li>
          <li><button class="dropdown-item" data-ask="check"><i class="bi bi-search me-2"></i>Check it for mistakes</button></li>
          <li><button class="dropdown-item" data-ask="image"><i class="bi bi-heart-pulse me-2"></i>Explain the annotated image</button></li>
        </ul>
      </div>
    </div>
    ${b.challenge ? `<div class="wb-challenge"><i class="bi bi-trophy me-2"></i>Draw the mechanism of <b>${escapeHtml(b.challenge)}</b> from memory: trigger → steps → clinical findings. Then tap <b>Ask SmartMedicine → Check my drawing</b>.</div>` : ''}
    <div class="wb-toolbar" role="toolbar" aria-label="Drawing tools">
      <div class="wb-group">${TOOLS.map(([k, icon, label]) => `<button class="wb-tool ${tool.name === k ? 'active' : ''}" data-tool="${k}" title="${label}" aria-label="${label}" aria-pressed="${tool.name === k}"><i class="bi ${icon}"></i></button>`).join('')}</div>
      <div class="wb-group">${COLORS.map((c) => `<button class="wb-color ${tool.color === c ? 'active' : ''}" data-color="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
      <div class="wb-group">${Object.keys(SIZES).map((s) => `<button class="wb-size ${tool.size === s ? 'active' : ''}" data-size="${s}" aria-label="Size ${s}">${s}</button>`).join('')}</div>
      <div class="wb-group">
        <button class="wb-tool" data-act="undo" title="Undo" aria-label="Undo"><i class="bi bi-arrow-counterclockwise"></i></button>
        <button class="wb-tool" data-act="redo" title="Redo" aria-label="Redo"><i class="bi bi-arrow-clockwise"></i></button>
        <label class="wb-tool mb-0" title="Background image" aria-label="Background image"><i class="bi bi-image"></i><input type="file" accept="image/*" id="wbBg" hidden></label>
        <button class="wb-tool" data-act="export" title="Download PNG" aria-label="Download PNG"><i class="bi bi-download"></i></button>
        <button class="wb-tool" data-act="clear" title="Clear board" aria-label="Clear board"><i class="bi bi-trash"></i></button>
      </div>
    </div>
    <div class="wb-stage" id="wbStage"><canvas id="wbCanvas" aria-label="Drawing canvas"></canvas></div>`;

  bindEditor();
  layout();
  resizeObs = new ResizeObserver(() => layout());
  resizeObs.observe($('#wbStage'));
}

function bindEditor() {
  const page = $('#whiteboardPage');
  $$('[data-tool]', page).forEach((b) => b.addEventListener('click', () => setTool({ name: b.dataset.tool })));
  $$('[data-color]', page).forEach((b) => b.addEventListener('click', () => setTool({ color: b.dataset.color, name: tool.name === 'eraser' ? 'pen' : tool.name })));
  $$('[data-size]', page).forEach((b) => b.addEventListener('click', () => setTool({ size: b.dataset.size })));
  $$('[data-act]', page).forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  $$('[data-ask]', page).forEach((b) => b.addEventListener('click', () => ask(b.dataset.ask)));
  $('#wbTitle').addEventListener('click', async () => {
    const t = await promptDialog('Rename board', board.title, 'Title');
    if (!t) return;
    board.title = t;
    $('#wbTitle').textContent = t;
    save();
  });
  $('#wbBg').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      board.bg = await fileToDataUrl(f, 1600);
      bgImage = await loadImg(board.bg);
      draw();
      save();
    } catch {
      toast('That image could not be read.', 'danger');
    }
  });
  const cv = $('#wbCanvas');
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
}

function setTool(patch) {
  Object.assign(tool, patch);
  $$('[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === tool.name);
    b.setAttribute('aria-pressed', b.dataset.tool === tool.name);
  });
  $$('[data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color === tool.color));
  $$('[data-size]').forEach((b) => b.classList.toggle('active', b.dataset.size === tool.size));
}

/* ---- geometry ---- */
function layout() {
  const stage = $('#wbStage');
  const cv = $('#wbCanvas');
  if (!stage || !cv || !board) return;
  const cssW = stage.clientWidth;
  const cssH = Math.round((cssW * board.h) / board.w);
  const dpr = Math.min(2.5, devicePixelRatio || 1);
  cv.style.width = `${cssW}px`;
  cv.style.height = `${cssH}px`;
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  cv._scale = (cssW * dpr) / board.w;
  draw();
}

function toLogical(e) {
  const r = $('#wbCanvas').getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * board.w, ((e.clientY - r.top) / r.height) * board.h, e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5];
}

/* ---- input ---- */
async function onDown(e) {
  if (!board || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  const p = toLogical(e);
  if (tool.name === 'text') {
    const text = await promptDialog('Add text', '', 'Text');
    if (text) commit({ tool: 'text', color: tool.color, size: SIZES[tool.size], x: p[0], y: p[1], text: text.slice(0, 200) });
    return;
  }
  e.target.setPointerCapture(e.pointerId);
  if (tool.name === 'eraser') {
    drawing = { erase: true, removed: [] };
    eraseAt(p);
    return;
  }
  drawing = { tool: tool.name, color: tool.color, size: SIZES[tool.size], points: [p] };
}

function onMove(e) {
  if (!drawing) return;
  const events = e.getCoalescedEvents?.() || [e];
  for (const ev of events) {
    const p = toLogical(ev);
    if (drawing.erase) eraseAt(p);
    else if (['pen', 'highlighter'].includes(drawing.tool)) drawing.points.push(p);
    else drawing.points[1] = p;
  }
  draw();
}

function onUp() {
  if (!drawing) return;
  const d = drawing;
  drawing = null;
  if (d.erase) {
    if (d.removed.length) {
      undoStack.push({ type: 'erase', items: d.removed });
      redoStack = [];
      save();
    }
    return;
  }
  if (d.points.length === 1 && ['pen', 'highlighter'].includes(d.tool)) d.points.push([d.points[0][0] + 0.1, d.points[0][1] + 0.1, d.points[0][2]]);
  if (d.points.length < 2) return draw();
  commit({ ...d, points: d.points.map(([x, y, pr]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pr * 100) / 100]) });
}

function commit(stroke) {
  board.strokes.push(stroke);
  undoStack.push({ type: 'add', stroke });
  redoStack = [];
  draw();
  save();
}

function eraseAt([x, y]) {
  const tol = 14;
  for (let i = board.strokes.length - 1; i >= 0; i--) {
    if (hits(board.strokes[i], x, y, tol)) {
      const [s] = board.strokes.splice(i, 1);
      drawing.removed.push({ stroke: s, index: i });
    }
  }
  draw();
}

function hits(s, x, y, tol) {
  if (s.tool === 'text') {
    const w = s.text.length * s.size * 3.2;
    return x >= s.x - tol && x <= s.x + w + tol && y >= s.y - s.size * 6 - tol && y <= s.y + tol;
  }
  let pts = s.points;
  if (s.tool === 'rect') {
    const [[x1, y1], [x2, y2]] = pts;
    pts = [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
  }
  const t = tol + (s.tool === 'highlighter' ? s.size * 1.5 : s.size / 2);
  for (let i = 1; i < pts.length; i++) if (segDist(x, y, pts[i - 1], pts[i]) <= t) return true;
  return false;
}

function segDist(px, py, [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function act(a) {
  if (a === 'undo' || a === 'redo') {
    const from = a === 'undo' ? undoStack : redoStack;
    const to = a === 'undo' ? redoStack : undoStack;
    const op = from.pop();
    if (!op) return;
    applyOp(op, a === 'undo');
    to.push(op);
    draw();
    save();
  } else if (a === 'clear') {
    if (!board.strokes.length) return;
    const op = { type: 'clear', strokes: board.strokes };
    board.strokes = [];
    undoStack.push(op);
    redoStack = [];
    draw();
    save();
  } else if (a === 'export') {
    renderToCanvas(1).toBlob((blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${board.title.replace(/[^\w-]+/g, '_')}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  }
}

function applyOp(op, undo) {
  if (op.type === 'add') {
    if (undo) board.strokes.splice(board.strokes.lastIndexOf(op.stroke), 1);
    else board.strokes.push(op.stroke);
  } else if (op.type === 'erase') {
    if (undo) [...op.items].reverse().forEach(({ stroke, index }) => board.strokes.splice(index, 0, stroke));
    else op.items.forEach(({ stroke }) => board.strokes.splice(board.strokes.indexOf(stroke), 1));
  } else if (op.type === 'clear') {
    board.strokes = undo ? op.strokes : [];
  }
}

/* ---- rendering ---- */
function draw() {
  const cv = $('#wbCanvas');
  if (!cv || !board) return;
  paint(cv.getContext('2d'), cv._scale || 1, cv.width, cv.height);
}

function paint(ctx, scale, W, H) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (bgImage) {
    const r = Math.min(board.w / bgImage.width, board.h / bgImage.height);
    const w = bgImage.width * r;
    const h = bgImage.height * r;
    ctx.drawImage(bgImage, (board.w - w) / 2, (board.h - h) / 2, w, h);
  }
  for (const s of board.strokes) drawStroke(ctx, s);
  if (drawing && !drawing.erase) drawStroke(ctx, drawing);
}

function drawStroke(ctx, s) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.tool === 'text') {
    ctx.font = `600 ${s.size * 6}px "Instrument Sans", system-ui, sans-serif`;
    ctx.fillText(s.text, s.x, s.y);
  } else if (s.tool === 'pen' || s.tool === 'highlighter') {
    if (s.tool === 'highlighter') ctx.globalAlpha = 0.3;
    const pts = s.points;
    const width = (p) => (s.tool === 'highlighter' ? s.size * 3 : s.size * (0.5 + (p?.[2] ?? 0.5)));
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      ctx.lineWidth = width(pts[i]);
      ctx.beginPath();
      if (i < pts.length - 1) {
        const [x2, y2] = pts[i + 1];
        ctx.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
        ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      } else {
        ctx.moveTo(i > 1 ? (x0 + x1) / 2 : x0, i > 1 ? (y0 + y1) / 2 : y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
  } else {
    const [[x1, y1], [x2, y2] = [x1, y1]] = s.points;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    if (s.tool === 'rect') ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    else {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (s.tool === 'arrow') {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const L = 14 + s.size * 2.5;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45));
        ctx.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45));
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** Renders the board at `ratio` × its logical size, independent of the screen. */
function renderToCanvas(ratio = 1) {
  const c = document.createElement('canvas');
  c.width = Math.round(board.w * ratio);
  c.height = Math.round(board.h * ratio);
  paint(c.getContext('2d'), ratio, c.width, c.height);
  return c;
}

/* ---- persistence ---- */
function save() {
  if (!board) return;
  board.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    board.thumb = renderToCanvas(240 / board.w).toDataURL('image/jpeg', 0.7);
    await db.put('boards', board);
  }, 600);
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function fileToDataUrl(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * r);
    c.height = Math.round(img.height * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---- ask the model ---- */
async function ask(kind) {
  if (!board.strokes.length && !board.bg) return toast('Draw something first.', 'warning');
  const c = renderToCanvas(Math.min(1, 1400 / board.w));
  const dataUrl = c.toDataURL('image/jpeg', 0.88);
  const image = { mediaType: 'image/jpeg', data: dataUrl.split(',')[1], preview: renderToCanvas(240 / board.w).toDataURL('image/jpeg', 0.7), name: board.title };
  const prompts = {
    grade: `I drew the mechanism of ${board.challenge} from memory on a whiteboard (image attached). Grade it like a tutor: read what I drew step by step, then tell me what I got right, what is missing or in the wrong order, and any wrong arrows or direction of change. Then give the correct mechanism as a chain and one memory anchor. End with a score out of 10.`,
    explain: 'This is a diagram I drew on a whiteboard (image attached). Read it, explain what it shows from first principles, and correct anything that is wrong.',
    check: 'Check this whiteboard drawing (image attached) for medical mistakes: wrong arrows, wrong direction of change, missing steps or wrong labels. List each problem and the correction, then redraw the corrected version as a chain.',
    image: 'I annotated this medical image on a whiteboard (image attached). Explain the image, and tell me whether my annotations point at the right findings.',
  };
  await composeAndSend(prompts[kind], { images: [image] });
}
