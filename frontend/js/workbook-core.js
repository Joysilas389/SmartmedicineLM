/*
 * SmartMedicineLM's offline database format: one Excel workbook, one sheet per kind of data.
 * Each row has readable columns (for looking at in Excel) plus "Record" columns holding the
 * exact record as JSON, so restoring is lossless. Pure functions: the SheetJS library is passed
 * in, so this runs in the browser, in the Termux server and in node tests.
 */
export const FORMAT = 'SmartMedicineLM workbook';
export const FORMAT_VERSION = 1;
const CELL = 32000; // Excel's cell limit is 32,767 characters
const RECORD = 'Record (do not edit)';

/** [header, field, kind] kind: text | long | date | pct | bool */
export const SHEETS = [
  { store: 'flashcards', sheet: 'Flashcards', editable: true, cols: [['Question', 'q', 'long'], ['Answer', 'a', 'long'], ['Concept', 'topic'], ['Next review', 'due', 'date'], ['Interval (days)', 'interval'], ['Reviews', 'reps'], ['Lapses', 'lapses']] },
  { store: 'mastery', sheet: 'Progress', cols: [['Concept', 'name'], ['System', 'system'], ['Understanding', 'understanding', 'pct'], ['Recall', 'recall', 'pct'], ['Application', 'application', 'pct'], ['Questions', 'attempts'], ['Correct', 'correct'], ['Errors', 'errors'], ['Last studied', 'lastReviewed', 'date'], ['Next review', 'nextReview', 'date']] },
  { store: 'chats', sheet: 'Chats', cols: [['Title', 'title'], ['Created', 'createdAt', 'date'], ['Updated', 'updatedAt', 'date'], ['Favourite', 'favorite', 'bool'], ['Archived', 'archived', 'bool']] },
  { store: 'messages', sheet: 'Messages', cols: [['Chat', 'chatId'], ['Role', 'role'], ['Mode', 'mode'], ['Text', 'content', 'long'], ['Time', 'createdAt', 'date']] },
  { store: 'questions', sheet: 'Questions', cols: [['Concept', 'concept'], ['System', 'system'], ['Difficulty', 'difficulty'], ['Question', 'stem', 'long'], ['Answer', 'answer'], ['High yield', 'highYield', 'long'], ['Created', 'createdAt', 'date']] },
  { store: 'attempts', sheet: 'Question attempts', cols: [['Concept', 'concept'], ['System', 'system'], ['Chosen', 'chosen'], ['Correct', 'correct', 'bool'], ['Confidence', 'confidence'], ['Error type', 'errorType'], ['Seconds', 'seconds'], ['Time', 'at', 'date']] },
  { store: 'blocks', sheet: 'Question blocks', cols: [['Label', 'label'], ['Mode', 'mode'], ['Status', 'status'], ['Score', 'score', 'pct'], ['Created', 'createdAt', 'date']] },
  { store: 'reviews', sheet: 'Review log', cols: [['Card', 'cardId'], ['Concept', 'conceptId'], ['Grade', 'grade'], ['Interval (days)', 'interval'], ['Time', 'at', 'date']] },
  { store: 'documents', sheet: 'Documents', cols: [['Title', 'title'], ['Type', 'fileType'], ['Pages', 'pageCount'], ['Status', 'status'], ['Added', 'createdAt', 'date']] },
  { store: 'chunks', sheet: 'Document text', cols: [['Document', 'docId'], ['Page', 'page'], ['Section', 'section'], ['Text', 'text', 'long']] },
  { store: 'graph', sheet: 'Knowledge graph', cols: [['Id', 'id'], ['Updated', 'updatedAt', 'date']] },
  { store: 'highlights', sheet: 'Highlights', cols: [['Highlighted text', 'text', 'long'], ['Ink', 'color'], ['Where', 'target'], ['Saved', 'createdAt', 'date']] },
  { store: 'boards', sheet: 'Whiteboards', cols: [['Title', 'title'], ['Challenge', 'challenge'], ['Updated', 'updatedAt', 'date']] },
];
export const STORES_IN_WORKBOOK = SHEETS.map((s) => s.store);

