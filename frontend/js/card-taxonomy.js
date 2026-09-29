/*
 * Deck classification for flashcards: every card belongs to one deck, and decks sit under
 * either the basic sciences or the clinical specialties, so a large collection stays
 * organised instead of being one scattered list.
 *
 * Pure functions (no DOM, no storage) so they can be tested directly.
 */

export const CATEGORIES = {
  basic: { label: 'Foundational & basic science', icon: 'bi-diagram-2' },
  clinical: { label: 'Clinical specialties', icon: 'bi-hospital' },
};

/** Deck order within each category. */
export const DECKS = {
  basic: ['Anatomy', 'Physiology', 'Biochemistry & Genetics', 'Pathology', 'Pharmacology', 'Microbiology', 'Immunology', 'Behavioural science', 'General principles'],
  clinical: [
    'Cardiology', 'Pulmonology', 'Nephrology', 'Endocrinology', 'Gastroenterology & Hepatology', 'Hematology & Oncology', 'Infectious disease',
    'Neurology', 'Psychiatry', 'Obstetrics & Gynecology', 'Pediatrics', 'Surgery & Emergency', 'Musculoskeletal & Rheumatology', 'Dermatology',
    'Preventive medicine, Biostatistics & Ethics', 'General clinical',
  ],
};
export const deckCategory = (deck) => (DECKS.basic.includes(deck) ? 'basic' : 'clinical');

/** A knowledge-graph system maps to a clinical deck (used when the card is clinical). */
const SYSTEM_TO_CLINICAL = {
  Cardiovascular: 'Cardiology',
  Respiratory: 'Pulmonology',
  Renal: 'Nephrology',
  Endocrine: 'Endocrinology',
  Gastrointestinal: 'Gastroenterology & Hepatology',
  'Hematology & Oncology': 'Hematology & Oncology',
  'Microbiology & Infectious disease': 'Infectious disease',
  Neurology: 'Neurology',
  Psychiatry: 'Psychiatry',
  'Reproductive & Musculoskeletal': 'Musculoskeletal & Rheumatology',
  'Biostatistics, Ethics & Prevention': 'Preventive medicine, Biostatistics & Ethics',
  Pharmacology: 'Pharmacology',
  Immunology: 'Immunology',
  Foundations: 'General principles',
};

/* Discipline cues, checked in order: the first that matches wins. */
const DISCIPLINE_RULES = [
  ['Pharmacology', /\b(drug|dose|dosing|half[- ]life|receptor (agonist|antagonist)|agonist|antagonist|inhibitor of|blocks? the .*receptor|pharmacokinetic|pharmacodynamic|first[- ]pass|cyp\d|adverse effect|side effect|contraindicat\w+|toxicity of|antidote|mechanism of action)\b/i],
  ['Microbiology', /\b(bacteri\w*|virus\w*|viral|fungal|fungus|parasit\w*|protozo\w*|helminth|gram[- ](positive|negative)|culture|organism|toxin|spore|capsule|biofilm|antibiotic resistance|pathogen)\b/i],
  ['Immunology', /\b(antibod\w*|antigen|immunoglobulin|complement|t[- ]cell|b[- ]cell|mhc|hla|cytokine|interleukin|hypersensitivity|autoimmun\w*|vaccine response|immunodeficien\w*)\b/i],
  ['Biochemistry & Genetics', /\b(enzyme|substrate|cofactor|coenzyme|vitamin|deficiency of vitamin|glycolysis|gluconeogenesis|krebs|citric acid cycle|beta[- ]oxidation|urea cycle|amino acid|nucleotide|purine|pyrimidine|dna|rna|transcription|translation|mutation|inherit\w*|autosomal|x[- ]linked|chromosom\w*|gene\b|allele|trinucleotide)\b/i],
  ['Anatomy', /\b(anatom\w*|nerve|innervat\w*|artery|arterial supply|vein|venous drainage|muscle|ligament|foramen|fossa|dermatome|lymphatic drainage|origin and insertion|course of the)\b/i],
  ['Pathology', /\b(histolog\w*|biopsy|gross specimen|morpholog\w*|necrosis|apoptosis|dysplasia|metaplasia|neoplas\w*|carcinoma|sarcoma|granuloma|amyloid|inclusion bod\w*|stain\w*|microscop\w*)\b/i],
  ['Physiology', /\b(physiolog\w*|homeostas\w*|feedback|gradient|pressure|compliance|resistance|filtration|reabsorb\w*|secret\w*|action potential|depolaris\w*|depolariz\w*|contractility|preload|afterload|cardiac output|osmo\w*|oncotic|clearance|ventilation|perfusion|shunt)\b/i],
  ['Behavioural science', /\b(behaviou?ral|psychosocial|grief|coping|defen[cs]e mechanism|developmental milestone|learning theory)\b/i],
];

