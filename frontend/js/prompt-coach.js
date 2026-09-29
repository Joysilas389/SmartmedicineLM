/*
 * Prompt coach. Looks at what the learner has typed or pasted, works out what kind of thing
 * it is (a topic, a passage from a book, a question vignette, lab values, a question), and
 * proposes the prompts most likely to produce real understanding of that input. Uses the
 * knowledge graph to make topic prompts specific: the right differential to compare with,
 * the prerequisites, the classic finding to explain.
 *
 * Pure logic: pass the graph in, so this can be tested without a browser.
 */

const VIGNETTE_AGE = /\b\d{1,3}[- ](year|month|week|day)[- ]old\b|\b\d{1,3} ?(yo|y\/o)\b/i;
const VIGNETTE_CLUE = /\b(presents?|presented|brought|comes to|complains?|history of|examination|physical exam|vital signs|temperature|pulse|blood pressure|respirations|laboratory|labs? show)\b/i;
const ASKS = /\b(which of the following|most likely|next best step|most appropriate|best explains)\b/i;
const LAB_VALUE = /\b\d+(\.\d+)?\s?(mg\/dl|mmol\/l|meq\/l|g\/dl|u\/l|iu\/l|mm hg|mmhg|%|\/mm3|pg\/ml|ng\/ml|µmol\/l|umol\/l)\b|\bph\s?7\.\d/i;

const words = (t) => t.trim().split(/\s+/).filter(Boolean);
const sentences = (t) => (t.match(/[.!?](\s|$)/g) || []).length;

/** What kind of input is this? */
export function classifyInput(raw = '') {
  const t = String(raw).trim();
  if (!t) return 'empty';
  const n = words(t).length;
  const isVignette = VIGNETTE_AGE.test(t) && (VIGNETTE_CLUE.test(t) || ASKS.test(t) || n > 30);
  if (isVignette) return 'vignette';
  const labs = (t.match(new RegExp(LAB_VALUE.source, 'gi')) || []).length;
  if (labs >= 2) return 'labs';
  if (n > 45 || sentences(t) >= 3) return 'passage';
  if (/\?$/.test(t) || /^(what|why|how|when|which|who|where|is|are|does|do|can|should|explain|describe)\b/i.test(t)) return 'question';
  if (n <= 8) return 'topic';
  return 'question';
}

const clip = (t, max = 60) => (t.length > max ? `${t.slice(0, max - 1).trim()}…` : t);

/**
 * Up to `max` suggestions: [{ label, prompt, why }]. `prompt` is the full text to send; for
 * pasted material it wraps the learner's text so nothing is lost.
 *   ctx: { graph, exam: 'step1'|'step2ck'|'step3', pinned: { title, page } }
 */
