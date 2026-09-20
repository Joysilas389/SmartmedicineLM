/* Shared application state + persisted settings. */
const SETTINGS_KEY = 'sm.settings.v1';

export const POLICY_TOGGLES = [
  { key: 'mechanism_first', label: 'Mechanism-first', hint: 'Causal chains for every mechanism' },
  { key: 'step1_high_yield', label: 'Step 1 focus', hint: 'High-yield facts, distractors and clues' },
  { key: 'clinical_case', label: 'Clinical cases', hint: 'A realistic patient after the mechanism' },
  { key: 'spatial_anchor', label: 'Spatial anchors', hint: 'Physical mental models for hard ideas' },
  { key: 'mermaid_diagrams', label: 'Diagrams', hint: 'Mermaid flowcharts where they help' },
  { key: 'flashcards', label: 'Flashcards', hint: 'Mechanism cards at the end of lessons' },
  { key: 'source_citation', label: 'Cite sources', hint: 'Page-level citations from your library' },
  { key: 'active_recall', label: 'Active recall', hint: 'Recall prompts at the end of lessons' },
];

const DEFAULTS = {
  accessCode: '',
  temperature: 0.4,
  mode: 'auto',
  depth: 'deep',
  knowledgeMode: 'hybrid',
  theme: 'auto',
  ghanaContext: false,
  retrievalK: 6,
  sidebarCollapsed: false,
  scheduler: 'fsrs',
  semanticSearch: !(typeof navigator !== 'undefined' && navigator.connection?.saveData),
  studyPlan: null,
  policy: {
    mechanism_first: true,
    step1_high_yield: true,
    clinical_case: true,
    spatial_anchor: true,
    mermaid_diagrams: true,
    flashcards: true,
    source_citation: true,
    active_recall: true,
  },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULTS, ...raw, policy: { ...DEFAULTS.policy, ...(raw.policy || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const state = {
  settings: load(),
  chats: [],
  documents: [],
  currentChatId: null,
  streaming: null, // AbortController while a response streams
  showArchived: false,
  pendingScope: null, // doc ids chosen before a chat exists
  modelInfo: null,
};

export function saveSettings(patch = {}) {
  Object.assign(state.settings, patch);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch { /* storage full or blocked */ }
  document.dispatchEvent(new CustomEvent('settings:changed'));
}

export function resetSettings() {
  state.settings = structuredClone(DEFAULTS);
  saveSettings();
}