const PRIVATE_SETTINGS = ['accessCode'];

const PREVIEW = 1500; // long text is previewed here; the full text lives in the Record columns

function display(value, kind, editable) {
  if (value == null || value === '') return null;
  if (kind === 'date') return typeof value === 'number' && value > 0 ? new Date(value) : null;
  if (kind === 'pct') return typeof value === 'number' ? Math.round(value * 1000) / 10 : null;
  if (kind === 'bool') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, CELL);
  const s = String(value);
  const limit = kind === 'long' && !editable ? PREVIEW : CELL;
  return s.length > limit ? s.slice(0, limit - 1) + '…' : s;
}

function splitJson(obj) {
  const json = JSON.stringify(obj);
  const parts = [];
  for (let i = 0; i < json.length; i += CELL) parts.push(json.slice(i, i + CELL));
  return parts.length ? parts : ['{}'];
}

/**
 * data: { stores: { flashcards: [...], ... }, settings, files: [{ id, name, type, base64 }], exportedAt, app }
 * Returns a SheetJS workbook.
 */
export function buildWorkbook(XLSX, data) {
  const wb = XLSX.utils.book_new();
  const counts = {};
  for (const def of SHEETS) counts[def.sheet] = (data.stores[def.store] || []).length;

  const about = [
    ['SmartMedicineLM'],
    ['Format', FORMAT],
    ['Format version', FORMAT_VERSION],
    ['Saved', new Date(data.exportedAt || Date.now())],
    ['App version', data.app || ''],
    [],
    ['This file is your SmartMedicineLM database. Keep it safe: you can restore everything from it in Settings → Your data.'],
    ['You can read every sheet. On the Flashcards sheet you may edit Question, Answer and Concept, or add new cards in empty rows (Question + Answer).'],
    ['Do not edit the "Record" columns: they hold the exact data used for restoring.'],
    [],
    ['Sheet', 'Rows'],
    ...Object.entries(counts).map(([k, v]) => [k, v]),
    ['Settings', 1],
    ['Files', (data.files || []).length],
  ];
  const aboutWs = XLSX.utils.aoa_to_sheet(about, { cellDates: true });
  aboutWs['!cols'] = [{ wch: 28 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, aboutWs, 'About');

  for (const def of SHEETS) {
    const rows = data.stores[def.store] || [];
    const parts = rows.map(splitJson);
    const nParts = Math.max(1, ...parts.map((p) => p.length));
    const header = [...def.cols.map((c) => c[0]), RECORD, ...Array.from({ length: nParts - 1 }, (_, i) => `Record part ${i + 2}`)];
    const aoa = [header, ...rows.map((r, i) => [...def.cols.map(([, f, kind]) => display(r[f], kind, def.editable)), ...parts[i]])];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'yyyy-mm-dd hh:mm' });
    ws['!cols'] = [...def.cols.map(([h, , kind]) => ({ wch: kind === 'long' ? 60 : kind === 'date' ? 17 : Math.max(10, h.length + 2) })), ...Array.from({ length: nParts }, () => ({ wch: 12 }))];
    XLSX.utils.book_append_sheet(wb, ws, def.sheet);
  }

  const settings = { ...(data.settings || {}) };
  for (const k of PRIVATE_SETTINGS) delete settings[k];
  const setWs = XLSX.utils.aoa_to_sheet([['Setting', 'Value'], ...Object.entries(settings).map(([k, v]) => [k, JSON.stringify(v)])]);
  setWs['!cols'] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, setWs, 'Settings');

  // Original PDFs/images, base64 in ≤32k pieces (only in full backups).
  const fileRows = [['File id', 'Name', 'Type', 'Part', 'Data']];
  for (const f of data.files || []) for (let i = 0, p = 1; i < f.base64.length || p === 1; i += CELL, p++) fileRows.push([f.id, f.name, f.type, p, f.base64.slice(i, i + CELL)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fileRows), 'Files');
  return wb;
}