export function suggestPrompts(raw = '', ctx = {}, max = 5) {
  const text = String(raw).trim();
  const kind = classifyInput(text);
  const exam = ctx.exam || 'step1';
  const clinical = exam !== 'step1';
  const out = [];
  const add = (label, prompt, why) => out.length < max && !out.some((o) => o.label === label) && out.push({ label, prompt, why });

  if (ctx.pinned && (kind === 'empty' || kind === 'topic' || kind === 'question')) {
    const where = `page ${ctx.pinned.page} of "${ctx.pinned.title}"`;
    add('Explain this page from zero', `Explain ${where} from zero: the central idea first, then the mechanism, then why it matters clinically.`, 'Uses the page you pinned');
    add('Hardest idea on this page', `What is the hardest concept on ${where}? Teach it to me step by step.`, 'Targets the sticking point');
    add('Questions from this page', `Write 3 exam-style questions that test ${where}. Do not reveal the answers until I reply.`, 'Checks you really understood it');
  }

  switch (kind) {
    case 'vignette':
      add('Walk me through it', `Walk me through this vignette like a tutor: the key clues and what each points to, the differential, the most likely answer, the mechanism behind it, and why each other option is wrong.\n\n${text}`, 'Builds the reasoning, not just the answer');
      add('Hint only, no answer', `Don't give me the answer yet. Point me to the single most important clue in this vignette and ask me what it suggests.\n\n${text}`, 'Lets you do the thinking first');
      add(clinical ? 'Next best step and why' : 'Mechanism behind the answer', clinical
        ? `For this vignette, what is the next best step in management, why that step first, and what would change the answer?\n\n${text}`
        : `Explain the mechanism that links the findings in this vignette to the diagnosis, as a causal chain.\n\n${text}`, clinical ? 'How Step 2/3 examine it' : 'How Step 1 examines it');
      add('What if one detail changed?', `Take this vignette and change one key detail so a different answer becomes correct. Explain what changed and why.\n\n${text}`, 'Trains discrimination between look-alikes');
      add('Turn it into flashcards', `Make 4 mechanism flashcards from the concepts this vignette tests.\n\n${text}`, 'For spaced repetition');
      break;
    case 'passage':
      add('Explain in plain language', `Explain what this passage is saying in plain language first, then the underlying mechanism, then why it matters clinically. Define every technical term.\n\n${text}`, 'Understand before memorising');
      add('What must I remember?', `From this passage, separate what I must know, should know, and can skip. Then give the one mental model that ties it together.\n\n${text}`, 'The 80/20 of the passage');
      add('Draw the causal chain', `Turn the process described in this passage into a causal chain from trigger to clinical consequence.\n\n${text}`, 'Makes the logic visible');
      add('What does it assume I know?', `What prerequisite ideas does this passage assume I already understand? Teach those briefly, then re-explain the passage.\n\n${text}`, 'Finds your hidden gap');
      add('Test me on this', `Ask me 3 questions on this passage, from recall to application. Wait for my answers.\n\n${text}`, 'Active recall');
      break;
    case 'labs':
      add('Interpret these results', `Interpret these results step by step: what each abnormal value means, the pattern they form, the most likely explanation, and what I would check next.\n\n${text}`, 'Patterns, not isolated values');
      add('Why is each value abnormal?', `For each abnormal value here, explain the physiology that makes it move in that direction.\n\n${text}`, 'Mechanism behind the numbers');
      add('What would I order next?', `Given these results, what single test would most change management next, and why?\n\n${text}`, 'Diagnostic reasoning');
      break;
    case 'topic':
    case 'question': {
      const concept = ctx.graph?.match?.(text) || ctx.graph?.find?.(text) || null;
      const name = concept?.name || (kind === 'topic' ? text : null);
      if (name) {
        add('Teach me from zero', `Teach me ${name} from absolute zero.`, 'Full layered lesson');
        const diff = concept?.relations?.find((r) => r.type === 'differential_of');
        if (diff) add(`Compare with ${clip(diff.target, 26)}`, `Compare ${name} vs ${diff.target}: the mechanism that separates them and the one finding that distinguishes them.`, 'The classic exam confusion');
        const finding = concept?.relations?.find((r) => r.type === 'presents_with' || r.type === 'causes');
        if (finding) add(`Why ${clip(finding.target.toLowerCase(), 28)}?`, `Why does ${name} cause ${finding.target.toLowerCase()}? Explain it as a causal chain from first principles.`, 'Derive the finding, not memorise it');
        const prereqs = concept && ctx.graph?.prerequisites ? ctx.graph.prerequisites(concept.id, 1).map((p) => p.concept.name) : [];
        if (prereqs.length) add('What do I need first?', `Before ${name}, briefly teach me ${prereqs.slice(0, 3).join(', ')}, then show how they lead into ${name}.`, 'Fixes the foundation');
        add(clinical ? 'Give me a case' : 'Give me a clinical case', `Give me a clinical case on ${name} and let me reason through it before you explain.`, 'Applied reasoning');
        add('2-minute review', `Give me a 2-minute review of ${name}.`, 'Quick revision');
        add('Test me', `Test me on ${name}.`, 'Active recall');
      }
      if (kind === 'question' && text.length > 10) {
        add('Answer, then explain why', `${text}\n\nAnswer directly first, then explain why it is true from first principles.`, 'Short answer plus the reasoning');
        add("Explain it like I'm new", `${text}\n\nI am new to this: explain it in plain language, defining every term, before giving the mechanism.`, 'Beginner-friendly');
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/* ------------------------------------------------------------------ prompt library */
/** Categorised templates; text inside [brackets] is a placeholder the learner replaces. */
export const PROMPT_LIBRARY = [
  {
    title: 'Learn a topic',
    items: [
      ['From absolute zero', 'Teach me [topic] from absolute zero.'],
      ['Just the core 20%', 'What is the core 20% of [topic] that explains most of it? Then the one mental model.'],
      ['Derive it, do not list it', 'Why does [disease] cause [finding]? Explain it as a causal chain from first principles.'],
      ['Prerequisites first', 'What do I need to understand before [topic]? Teach those briefly, then the topic.'],
      ['2-minute review', 'Give me a 2-minute review of [topic].'],
    ],
  },
  {
    title: 'Understand something you are reading',
    items: [
      ['Explain a passage', 'Explain this passage in plain language, then the mechanism, then why it matters clinically:\n\n[paste the passage here]'],
      ['What should I remember?', 'From this passage, what must I know, what should I know, and what can I skip?\n\n[paste the passage here]'],
      ['Explain one sentence', 'I do not understand this sentence. Explain it step by step:\n\n"[paste the sentence]"'],
      ['From my library', 'Using [document name], explain page [number] from zero and tell me the key idea.'],
    ],
  },
  {
    title: 'Question vignettes',
    items: [
      ['Walk me through a vignette', 'Walk me through this vignette: key clues, differential, answer, mechanism, and why each other option is wrong.\n\n[paste the vignette]'],
      ['Hint, not the answer', 'Do not give me the answer. Point me to the most important clue in this vignette.\n\n[paste the vignette]'],
      ['Why was I wrong?', 'I chose [option] but the answer was [answer]. Explain the reasoning error I made.\n\n[paste the vignette]'],
      ['Change one detail', 'Change one detail in this vignette so a different answer becomes correct, and explain why.\n\n[paste the vignette]'],
    ],
  },
  {
    title: 'Clinical reasoning',
    items: [
      ['Approach to a symptom', 'What is the approach to [symptom]? Organise the differential and show how each finding narrows it.'],
      ['Next best step', 'A patient with [situation]: what is the next best step and why that step first?'],
      ['Interpret results', 'Interpret these results as a pattern and tell me what to check next:\n\n[paste the values]'],
      ['Give me a case', 'Give me a clinical case on [topic] and let me reason through it before you explain.'],
    ],
  },
  {
    title: 'Compare and remember',
    items: [
      ['Compare two things', 'Compare [A] vs [B]: the mechanism that separates them and the single most reliable distinguishing feature.'],
      ['Make flashcards', 'Make 6 mechanism flashcards on [topic].'],
      ['Test me', 'Test me on [topic], from recall up to application. Wait for my answers.'],
      ['I still do not get it', 'I still do not understand [concept]. Explain it differently, with an analogy and one step at a time.'],
    ],
  },
];

/** The first [placeholder] in a template, as a { start, end } selection. */
export function firstPlaceholder(template) {
  const m = /\[[^\]]+\]/.exec(template);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}
