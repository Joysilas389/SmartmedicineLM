/*
 * Spaced repetition (spec §38). Two interchangeable schedulers with one interface:
 *   scheduler.next(card, grade, now) -> updated card      grade: 1 Again, 2 Hard, 3 Good, 4 Easy
 *   scheduler.preview(card, grade, now) -> "10 min" | "4 d"
 * FSRS (default) tracks difficulty, stability and retrievability per card, as the spec asks.
 * SM-2 is kept for comparison and for anyone who prefers it.
 */

export const DAY = 86400000;
const MIN = 60000;
export const GRADES = [
  { grade: 1, key: 'again', label: 'Again' },
  { grade: 2, key: 'hard', label: 'Hard' },
  { grade: 3, key: 'good', label: 'Good' },
  { grade: 4, key: 'easy', label: 'Easy' },
];

/* ------------------------------ FSRS (v4.5 parameters) ------------------------------ */
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const clampD = (d) => Math.min(10, Math.max(1, d));

export function retrievability(card, now = Date.now()) {
  if (!card.stability || card.lastReview == null) return null;
  const t = Math.max(0, (now - card.lastReview) / DAY);
  return Math.pow(1 + (FACTOR * t) / card.stability, DECAY);
}

function intervalDays(stability, retention) {
  const days = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(36500, Math.max(1, Math.round(days)));
}

const initDifficulty = (g) => clampD(W[4] - (g - 3) * W[5]);

/** Converts an SM-2 card (Phase 1) into FSRS state the first time FSRS sees it. */
export function migrateCard(card) {
  if (card.stability != null) return card;
  const c = { ...card };
  if (!c.reps && !c.lastReview) {
    c.state = 'new';
    return c;
  }
  c.stability = Math.max(0.5, c.interval || 1);
  c.difficulty = clampD(5 + (2.5 - (c.ease || 2.5)) * 3.3);
  c.state = 'review';
  return c;
}

export const FSRS = {
  id: 'fsrs',
  name: 'FSRS',
  retention: 0.9,
  next(input, grade, now = Date.now()) {
    const c = migrateCard({ ...input });
    const good = grade >= 2;
    if (c.state === 'new' || c.stability == null) {
      c.stability = W[grade - 1];
      c.difficulty = initDifficulty(grade);
    } else {
      const R = retrievability(c, now) ?? 1;
      const D = c.difficulty;
      const S = c.stability;
      if (!good) {
        c.stability = Math.min(S, W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
      } else {
        const hard = grade === 2 ? W[15] : 1;
        const easy = grade === 4 ? W[16] : 1;
        c.stability = S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * hard * easy);
      }
      const d1 = D - W[6] * (grade - 3);
      c.difficulty = clampD(W[7] * initDifficulty(4) + (1 - W[7]) * d1);
    }
    if (good) {
      c.state = 'review';
      c.interval = intervalDays(c.stability, this.retention);
      c.due = now + c.interval * DAY;
      c.successes = (c.successes || 0) + 1;
      c.reps = (c.reps || 0) + 1;
    } else {
      c.state = c.state === 'new' ? 'learning' : 'relearning';
      c.interval = 0;
      c.due = now + 10 * MIN;
      c.failures = (c.failures || 0) + 1;
      c.lapses = (c.lapses || 0) + (c.state === 'relearning' ? 1 : 0);
    }
    c.lastReview = now;
    return c;
  },
  preview(card, grade, now = Date.now()) {
    return formatWait(this.next(card, grade, now).due - now);
  },
};

/* ------------------------------ SM-2 ------------------------------ */
const Q = { 1: 0, 2: 3, 3: 4, 4: 5 };
export const SM2 = {
  id: 'sm2',
  name: 'SM-2',
  next(card, grade, now = Date.now()) {
    const q = Q[grade];
    const c = { ...card };
    if (q < 3) {
      c.reps = 0;
      c.interval = 0;
      c.lapses = (c.lapses || 0) + 1;
      c.failures = (c.failures || 0) + 1;
      c.ease = Math.max(1.3, (c.ease || 2.5) - 0.2);
      c.due = now + 10 * MIN;
    } else {
      c.reps = (c.reps || 0) + 1;
      c.successes = (c.successes || 0) + 1;
      const mult = q === 3 ? 0.8 : q === 5 ? 1.3 : 1;
      c.interval = c.reps === 1 ? 1 : c.reps === 2 ? (q === 5 ? 4 : 3) : Math.max(1, Math.round((c.interval || 1) * (c.ease || 2.5) * mult));
      c.ease = Math.max(1.3, (c.ease || 2.5) + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      c.due = now + c.interval * DAY;
    }
    c.lastReview = now;
    return c;
  },
  preview(card, grade, now = Date.now()) {
    return formatWait(this.next(card, grade, now).due - now);
  },
};

export const SCHEDULERS = { fsrs: FSRS, sm2: SM2 };
export const getScheduler = (id) => SCHEDULERS[id] || FSRS;

export function formatWait(ms) {
  if (ms < DAY) return `${Math.max(1, Math.round(ms / MIN))} min`;
  const d = Math.round(ms / DAY);
  if (d < 45) return `${d} d`;
  if (d < 365) return `${Math.round(d / 30)} mo`;
  return `${(d / 365).toFixed(1)} y`;
}

/** Cards due per day for the next `days` days (review forecast for the study plan). */
export function forecast(cards, days = 7, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const out = Array.from({ length: days }, () => 0);
  for (const c of cards) {
    const idx = Math.floor((Math.max(c.due || now, start.getTime()) - start.getTime()) / DAY);
    if (idx >= 0 && idx < days) out[idx]++;
  }
  return out;
}