/**
 * Reads a workbook back into { stores, settings, files, meta }. Flashcards edited or added in
 * Excel are applied (edits get a fresh timestamp so they win over the copy in the browser).
 */
export function parseWorkbook(XLSX, wb, now = Date.now()) {
  const about = wb.Sheets.About ? XLSX.utils.sheet_to_json(wb.Sheets.About, { header: 1, raw: true }) : [];
  const fmt = about.find((r) => r[0] === 'Format')?.[1];
  if (fmt !== FORMAT) throw new Error('This is not a SmartMedicineLM workbook.');
  const version = Number(about.find((r) => r[0] === 'Format version')?.[1] || 1);
  if (version > FORMAT_VERSION) throw new Error('This workbook was made by a newer version of SmartMedicineLM. Update the app first.');

  const stores = {};
  const stats = { edited: 0, added: 0, skipped: 0 };
  for (const def of SHEETS) {
    const ws = wb.Sheets[def.sheet];
    stores[def.store] = [];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const header = rows.shift() || [];
    const recCols = header.map((h, i) => (typeof h === 'string' && h.startsWith('Record') ? i : -1)).filter((i) => i >= 0);
    const col = (name) => header.indexOf(name);
    for (const row of rows) {
      if (!row || row.every((v) => v == null || v === '')) continue;
      const json = recCols.map((i) => row[i] ?? '').join('');
      let rec = null;
      if (json.trim()) {
        try {
          rec = JSON.parse(json);
        } catch {
          stats.skipped++;
          continue;
        }
      }
      if (def.editable) {
        const q = row[col('Question')];
        const a = row[col('Answer')];
        const concept = row[col('Concept')];
        if (!rec) {
          if (typeof q === 'string' && q.trim() && a != null && String(a).trim()) {
            rec = { id: `card_x${now.toString(36)}${stores[def.store].length}`, q: q.trim(), a: String(a).trim(), topic: concept ? String(concept).trim() : '', createdAt: now, due: now, state: 'new', reps: 0, lapses: 0, successes: 0, failures: 0, source: 'excel', _u: now };
            stats.added++;
          } else continue;
        } else {
          const nq = typeof q === 'string' ? q.trim() : rec.q;
          const na = a != null ? String(a).trim() : rec.a;
          const nc = concept != null ? String(concept).trim() : rec.topic;
          if ((nq && nq !== rec.q && !String(q).endsWith('…')) || (na && na !== rec.a && !String(a).endsWith('…')) || (nc || '') !== (rec.topic || '')) {
            rec = { ...rec, q: nq || rec.q, a: na || rec.a, topic: nc || '', _u: now };
            stats.edited++;
          }
        }
      }
      if (rec && typeof rec.id === 'string') stores[def.store].push(rec);
      else stats.skipped++;
    }
  }

  const settings = {};
  if (wb.Sheets.Settings)
    for (const [k, v] of XLSX.utils.sheet_to_json(wb.Sheets.Settings, { header: 1, raw: true }).slice(1)) {
      if (!k || PRIVATE_SETTINGS.includes(k)) continue;
      try {
        settings[k] = JSON.parse(v);
      } catch { /* ignore a hand-edited value that is not JSON */ }
    }

  const files = new Map();
  if (wb.Sheets.Files)
    for (const [id, name, type, part, chunk] of XLSX.utils.sheet_to_json(wb.Sheets.Files, { header: 1, raw: true }).slice(1)) {
      if (!id) continue;
      const f = files.get(id) || { id, name, type, parts: [] };
      f.parts[Number(part) - 1] = chunk || '';
      files.set(id, f);
    }

  return {
    stores,
    settings,
    files: [...files.values()].map((f) => ({ id: f.id, name: f.name, type: f.type, base64: f.parts.join('') })),
    meta: { version, saved: about.find((r) => r[0] === 'Saved')?.[1] || null },
    stats,
  };
}
