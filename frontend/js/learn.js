/* Learn page (spec §35, §48): system-wise topic launcher that starts a full lesson. */
import { $, escapeHtml } from './ui.js';
import { composeAndSend } from './chat.js';
import { currentExam, examShort } from './exams.js';

const STEP1_GROUPS = [
  { name: 'Foundations', icon: 'bi-bricks', topics: ['Cell membrane and ion channels', 'Resting membrane potential', 'Enzyme kinetics', 'Cell injury and necrosis vs apoptosis', 'Acute inflammation', 'Wound healing'] },
  { name: 'Cardiovascular', icon: 'bi-heart-pulse', topics: ['Cardiac action potential', 'Cardiac cycle and pressure-volume loops', 'Heart failure', 'Atherosclerosis', 'Shock', 'Valvular heart disease'] },
  { name: 'Renal', icon: 'bi-droplet-half', topics: ['Glomerular filtration', 'Renin-angiotensin-aldosterone system', 'Nephrotic vs nephritic syndrome', 'Acute kidney injury', 'Chronic kidney disease and mineral bone disease', 'Acid-base disorders'] },
  { name: 'Respiratory', icon: 'bi-lungs', topics: ['Ventilation-perfusion mismatch', 'Oxygen-hemoglobin dissociation curve', 'Obstructive vs restrictive lung disease', 'Asthma', 'Pulmonary embolism', 'ARDS'] },
  { name: 'Endocrine', icon: 'bi-thermometer-half', topics: ['Hypothalamic-pituitary axes', 'Thyroid hormone physiology', 'Diabetes mellitus and DKA', 'Adrenal cortex and Cushing syndrome', 'Primary hyperaldosteronism', 'Calcium and PTH regulation'] },
  { name: 'Gastrointestinal', icon: 'bi-egg-fried', topics: ['Bilirubin metabolism and jaundice', 'Portal hypertension', 'Malabsorption', 'Inflammatory bowel disease', 'Acute pancreatitis', 'Liver function tests'] },
  { name: 'Hematology & Oncology', icon: 'bi-droplet', topics: ['Microcytic anemias', 'Hemolytic anemia', 'Coagulation cascade', 'Sickle cell disease', 'Leukemias', 'Tumor suppressors and oncogenes'] },
  { name: 'Neurology', icon: 'bi-lightning-charge', topics: ['Upper vs lower motor neuron lesions', 'Spinal cord tracts', 'Stroke syndromes', 'Raised intracranial pressure', 'Myasthenia gravis', 'Seizures'] },
  { name: 'Immunology', icon: 'bi-shield-check', topics: ['Innate vs adaptive immunity', 'Hypersensitivity reactions', 'MHC and antigen presentation', 'Immunodeficiencies', 'Transplant rejection', 'Complement system'] },
  { name: 'Microbiology & Infectious disease', icon: 'bi-virus', topics: ['Bacterial toxins', 'Malaria', 'HIV pathogenesis', 'Tuberculosis', 'Sepsis', 'Antibiotic mechanisms and resistance'] },
  { name: 'Pharmacology', icon: 'bi-capsule', topics: ['Pharmacokinetics', 'Autonomic drugs', 'Diuretics', 'ACE inhibitors and ARBs', 'Anticoagulants', 'Cytochrome P450 interactions'] },
  { name: 'Reproductive & Musculoskeletal', icon: 'bi-person-standing', topics: ['Menstrual cycle hormones', 'Pre-eclampsia', 'Osteoporosis vs osteomalacia', 'Gout', 'Rheumatoid arthritis', 'Muscle contraction'] },
];

/* Step 2 CK: clinical decision-making, organised the way the exam is. */
const STEP2CK_GROUPS = [
  { name: 'Emergency & critical care', icon: 'bi-hospital', topics: ['Approach to chest pain in the emergency department', 'STEMI management', 'Sepsis and septic shock management', 'DKA management', 'Acute upper GI bleeding', 'Trauma primary survey'] },
  { name: 'Internal medicine', icon: 'bi-heart-pulse', topics: ['Heart failure management', 'Atrial fibrillation management', 'Community-acquired pneumonia', 'Acute kidney injury work-up', 'Approach to hyponatremia', 'Anemia work-up'] },
  { name: 'Surgery', icon: 'bi-scissors', topics: ['Acute abdomen', 'Appendicitis', 'Small bowel obstruction', 'Postoperative fever', 'Breast mass work-up', 'Thyroid nodule work-up'] },
  { name: 'Pediatrics', icon: 'bi-balloon', topics: ['Neonatal jaundice', 'Developmental milestones', 'The febrile infant', 'Bronchiolitis', 'Childhood vaccination schedule', 'Failure to thrive'] },
  { name: 'Obstetrics & gynecology', icon: 'bi-gender-female', topics: ['Prenatal care and screening', 'Pre-eclampsia management', 'Third-trimester bleeding', 'Postpartum hemorrhage', 'Ectopic pregnancy', 'Abnormal uterine bleeding'] },
  { name: 'Psychiatry', icon: 'bi-chat-heart', topics: ['Major depressive disorder', 'Bipolar disorder', 'Schizophrenia', 'Alcohol withdrawal', 'Suicide risk assessment', 'Delirium vs dementia'] },
  { name: 'Neurology', icon: 'bi-lightning-charge', topics: ['Acute stroke management', 'Headache red flags', 'Status epilepticus', 'Syncope work-up', 'Spinal cord compression', 'Meningitis management'] },
  { name: 'Prevention', icon: 'bi-shield-check', topics: ['Cancer screening', 'Adult vaccination', 'Hypertension screening and treatment', 'Diabetes screening', 'Lipid management and statins', 'Osteoporosis screening'] },
];

