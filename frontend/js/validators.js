/*
 * Response validators (spec §45), Phase 1 subset running in the browser:
 *  - Mermaid validator: parse → repair simple syntax errors → re-parse → fallback to code
 *  - Citation validator: flags [S#] tags that don't match a retrieved source (hallucinated references)
 * Medical-consistency and teaching-policy validators are planned server-side.
 */

export const CLASS_DEFS = [
  'classDef pathology fill:#fde8e8,stroke:#b3261e,color:#4a0f0b',
  'classDef mechanism fill:#ece7fb,stroke:#4a3f8f,color:#241c52',
  'classDef compensation fill:#fdf1d8,stroke:#b7790d,color:#4d3300',
  'classDef normal fill:#e3f3e8,stroke:#2e7d52,color:#113a22',
];

const HEADER = /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|mindmap|timeline|journey)\b/;
const OWN_DEFS = /^\s*classDef\s+(pathology|mechanism|compensation|normal)\b/;

export function withClassDefs(src) {
  const lines = src.replace(/\r/g, '').split('\n').filter((l) => !OWN_DEFS.test(l));
  const isFlow = lines.some((l) => /^\s*(flowchart|graph)\b/.test(l));
  return isFlow ? [...lines, ...CLASS_DEFS.map((d) => '  ' + d)].join('\n') : lines.join('\n');
}

const q = (label) => label.trim().replace(/"/g, "'");

/** Repairs the most common LLM Mermaid mistakes. Only used after the original fails to parse. */
export function repairMermaid(src) {
  let lines = src.replace(/\r/g, '').split('\n').filter((l) => !OWN_DEFS.test(l));
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return src;
  if (!HEADER.test(lines[first])) lines.splice(first, 0, 'flowchart TD');
  lines = lines.map((l) => {
    if (/^\s*(%%|class\s|classDef|style\s|linkStyle|subgraph|end\s*$|flowchart|graph|direction)/.test(l)) return l.replace(/;+\s*$/, '');
    return l
      .replace(/;+\s*$/, '')
      .replace(/\s*(→|⟶|->(?!>))\s*/g, ' --> ')
      .replace(/-{3,}>/g, '-->')
      .replace(/\b([A-Za-z][A-Za-z0-9_]*)\[(?!["\[(])([^\[\]]*?)\](?!\])/g, (_, id, label) => `${id}["${q(label)}"]`)
      .replace(/\b([A-Za-z][A-Za-z0-9_]*)\{(?![{"])([^{}]*?)\}(?!\})/g, (_, id, label) => `${id}{"${q(label)}"}`)
      .replace(/\b([A-Za-z][A-Za-z0-9_]*)\((?![("[])([^()]*?)\)(?!\))/g, (_, id, label) => `${id}("${q(label)}")`)
      .replace(/\|(?!")([^|]+?)\|/g, (_, t) => `|"${q(t)}"|`);
  });
  return lines.join('\n');
}

async function parses(src) {
  try {
    await window.mermaid.parse(src);
    return true;
  } catch {
    return false;
  }
}

/** Returns { ok, source, repaired } — the first version of the diagram that parses. */
export async function validateMermaid(code) {
  if (!window.mermaid) return { ok: false, source: code, repaired: false };
  const original = withClassDefs(code);
  if (await parses(original)) return { ok: true, source: original, repaired: false };
  const fixed = withClassDefs(repairMermaid(code));
  if (await parses(fixed)) return { ok: true, source: fixed, repaired: true };
  return { ok: false, source: code, repaired: false };
}

/** Splits cited tags into those backed by retrieved sources and those that aren't. */
export function checkCitations(tags, sources = []) {
  const known = new Set(sources.map((s) => s.tag));
  const valid = [];
  const invalid = [];
  for (const t of new Set(tags)) (known.has(t) ? valid : invalid).push(t);
  return { valid, invalid };
}
