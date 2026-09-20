import { test } from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { buildWorkbook, parseWorkbook, FORMAT, SHEETS } from '../frontend/js/workbook-core.js';

const longLesson = 'Nephrotic syndrome. '.repeat(4000); // ~80k characters: must span several cells
const sample = () => ({
  exportedAt: Date.UTC(2026, 8, 20),
  app: 'test',
  settings: { depth: 'deep', scheduler: 'fsrs', accessCode: 'secret', studyPlan: { examDate: '2026-12-20', hours: 5 } },
  files: [{ id: 'file_1', name: 'notes.pdf', type: 'application/pdf', base64: 'QUJD'.repeat(9000) }],
  stores: {
    flashcards: [
      { id: 'c1', q: 'Why does hypoalbuminemia cause edema?', a: 'Low oncotic pressure.', topic: 'Nephrotic syndrome', due: Date.UTC(2026, 8, 25), interval: 5, reps: 2, lapses: 0, stability: 5.2, _u: 100 },
      { id: 'c2', q: 'What does aldosterone do to potassium?', a: 'Increases secretion.', topic: 'RAAS', due: Date.UTC(2026, 8, 21), interval: 1, reps: 1, _u: 100 },
    ],
    messages: [{ id: 'm1', chatId: 'chat1', role: 'assistant', mode: 'learn', content: longLesson, createdAt: Date.UTC(2026, 8, 19), _u: 50 }],
    mastery: [{ id: 'nephrotic-syndrome', name: 'Nephrotic syndrome', system: 'Renal', understanding: 0.3, recall: null, application: 0.5, n: { understanding: 2, recall: 0, application: 3 }, attempts: 3, correct: 1, errors: 1, errorTypes: { mechanism_gap: 1 }, lastReviewed: Date.UTC(2026, 8, 18), _u: 70 }],
    chats: [{ id: 'chat1', title: 'Nephrotic syndrome', createdAt: 1, updatedAt: 2, favorite: true, archived: false, _u: 10 }],
    questions: [], attempts: [], blocks: [], reviews: [], documents: [], chunks: [], graph: [], boards: [],
  },
});

const roundTrip = (data) => parseWorkbook(XLSX, XLSX.read(XLSX.write(buildWorkbook(XLSX, data), { bookType: 'xlsx', type: 'array' }), { type: 'array' }));

test('workbook round-trip keeps every record exactly, including very long lessons', () => {
  const back = roundTrip(sample());
  assert.deepEqual(back.stores.flashcards, sample().stores.flashcards);
  assert.deepEqual(back.stores.mastery, sample().stores.mastery, 'nested learner-model fields survive');
  assert.equal(back.stores.messages[0].content.length, longLesson.length, 'a lesson split across cells is rejoined');
  assert.equal(back.stores.messages[0].content, longLesson);
  assert.equal(back.files[0].base64, sample().files[0].base64, 'an attached PDF is restored byte for byte');
  assert.equal(back.settings.depth, 'deep');
  assert.deepEqual(back.settings.studyPlan, { examDate: '2026-12-20', hours: 5 });
  assert.equal(back.settings.accessCode, undefined, 'the access code is never written to the file');
});

test('the workbook is readable: real sheets, readable columns, dates and percentages', () => {
  const wb = buildWorkbook(XLSX, sample());
  assert.ok(wb.SheetNames.includes('Flashcards') && wb.SheetNames.includes('Progress') && wb.SheetNames.includes('About'));
  assert.equal(wb.SheetNames.length, SHEETS.length + 3);
  const cards = XLSX.utils.sheet_to_json(wb.Sheets.Flashcards, { header: 1, raw: true });
  assert.deepEqual(cards[0].slice(0, 4), ['Question', 'Answer', 'Concept', 'Next review']);
  assert.equal(cards[1][0], 'Why does hypoalbuminemia cause edema?');
  assert.ok(cards[1][3] instanceof Date, 'due dates are real Excel dates');
  const prog = XLSX.utils.sheet_to_json(wb.Sheets.Progress, { header: 1, raw: true });
  assert.equal(prog[1][2], 30, 'understanding shown as a percentage');
  assert.equal(prog[1][4], 50);
  const about = XLSX.utils.sheet_to_json(wb.Sheets.About, { header: 1, raw: true });
  assert.equal(about.find((r) => r[0] === 'Format')[1], FORMAT);
});

test('flashcards edited or added in Excel come back in; other sheets stay authoritative', () => {
  const wb = buildWorkbook(XLSX, sample());
  const ws = wb.Sheets.Flashcards;
  ws.B2 = { t: 's', v: 'Low plasma oncotic pressure lets fluid leave the capillary.' }; // edited answer
  ws.A4 = { t: 's', v: 'What is the anion gap formula?' }; // a new card typed into an empty row
  ws.B4 = { t: 's', v: 'Na - (Cl + HCO3)' };
  ws.C4 = { t: 's', v: 'Anion gap' };
  ws['!ref'] = 'A1:H4';
  const back = parseWorkbook(XLSX, XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' }), 999);
  assert.equal(back.stats.edited, 1);
  assert.equal(back.stats.added, 1);
  const edited = back.stores.flashcards.find((c) => c.id === 'c1');
  assert.match(edited.a, /leave the capillary/);
  assert.equal(edited.stability, 5.2, 'the review schedule is kept when only the text is edited');
  assert.equal(edited._u, 999, 'an edit in Excel wins over the copy in the browser');
  const added = back.stores.flashcards.find((c) => c.q.startsWith('What is the anion gap'));
  assert.equal(added.topic, 'Anion gap');
  assert.equal(added.state, 'new');
  assert.equal(back.stores.flashcards.find((c) => c.id === 'c2')._u, 100, 'untouched rows keep their timestamp');
});

test('a file that is not a SmartMedicineLM workbook is refused clearly', () => {
  const other = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(other, XLSX.utils.aoa_to_sheet([['Name', 'Mark'], ['Ama', 70]]), 'Sheet1');
  assert.throws(() => parseWorkbook(XLSX, other), /not a SmartMedicineLM workbook/);
  const future = buildWorkbook(XLSX, sample());
  future.Sheets.About.B3 = { t: 'n', v: 99 };
  assert.throws(() => parseWorkbook(XLSX, future), /newer version/);
});

test('damaged rows are skipped instead of losing the whole file', () => {
  const wb = buildWorkbook(XLSX, sample());
  wb.Sheets.Flashcards.H3 = { t: 's', v: '{broken json' };
  const back = parseWorkbook(XLSX, XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' }));
  assert.equal(back.stores.flashcards.length, 1);
  assert.equal(back.stats.skipped, 1);
});