/* Step 3: independent practice, management over time, ethics and biostatistics. */
const STEP3_GROUPS = [
  { name: 'Case management (CCS style)', icon: 'bi-clipboard2-pulse', topics: ['Chest pain: from triage to discharge', 'Sepsis: the first hours to discharge', 'DKA: orders, monitoring and transition', 'GI bleeding: resuscitation to follow-up', 'Pneumonia: admit or treat at home', 'Postoperative complications'] },
  { name: 'Ambulatory care', icon: 'bi-house-heart', topics: ['Diabetes follow-up and complication screening', 'Long-term hypertension management', 'Chronic kidney disease follow-up', 'Asthma and COPD step-up therapy', 'Anticoagulation follow-up', 'Depression in primary care'] },
  { name: 'Prevention', icon: 'bi-shield-check', topics: ['Cancer screening', 'Adult vaccination', 'Well-child care and immunizations', 'Prenatal care and screening', 'Osteoporosis screening', 'Falls prevention in older adults'] },
  { name: 'Ethics & law', icon: 'bi-bank', topics: ['Informed consent and capacity', 'Confidentiality and its exceptions', 'Advance directives and surrogate decisions', 'Disclosure of medical errors', 'Minors and consent', 'Duty to warn'] },
  { name: 'Biostatistics & epidemiology', icon: 'bi-bar-chart-line', topics: ['Sensitivity, specificity and predictive values', 'Study designs', 'Bias and confounding', 'Relative risk, odds ratio and NNT', 'Hypothesis testing and confidence intervals', 'Evaluating a screening test'] },
  { name: 'Patient safety & special populations', icon: 'bi-people', topics: ['Root cause analysis', 'Medication errors and handoffs', 'Medications in pregnancy', 'Polypharmacy in older adults', 'Palliative care and pain management', 'Quality improvement cycles'] },
];

const GROUPS = { step1: STEP1_GROUPS, step2ck: STEP2CK_GROUPS, step3: STEP3_GROUPS };

const SUBTITLE = {
  step1: 'Pick a topic to start a full lesson from zero: problem, mechanism, timeline, patient, investigations, treatment, differentials, Step 1 reasoning and recall.',
  step2ck: 'Pick a topic for a full lesson built for Step 2 CK: presentation, diagnosis, which test first, the next best step and management, with the mechanism only as deep as the decisions need.',
  step3: 'Pick a topic for a full lesson built for Step 3: management over time, disposition, follow-up, prevention, ethics and biostatistics, taught the way the case simulations test it.',
};

function renderGrid() {
  const exam = currentExam();
  const sub = document.querySelector('#view-learn .page-sub');
  if (sub) sub.textContent = SUBTITLE[exam];
  $('#learnSystems').innerHTML = GROUPS[exam]
    .map(
      (s) => `
    <div class="system">
      <h3><i class="bi ${s.icon}"></i>${escapeHtml(s.name)}</h3>
      <ul>${s.topics.map((t) => `<li><button type="button" data-topic="${escapeHtml(t)}">${escapeHtml(t)}</button></li>`).join('')}</ul>
    </div>`
    )
    .join('');
  const label = document.getElementById('learnExamLabel');
  if (label) label.textContent = examShort(exam);
}

export function initLearn() {
  const input = $('#learnTopic');
  const go = () => {
    const topic = input.value.trim();
    if (!topic) return input.focus();
    input.value = '';
    startLesson(topic);
  };
  $('#learnGo').addEventListener('click', go);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());

  const grid = $('#learnSystems');
  renderGrid();
  document.addEventListener('settings:changed', renderGrid);
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-topic]');
    if (b) startLesson(b.dataset.topic);
  });
}

function startLesson(topic) {
  composeAndSend(`Teach me ${topic} from absolute zero.`);
}
