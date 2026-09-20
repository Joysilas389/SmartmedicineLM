/* Learn page (spec §35, §48): system-wise topic launcher that starts a full lesson. */
import { $, escapeHtml } from './ui.js';
import { composeAndSend } from './chat.js';

const SYSTEMS = [
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
  grid.innerHTML = SYSTEMS.map((s) => `
    <div class="system">
      <h3><i class="bi ${s.icon}"></i>${escapeHtml(s.name)}</h3>
      <ul>${s.topics.map((t) => `<li><button type="button" data-topic="${escapeHtml(t)}">${escapeHtml(t)}</button></li>`).join('')}</ul>
    </div>`).join('');
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-topic]');
    if (b) startLesson(b.dataset.topic);
  });
}

function startLesson(topic) {
  composeAndSend(`Teach me ${topic} from absolute zero.`);
}
