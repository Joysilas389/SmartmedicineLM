/*
 * Study plan (spec §54): daily plan, weekly plan, system rotation, question/review/flashcard
 * schedule and weak-area remediation, recomputed from the learner model every time, so the
 * plan adapts as mastery changes. Pure logic.
 */
import { mastery, status } from './learner-model.js';

const DAY = 86400000;
const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * input: { exam, examDate: 'YYYY-MM-DD', hours, targetDate?: 'YYYY-MM-DD' }
 * ctx:   { graph, records, systems, dueForecast: number[], now }
 */
export function buildPlan(input, { graph, records, systems, dueForecast = [], now = Date.now() }) {
  const today = startOfDay(now);
  const exam = input?.examDate ? startOfDay(new Date(input.examDate + 'T00:00:00').getTime()) : NaN;
  if (!Number.isFinite(exam)) return { error: 'Set your exam date.' };
  const daysLeft = Math.round((exam - today) / DAY);
  if (daysLeft < 1) return { error: 'The exam date must be in the future.' };
  const hours = Math.min(16, Math.max(0.5, Number(input.hours) || 4));

  // Phase boundaries: first pass (content), consolidation (mixed + weak areas), final review.
  const finalDays = Math.min(7, Math.max(1, Math.round(daysLeft * 0.15)));
  let passEnd = input.targetDate ? startOfDay(new Date(input.targetDate + 'T00:00:00').getTime()) : NaN;
  if (!Number.isFinite(passEnd) || passEnd <= today || passEnd > exam - finalDays * DAY) passEnd = today + Math.max(1, Math.round((daysLeft - finalDays) * 0.7)) * DAY;
  const passDays = Math.max(1, Math.round((passEnd - today) / DAY));
  const consolidationDays = Math.max(0, daysLeft - passDays - finalDays);

  // System rotation: weaker and larger systems get more days. Unrated systems count as 50%.
  const sys = systems.map((name) => {
    const concepts = graph.bySystem(name);
    const ms = concepts.map((c) => mastery(records.get(c.id))).filter((m) => m != null);
    const m = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
    const need = (1 - (m ?? 0.5)) * Math.sqrt(concepts.length || 1);
    return { name, mastery: m, concepts, need };
  });
  const foundations = sys.find((s) => s.name === 'Foundations');
  const rest = sys.filter((s) => s !== foundations).sort((a, b) => b.need - a.need);
  const order = foundations && (foundations.mastery ?? 0) < 0.8 ? [foundations, ...rest] : rest;
  const totalNeed = order.reduce((a, s) => a + s.need, 0) || 1;
  let cursor = today;
  const rotation = order.map((s, i) => {
    const days = i === order.length - 1 ? Math.max(1, Math.round((passEnd - cursor) / DAY)) : Math.max(1, Math.round((passDays * s.need) / totalNeed));
    const start = cursor;
    cursor = Math.min(passEnd, cursor + days * DAY);
    return { system: s.name, mastery: s.mastery, start, end: Math.max(start + DAY, cursor), days };
  });

  // Daily time split. Questions ≈ 1.5 min each + review time; flashcards ≈ 20 s per card.
  const minutes = Math.round(hours * 60);
  const dueToday = dueForecast[0] || 0;
  const cardMin = Math.min(Math.round(minutes * 0.3), Math.max(10, Math.round(dueToday * 0.35)));
  const phaseOf = (t) => (t < passEnd ? 'first-pass' : t < exam - finalDays * DAY ? 'consolidation' : 'final');
  const split = (phase) => {
    const left = minutes - cardMin;
    const share = phase === 'first-pass' ? [0.55, 0.45] : phase === 'consolidation' ? [0.25, 0.75] : [0.1, 0.9];
    const learn = Math.round(left * share[0]);
    const qMin = left - learn;
    return { learn, questions: Math.max(5, Math.round(qMin / 2.5)), questionMinutes: qMin, flashcards: cardMin };
  };

  const current = rotation.find((r) => today >= r.start && today < r.end) || rotation[0];
  const phase = phaseOf(today);
  const s = split(phase);

  // Today's concrete tasks.
  const inSystem = graph.bySystem(current.system);
  const nextConcept =
    inSystem.find((c) => mastery(records.get(c.id)) == null && c.prereqs.every((p) => (mastery(records.get(p)) ?? 0) >= 0.5 || !inSystem.some((x) => x.id === p))) ||
    inSystem.find((c) => mastery(records.get(c.id)) == null) ||
    inSystem.slice().sort((a, b) => (mastery(records.get(a.id)) ?? 1) - (mastery(records.get(b.id)) ?? 1))[0];
  const weakest = graph
    .all()
    .filter((c) => ['critical', 'review'].includes(status(records.get(c.id))))
    .sort((a, b) => mastery(records.get(a.id)) - mastery(records.get(b.id)))
    .slice(0, 3);

  const today_tasks = [];
  if (phase === 'first-pass' && nextConcept)
    today_tasks.push({ kind: 'learn', minutes: s.learn, text: `Learn ${nextConcept.name} from zero`, concept: nextConcept.name });
  if (phase !== 'first-pass' && weakest[0]) today_tasks.push({ kind: 'learn', minutes: s.learn, text: `Re-learn your weakest concept: ${weakest[0].name}`, concept: weakest[0].name });
  today_tasks.push({
    kind: 'questions',
    minutes: s.questionMinutes,
    text: phase === 'first-pass' ? `${s.questions} ${current.system} questions (tutor mode)` : phase === 'consolidation' ? `${s.questions} mixed questions, weak areas first` : `${s.questions} questions as timed blocks`,
    system: phase === 'first-pass' ? current.system : '',
    count: s.questions,
    mode: phase === 'final' ? 'exam' : 'tutor',
    weak: phase !== 'first-pass',
  });
  today_tasks.push({ kind: 'flashcards', minutes: s.flashcards, text: dueToday ? `Review ${dueToday} due flashcards` : 'No flashcards due: add cards from a lesson' });
  if (weakest.length && phase === 'first-pass')
    today_tasks.push({ kind: 'remediate', minutes: 15, text: `Weak-area remediation: ${weakest.map((w) => w.name).join(', ')}`, concept: weakest[0].name });

  // Weekly plan.
  const weeks = [];
  for (let w = 0; w * 7 < daysLeft && w < 26; w++) {
    const ws = today + w * 7 * DAY;
    const we = Math.min(exam, ws + 7 * DAY);
    const focus = rotation.filter((r) => r.start < we && r.end > ws).map((r) => r.system);
    const ph = phaseOf(ws);
    const days = Math.round((we - ws) / DAY);
    const sp = split(ph);
    weeks.push({
      start: ws,
      end: we - DAY,
      phase: ph,
      focus: ph === 'first-pass' ? focus : ph === 'consolidation' ? ['Mixed systems', 'Weak areas'] : ['Timed mixed blocks', 'Final review'],
      questions: sp.questions * days,
      reviewCards: dueForecast.slice(w * 7, w * 7 + 7).reduce((a, b) => a + b, 0),
    });
  }

  return {
    exam: input.exam || 'USMLE Step 1',
    daysLeft,
    hours,
    phase,
    phases: { firstPass: passDays, consolidation: consolidationDays, final: finalDays, passEnd, examDate: exam },
    current: current.system,
    rotation,
    today: today_tasks,
    weeks,
    daily: s,
  };
}

export const PHASE_LABEL = { 'first-pass': 'First pass', consolidation: 'Consolidation', final: 'Final review' };
