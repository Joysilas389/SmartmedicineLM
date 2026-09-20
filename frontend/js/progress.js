/* Progress dashboard (spec §52), weakness map (§53) and study plan (§54). */
import { state, saveSettings } from './state.js';
import { db } from './store.js';
import { $, $$, escapeHtml, toast } from './ui.js';
import { graph, records, loadKnowledge } from './knowledge-store.js';
import { mastery, status, systemSummary, bottlenecks, errorBreakdown, ERROR_TYPES, STATUS_LABEL, DIMENSIONS } from './learner-model.js';
import { SYSTEMS } from './graph-seed.js';
import { forecast } from './srs.js';
import { buildPlan, PHASE_LABEL } from './study-plan.js';
import { composeAndSend } from './chat.js';

const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const bar = (v, cls = '') => `<span class="mbar ${cls}"><span style="width:${v == null ? 0 : Math.round(v * 100)}%"></span></span>`;
const dayFmt = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const DIM_LABEL = { understanding: 'Understanding', recall: 'Recall', application: 'Application' };

export async function renderProgress() {
  await loadKnowledge();
  const [attempts, cards, reviews] = await Promise.all([db.all('attempts'), db.all('flashcards'), db.all('reviews')]);
  const week = Date.now() - 7 * 86400000;
  const rated = graph.all().filter((c) => mastery(records.get(c.id)) != null);
  const overall = rated.length ? rated.reduce((a, c) => a + mastery(records.get(c.id)), 0) / rated.length : null;
  const dims = Object.fromEntries(
    DIMENSIONS.map((d) => {
      const vals = rated.map((c) => records.get(c.id)[d]).filter((v) => v != null);
      return [d, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null];
    })
  );
  const summary = systemSummary(graph, records, SYSTEMS);
  const groups = { strong: [], moderate: [], review: [], critical: [] };
  for (const c of rated) groups[status(records.get(c.id))]?.push(c);
  const bn = bottlenecks(graph, records, 5);
  const errs = Object.entries(errorBreakdown(records)).sort((a, b) => b[1] - a[1]);
  const errTotal = errs.reduce((a, [, n]) => a + n, 0);
  const fc = forecast(cards, 7);
  const qWeek = attempts.filter((a) => a.at >= week);
  const empty = !rated.length;

  $('#progressPage').innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">Progress</h2>
      <p class="page-sub">Your learner model: every concept is tracked for understanding, recall and application separately, because knowing a fact is not the same as using it.</p>
    </div></div>

    ${
      empty
        ? `<div class="note-box mb-4"><i class="bi bi-lightbulb me-2"></i>Nothing measured yet. Your map fills in as you <a href="#/learn">rate lessons</a>, <a href="#/questions">answer questions</a> and <a href="#/flashcards">review flashcards</a>.</div>`
        : ''
    }

    <section class="dash-hero">
      <div class="hero-main">
        <div class="small text-body-secondary">${escapeHtml(state.settings.studyPlan?.exam || 'USMLE Step 1')} · overall mastery</div>
        <div class="hero-num">${pct(overall)}</div>
        ${bar(overall, 'lg')}
        <div class="small text-body-secondary mt-1">Based on ${rated.length} of ${graph.size} concepts studied so far.</div>
      </div>
      <div class="hero-dims">${DIMENSIONS.map((d) => `<div class="dim"><span>${DIM_LABEL[d]}</span>${bar(dims[d], d)}<b>${pct(dims[d])}</b></div>`).join('')}</div>
    </section>

    <div class="stat-row">
      <div class="stat"><b>${qWeek.length}</b><span>questions this week</span></div>
      <div class="stat"><b>${qWeek.length ? Math.round((qWeek.filter((a) => a.correct).length / qWeek.length) * 100) + '%' : '–'}</b><span>correct this week</span></div>
      <div class="stat"><b>${reviews.filter((r) => r.at >= week).length}</b><span>cards reviewed this week</span></div>
      <div class="stat"><b>${fc[0]}</b><span>cards due today</span></div>
    </div>

    <h3 class="section-title">Systems</h3>
    <div class="table-responsive"><table class="table sys-table align-middle">
      <thead><tr><th>System</th><th>Mastery</th><th class="d-none d-md-table-cell">Understanding</th><th class="d-none d-md-table-cell">Recall</th><th class="d-none d-md-table-cell">Application</th><th class="text-end">Studied</th></tr></thead>
      <tbody>${summary
        .map(
          (s) => `<tr data-system="${escapeHtml(s.system)}" class="${s.rated ? '' : 'unrated'}">
          <td><a href="#/knowledge?system=${encodeURIComponent(s.system)}">${escapeHtml(s.system)}</a>
            <div class="d-md-none sys-mini">${DIMENSIONS.map((d) => `<span title="${DIM_LABEL[d]}">${DIM_LABEL[d][0]} ${pct(s[d])}</span>`).join('')}</div></td>
          <td class="w-bar">${bar(s.mastery)} <b>${pct(s.mastery)}</b></td>
          ${DIMENSIONS.map((d) => `<td class="d-none d-md-table-cell w-bar">${bar(s[d], d)} <span>${pct(s[d])}</span></td>`).join('')}
          <td class="text-end text-nowrap">${s.rated}/${s.total}</td></tr>`
        )
        .join('')}</tbody></table></div>

    <h3 class="section-title mt-4">Weakness map</h3>
    <div class="weak-map">${['critical', 'review', 'moderate', 'strong']
      .map(
        (k) => `<div class="wm-col st-${k}"><div class="wm-head">${STATUS_LABEL[k]} <span>${groups[k].length}</span></div>
          <div class="wm-body">${
            groups[k].length
              ? groups[k]
                  .sort((a, b) => mastery(records.get(a.id)) - mastery(records.get(b.id)))
                  .slice(0, 12)
                  .map((c) => `<a class="concept-chip st-${k}" href="#/knowledge/${c.id}">${escapeHtml(c.name)} <small>${pct(mastery(records.get(c.id)))}</small></a>`)
                  .join('')
              : '<span class="small text-body-secondary">None yet</span>'
          }</div></div>`
      )
      .join('')}</div>

    ${
      bn.length
        ? `<h3 class="section-title mt-4">Prerequisite bottlenecks</h3>
      <p class="small text-body-secondary">Foundations that sit underneath several topics you're struggling with. Fixing one of these often fixes the topics above it.</p>
      <div class="bn-list">${bn
        .map(
          (b) => `<div class="bn-row"><div class="bn-chain">${b.chain
            .map((n, i) => `<span class="${i === b.chain.length - 1 ? 'bn-root' : ''}">${escapeHtml(n)}</span>`)
            .join('<i class="bi bi-arrow-right"></i><small>requires</small><i class="bi bi-arrow-right"></i>')}</div>
          <div class="small text-body-secondary">Underlies ${b.blocks.length} weak topic${b.blocks.length === 1 ? '' : 's'}: ${b.blocks.map((x) => escapeHtml(x.name)).join(', ')}</div>
          <button class="btn btn-sm btn-outline-primary" data-teach="${escapeHtml(b.concept.name)}"><i class="bi bi-mortarboard me-1"></i>Teach ${escapeHtml(b.concept.name)}</button></div>`
        )
        .join('')}</div>`
        : ''
    }

    <div class="dash-2col mt-4">
      <section><h3 class="section-title">Error analysis</h3>
        ${
          errTotal
            ? `<div class="err-bars">${errs
                .map(([k, n]) => `<div class="eb-row"><span>${ERROR_TYPES[k].label}</span><span class="eb-bar"><span style="width:${(n / errs[0][1]) * 100}%"></span></span><b>${n}</b></div>`)
                .join('')}</div>
              <div class="note-box mt-2 small"><i class="bi bi-lightbulb me-1"></i>${errorAdvice(errs[0][0])}</div>`
            : '<p class="small text-body-secondary">Classify your missed questions and your most common error types will appear here.</p>'
        }</section>
      <section><h3 class="section-title">Review forecast</h3>
        <div class="forecast">${fc
          .map((n, i) => `<div class="fc-col"><span class="fc-bar" style="height:${Math.max(4, (n / Math.max(1, ...fc)) * 100)}%"></span><b>${n}</b><small>${i === 0 ? 'Today' : new Date(Date.now() + i * 86400000).toLocaleDateString(undefined, { weekday: 'short' })}</small></div>`)
          .join('')}</div></section>
    </div>

    <h3 class="section-title mt-4" id="plan">Study plan</h3>
    <div id="planBox"></div>`;

  $$('[data-teach]', $('#progressPage')).forEach((b) => b.addEventListener('click', () => composeAndSend(`Teach me ${b.dataset.teach} from absolute zero.`)));
  renderPlan(fc);
}

function errorAdvice(type) {
  return (
    {
      knowledge_gap: 'Most misses are things you had not learned yet. Prioritise first-pass lessons before doing more questions on those systems.',
      mechanism_gap: 'You often know facts without the mechanism. Use "Teach me … from absolute zero" and redraw the causal chain from memory before each block.',
      recognition_failure: 'You know the material but miss it in vignettes. Do more tutor-mode questions and read the "Clues in the stem" after each one.',
      misread_clue: 'Details in the stem are slipping past. Read the last sentence first, then the stem, and underline age, timing and labs.',
      differential_confusion: 'Similar conditions are getting mixed up. Study the "would be right if" notes: they are exactly the differences you need.',
      calculation_error: 'Your reasoning is right but the arithmetic is not. Write out formulas (anion gap, A–a gradient, clearance) step by step.',
      distractor_trap: 'Tempting options are pulling you away. Commit to an answer before reading the options, then check it against them.',
      recall_failure: 'You learned it but could not retrieve it. Keep up daily flashcards; they target exactly this.',
    }[type] || ''
  );
}

function renderPlan(fc) {
  const box = $('#planBox');
  const input = state.settings.studyPlan || {};
  const plan = input.examDate ? buildPlan(input, { graph, records, systems: SYSTEMS, dueForecast: fc }) : null;
  const form = `<form class="plan-form" id="planForm">
      <div><label class="form-label small" for="pExam">Exam</label><input class="form-control form-control-sm" id="pExam" value="${escapeHtml(input.exam || 'USMLE Step 1')}"></div>
      <div><label class="form-label small" for="pDate">Exam date</label><input type="date" class="form-control form-control-sm" id="pDate" value="${escapeHtml(input.examDate || '')}" required></div>
      <div><label class="form-label small" for="pHours">Hours per day</label><input type="number" class="form-control form-control-sm" id="pHours" min="0.5" max="16" step="0.5" value="${escapeHtml(String(input.hours || 4))}"></div>
      <div><label class="form-label small" for="pTarget">Finish first pass by <span class="text-body-secondary">(optional)</span></label><input type="date" class="form-control form-control-sm" id="pTarget" value="${escapeHtml(input.targetDate || '')}"></div>
      <div class="plan-go"><button class="btn btn-sm btn-primary" type="submit">${plan ? 'Update plan' : 'Create plan'}</button></div>
    </form>`;

  if (!plan || plan.error) {
    box.innerHTML = `${plan?.error ? `<div class="alert alert-warning py-2 small">${escapeHtml(plan.error)}</div>` : '<p class="small text-body-secondary">Tell SmartMedicineLM when your exam is and how much time you have. The plan adapts every day to what your learner model shows.</p>'}${form}`;
  } else {
    box.innerHTML = `
      <div class="plan-head">
        <div><b>${plan.daysLeft} days</b> to ${escapeHtml(plan.exam)} · ${plan.hours} h/day · now in <b>${PHASE_LABEL[plan.phase]}</b></div>
        <div class="phase-bar">
          <span class="ph-first" style="flex:${plan.phases.firstPass}" title="First pass: ${plan.phases.firstPass} days">First pass</span>
          ${plan.phases.consolidation ? `<span class="ph-cons" style="flex:${plan.phases.consolidation}" title="Consolidation: ${plan.phases.consolidation} days">Consolidation</span>` : ''}
          <span class="ph-final" style="flex:${Math.max(plan.phases.final, 3)}" title="Final review: ${plan.phases.final} days">Final</span>
        </div>
      </div>
      <div class="dash-2col">
        <section class="plan-today"><h4>Today</h4>
          ${plan.today
            .map(
              (t, i) => `<div class="task"><i class="bi ${{ learn: 'bi-mortarboard', questions: 'bi-ui-checks', flashcards: 'bi-stack', remediate: 'bi-bandaid' }[t.kind]}"></i>
              <div class="min-w-0"><div>${escapeHtml(t.text)}</div><small class="text-body-secondary">~${t.minutes} min</small></div>
              <button class="btn btn-sm btn-outline-primary ms-auto" data-task="${i}">Start</button></div>`
            )
            .join('')}
        </section>
        <section><h4>System rotation</h4>
          <div class="rotation">${plan.rotation
            .map((r) => `<div class="rot ${r.system === plan.current ? 'current' : ''}"><span>${escapeHtml(r.system)}</span><small>${dayFmt(r.start)}–${dayFmt(r.end - 86400000)} · ${r.days} d</small></div>`)
            .join('')}</div></section>
      </div>
      <details class="mt-3"><summary class="fw-semibold">Weekly plan (${plan.weeks.length} weeks)</summary>
        <div class="table-responsive mt-2"><table class="table table-sm align-middle week-table"><thead><tr><th>Week</th><th>Phase</th><th>Focus</th><th class="text-end">Questions</th><th class="text-end d-none d-sm-table-cell">Cards due</th></tr></thead><tbody>
        ${plan.weeks
          .map((w, i) => `<tr><td class="text-nowrap">${i + 1} · ${dayFmt(w.start)}</td><td>${PHASE_LABEL[w.phase]}</td><td>${w.focus.map(escapeHtml).join(', ')}</td><td class="text-end">${w.questions}</td><td class="text-end d-none d-sm-table-cell">${i === 0 ? w.reviewCards : '–'}</td></tr>`)
          .join('')}</tbody></table></div></details>
      <details class="mt-2"><summary class="small">Change plan settings</summary>${form}</details>`;

    $$('[data-task]', box).forEach((b) =>
      b.addEventListener('click', () => {
        const t = plan.today[Number(b.dataset.task)];
        if (t.kind === 'learn' || t.kind === 'remediate') composeAndSend(`Teach me ${t.concept} from absolute zero.`);
        else if (t.kind === 'flashcards') location.hash = '#/flashcards';
        else {
          const q = new URLSearchParams();
          if (t.system) q.set('system', t.system);
          if (t.weak) q.set('source', 'weak');
          q.set('count', String(t.count <= 5 ? 5 : t.count <= 10 ? 10 : 20));
          q.set('mode', t.mode);
          location.hash = `#/questions?${q}`;
        }
      })
    );
  }

  $('#planForm', box).addEventListener('submit', (e) => {
    e.preventDefault();
    const examDate = $('#pDate', box).value;
    if (!examDate) return toast('Choose your exam date.', 'warning');
    saveSettings({ studyPlan: { exam: $('#pExam', box).value.trim() || 'USMLE Step 1', examDate, hours: Number($('#pHours', box).value) || 4, targetDate: $('#pTarget', box).value || '' } });
    renderPlan(fc);
    toast('Study plan saved.', 'success', 2000);
  });
}
