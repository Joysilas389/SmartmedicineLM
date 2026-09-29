import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCard, groupCards, DECKS, deckCategory } from '../frontend/js/card-taxonomy.js';

const deckOf = (q, a = '', concept = null, extra = {}) => classifyCard({ q, a, ...extra }, concept);

test('basic-science cards land in their discipline, whatever organ they concern', () => {
  assert.equal(deckOf('How does spironolactone work?', 'It blocks the mineralocorticoid receptor.').deck, 'Pharmacology');
  assert.equal(deckOf('Which organism causes rice-water stools?', 'Vibrio cholerae, via its toxin.').deck, 'Microbiology');
  assert.equal(deckOf('What does MHC class II present?', 'Extracellular antigen to CD4 T cells.').deck, 'Immunology');
  assert.equal(deckOf('Why does thiamine deficiency impair the citric acid cycle?', 'It is a cofactor.').deck, 'Biochemistry & Genetics');
  assert.equal(deckOf('What is the innervation of the diaphragm?', 'The phrenic nerve, C3-C5.').deck, 'Anatomy');
  assert.equal(deckOf('What does effacement of podocyte foot processes look like on microscopy?', 'Only on electron microscopy.').deck, 'Pathology');
  assert.equal(deckOf('Why does raising preload increase stroke volume?', 'Frank-Starling: more overlap of filaments.').deck, 'Physiology');
  for (const q of ['How does spironolactone work?', 'What does MHC class II present?']) assert.equal(classifyCard({ q, a: '' }).category, 'basic');
});

test('cards about caring for a patient land in the clinical specialty', () => {
  assert.equal(deckOf('What is the next best step in a STEMI at a PCI-capable hospital?', 'Primary PCI.', { system: 'Cardiovascular' }).deck, 'Cardiology');
  assert.equal(deckOf('First-line management of diabetic ketoacidosis?', 'Fluids, insulin, potassium.', { system: 'Endocrine' }).deck, 'Endocrinology');
  assert.equal(deckOf('When is colorectal cancer screening started?', 'At 45 in average-risk adults.', { system: 'Biostatistics, Ethics & Prevention' }).deck, 'Preventive medicine, Biostatistics & Ethics');
  assert.equal(deckOf('How do you manage pre-eclampsia at 37 weeks?', 'Delivery.').deck, 'Obstetrics & Gynecology');
  assert.equal(deckOf('Management of bronchiolitis in an infant?', 'Supportive care.').deck, 'Pediatrics');
  assert.equal(deckOf('Which antibiotic is first-line for community-acquired pneumonia?', 'Amoxicillin.', { system: 'Microbiology & Infectious disease' }).deck, 'Infectious disease',
    'a drug question about treating a patient is clinical, not pharmacology');
  assert.equal(classifyCard({ q: 'What is the next best step in a STEMI?', a: 'PCI.' }).category, 'clinical');
});

test('a mechanism card in an organ system stays basic science', () => {
  const c = deckOf('Why does hypoalbuminemia cause edema?', 'Low oncotic pressure lets fluid leave the capillary.', { system: 'Renal' });
  assert.equal(c.category, 'basic');
  assert.equal(c.deck, 'Physiology');
});

test('the exam a card came from is a clinical signal', () => {
  const c = deckOf('When do you admit a patient with pneumonia?', 'Use CURB-65.', { system: 'Respiratory' }, { exam: 'step2ck' });
  assert.equal(c.deck, 'Pulmonology');
  assert.equal(c.category, 'clinical');
});

test('grouping keeps a fixed order, splits the two categories and counts what is due', () => {
  const now = 1_000_000;
  const cards = [
    { id: 'a', deck: 'Cardiology', category: 'clinical', due: now - 1 },
    { id: 'b', deck: 'Physiology', category: 'basic', due: now + 10_000 },
    { id: 'c', deck: 'Physiology', category: 'basic', due: now - 5 },
    { id: 'd', deck: 'Pharmacology', category: 'basic', due: now - 5 },
    { id: 'e', deck: 'Unlabelled deck', category: 'clinical', due: now + 1 },
  ];
  const g = groupCards(cards, now);
  assert.deepEqual(g.basic.map((x) => x.deck), ['Physiology', 'Pharmacology'], 'fixed order, not insertion order');
  assert.deepEqual(g.clinical.map((x) => x.deck), ['Cardiology', 'Unlabelled deck'], 'unknown decks come last');
  assert.equal(g.basic[0].cards.length, 2);
  assert.equal(g.basic[0].due, 1);
  assert.equal(g.clinical[0].due, 1);
  assert.equal(deckCategory('Cardiology'), 'clinical');
  assert.equal(deckCategory('Anatomy'), 'basic');
  assert.ok(DECKS.basic.length + DECKS.clinical.length >= 20);
});
