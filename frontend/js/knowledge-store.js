/*
 * Browser persistence and shared access for the knowledge graph and learner model.
 * Everything else (chat, questions, flashcards, dashboard) goes through these functions.
 */
import { db } from './store.js';
import { KnowledgeGraph } from './graph.js';
import { emptyRecord, applyEvidence, prerequisitePlan } from './learner-model.js';

export const graph = new KnowledgeGraph();
export const records = new Map(); // conceptId -> learner record
let loaded = null;

export function loadKnowledge() {
  loaded ||= (async () => {
    try {
      const saved = await db.get('graph', 'learned');
      if (saved?.records) graph.restore(saved.records);
      for (const r of await db.all('mastery')) records.set(r.id, r);
    } catch (err) {
      console.warn('Knowledge store unavailable', err);
    }
  })();
  return loaded;
}

/** Re-reads everything after another device's changes arrive. */
export async function reloadKnowledge() {
  records.clear();
  loaded = null;
  await loadKnowledge();
}

let graphTimer = null;
function saveGraph() {
  clearTimeout(graphTimer);
  graphTimer = setTimeout(() => {
    db.put('graph', { id: 'learned', records: graph.learnedState(), updatedAt: Date.now() }).catch((e) => console.warn(e));
  }, 300);
}

function changed() {
  document.dispatchEvent(new CustomEvent('knowledge:changed'));
}

/** Finds a concept by name (exact, then fuzzy), creating it in `system` if it is new. */
export function resolveConcept(name, system) {
  if (!name) return null;
  const hit = graph.find(name) || graph.match(name);
  if (hit) return hit;
  const node = graph.merge({ concept: name, system });
  if (node) saveGraph();
  return node;
}

/** Merges the structured concept block a lesson returns (see ai/teacher/modules.js CONCEPTS). */
export function mergeLessonBlock(block) {
  const node = graph.merge(block);
  if (node) {
    saveGraph();
    changed();
  }
  return node;
}

/** Records one piece of learning evidence against a concept. */
export async function recordEvidence(conceptOrName, event, system) {
  await loadKnowledge();
  const concept =
    typeof conceptOrName === 'string' ? resolveConcept(conceptOrName, system) : graph.get(conceptOrName?.id) || resolveConcept(conceptOrName?.name, system);
  if (!concept) return null;
  const rec = records.get(concept.id) || emptyRecord(concept);
  rec.name = concept.name;
  rec.system = concept.system;
  applyEvidence(rec, event);
  records.set(concept.id, rec);
  await db.put('mastery', rec);
  changed();
  return rec;
}

/** Keeps nextReview on each concept in step with its earliest-due flashcard. */
export async function syncReviewDates(cards) {
  await loadKnowledge();
  const next = new Map();
  for (const c of cards) if (c.conceptId) next.set(c.conceptId, Math.min(next.get(c.conceptId) ?? Infinity, c.due));
  for (const [id, due] of next) {
    const rec = records.get(id);
    if (rec && rec.nextReview !== due) {
      rec.nextReview = due;
      await db.put('mastery', rec);
    }
  }
}

/**
 * Prerequisite engine entry point: for a learner request, which concept is it about and
 * what should happen with each prerequisite. Returns null when no known concept matches.
 */
export async function planFor(text) {
  await loadKnowledge();
  const concept = graph.match(text);
  if (!concept) return null;
  const plan = prerequisitePlan(graph.prerequisites(concept.id, 3), records);
  return { concept, plan };
}