/* Cues that a card is about caring for a patient rather than the science underneath. */
const CLINICAL_CUE = /\b(next best step|most appropriate|management of|manage\b|treat(ment|ed|s)? (of|with|the patient)|first[- ]line|admit|discharge|disposition|screening|prophylaxis|follow[- ]up|monitor\w* therapy|when to (start|stop|refer)|indication for|diagnos(is|e|tic) (of|approach)|work[- ]?up|which test|initial test|guideline|counsel\w*|prognosis|complication of .* treatment)\b/i;

const SPECIALTY_CUE = [
  ['Obstetrics & Gynecology', /\b(pregnan\w*|obstetric|gestation\w*|prenatal|postpartum|labou?r|eclampsia|menstrual|uterine|ovarian|cervical (cancer|screening)|contracept\w*)\b/i],
  ['Pediatrics', /\b(neonat\w*|newborn|infant|child\w*|paediatric|pediatric|milestone|kawasaki|bronchiolitis|croup)\b/i],
  ['Surgery & Emergency', /\b(surger\w*|surgical|operat\w*|postoperative|trauma|resuscitat\w*|acute abdomen|appendicitis|obstruction|emergency department|triage|atls)\b/i],
  ['Dermatology', /\b(rash|skin lesion|dermatit\w*|psorias\w*|eczema|urticaria|melanoma|dermatolog\w*)\b/i],
];

const text = (card) => `${card?.q || ''} ${card?.a || ''} ${card?.topic || ''} ${card?.type || ''}`;

/**
 * Decides a card's deck.
 *   card: { q, a, topic, exam }
 *   concept: the knowledge-graph concept it is linked to, if any ({ system })
 * Returns { deck, category }.
 */
export function classifyCard(card, concept = null) {
  const t = text(card);
  const system = concept?.system || '';

  // 1. An explicit discipline in the wording wins: this is basic science whatever organ it concerns.
  for (const [deck, re] of DISCIPLINE_RULES) {
    if (re.test(t)) {
      // …unless the card is clearly about managing a patient with that drug or organism.
      if (CLINICAL_CUE.test(t) && (deck === 'Microbiology' || deck === 'Pharmacology')) break;
      return { deck, category: deckCategory(deck) };
    }
  }

  // 2. A named specialty in the wording.
  for (const [deck, re] of SPECIALTY_CUE) if (re.test(t)) return { deck, category: 'clinical' };

  // 3. Otherwise use the concept's system, as clinical when the card is about patient care.
  const clinical = CLINICAL_CUE.test(t) || card?.exam === 'step2ck' || card?.exam === 'step3';
  if (system) {
    if (!clinical && (system === 'Foundations' || system === 'Pharmacology' || system === 'Immunology')) {
      const deck = system === 'Foundations' ? 'General principles' : system;
      return { deck, category: 'basic' };
    }
    const deck = SYSTEM_TO_CLINICAL[system] || 'General clinical';
    if (!clinical && deck !== 'General clinical') {
      // An organ-system card with no clinical cue is still physiology/pathology teaching.
      return { deck: 'Physiology', category: 'basic', system: deck };
    }
    return { deck, category: deckCategory(deck) };
  }
  return clinical ? { deck: 'General clinical', category: 'clinical' } : { deck: 'General principles', category: 'basic' };
}

/** Groups cards into { basic: [{deck, cards, due}], clinical: [...] }, decks in fixed order. */
export function groupCards(cards, now = Date.now()) {
  const byDeck = new Map();
  for (const c of cards) {
    const deck = c.deck || 'General principles';
    const entry = byDeck.get(deck) || { deck, category: c.category || deckCategory(deck), cards: [], due: 0 };
    entry.cards.push(c);
    if ((c.due || 0) <= now) entry.due++;
    byDeck.set(deck, entry);
  }
  const order = (cat) => DECKS[cat].concat([...byDeck.keys()].filter((d) => !DECKS[cat].includes(d) && deckCategory(d) === cat));
  const out = { basic: [], clinical: [] };
  for (const cat of ['basic', 'clinical'])
    for (const deck of order(cat)) {
      const e = byDeck.get(deck);
      if (e && e.category === cat) out[cat].push(e);
    }
  return out;
}
