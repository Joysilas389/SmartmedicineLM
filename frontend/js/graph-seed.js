/*
 * Seed knowledge graph (spec §29–30): core USMLE Step 1 concepts, their prerequisites
 * and key clinical relationships. The graph grows at runtime: every full lesson returns a
 * small structured block of concepts/relations that is merged in (see graph.js).
 *
 * One concept per line:
 *   System | Name | aliases (comma) | prerequisites (semicolon, by name) | relations (semicolon, "type>target")
 * Relation types: causes, caused_by, inhibits, activates, associated_with, presents_with,
 * diagnosed_by, treated_by, differential_of. Targets may be concepts or free-text findings.
 */
export const SEED = `
Foundations | Cell membrane and ion channels | membrane transport, ion channel, Na/K ATPase, sodium-potassium pump | |
Foundations | Diffusion and osmosis | osmosis, osmolality, osmotic pressure, tonicity | |
Foundations | Starling forces | oncotic pressure, colloid osmotic pressure, hydrostatic pressure, capillary fluid exchange, starling equation | Diffusion and osmosis; Plasma proteins and albumin | causes>Edema when balance is disturbed
Foundations | Plasma proteins and albumin | albumin, plasma proteins | |
Foundations | Resting membrane potential | membrane potential, nernst equation | Cell membrane and ion channels |
Foundations | Action potential | nerve action potential, depolarization, repolarization | Resting membrane potential |
Foundations | Receptor signaling | g-protein, gpcr, second messenger, camp, receptor tyrosine kinase | Cell membrane and ion channels |
Foundations | Enzyme kinetics | michaelis-menten, km, vmax, enzyme inhibition | |
Foundations | Electrolyte physiology | potassium balance, sodium balance, electrolytes | Cell membrane and ion channels; Diffusion and osmosis |
Foundations | Acid-base physiology | ph, bicarbonate buffer, henderson-hasselbalch, buffer system | |
Foundations | Lipoprotein metabolism | cholesterol, ldl, hdl, lipoproteins, hyperlipidemia | |
Foundations | Cell injury and necrosis | necrosis, cell injury, coagulative necrosis, liquefactive necrosis | |
Foundations | Apoptosis | programmed cell death, caspases | Cell injury and necrosis |
Foundations | Acute inflammation | inflammation, neutrophils, inflammatory mediators | Cell injury and necrosis |
Foundations | Chronic inflammation | granuloma, granulomatous inflammation, macrophages | Acute inflammation |
Foundations | Wound healing | tissue repair, granulation tissue, fibrosis | Acute inflammation |
Foundations | Tumor suppressors and oncogenes | oncogene, tumor suppressor, cell cycle, p53, rb, ras | Apoptosis |
Cardiovascular | Cardiac action potential | myocyte action potential, pacemaker potential, cardiac conduction | Action potential |
Cardiovascular | Cardiac cycle and pressure-volume loops | cardiac cycle, pressure-volume loop, pv loop, wiggers diagram | Cardiac action potential |
Cardiovascular | Cardiac output | preload, afterload, contractility, frank-starling, stroke volume | Cardiac cycle and pressure-volume loops |
Cardiovascular | Blood pressure regulation | baroreceptor reflex, baroreceptors, mean arterial pressure | Cardiac output; Renin-angiotensin-aldosterone system |
Cardiovascular | Hypertension | high blood pressure, essential hypertension | Blood pressure regulation | causes>Left ventricular hypertrophy; causes>Stroke; causes>Chronic kidney disease; treated_by>ACE inhibitors and ARBs; treated_by>Diuretics
Cardiovascular | Atherosclerosis | atheroma, plaque, arteriosclerosis | Lipoprotein metabolism; Acute inflammation | causes>Myocardial infarction; causes>Stroke syndromes; associated_with>Diabetes mellitus and DKA
Cardiovascular | Myocardial infarction | mi, heart attack, stemi, nstemi, acute coronary syndrome | Atherosclerosis; Cardiac cycle and pressure-volume loops; Cell injury and necrosis | presents_with>Crushing chest pain; diagnosed_by>Troponin; diagnosed_by>ECG ST changes; causes>Heart failure; treated_by>Anticoagulants
Cardiovascular | Heart failure | chf, congestive heart failure, hfref, hfpef | Cardiac output; Starling forces; Renin-angiotensin-aldosterone system | presents_with>Dyspnea and edema; diagnosed_by>BNP; treated_by>ACE inhibitors and ARBs; treated_by>Diuretics
Cardiovascular | Shock | hypovolemic shock, cardiogenic shock, distributive shock, septic shock | Cardiac output; Blood pressure regulation | presents_with>Hypotension and tachycardia; differential_of>Sepsis
Cardiovascular | Valvular heart disease | aortic stenosis, mitral regurgitation, heart murmurs, murmur | Cardiac cycle and pressure-volume loops |
Renal | Glomerular filtration | gfr, glomerulus, filtration barrier, glomerular basement membrane, podocytes | Starling forces |
Renal | Tubular transport | nephron transport, tubular reabsorption, proximal tubule, loop of henle, collecting duct | Cell membrane and ion channels; Glomerular filtration |
Renal | Renin-angiotensin-aldosterone system | raas, renin, angiotensin, angiotensin ii, aldosterone | Tubular transport | activates>Sodium retention; activates>Vasoconstriction
Renal | Nephrotic syndrome | nephrotic, minimal change disease, membranous nephropathy, fsgs | Glomerular filtration; Plasma proteins and albumin; Starling forces | causes>Proteinuria over 3.5 g/day; causes>Hypoalbuminemia; causes>Edema; causes>Hyperlipidemia; causes>Hypercoagulability; differential_of>Nephritic syndrome; diagnosed_by>24-hour urine protein; treated_by>Corticosteroids
Renal | Nephritic syndrome | nephritic, glomerulonephritis, post-streptococcal glomerulonephritis, iga nephropathy | Glomerular filtration; Hypersensitivity reactions | presents_with>Hematuria with red cell casts; presents_with>Hypertension; presents_with>Oliguria; differential_of>Nephrotic syndrome
Renal | Acute kidney injury | aki, acute renal failure, acute tubular necrosis, prerenal azotemia | Glomerular filtration; Tubular transport | diagnosed_by>Rising creatinine; diagnosed_by>BUN:creatinine ratio
Renal | Chronic kidney disease | ckd, chronic renal failure, renal osteodystrophy | Glomerular filtration; Calcium and PTH regulation | causes>Anemia of CKD; causes>Secondary hyperparathyroidism; caused_by>Diabetes mellitus and DKA; caused_by>Hypertension
Renal | Anion gap | anion gap metabolic acidosis, agma, mudpiles | Electrolyte physiology; Acid-base physiology |
Renal | Acid-base disorders | metabolic acidosis, metabolic alkalosis, respiratory acidosis, respiratory alkalosis, abg | Acid-base physiology; Anion gap |
Respiratory | Lung mechanics | compliance, lung compliance, surfactant, airway resistance | |
Respiratory | Gas exchange | alveolar gas equation, a-a gradient, diffusion capacity, dlco | Diffusion and osmosis; Lung mechanics |
Respiratory | Ventilation-perfusion mismatch | v/q mismatch, shunt, dead space | Gas exchange | causes>Hypoxemia
Respiratory | Oxygen-hemoglobin dissociation curve | oxygen dissociation curve, bohr effect, 2,3-bpg, p50 | Gas exchange |
Respiratory | Obstructive vs restrictive lung disease | copd, obstructive lung disease, restrictive lung disease, fev1/fvc, emphysema, pulmonary fibrosis | Lung mechanics | diagnosed_by>Spirometry
Respiratory | Asthma | bronchial asthma, bronchospasm | Obstructive vs restrictive lung disease; Hypersensitivity reactions | presents_with>Episodic wheeze; treated_by>Inhaled beta-2 agonists; treated_by>Inhaled corticosteroids
Respiratory | Pulmonary embolism | pe, dvt, deep vein thrombosis, venous thromboembolism, virchow triad | Ventilation-perfusion mismatch; Coagulation cascade | presents_with>Sudden dyspnea and pleuritic pain; diagnosed_by>CT pulmonary angiography; treated_by>Anticoagulants
Respiratory | ARDS | acute respiratory distress syndrome | Gas exchange; Acute inflammation; Starling forces | caused_by>Sepsis; presents_with>Refractory hypoxemia
Endocrine | Hypothalamic-pituitary axes | pituitary, hypothalamus, hpa axis, feedback loops, anterior pituitary | Receptor signaling |
Endocrine | Thyroid hormone physiology | thyroid, t3, t4, tsh, hyperthyroidism, hypothyroidism, graves disease, hashimoto | Hypothalamic-pituitary axes |
Endocrine | Insulin and glucose metabolism | insulin, glucagon, glucose homeostasis, glycolysis, gluconeogenesis | Receptor signaling |
Endocrine | Diabetes mellitus and DKA | diabetes, dka, diabetic ketoacidosis, type 1 diabetes, type 2 diabetes, hyperglycemia | Insulin and glucose metabolism; Acid-base disorders | causes>Diabetic nephropathy; presents_with>Polyuria and polydipsia; treated_by>Insulin
Endocrine | Adrenal cortex and Cushing syndrome | cushing, cushing syndrome, cortisol, adrenal insufficiency, addison disease | Hypothalamic-pituitary axes |
Endocrine | Primary hyperaldosteronism | conn syndrome, hyperaldosteronism, aldosteronoma | Renin-angiotensin-aldosterone system; Tubular transport | causes>Sodium retention; causes>Hypokalemia; causes>Metabolic alkalosis; presents_with>Hypertension; diagnosed_by>High aldosterone with low renin
Endocrine | Calcium and PTH regulation | pth, parathyroid hormone, calcium homeostasis, vitamin d, hyperparathyroidism, hypocalcemia, hypercalcemia | Electrolyte physiology |
Gastrointestinal | Bilirubin metabolism and jaundice | bilirubin, jaundice, conjugated bilirubin, unconjugated bilirubin, gilbert syndrome | |
Gastrointestinal | Liver function tests | lfts, alt, ast, alkaline phosphatase | Bilirubin metabolism and jaundice |
Gastrointestinal | Cirrhosis | liver cirrhosis, hepatic fibrosis, chronic liver disease | Chronic inflammation; Wound healing | causes>Portal hypertension; causes>Hypoalbuminemia
Gastrointestinal | Portal hypertension | ascites, esophageal varices, caput medusae | Cirrhosis; Starling forces | presents_with>Ascites; presents_with>Variceal bleeding
Gastrointestinal | Malabsorption | celiac disease, steatorrhea, malabsorption syndromes | |
Gastrointestinal | Inflammatory bowel disease | ibd, crohn disease, ulcerative colitis | Chronic inflammation |
Gastrointestinal | Acute pancreatitis | pancreatitis | Acute inflammation | caused_by>Gallstones; caused_by>Alcohol; diagnosed_by>Serum lipase
Hematology & Oncology | Hemoglobin and iron metabolism | iron, ferritin, heme synthesis, hemoglobin, transferrin | |
Hematology & Oncology | Microcytic anemias | iron deficiency anemia, thalassemia, microcytic anemia, sideroblastic anemia | Hemoglobin and iron metabolism | diagnosed_by>Iron studies
Hematology & Oncology | Hemolytic anemia | hemolysis, spherocytosis, g6pd deficiency | Hemoglobin and iron metabolism; Bilirubin metabolism and jaundice | causes>Unconjugated hyperbilirubinemia; diagnosed_by>Raised LDH and low haptoglobin
Hematology & Oncology | Coagulation cascade | coagulation, clotting cascade, hemostasis, prothrombin time, ptt, platelets | | 
Hematology & Oncology | Sickle cell disease | sickle cell anemia, hbs | Hemolytic anemia; Oxygen-hemoglobin dissociation curve | causes>Vaso-occlusive crises; causes>Autosplenectomy
Hematology & Oncology | Leukemias | leukemia, aml, cml, cll, acute lymphoblastic leukemia | Tumor suppressors and oncogenes |
Neurology | Neuromuscular junction | nmj, acetylcholine release, motor end plate | Action potential |
Neurology | Spinal cord tracts | corticospinal tract, dorsal columns, spinothalamic tract | Action potential |
Neurology | Upper vs lower motor neuron lesions | umn, lmn, upper motor neuron, lower motor neuron | Spinal cord tracts |
Neurology | Stroke syndromes | stroke, cerebrovascular accident, cva, mca stroke, tia | Spinal cord tracts; Atherosclerosis |
Neurology | Raised intracranial pressure | icp, intracranial pressure, cerebral edema, herniation | |
Neurology | Myasthenia gravis | myasthenia | Neuromuscular junction; Hypersensitivity reactions | presents_with>Fatigable weakness; treated_by>Acetylcholinesterase inhibitors
Neurology | Seizures | epilepsy, seizure | Action potential |
Immunology | Innate vs adaptive immunity | innate immunity, adaptive immunity, t cells, b cells | |
Immunology | MHC and antigen presentation | mhc, hla, antigen presentation, mhc class i, mhc class ii | Innate vs adaptive immunity |
Immunology | Complement system | complement, c3, c5a, membrane attack complex | Innate vs adaptive immunity |
Immunology | Hypersensitivity reactions | hypersensitivity, type i hypersensitivity, type ii hypersensitivity, type iii hypersensitivity, type iv hypersensitivity, anaphylaxis | MHC and antigen presentation; Complement system |
Immunology | Immunodeficiencies | immunodeficiency, scid, bruton agammaglobulinemia, digeorge syndrome | MHC and antigen presentation |
Immunology | Transplant rejection | graft rejection, hyperacute rejection, graft versus host disease | MHC and antigen presentation; Hypersensitivity reactions |
Microbiology & Infectious disease | Bacterial toxins | exotoxin, endotoxin, lps | |
Microbiology & Infectious disease | Sepsis | septicemia, bacteremia | Acute inflammation; Shock; Bacterial toxins | causes>ARDS; causes>Acute kidney injury
Microbiology & Infectious disease | Malaria | plasmodium, falciparum, plasmodium falciparum | Hemolytic anemia | causes>Hemolytic anemia; diagnosed_by>Blood smear; treated_by>Artemisinin-based therapy
Microbiology & Infectious disease | HIV pathogenesis | hiv, aids | MHC and antigen presentation; Innate vs adaptive immunity | causes>CD4 T cell depletion; associated_with>Tuberculosis
Microbiology & Infectious disease | Tuberculosis | tb, mycobacterium tuberculosis, ghon complex | Chronic inflammation; Hypersensitivity reactions | presents_with>Caseating granulomas; associated_with>HIV pathogenesis
Microbiology & Infectious disease | Antibiotic mechanisms and resistance | antibiotics, beta-lactams, antibiotic resistance | |
Pharmacology | Pharmacokinetics | half-life, volume of distribution, clearance, bioavailability | |
Pharmacology | Autonomic drugs | autonomic pharmacology, adrenergic, cholinergic, beta blockers | Receptor signaling |
Pharmacology | Diuretics | loop diuretics, thiazides, furosemide, spironolactone | Tubular transport |
Pharmacology | ACE inhibitors and ARBs | ace inhibitors, arbs, lisinopril, losartan | Renin-angiotensin-aldosterone system | causes>Hyperkalemia; causes>Dry cough (ACE inhibitors)
Pharmacology | Anticoagulants | heparin, warfarin, doacs, anticoagulation | Coagulation cascade |
Pharmacology | Cytochrome P450 interactions | cyp450, p450, drug interactions, enzyme inducers, enzyme inhibitors | Pharmacokinetics |
Reproductive & Musculoskeletal | Menstrual cycle hormones | menstrual cycle, estrogen, progesterone, lh surge | Hypothalamic-pituitary axes |
Reproductive & Musculoskeletal | Pre-eclampsia | preeclampsia, eclampsia, hellp | Blood pressure regulation; Glomerular filtration | presents_with>Hypertension and proteinuria after 20 weeks
Reproductive & Musculoskeletal | Osteoporosis vs osteomalacia | osteoporosis, osteomalacia, rickets | Calcium and PTH regulation |
Reproductive & Musculoskeletal | Gout | hyperuricemia, uric acid | Acute inflammation | diagnosed_by>Negatively birefringent crystals
Reproductive & Musculoskeletal | Rheumatoid arthritis | ra, rheumatoid | Chronic inflammation; Hypersensitivity reactions |
Reproductive & Musculoskeletal | Muscle contraction | excitation-contraction coupling, sarcomere, cross-bridge cycle | Action potential; Neuromuscular junction |
`;

export const SYSTEMS = [
  'Foundations',
  'Cardiovascular',
  'Renal',
  'Respiratory',
  'Endocrine',
  'Gastrointestinal',
  'Hematology & Oncology',
  'Neurology',
  'Immunology',
  'Microbiology & Infectious disease',
  'Pharmacology',
  'Reproductive & Musculoskeletal',
];

export const RELATION_TYPES = ['causes', 'caused_by', 'inhibits', 'activates', 'associated_with', 'presents_with', 'diagnosed_by', 'treated_by', 'differential_of'];
