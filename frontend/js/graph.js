/*
 * Knowledge graph + prerequisite engine (spec §29–31).
 * Pure logic (no DOM) so it runs in the browser and in node tests. Persistence of
 * learned concepts lives in knowledge-store.js.
 */
import { SEED, SYSTEMS, RELATION_TYPES } from './graph-seed.js';

export const norm = (s = '') =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9/+.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const slug = (s = '') => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'concept';

export function parseSeed(text = SEED) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const [system, name, aliases = '', prereqs = '', relations = ''] = line.split('|').map((p) => p.trim());
    if (!system || !name) continue;
    out.push({
      id: slug(name),
      name,
      system,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      prereqNames: prereqs.split(';').map((p) => p.trim()).filter(Boolean),
      relations: relations
        .split(';')
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => {
          const [type, ...rest] = r.split('>');
          return { type: type.trim(), target: rest.join('>').trim() };
        })
        .filter((r) => RELATION_TYPES.includes(r.type) && r.target),
      origin: 'seed',
    });
  }
  return out;
}

export class KnowledgeGraph {
  constructor(seedConcepts = parseSeed()) {
    this.concepts = new Map();
    this.phrases = new Map(); // normalised phrase -> concept id
    for (const c of seedConcepts) this.#insert({ ...c, prereqs: [] });
    // Resolve prerequisite names once every concept exists.
    for (const c of seedConcepts) {
      const node = this.concepts.get(c.id);
      node.prereqs = c.prereqNames.map((n) => this.find(n)?.id).filter((id) => id && id !== c.id);
    }
    this.#linkRelations();
  }

