/*
 * Learner model (spec §28): knowledge tracked per concept on three separate axes
 *   understanding  – can explain the mechanism        (lesson self-ratings, mechanism errors)
 *   recall         – can retrieve the fact            (flashcard reviews)
 *   application    – can use it on a vignette         (question attempts)
 * plus confidence calibration, errors by type and review dates.
 * Pure functions only; persistence is in knowledge-store.js.
 */

export const DIMENSIONS = ['understanding', 'recall', 'application'];
const WEIGHT = { understanding: 0.35, recall: 0.25, application: 0.4 };
const MEMORY = 8; // evidence beyond this many events is discounted, so recent work counts more

export const ERROR_TYPES = {
  knowledge_gap: { label: 'Knowledge gap', hint: 'I had never learned this.' },
  mechanism_gap: { label: 'Mechanism gap', hint: 'I knew the facts but not why they happen.' },
  recognition_failure: { label: 'Recognition failure', hint: 'I knew it but did not recognise it in the vignette.' },
  misread_clue: { label: 'Misread clue', hint: 'I misread or skipped a detail in the stem.' },
  differential_confusion: { label: 'Differential confusion', hint: 'I mixed it up with a similar condition.' },
  calculation_error: { label: 'Calculation error', hint: 'My reasoning was right but the arithmetic was wrong.' },
  distractor_trap: { label: 'Distractor trap', hint: 'A tempting option pulled me away from the answer.' },
  recall_failure: { label: 'Recall failure', hint: 'I knew it once but could not retrieve it.' },
};

export function emptyRecord(concept) {
  return {
    id: concept.id,
    name: concept.name,
    system: concept.system,
    understanding: null,
    recall: null,
    application: null,
    n: { understanding: 0, recall: 0, application: 0 },
    confidence: null, // how often the learner's certainty matched their correctness (0..1)
    nConfidence: 0,
    errors: 0,
    errorTypes: {},
    attempts: 0,
    correct: 0,
    lastReviewed: null,
    nextReview: null,
    history: [],
  };
}

function blend(rec, dim, value, weight = 1) {
  const n = Math.min(rec.n[dim], MEMORY);
  rec[dim] = rec[dim] == null ? value : (rec[dim] * n + value * weight) / (n + weight);
  rec.n[dim] += 1;
}

function log(rec, kind, value, now) {
  rec.history.push({ t: now, kind, value });
  if (rec.history.length > 30) rec.history.splice(0, rec.history.length - 30);
  rec.lastReviewed = now;
}

/**
 * Applies one piece of evidence to a concept record (mutates and returns it).
 * events:
 *   { kind: 'lesson', rating: 'lost'|'partly'|'got' }
 *   { kind: 'card', grade: 1..4 }                      (FSRS grades: again/hard/good/easy)
 *   { kind: 'question', correct, confidence: 'sure'|'unsure'|'guess' }
 *   { kind: 'error', type }                            (classified mistake)
 */
export function applyEvidence(rec, event, now = Date.now()) {
  switch (event.kind) {
    case 'lesson': {
      const v = { lost: 0.2, partly: 0.55, got: 0.85 }[event.rating];
      if (v == null) return rec;
      blend(rec, 'understanding', v);
      log(rec, 'lesson', v, now);
      break;
    }
    case 'card': {
      const v = { 1: 0, 2: 0.6, 3: 0.85, 4: 1 }[event.grade];
      if (v == null) return rec;
      blend(rec, 'recall', v);
      log(rec, 'card', v, now);
      break;
    }
    case 'question': {
      const conf = event.confidence || 'unsure';
      // A lucky guess is weaker evidence of skill than a confident correct answer.
      const v = event.correct ? (conf === 'guess' ? 0.6 : conf === 'unsure' ? 0.85 : 1) : 0;
      blend(rec, 'application', v);
      rec.attempts += 1;
      if (event.correct) rec.correct += 1;
      // Calibration: sure+correct and guess+wrong are well calibrated.
      const calibrated = event.correct ? (conf === 'sure' ? 1 : conf === 'unsure' ? 0.6 : 0.3) : conf === 'guess' ? 1 : conf === 'unsure' ? 0.6 : 0;
      rec.confidence = rec.confidence == null ? calibrated : (rec.confidence * Math.min(rec.nConfidence, MEMORY) + calibrated) / (Math.min(rec.nConfidence, MEMORY) + 1);
      rec.nConfidence += 1;
      // Being confidently wrong points to a misconception, not just a slip.
      if (!event.correct && conf === 'sure') blend(rec, 'understanding', 0.3, 0.5);
      log(rec, 'question', v, now);
      break;
    }
    case 'error': {
      if (!ERROR_TYPES[event.type]) return rec;
      rec.errors += 1;
      rec.errorTypes[event.type] = (rec.errorTypes[event.type] || 0) + 1;
      if (event.type === 'mechanism_gap') blend(rec, 'understanding', 0.15);
      if (event.type === 'knowledge_gap') blend(rec, 'understanding', 0.3, 0.7);
      if (event.type === 'recall_failure') blend(rec, 'recall', 0.2, 0.7);
      log(rec, 'error', event.type, now);
      break;
    }
    default:
      return rec;
  }
  return rec;
}

