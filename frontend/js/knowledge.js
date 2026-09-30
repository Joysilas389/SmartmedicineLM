/* Knowledge explorer (spec §30): browse the concept graph with the learner's mastery overlaid. */
import { $, $$, escapeHtml, formatDate } from './ui.js';
import { graph, records, loadKnowledge } from './knowledge-store.js';
import { mastery, status, STATUS_LABEL, ERROR_TYPES, DIMENSIONS } from './learner-model.js';
import { RELATION_LABEL } from './graph.js';
import { SYSTEMS } from './graph-seed.js';
import { renderMessage } from './render.js';
import { composeAndSend, startExplainBack } from './chat.js';
import { recordEvidence } from './knowledge-store.js';
import { mapQuizItems as mapItems } from './notebook-pure.js';
const mapQuizItems = (c) => mapItems(c, graph);

const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
let filter = { system: '', q: '' };

export async function renderKnowledge(id, params = {}) {
  await loadKnowledge();
  if (params.system !== undefined) filter.system = SYSTEMS.includes(params.system) ? params.system : '';
  if (id && graph.get(id)) return renderConcept(graph.get(id));
  return renderIndex();
}

function renderIndex() {
  const learned = graph.all().filter((c) => c.origin === 'learned').length;
  const relations = graph.all().reduce((a, c) => a + c.relations.length + c.prereqs.length, 0);
  $('#knowledgePage').innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">Knowledge</h2>
      <p class="page-sub">The concept graph behind your lessons: ${graph.size} concepts and ${relations} links (prerequisites, causes, presentations, tests, treatments). Colours show your mastery. It grows as you learn: ${learned} concept${learned === 1 ? '' : 's'} added from your lessons and questions so far.</p>
    </div></div>
    <div class="kn-tools">
      <div class="search-wrap flex-grow-1"><i class="bi bi-search"></i><input type="search" class="form-control form-control-sm" id="knSearch" placeholder="Search concepts" value="${escapeHtml(filter.q)}" aria-label="Search concepts"></div>
      <select class="form-select form-select-sm" id="knSystem" aria-label="System"><option value="">All systems</option>${SYSTEMS.map((s) => `<option ${filter.system === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select>
    </div>
    <div class="legend small">${['strong', 'moderate', 'review', 'critical', 'unrated'].map((k) => `<span><i class="dot st-${k}"></i>${STATUS_LABEL[k]}</span>`).join('')}</div>
    <div id="knList"></div>`;
  const draw = () => {
    const q = filter.q.trim().toLowerCase();
    const systems = filter.system ? [filter.system] : SYSTEMS;
    $('#knList').innerHTML = systems
      .map((s) => {
        const items = graph
          .bySystem(s)
          .filter((c) => !q || c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.includes(q)))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!items.length) return '';
        return `<h3 class="section-title mt-3">${escapeHtml(s)} <small class="text-body-secondary fw-normal">${items.length}</small></h3>
          <div class="kn-grid">${items
            .map((c) => {
              const r = records.get(c.id);
              const st = status(r);
              return `<a class="kn-card" href="#/knowledge/${c.id}"><i class="dot st-${st}"></i><span class="min-w-0"><b class="text-truncate d-block">${escapeHtml(c.name)}</b>
                <small class="text-body-secondary">${mastery(r) == null ? STATUS_LABEL.unrated : `${pct(mastery(r))} · ${STATUS_LABEL[st]}`}${c.origin === 'learned' ? ' · <i class="bi bi-stars"></i> learned' : ''}</small></span></a>`;
            })
            .join('')}</div>`;
      })
      .join('') || '<p class="text-body-secondary mt-3">No concepts match.</p>';
  };
  draw();
  $('#knSearch').addEventListener('input', (e) => {
    filter.q = e.target.value;
    draw();
  });
  $('#knSystem').addEventListener('change', (e) => {
    filter.system = e.target.value;
    draw();
  });
}

