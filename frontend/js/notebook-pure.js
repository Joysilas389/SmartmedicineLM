/* Pure helpers used by the notebook, progress, knowledge, flashcards and search pages. They have
   no DOM dependencies, so the exact code the pages run is also tested in node. */
export function buildCloze(context, phrase) {
  const flat = (t) => t.replace(/\s+/g, ' ').trim();
  const ctx = flat(context);
  const p = flat(phrase);
  if (!p) return null;
  const at = ctx.toLowerCase().indexOf(p.toLowerCase());
  if (at < 0) return { q: `Fill in the blank: _____ (${p.split(' ').length} word${p.split(' ').length === 1 ? '' : 's'})`, a: p };
  const prev = ctx.lastIndexOf('. ', at);
  const startSent = prev < 0 ? 0 : prev + 2;
  let end = ctx.indexOf('. ', at + p.length);
  end = end < 0 ? ctx.length : end + 1;
  const sentence = ctx.slice(startSent, end).trim();
  const q = sentence.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____');
  return { q: `Fill in the blank: ${q}`, a: `${p}\n\n${sentence}` };
}

export function fitLine(points) {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx < 1e-6) return null;
  const slope = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
  const intercept = my - slope * mx;
  const resid = Math.sqrt(points.reduce((a, p) => a + (p.y - (intercept + slope * p.x)) ** 2, 0) / Math.max(1, n - 2));
  return { slope, intercept, resid, predict: (x) => intercept + slope * x };
}

export function mapQuizItems(c, g, rand = Math.random) {
  const items = [];
  for (const p of c.prereqs.slice(0, 4)) items.push({ label: g.get(p)?.name, answer: 'prereq' });
  for (const d of g.dependents(c.id).slice(0, 3)) items.push({ label: d.name, answer: 'dependent' });
  for (const r of c.relations.slice(0, 6)) if (['causes', 'presents_with', 'diagnosed_by', 'treated_by', 'differential_of'].includes(r.type)) items.push({ label: r.target, answer: r.type });
  const near = new Set([c.id, ...c.prereqs, ...g.dependents(c.id).map((d) => d.id)]);
  const others = g.all().filter((x) => !near.has(x.id) && x.system !== c.system);
  for (let i = 0; i < 2 && others.length; i++) items.push({ label: others.splice(Math.floor(rand() * others.length), 1)[0].name, answer: 'none' });
  return items.filter((i) => i.label).sort(() => rand() - 0.5);
}

export function interleave(cards) {
  const byDeck = new Map();
  for (const c of cards) {
    const k = c.deck || '';
    if (!byDeck.has(k)) byDeck.set(k, []);
    byDeck.get(k).push(c);
  }
  const queues = [...byDeck.values()];
  const out = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
  return out;
}

export function scoreText(text = '', terms) {
  const t = text.toLowerCase();
  let score = 0;
  for (const term of terms) if (t.includes(term)) score += 1 + (t.split(term).length - 2) * 0.1;
  return terms.every((term) => t.includes(term)) ? score + terms.length : score > 0 ? score * 0.3 : 0;
}