  #insert(c) {
    const node = {
      id: c.id,
      name: c.name,
      system: SYSTEMS.includes(c.system) ? c.system : 'Foundations',
      aliases: c.aliases || [],
      prereqs: c.prereqs || [],
      relations: c.relations || [],
      origin: c.origin || 'learned',
    };
    this.concepts.set(node.id, node);
    for (const p of [node.name, ...node.aliases]) {
      const k = norm(p);
      if (k && !this.phrases.has(k)) this.phrases.set(k, node.id);
    }
    return node;
  }

  #linkRelations() {
    for (const c of this.concepts.values())
      for (const r of c.relations) r.targetId = this.find(r.target)?.id || null;
  }

  get size() {
    return this.concepts.size;
  }

  get(id) {
    return this.concepts.get(id) || null;
  }

  all() {
    return [...this.concepts.values()];
  }

  bySystem(system) {
    return this.all().filter((c) => c.system === system);
  }

  /** Exact lookup by name or alias. */
  find(name) {
    const id = this.phrases.get(norm(name)) || this.phrases.get(norm(name).replace(/s$/, ''));
    return id ? this.concepts.get(id) : null;
  }

  /** Finds the concept a free-text request is about (longest whole-phrase match wins). */
  match(text) {
    const hay = ` ${norm(text)} `;
    let best = null;
    for (const [phrase, id] of this.phrases) {
      if (phrase.length < 2) continue;
      const i = hay.indexOf(` ${phrase} `) >= 0 ? hay.indexOf(` ${phrase} `) : hay.indexOf(` ${phrase}s `);
      if (i < 0) continue;
      if (!best || phrase.length > best.len) best = { id, len: phrase.length, pos: i };
    }
    return best ? this.concepts.get(best.id) : null;
  }

  /**
   * Prerequisite chain for a concept: [{ concept, depth }] ordered foundations-first,
   * limited to `maxDepth` levels, cycle-safe.
   */
  prerequisites(id, maxDepth = 3) {
    const seen = new Map();
    const visit = (cid, depth) => {
      if (depth > maxDepth) return;
      for (const p of this.get(cid)?.prereqs || []) {
        if (p === id) continue;
        if (!seen.has(p) || seen.get(p) > depth) {
          seen.set(p, depth);
          visit(p, depth + 1);
        }
      }
    };
    visit(id, 1);
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cid, depth]) => ({ concept: this.get(cid), depth }));
  }

  /** Concepts that list `id` as a direct prerequisite. */
  dependents(id) {
    return this.all().filter((c) => c.prereqs.includes(id));
  }

  /** All concepts that (transitively) depend on `id`. */
  downstream(id, maxDepth = 4) {
    const out = new Set();
    let frontier = [id];
    for (let d = 0; d < maxDepth && frontier.length; d++) {
      const next = [];
      for (const f of frontier)
        for (const dep of this.dependents(f))
          if (!out.has(dep.id) && dep.id !== id) {
            out.add(dep.id);
            next.push(dep.id);
          }
      frontier = next;
    }
    return [...out].map((cid) => this.get(cid));
  }

  /**
   * Merges a concept block produced by a lesson:
   *   { concept, system, prerequisites: [names], relations: [[type, target], ...] }
   * Unknown prerequisite names become new concepts in the same system.
   * Returns the concept node (or null if the block was unusable).
   */
  merge(block) {
    if (!block || typeof block.concept !== 'string') return null;
    const name = block.concept.trim().slice(0, 80);
    if (name.length < 3) return null;
    const system = SYSTEMS.includes(block.system) ? block.system : null;
    let node = this.find(name);
    if (!node) node = this.#insert({ id: this.#freeId(name), name, system: system || 'Foundations', origin: 'learned' });
    else if (system && node.origin === 'learned' && node.system === 'Foundations') node.system = system;

    for (const p of (Array.isArray(block.prerequisites) ? block.prerequisites : []).slice(0, 8)) {
      if (typeof p !== 'string' || p.trim().length < 3) continue;
      let pre = this.find(p);
      if (!pre) pre = this.#insert({ id: this.#freeId(p), name: p.trim().slice(0, 80), system: node.system, origin: 'learned' });
      if (pre.id !== node.id && !node.prereqs.includes(pre.id) && !this.#reaches(pre.id, node.id)) {
        node.prereqs.push(pre.id);
        node.dirty = true;
      }
    }
    for (const r of (Array.isArray(block.relations) ? block.relations : []).slice(0, 16)) {
      const [type, target] = Array.isArray(r) ? r : [r?.type, r?.target];
      if (!RELATION_TYPES.includes(type) || typeof target !== 'string' || !target.trim()) continue;
      const t = target.trim().slice(0, 100);
      if (node.relations.some((x) => x.type === type && norm(x.target) === norm(t))) continue;
      node.relations.push({ type, target: t, targetId: this.find(t)?.id || null, origin: 'learned' });
    }
    return node;
  }

  /** True when `from` already has `to` among its prerequisites (prevents cycles). */
  #reaches(from, to) {
    const stack = [from];
    const seen = new Set();
    while (stack.length) {
      const c = stack.pop();
      if (c === to) return true;
      if (seen.has(c)) continue;
      seen.add(c);
      stack.push(...(this.get(c)?.prereqs || []));
    }
    return false;
  }

  #freeId(name) {
    let id = slug(name);
    let i = 2;
    while (this.concepts.has(id)) id = `${slug(name)}-${i++}`;
    return id;
  }

  /** Serialisable state of everything that differs from the seed (for persistence). */
  learnedState() {
    const seedIds = new Set(parseSeed().map((c) => c.id));
    const out = [];
    for (const c of this.concepts.values()) {
      const learnedRel = c.relations.filter((r) => r.origin === 'learned');
      if (!seedIds.has(c.id) || learnedRel.length || c.dirty)
        out.push({ id: c.id, name: c.name, system: c.system, prereqs: c.prereqs, relations: learnedRel, seed: seedIds.has(c.id) });
    }
    return out;
  }

  /** Restores learnedState() records on top of the seed. */
  restore(records = []) {
    for (const r of records) {
      let node = this.get(r.id);
      if (!node) node = this.#insert({ id: r.id, name: r.name, system: r.system, origin: 'learned' });
      node.dirty = true;
      for (const p of r.prereqs || []) if (!node.prereqs.includes(p) && p !== node.id) node.prereqs.push(p);
      for (const rel of r.relations || [])
        if (!node.relations.some((x) => x.type === rel.type && norm(x.target) === norm(rel.target))) node.relations.push({ ...rel, origin: 'learned' });
    }
    for (const node of this.concepts.values()) node.prereqs = node.prereqs.filter((p) => this.concepts.has(p));
    this.#linkRelations();
  }
}

export const RELATION_LABEL = {
  causes: 'Causes',
  caused_by: 'Caused by',
  inhibits: 'Inhibits',
  activates: 'Activates',
  associated_with: 'Associated with',
  presents_with: 'Presents with',
  diagnosed_by: 'Diagnosed by',
  treated_by: 'Treated by',
  differential_of: 'Differential of',
};