async function renderConcept(c) {
  const r = records.get(c.id);
  const st = status(r);
  const prereqs = graph.prerequisites(c.id, 2);
  const deps = graph.dependents(c.id);
  const rels = {};
  for (const x of c.relations) (rels[x.type] ||= []).push(x);
  const link = (id, name) => {
    const s = status(records.get(id));
    return `<a class="concept-chip st-${s}" href="#/knowledge/${id}">${escapeHtml(name)}</a>`;
  };

  $('#knowledgePage').innerHTML = `
    <div class="q-top"><div class="q-top-left"><a class="btn btn-icon" href="#/knowledge" aria-label="All concepts"><i class="bi bi-arrow-left"></i></a><span class="text-body-secondary small">${escapeHtml(c.system)}</span></div></div>
    <div class="kn-head">
      <div><h2 class="page-title mb-1">${escapeHtml(c.name)}</h2>
        <span class="status-pill st-${st}">${STATUS_LABEL[st]}${mastery(r) != null ? ` · ${pct(mastery(r))}` : ''}</span>
        ${c.aliases.length ? `<div class="small text-body-secondary mt-2">Also: ${c.aliases.slice(0, 6).map(escapeHtml).join(', ')}</div>` : ''}</div>
      <div class="kn-actions">
        <button class="btn btn-primary btn-sm" data-k="teach"><i class="bi bi-mortarboard me-1"></i>Teach me</button>
        <a class="btn btn-outline-primary btn-sm" href="#/questions?concept=${encodeURIComponent(c.name)}"><i class="bi bi-ui-checks me-1"></i>Quiz me</a>
        <button class="btn btn-outline-secondary btn-sm" data-k="review"><i class="bi bi-lightning me-1"></i>2-minute review</button>
        <button class="btn btn-outline-secondary btn-sm" data-k="explain"><i class="bi bi-chat-square-quote me-1"></i>Explain it back</button>
        <button class="btn btn-outline-secondary btn-sm" data-k="map"><i class="bi bi-diagram-3 me-1"></i>Map it yourself</button>
      </div>
    </div>

    <div class="dash-2col mt-3">
      <section class="kn-box"><h4>Your mastery</h4>
        ${DIMENSIONS.map(
          (d) => `<div class="dim"><span>${d[0].toUpperCase() + d.slice(1)}</span><span class="mbar ${d}"><span style="width:${r?.[d] == null ? 0 : Math.round(r[d] * 100)}%"></span></span><b>${pct(r?.[d])}</b><small class="text-body-secondary">${r?.n?.[d] || 0}×</small></div>`
        ).join('')}
        <div class="small text-body-secondary mt-2">
          ${r?.attempts ? `${r.correct}/${r.attempts} questions correct · ` : ''}${r?.confidence != null ? `confidence calibration ${pct(r.confidence)} · ` : ''}${r?.lastReviewed ? `last studied ${formatDate(r.lastReviewed)}` : 'not studied yet'}${r?.nextReview ? ` · next card review ${formatDate(r.nextReview)}` : ''}
        </div>
        ${
          r?.errors
            ? `<div class="mt-2 small"><b>Errors:</b> ${Object.entries(r.errorTypes)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => `${ERROR_TYPES[k]?.label || k} ×${n}`)
                .join(', ')}</div>`
            : ''
        }
      </section>
      <section class="kn-box"><h4>Map</h4><div class="prose" id="knDiagram"></div></section>
    </div>

    <section class="kn-box mt-3"><h4>Needs first (prerequisites)</h4>
      ${prereqs.length ? `<div class="chip-row">${prereqs.map((p) => link(p.concept.id, p.concept.name)).join('')}</div>` : '<p class="small text-body-secondary mb-0">No prerequisites recorded.</p>'}
      ${deps.length ? `<h4 class="mt-3">Needed for</h4><div class="chip-row">${deps.map((d) => link(d.id, d.name)).join('')}</div>` : ''}
    </section>

    ${
      Object.keys(rels).length
        ? `<section class="kn-box mt-3"><h4>Relationships</h4><dl class="rel-list">${Object.entries(rels)
            .map(
              ([type, list]) => `<dt>${RELATION_LABEL[type] || type}</dt><dd>${list
                .map((x) => (x.targetId ? link(x.targetId, x.target) : `<span class="rel-text">${escapeHtml(x.target)}</span>`))
                .join('')}</dd>`
            )
            .join('')}</dl></section>`
        : ''
    }`;

  $('[data-k="teach"]').addEventListener('click', () => composeAndSend(`Teach me ${c.name} from absolute zero.`));
  $('[data-k="review"]').addEventListener('click', () => composeAndSend(`Give me a 2-minute review of ${c.name}.`));
  $('[data-k="explain"]').addEventListener('click', () => startExplainBack(c.name));
  $('[data-k="map"]').addEventListener('click', () => mapQuiz(c));
  await renderMessage($('#knDiagram'), '```mermaid\n' + conceptDiagram(c, prereqs, deps) + '\n```', { final: true });
  $('#knDiagram').addEventListener('diagram:node', (e) => {
    const hit = graph.find(e.detail.label) || graph.match(e.detail.label);
    if (hit && hit.id !== c.id) location.hash = `#/knowledge/${hit.id}`;
    else if (!hit) composeAndSend(`Explain ${e.detail.label} in the context of ${c.name}.`);
  });
}