/** Single mastery number (0..1) from whichever dimensions have evidence, or null. */
export function mastery(rec) {
  if (!rec) return null;
  let sum = 0;
  let w = 0;
  for (const d of DIMENSIONS)
    if (rec[d] != null) {
      sum += rec[d] * WEIGHT[d];
      w += WEIGHT[d];
    }
  return w ? sum / w : null;
}

/** Weakness-map band (spec §53). */
export function status(rec) {
  const m = mastery(rec);
  if (m == null) return 'unrated';
  if (rec.errors >= 3 && (rec.application ?? 1) < 0.5) return 'critical';
  if (m >= 0.8) return 'strong';
  if (m >= 0.6) return 'moderate';
  if (m >= 0.4) return 'review';
  return 'critical';
}

export const STATUS_LABEL = {
  strong: 'Strong',
  moderate: 'Moderate',
  review: 'Needs review',
  critical: 'Critical gap',
  unrated: 'Not yet studied',
};

/**
 * Prerequisite decision (spec §29): what to do with each prerequisite of a topic.
 * Returns [{ name, id, decision: 'teach'|'review'|'skip', mastery }] (skips included).
 */
export function prerequisitePlan(prereqs, records) {
  return prereqs.map(({ concept, depth }) => {
    const rec = records.get(concept.id);
    const m = mastery(rec);
    let decision;
    if (m == null) decision = depth === 1 ? 'review' : 'skip';
    else if (m >= 0.75 && (rec.understanding == null || rec.understanding >= 0.65)) decision = 'skip';
    else if (m >= 0.5) decision = 'review';
    else decision = 'teach';
    return { id: concept.id, name: concept.name, depth, decision, mastery: m };
  });
}

/** Per-system aggregates for the dashboard (spec §52). */
export function systemSummary(graph, records, systems) {
  return systems.map((system) => {
    const concepts = graph.bySystem(system);
    const out = { system, total: concepts.length, rated: 0 };
    for (const d of DIMENSIONS) {
      let s = 0;
      let w = 0;
      for (const c of concepts) {
        const r = records.get(c.id);
        if (r?.[d] != null) {
          const wt = Math.min(r.n[d], MEMORY);
          s += r[d] * wt;
          w += wt;
        }
      }
      out[d] = w ? s / w : null;
    }
    out.rated = concepts.filter((c) => mastery(records.get(c.id)) != null).length;
    let s = 0;
    let n = 0;
    for (const c of concepts) {
      const m = mastery(records.get(c.id));
      if (m != null) {
        s += m;
        n++;
      }
    }
    out.mastery = n ? s / n : null;
    return out;
  });
}

/**
 * Prerequisite bottlenecks (spec §53): prerequisites that are not strong and sit
 * underneath one or more weak topics. Returns [{ concept, blocks: [weak concepts], chain }].
 */
export function bottlenecks(graph, records, limit = 6) {
  const weak = graph.all().filter((c) => ['review', 'critical'].includes(status(records.get(c.id))));
  const score = new Map();
  for (const w of weak)
    for (const { concept, depth } of graph.prerequisites(w.id, 2)) {
      const st = status(records.get(concept.id));
      if (st === 'strong') continue;
      const entry = score.get(concept.id) || { concept, blocks: [], score: 0 };
      entry.blocks.push(w);
      entry.score += (st === 'critical' ? 2 : st === 'review' ? 1.5 : 1) / depth;
      score.set(concept.id, entry);
    }
  return [...score.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => ({ ...e, chain: chainBetween(graph, e.blocks[0].id, e.concept.id) }));
}

function chainBetween(graph, fromId, toId) {
  const queue = [[fromId]];
  const seen = new Set([fromId]);
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === toId) return path.map((id) => graph.get(id).name);
    for (const p of graph.get(last)?.prereqs || [])
      if (!seen.has(p)) {
        seen.add(p);
        queue.push([...path, p]);
      }
  }
  return [graph.get(fromId).name, graph.get(toId).name];
}

/** Totals for the error-analysis panel. */
export function errorBreakdown(records) {
  const out = Object.fromEntries(Object.keys(ERROR_TYPES).map((k) => [k, 0]));
  for (const r of records.values()) for (const [k, v] of Object.entries(r.errorTypes || {})) if (k in out) out[k] += v;
  return out;
}