const label = (s) => String(s).replace(/["[\]{}()<>|#;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

function conceptDiagram(c, prereqs, deps) {
  const lines = ['flowchart TD'];
  const direct = prereqs.filter((p) => p.depth === 1).slice(0, 4);
  direct.forEach((p, i) => lines.push(`P${i}["${label(p.concept.name)}"] --> C["${label(c.name)}"]`));
  if (!direct.length) lines.push(`C["${label(c.name)}"]`);
  deps.slice(0, 3).forEach((d, i) => lines.push(`C --> D${i}["${label(d.name)}"]`));
  c.relations
    .filter((r) => ['causes', 'presents_with'].includes(r.type))
    .slice(0, 3)
    .forEach((r, i) => lines.push(`C -. "${r.type === 'causes' ? 'causes' : 'presents with'}" .-> R${i}["${label(r.target)}"]`));
  lines.push('class C mechanism');
  const weak = direct.map((p, i) => [p, i]).filter(([p]) => ['review', 'critical'].includes(status(records.get(p.concept.id))));
  if (weak.length) lines.push(`class ${weak.map(([, i]) => `P${i}`).join(',')} pathology`);
  const strong = direct.map((p, i) => [p, i]).filter(([p]) => status(records.get(p.concept.id)) === 'strong');
  if (strong.length) lines.push(`class ${strong.map(([, i]) => `P${i}`).join(',')} normal`);
  return lines.join('\n');
}

/* ---------------- "Map it yourself": rebuild the concept's links from memory ---------------- */
const MAP_CHOICES = [
  ['prereq', 'Needed first (prerequisite)'],
  ['dependent', 'Builds on it'],
  ['causes', 'It causes / leads to'],
  ['presents_with', 'It presents with'],
  ['diagnosed_by', 'Diagnosed by'],
  ['treated_by', 'Treated by'],
  ['differential_of', 'Differential'],
  ['none', 'Not directly related'],
];

function mapQuiz(c) {
  const items = mapQuizItems(c);
  const box = document.createElement('section');
  box.className = 'kn-box mt-3';
  box.id = 'mapQuiz';
  document.getElementById('mapQuiz')?.remove();
  box.innerHTML = `<h4><i class="bi bi-diagram-3 me-1"></i>Map ${escapeHtml(c.name)} from memory</h4>
    <p class="small text-body-secondary">For each item, choose how it relates to ${escapeHtml(c.name)}. Some are unrelated on purpose.</p>
    ${items.map((it, i) => `<div class="map-row"><span>${escapeHtml(it.label)}</span><select class="form-select form-select-sm" data-map="${i}"><option value="">Choose…</option>${MAP_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>`).join('')}
    <button class="btn btn-primary btn-sm mt-2" id="mapCheck">Check my map</button><div id="mapResult" class="mt-2"></div>`;
  document.querySelector('.kn-head').after(box);
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('mapCheck').addEventListener('click', () => {
    let right = 0;
    box.querySelectorAll('[data-map]').forEach((sel) => {
      const it = items[Number(sel.dataset.map)];
      const ok = sel.value === it.answer;
      if (ok) right++;
      sel.classList.toggle('is-valid', ok);
      sel.classList.toggle('is-invalid', !ok);
      const row = sel.closest('.map-row');
      row.querySelector('.map-fix')?.remove();
      if (!ok) row.insertAdjacentHTML('beforeend', `<small class="map-fix">${MAP_CHOICES.find(([k]) => k === it.answer)[1]}</small>`);
    });
    const score = items.length ? right / items.length : 0;
    document.getElementById('mapResult').innerHTML = `<div class="verdict ${score >= 0.8 ? 'ok' : 'bad'}"><i class="bi ${score >= 0.8 ? 'bi-check-circle-fill' : 'bi-diagram-3'}"></i><div><b>${right} of ${items.length} links right</b><div class="small">${score >= 0.8 ? 'You can reconstruct how this concept connects.' : 'Compare with the map above, then try again tomorrow.'}</div></div></div>`;
    recordEvidence({ id: c.id, name: c.name }, { kind: 'lesson', rating: score >= 0.8 ? 'got' : score >= 0.5 ? 'partly' : 'lost' }).catch(() => {});
  });
}
