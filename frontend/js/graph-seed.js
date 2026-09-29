/*
 * Seed knowledge graph (spec §29–30): core USMLE Step 1, Step 2 CK and Step 3 concepts, their prerequisites
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
Foundations | Electrolyte physiology | potassium balance, electrolytes | Cell membrane and ion channels; Diffusion and osmosis |
Foundations | Acid-base physiology | ph, bicarbonate buffer, henderson-hasselbalch, buffer system | |
Foundations | Lipoprotein metabolism | cholesterol, ldl, hdl, lipoproteins, hyperlipidemia | |
Foundations | Cell injury and necrosis | necrosis, cell injury, coagulative necrosis, liquefactive necrosis | |
Foundations | Apoptosis | programmed cell death, caspases | Cell injury and necrosis |
Foundations | Acute inflammation | inflammation, neutrophils, inflammatory mediators | Cell injury and necrosis |
Foundations | Chronic inflammation | granuloma, granulomatous inflammation, macrophages | Acute inflammation |
Foundations | Wound healing | tissue repair, granulation tissue, fibrosis | Acute inflammation |
Foundations | Tumor suppressors and oncogenes | oncogene, tumor suppressor, p53, rb, ras | Apoptosis |
Cardiovascular | Cardiac action potential | myocyte action potential, pacemaker potential, cardiac conduction | Action potential |
Cardiovascular | Cardiac cycle and pressure-volume loops | cardiac cycle, pressure-volume loop, pv loop, wiggers diagram | Cardiac action potential |
Cardiovascular | Cardiac output | preload, afterload, contractility, frank-starling, stroke volume | Cardiac cycle and pressure-volume loops |
Cardiovascular | Blood pressure regulation | baroreceptor reflex, baroreceptors, mean arterial pressure | Cardiac output; Renin-angiotensin-aldosterone system |
Cardiovascular | Hypertension | high blood pressure, essential hypertension | Blood pressure regulation | causes>Left ventricular hypertrophy; causes>Stroke; causes>Chronic kidney disease; treated_by>ACE inhibitors and ARBs; treated_by>Diuretics
Cardiovascular | Atherosclerosis | atheroma, arteriosclerosis | Lipoprotein metabolism; Acute inflammation | causes>Myocardial infarction; causes>Stroke syndromes; associated_with>Diabetes mellitus and DKA
Cardiovascular | Myocardial infarction | mi, heart attack, stemi | Atherosclerosis; Cardiac cycle and pressure-volume loops; Cell injury and necrosis | presents_with>Crushing chest pain; diagnosed_by>Troponin; diagnosed_by>ECG ST changes; causes>Heart failure; treated_by>Anticoagulants
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
Respiratory | Obstructive vs restrictive lung disease | obstructive lung disease, restrictive lung disease, fev1/fvc | Lung mechanics | diagnosed_by>Spirometry
Respiratory | Asthma | bronchial asthma, bronchospasm | Obstructive vs restrictive lung disease; Hypersensitivity reactions | presents_with>Episodic wheeze; treated_by>Inhaled beta-2 agonists; treated_by>Inhaled corticosteroids
Respiratory | Pulmonary embolism | pe, dvt, deep vein thrombosis, venous thromboembolism | Ventilation-perfusion mismatch; Coagulation cascade | presents_with>Sudden dyspnea and pleuritic pain; diagnosed_by>CT pulmonary angiography; treated_by>Anticoagulants
Respiratory | ARDS | acute respiratory distress syndrome | Gas exchange; Acute inflammation; Starling forces | caused_by>Sepsis; presents_with>Refractory hypoxemia
Endocrine | Hypothalamic-pituitary axes | pituitary, hypothalamus, hpa axis, feedback loops, anterior pituitary | Receptor signaling |
Endocrine | Thyroid hormone physiology | thyroid, t3, t4, tsh, hyperthyroidism, hypothyroidism, graves disease, hashimoto | Hypothalamic-pituitary axes |
Endocrine | Insulin and glucose metabolism | insulin, glucagon, glucose homeostasis | Receptor signaling |
Endocrine | Diabetes mellitus and DKA | diabetes, dka, diabetic ketoacidosis, hyperglycemia | Insulin and glucose metabolism; Acid-base disorders | causes>Diabetic nephropathy; presents_with>Polyuria and polydipsia; treated_by>Insulin
Endocrine | Adrenal cortex and Cushing syndrome | cushing, cushing syndrome, cortisol | Hypothalamic-pituitary axes |
Endocrine | Primary hyperaldosteronism | conn syndrome, hyperaldosteronism, aldosteronoma | Renin-angiotensin-aldosterone system; Tubular transport | causes>Sodium retention; causes>Hypokalemia; causes>Metabolic alkalosis; presents_with>Hypertension; diagnosed_by>High aldosterone with low renin
Endocrine | Calcium and PTH regulation | pth, parathyroid hormone, calcium homeostasis, vitamin d, hyperparathyroidism | Electrolyte physiology |
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
Reproductive & Musculoskeletal | Pre-eclampsia | preeclampsia, hellp | Blood pressure regulation; Glomerular filtration | presents_with>Hypertension and proteinuria after 20 weeks
Reproductive & Musculoskeletal | Osteoporosis vs osteomalacia | osteoporosis, osteomalacia, rickets | Calcium and PTH regulation |
Reproductive & Musculoskeletal | Gout | hyperuricemia, uric acid | Acute inflammation | diagnosed_by>Negatively birefringent crystals
Reproductive & Musculoskeletal | Rheumatoid arthritis | ra, rheumatoid | Chronic inflammation; Hypersensitivity reactions |
Reproductive & Musculoskeletal | Muscle contraction | excitation-contraction coupling, sarcomere, cross-bridge cycle | Action potential; Neuromuscular junction |
Cardiovascular | STEMI management | primary pci, fibrinolysis, reperfusion therapy | Myocardial infarction | treated_by>Primary PCI; treated_by>Fibrinolysis when PCI is delayed
Microbiology & Infectious disease | Sepsis management | septic shock management, sepsis bundle | Sepsis | treated_by>Early broad-spectrum antibiotics; treated_by>Intravenous crystalloid; treated_by>Norepinephrine if hypotension persists
Reproductive & Musculoskeletal | Prenatal care | antenatal care, prenatal screening, pregnancy care | Menstrual cycle hormones |
Psychiatry | Neurotransmitters and psychopharmacology | serotonin, dopamine, norepinephrine, antidepressants, ssris, ssri | Receptor signaling |
Psychiatry | Major depressive disorder | mdd, major depression, depressive disorder | Neurotransmitters and psychopharmacology | presents_with>Low mood or anhedonia for at least 2 weeks; treated_by>SSRIs; treated_by>Psychotherapy; associated_with>Suicide risk assessment
Psychiatry | Bipolar disorder | mania, hypomania, bipolar i disorder, bipolar ii disorder | Neurotransmitters and psychopharmacology | treated_by>Lithium; differential_of>Major depressive disorder
Psychiatry | Schizophrenia | psychosis, hallucinations, delusions, schizoaffective disorder | Neurotransmitters and psychopharmacology | treated_by>Second-generation antipsychotics
Psychiatry | Anxiety disorders | generalized anxiety disorder, panic disorder, panic attack | Neurotransmitters and psychopharmacology | treated_by>SSRIs; treated_by>Cognitive behavioural therapy
Psychiatry | Substance use and withdrawal | alcohol withdrawal, delirium tremens, opioid withdrawal, opioid overdose, substance use disorder | Neurotransmitters and psychopharmacology | treated_by>Benzodiazepines for alcohol withdrawal; treated_by>Naloxone for opioid overdose
Psychiatry | Delirium and dementia | delirium, dementia, neurocognitive disorder | | differential_of>Major depressive disorder
Psychiatry | Suicide risk assessment | suicide, suicidal ideation, self-harm | Major depressive disorder |
Psychiatry | Eating disorders | anorexia nervosa, bulimia nervosa, binge eating disorder | | causes>Refeeding syndrome risk
Biostatistics, Ethics & Prevention | Sensitivity and specificity | positive predictive value, negative predictive value, ppv, npv, 2x2 table | |
Biostatistics, Ethics & Prevention | Study designs | cohort study, case-control study, randomized controlled trial, rct, cross-sectional study | |
Biostatistics, Ethics & Prevention | Bias and confounding | confounding, selection bias, lead-time bias, recall bias | Study designs |
Biostatistics, Ethics & Prevention | Hypothesis testing | p value, confidence interval, type i error, type ii error, statistical power | Study designs |
Biostatistics, Ethics & Prevention | Risk measures | relative risk, odds ratio, absolute risk reduction, number needed to treat, nnt | Study designs |
Biostatistics, Ethics & Prevention | Informed consent and capacity | informed consent, decision-making capacity, surrogate decision maker | |
Biostatistics, Ethics & Prevention | Confidentiality and disclosure | confidentiality, hipaa, disclosure of medical errors, duty to warn | |
Biostatistics, Ethics & Prevention | Patient safety and quality | medical error, root cause analysis, quality improvement, patient safety | |
Biostatistics, Ethics & Prevention | Cancer screening | colorectal cancer screening, breast cancer screening, cervical cancer screening, lung cancer screening, uspstf | Tumor suppressors and oncogenes |
Biostatistics, Ethics & Prevention | Adult vaccination | vaccines, vaccination, immunization schedule | Innate vs adaptive immunity |
Foundations | Cell cycle and its checkpoints | cell cycle, g1 checkpoint, mitosis, cyclins, cyclin-dependent kinase | |
Foundations | DNA replication and repair | replication, dna polymerase, mismatch repair, nucleotide excision repair, okazaki | |
Foundations | Transcription and translation | transcription, translation, mrna, trna, ribosome, splicing, start codon | DNA replication and repair |
Foundations | Mendelian inheritance patterns | autosomal dominant, autosomal recessive, x-linked recessive, x-linked dominant, mitochondrial inheritance, pedigree | DNA replication and repair |
Foundations | Population genetics | hardy-weinberg, carrier frequency, allele frequency | Mendelian inheritance patterns |
Foundations | Chromosomal disorders | down syndrome, trisomy 21, trisomy 18, trisomy 13, turner syndrome, klinefelter syndrome, nondisjunction | Mendelian inheritance patterns |
Foundations | Genetic imprinting and mosaicism | prader-willi, angelman syndrome, imprinting, uniparental disomy, mosaicism | Mendelian inheritance patterns |
Foundations | Glycolysis and gluconeogenesis | glycolysis, gluconeogenesis, hexokinase, glucokinase, pyruvate kinase, phosphofructokinase | Enzyme kinetics |
Foundations | Citric acid cycle and oxidative phosphorylation | krebs cycle, tca cycle, electron transport chain, atp synthase, oxidative phosphorylation, uncoupling | Glycolysis and gluconeogenesis |
Foundations | Fatty acid oxidation and ketogenesis | beta-oxidation, carnitine shuttle, ketone bodies, ketogenesis, mcad deficiency | Citric acid cycle and oxidative phosphorylation |
Foundations | Glycogen metabolism | glycogen, glycogen storage disease, von gierke, mcardle, glycogen phosphorylase | Glycolysis and gluconeogenesis |
Foundations | Amino acid metabolism and the urea cycle | urea cycle, ammonia, hyperammonemia, otc deficiency, transamination | Citric acid cycle and oxidative phosphorylation |
Foundations | Inborn errors of amino acid metabolism | phenylketonuria, pku, maple syrup urine disease, homocystinuria, alkaptonuria | Amino acid metabolism and the urea cycle; Mendelian inheritance patterns |
Foundations | Purine and pyrimidine metabolism | purine metabolism, pyrimidine, hgprt, lesch-nyhan, orotic aciduria, uric acid production | DNA replication and repair |
Foundations | Vitamins and their deficiencies | vitamin deficiency, thiamine, niacin, pellagra, scurvy, vitamin b12, folate, vitamin d deficiency, beriberi, wernicke | Enzyme kinetics |
Foundations | Lysosomal storage diseases | tay-sachs, gaucher, niemann-pick, fabry, hurler, hunter syndrome | Mendelian inheritance patterns |
Foundations | Collagen and connective tissue | collagen synthesis, ehlers-danlos, osteogenesis imperfecta, marfan syndrome, elastin | |
Foundations | Cell signalling second messengers | cgmp, ip3, protein kinase a, tyrosine kinase, jak-stat | Receptor signaling |
Foundations | Cytoskeleton and cell transport | microtubule, kartagener, dynein, kinesin, vesicular transport, i-cell disease | |
Foundations | Free radical injury and hypoxia | ischemia, reperfusion injury, free radicals, hypoxic cell injury, atp depletion | Cell injury and necrosis |
Foundations | Neoplasia principles | carcinogenesis, metastasis, tumor grading, staging, paraneoplastic syndrome, tumor markers | Tumor suppressors and oncogenes |
Foundations | Amyloidosis | amyloid, aa amyloidosis, al amyloidosis, congo red | Chronic inflammation |
Foundations | Edema and fluid compartments | edema, third spacing, body fluid compartments, extracellular fluid | Starling forces |
Foundations | Thermoregulation and fever | fever, pyrogens, hyperthermia, hypothermia | Acute inflammation |
Cardiovascular | Cardiac embryology and congenital defects | congenital heart disease, ventricular septal defect, atrial septal defect, patent ductus arteriosus, tetralogy of fallot, coarctation of the aorta, transposition | Cardiac cycle and pressure-volume loops |
Cardiovascular | Coronary circulation | coronary arteries, left anterior descending, coronary dominance, myocardial oxygen demand | Cardiac output |
Cardiovascular | Stable angina and chronic coronary disease | angina pectoris, stable angina, exertional chest pain, ischemic heart disease | Atherosclerosis; Coronary circulation | treated_by>Beta blockers; treated_by>Nitrates; diagnosed_by>Stress testing
Cardiovascular | Acute coronary syndromes | unstable angina, nstemi, acute coronary syndrome, acs | Atherosclerosis; Coronary circulation | differential_of>Stable angina and chronic coronary disease
Cardiovascular | Arrhythmia mechanisms | reentry, automaticity, triggered activity, arrhythmogenesis | Cardiac action potential |
Cardiovascular | Atrial fibrillation and flutter | atrial fibrillation, afib, atrial flutter, irregularly irregular | Arrhythmia mechanisms | causes>Cardioembolic stroke; treated_by>Rate control; treated_by>Anticoagulants
Cardiovascular | Supraventricular tachycardia | svt, avnrt, wolff-parkinson-white, wpw | Arrhythmia mechanisms | treated_by>Vagal manoeuvres; treated_by>Adenosine
Cardiovascular | Ventricular arrhythmias | ventricular tachycardia, ventricular fibrillation, torsades de pointes, long qt | Arrhythmia mechanisms | caused_by>Electrolyte disturbance; treated_by>Defibrillation
Cardiovascular | Bradyarrhythmias and heart block | sinus bradycardia, first-degree block, mobitz, complete heart block, pacemaker indication | Arrhythmia mechanisms |
Cardiovascular | Cardiomyopathies | dilated cardiomyopathy, hypertrophic cardiomyopathy, restrictive cardiomyopathy, hocm | Cardiac output | differential_of>Heart failure
Cardiovascular | Pericardial disease | pericarditis, pericardial effusion, cardiac tamponade, constrictive pericarditis, pulsus paradoxus | Cardiac cycle and pressure-volume loops
Cardiovascular | Infective endocarditis | endocarditis, duke criteria, vegetation, janeway lesions | Valvular heart disease; Bacterial toxins | diagnosed_by>Blood cultures and echocardiography
Cardiovascular | Rheumatic heart disease | rheumatic fever, jones criteria, mitral stenosis | Valvular heart disease; Hypersensitivity reactions
Cardiovascular | Aortic aneurysm and dissection | aortic aneurysm, aortic dissection, abdominal aortic aneurysm, marfan aorta | Atherosclerosis; Blood pressure regulation | presents_with>Tearing chest or back pain
Cardiovascular | Peripheral arterial disease | claudication, peripheral vascular disease, ankle-brachial index, critical limb ischemia | Atherosclerosis |
Cardiovascular | Venous disease and thromboembolism | deep venous thrombosis, varicose veins, venous insufficiency, virchow triad | Coagulation cascade | causes>Pulmonary embolism
Cardiovascular | Vasculitides | vasculitis, giant cell arteritis, takayasu, polyarteritis nodosa, granulomatosis with polyangiitis, kawasaki disease, henoch-schonlein | Hypersensitivity reactions; Acute inflammation
Cardiovascular | Syncope | syncope, vasovagal, orthostatic hypotension, cardiac syncope | Blood pressure regulation |
Cardiovascular | Hypertensive emergency | hypertensive crisis, malignant hypertension, end-organ damage | Hypertension |
Cardiovascular | Lipid disorders and statin therapy | hyperlipidemia management, familial hypercholesterolemia, statins, ldl targets | Lipoprotein metabolism | treated_by>Statins
Renal | Renal anatomy and blood flow | renal blood flow, afferent arteriole, efferent arteriole, juxtaglomerular apparatus, filtration fraction | Glomerular filtration |
Renal | Sodium and water handling | sodium balance, free water clearance, adh, vasopressin, aquaporin, countercurrent multiplier | Tubular transport |
Renal | Hyponatremia and hypernatremia | hyponatremia, hypernatremia, siadh, diabetes insipidus, serum osmolality | Sodium and water handling | diagnosed_by>Urine osmolality and sodium
Renal | Potassium disorders | hyperkalemia, hypokalemia, potassium shift, ecg changes of hyperkalemia | Electrolyte physiology; Tubular transport
Renal | Calcium phosphate and magnesium disorders | hypercalcemia, hypocalcemia, hyperphosphatemia, hypomagnesemia | Calcium and PTH regulation |
Renal | Glomerular disease patterns | glomerulonephritis patterns, proteinuria, hematuria evaluation, membranoproliferative | Glomerular filtration | differential_of>Nephrotic syndrome; differential_of>Nephritic syndrome
Renal | Diabetic nephropathy | diabetic kidney disease, kimmelstiel-wilson, microalbuminuria | Diabetes mellitus and DKA; Glomerular filtration | treated_by>ACE inhibitors and ARBs
Renal | Tubulointerstitial disease | acute interstitial nephritis, analgesic nephropathy, tubulointerstitial nephritis | Tubular transport |
Renal | Renal tubular acidosis | rta, type 1 rta, type 2 rta, type 4 rta | Acid-base disorders; Tubular transport |
Renal | Nephrolithiasis | kidney stones, renal colic, calcium oxalate stone, struvite, uric acid stone | Tubular transport | presents_with>Colicky flank pain radiating to the groin
Renal | Urinary tract infection and pyelonephritis | uti, cystitis, pyelonephritis, dysuria | Tubular transport | treated_by>Antibiotics guided by culture
Renal | Urinary obstruction and retention | hydronephrosis, urinary retention, obstructive uropathy, benign prostatic hyperplasia | Glomerular filtration |
Renal | Renal replacement therapy | dialysis, hemodialysis, peritoneal dialysis, kidney transplant, dialysis indications | Chronic kidney disease |
Renal | Renal and bladder tumours | renal cell carcinoma, wilms tumor, bladder cancer, transitional cell carcinoma | Neoplasia principles |
Renal | Polycystic kidney disease | adpkd, arpkd, polycystic kidneys | Mendelian inheritance patterns; Glomerular filtration |
Respiratory | Respiratory anatomy and airways | bronchial tree, alveoli, pleura, dead space anatomy, respiratory epithelium | |
Respiratory | Control of ventilation | respiratory drive, central chemoreceptors, peripheral chemoreceptors, hypercapnic drive | Gas exchange |
Respiratory | Pulmonary circulation | pulmonary vascular resistance, hypoxic vasoconstriction, pulmonary hypertension | Ventilation-perfusion mismatch | causes>Cor pulmonale
Respiratory | Asthma management | asthma treatment, inhaled corticosteroids, saba, exacerbation of asthma | Asthma | treated_by>Stepwise inhaler therapy
Respiratory | COPD | chronic obstructive pulmonary disease, emphysema, chronic bronchitis, alpha-1 antitrypsin | Obstructive vs restrictive lung disease | treated_by>Bronchodilators; treated_by>Smoking cessation
Respiratory | Interstitial lung disease | pulmonary fibrosis, idiopathic pulmonary fibrosis, sarcoidosis, pneumoconiosis, asbestosis, silicosis | Obstructive vs restrictive lung disease |
Respiratory | Pneumonia | community-acquired pneumonia, hospital-acquired pneumonia, aspiration pneumonia, consolidation | Innate vs adaptive immunity | diagnosed_by>Chest radiograph; treated_by>Antibiotics by setting and severity
Respiratory | Tuberculosis management | tb treatment, rifampin isoniazid, latent tuberculosis, directly observed therapy | Tuberculosis |
Respiratory | Pleural disease | pleural effusion, pneumothorax, tension pneumothorax, empyema, lights criteria | Respiratory anatomy and airways | presents_with>Pleuritic pain and reduced breath sounds
Respiratory | Lung cancer | bronchogenic carcinoma, small cell lung cancer, non-small cell lung cancer, pancoast tumor | Neoplasia principles | associated_with>Paraneoplastic syndromes
Respiratory | Sleep-disordered breathing | obstructive sleep apnea, osa, sleep apnea, obesity hypoventilation | Control of ventilation |
Respiratory | Cystic fibrosis | cftr, cystic fibrosis | Mendelian inheritance patterns; Respiratory anatomy and airways |
Respiratory | Respiratory failure and ventilation | respiratory failure, mechanical ventilation, intubation indications, oxygen therapy | Gas exchange; Control of ventilation |
Endocrine | Pituitary disorders | prolactinoma, acromegaly, growth hormone, hypopituitarism, sheehan syndrome, diabetes insipidus central | Hypothalamic-pituitary axes |
Endocrine | Thyroid nodules and cancer | thyroid nodule, papillary thyroid carcinoma, medullary thyroid carcinoma, fine needle aspiration | Thyroid hormone physiology; Neoplasia principles |
Endocrine | Thyroid emergencies | thyroid storm, myxedema coma | Thyroid hormone physiology |
Endocrine | Type 1 versus type 2 diabetes | type 1 diabetes, type 2 diabetes, insulin resistance, autoimmune diabetes | Insulin and glucose metabolism | differential_of>Diabetes mellitus and DKA
Endocrine | Diabetes management and monitoring | metformin, hba1c, glp-1 agonist, sglt2 inhibitor, insulin regimen, diabetes complications screening | Type 1 versus type 2 diabetes | treated_by>Metformin first-line in type 2
Endocrine | Hyperosmolar hyperglycemic state | hhs, hyperosmolar nonketotic | Insulin and glucose metabolism | differential_of>Diabetes mellitus and DKA
Endocrine | Hypoglycemia | hypoglycemia, whipple triad, insulinoma, sulfonylurea overdose | Insulin and glucose metabolism |
Endocrine | Adrenal insufficiency | addison disease, adrenal crisis, secondary adrenal insufficiency, cosyntropin | Adrenal cortex and Cushing syndrome | treated_by>Hydrocortisone
Endocrine | Pheochromocytoma and adrenal masses | pheochromocytoma, adrenal incidentaloma, metanephrines | Adrenal cortex and Cushing syndrome | presents_with>Episodic hypertension, headache and sweating
Endocrine | Congenital adrenal hyperplasia | cah, 21-hydroxylase deficiency, ambiguous genitalia | Adrenal cortex and Cushing syndrome; Mendelian inheritance patterns |
Endocrine | Parathyroid disorders | primary hyperparathyroidism, hypoparathyroidism, parathyroid adenoma | Calcium and PTH regulation |
Endocrine | Multiple endocrine neoplasia | men1, men2a, men2b, multiple endocrine neoplasia | Neoplasia principles; Mendelian inheritance patterns |
Endocrine | Obesity and metabolic syndrome | obesity, metabolic syndrome, bmi, bariatric surgery | Insulin and glucose metabolism; Lipoprotein metabolism |
Gastrointestinal | Gastrointestinal motility and secretion | peristalsis, gastric acid secretion, parietal cell, gastrin, lower esophageal sphincter | |
Gastrointestinal | Digestion and absorption | brush border, micelles, bile salts, pancreatic enzymes, iron absorption | Gastrointestinal motility and secretion |
Gastrointestinal | Esophageal disorders | gerd, achalasia, barrett esophagus, esophageal cancer, dysphagia | Gastrointestinal motility and secretion |
Gastrointestinal | Peptic ulcer disease and gastritis | peptic ulcer, gastritis, helicobacter pylori, nsaid ulcer, zollinger-ellison | Gastrointestinal motility and secretion | treated_by>Proton pump inhibitor and H pylori eradication
Gastrointestinal | Viral hepatitis | hepatitis a, hepatitis b, hepatitis c, hepatitis serology, hbsag | Liver function tests | causes>Cirrhosis; causes>Hepatocellular carcinoma
Gastrointestinal | Alcohol-related and fatty liver disease | alcoholic hepatitis, nafld, nash, steatosis | Cell injury and necrosis; Liver function tests | causes>Cirrhosis
Gastrointestinal | Complications of cirrhosis | hepatic encephalopathy, spontaneous bacterial peritonitis, hepatorenal syndrome, ascites management | Cirrhosis; Portal hypertension |
Gastrointestinal | Biliary disease | gallstones, cholecystitis, cholangitis, choledocholithiasis, biliary colic, charcot triad | Digestion and absorption | treated_by>Cholecystectomy
Gastrointestinal | Chronic pancreatitis and pancreatic cancer | chronic pancreatitis, pancreatic adenocarcinoma, courvoisier | Acute pancreatitis; Neoplasia principles |
Gastrointestinal | Diarrhea and malabsorption syndromes | acute diarrhea, chronic diarrhea, osmotic diarrhea, secretory diarrhea, lactose intolerance, whipple disease | Malabsorption |
Gastrointestinal | Colorectal cancer and polyps | colorectal carcinoma, adenomatous polyp, fap, lynch syndrome | Neoplasia principles | diagnosed_by>Colonoscopy
Gastrointestinal | Gastrointestinal bleeding | upper gi bleed, lower gi bleed, hematemesis, melena, hematochezia | Portal hypertension; Peptic ulcer disease and gastritis | treated_by>Resuscitation then endoscopy
Gastrointestinal | Bowel obstruction and ileus | small bowel obstruction, large bowel obstruction, adhesions, volvulus, ileus | Gastrointestinal motility and secretion |
Gastrointestinal | Diverticular disease and appendicitis | diverticulitis, diverticulosis, appendicitis, mcburney point | Acute inflammation |
Gastrointestinal | Irritable bowel syndrome | ibs, functional bowel disorder, rome criteria | Gastrointestinal motility and secretion | differential_of>Inflammatory bowel disease
Hematology & Oncology | Hematopoiesis | bone marrow, stem cell, blood cell lineages, erythropoietin | |
Hematology & Oncology | Macrocytic and megaloblastic anemia | macrocytic anemia, b12 deficiency, folate deficiency, pernicious anemia, hypersegmented neutrophils | Hemoglobin and iron metabolism; Vitamins and their deficiencies |
Hematology & Oncology | Anemia of chronic disease | anemia of inflammation, hepcidin | Chronic inflammation; Hemoglobin and iron metabolism |
Hematology & Oncology | Aplastic anemia and marrow failure | aplastic anemia, pancytopenia, marrow failure | Hematopoiesis |
Hematology & Oncology | Thalassemias | alpha thalassemia, beta thalassemia, hemoglobin electrophoresis | Hemoglobin and iron metabolism; Mendelian inheritance patterns |
Hematology & Oncology | Autoimmune hemolysis and microangiopathy | autoimmune hemolytic anemia, warm agglutinin, cold agglutinin, ttp, hus, dic, schistocytes | Hemolytic anemia; Coagulation cascade |
Hematology & Oncology | Platelet disorders | thrombocytopenia, itp, von willebrand disease, bernard-soulier, glanzmann | Coagulation cascade | presents_with>Mucocutaneous bleeding
Hematology & Oncology | Coagulation factor disorders | hemophilia a, hemophilia b, factor v leiden, antithrombin deficiency, thrombophilia | Coagulation cascade |
Hematology & Oncology | Transfusion medicine | blood transfusion, abo compatibility, transfusion reaction, massive transfusion | Hypersensitivity reactions |
Hematology & Oncology | Lymphomas | hodgkin lymphoma, non-hodgkin lymphoma, reed-sternberg, burkitt lymphoma | Neoplasia principles; Innate vs adaptive immunity |
Hematology & Oncology | Plasma cell disorders | multiple myeloma, mgus, bence jones, monoclonal gammopathy | Neoplasia principles | causes>Hypercalcemia; causes>Renal failure
Hematology & Oncology | Myeloproliferative neoplasms | polycythemia vera, essential thrombocythemia, myelofibrosis, jak2 | Hematopoiesis; Tumor suppressors and oncogenes |
Hematology & Oncology | Oncologic emergencies | tumor lysis syndrome, febrile neutropenia, spinal cord compression, superior vena cava syndrome, hypercalcemia of malignancy | Neoplasia principles |
Hematology & Oncology | Principles of chemotherapy and radiation | chemotherapy, alkylating agents, antimetabolites, radiation therapy, myelosuppression | Cell cycle and its checkpoints |
Neurology | Cerebral blood flow and intracranial dynamics | cerebral perfusion pressure, autoregulation of cerebral blood flow, csf circulation, hydrocephalus | Raised intracranial pressure |
Neurology | Stroke management | acute ischemic stroke, thrombectomy, tpa window, nihss | Stroke syndromes | treated_by>Thrombolysis within the window; treated_by>Mechanical thrombectomy
Neurology | Intracranial hemorrhage | subarachnoid hemorrhage, intracerebral hemorrhage, subdural hematoma, epidural hematoma, berry aneurysm | Raised intracranial pressure | presents_with>Thunderclap headache
Neurology | Seizure disorders and epilepsy | epilepsy syndromes, focal seizure, generalised seizure, status epilepticus, antiepileptic drugs | Seizures | treated_by>Benzodiazepine then antiepileptic loading
Neurology | Headache disorders | migraine, tension headache, cluster headache, headache red flags | | differential_of>Intracranial hemorrhage
Neurology | Demyelinating disease | multiple sclerosis, optic neuritis, guillain-barre, cidp | Hypersensitivity reactions; Action potential |
Neurology | Neurodegenerative disease | parkinson disease, alzheimer disease, huntington disease, als, lewy body dementia | Neurotransmitters and psychopharmacology |
Neurology | Peripheral neuropathy | polyneuropathy, diabetic neuropathy, carpal tunnel, mononeuropathy, radiculopathy | Spinal cord tracts |
Neurology | Central nervous system infections | meningitis, encephalitis, brain abscess, csf analysis, lumbar puncture | Innate vs adaptive immunity | diagnosed_by>Lumbar puncture; treated_by>Empiric antibiotics without delay
Neurology | Brain tumours | glioblastoma, meningioma, brain metastases, pituitary tumor mass effect | Neoplasia principles |
Neurology | Vertigo and hearing loss | vertigo, bppv, meniere disease, vestibular neuritis, sensorineural hearing loss | |
Neurology | Cranial nerves and brainstem syndromes | cranial nerve palsy, brainstem stroke, wallenberg, facial nerve palsy, bell palsy | Spinal cord tracts |
Neurology | Coma and brain death | coma, glasgow coma scale, brain death, altered mental status | Cerebral blood flow and intracranial dynamics |
Immunology | Innate immune cells and barriers | neutrophil, macrophage, natural killer cell, toll-like receptor, mucosal barrier | Innate vs adaptive immunity |
Immunology | T cell and B cell development | thymus, positive selection, negative selection, vdj recombination, class switching | MHC and antigen presentation |
Immunology | Tolerance and autoimmunity | self-tolerance, central tolerance, autoantibodies, lupus, sle, sjogren, scleroderma | Hypersensitivity reactions | causes>Systemic autoimmune disease
Immunology | Vaccines and immunisation principles | live attenuated vaccine, inactivated vaccine, passive immunity, herd immunity | Innate vs adaptive immunity |
Immunology | Immunosuppressive therapy | corticosteroids, calcineurin inhibitor, cyclosporine, tacrolimus, biologics, tnf inhibitor | Transplant rejection | causes>Opportunistic infection
Microbiology & Infectious disease | Gram-positive bacteria | staphylococcus aureus, streptococcus pneumoniae, streptococcus pyogenes, enterococcus, clostridioides difficile, listeria | Bacterial toxins |
Microbiology & Infectious disease | Gram-negative bacteria | escherichia coli, klebsiella, pseudomonas, neisseria, haemophilus, salmonella, shigella, campylobacter | Bacterial toxins |
Microbiology & Infectious disease | Atypical and zoonotic organisms | mycoplasma, chlamydia, legionella, rickettsia, borrelia, lyme disease, brucella, leptospira | Bacterial toxins |
Microbiology & Infectious disease | DNA and RNA viruses | herpesvirus, cytomegalovirus, epstein-barr, influenza, measles, rotavirus, hepatitis viruses, varicella | Innate vs adaptive immunity |
Microbiology & Infectious disease | Fungal infections | candida, aspergillus, cryptococcus, histoplasma, pneumocystis, mucormycosis | Immunodeficiencies |
Microbiology & Infectious disease | Parasitic infections | schistosoma, entamoeba, giardia, toxoplasma, strongyloides, ascaris, hookworm, trypanosoma | Innate vs adaptive immunity |
Microbiology & Infectious disease | Sexually transmitted infections | syphilis, gonorrhea, chlamydia trachomatis, trichomonas, genital herpes, hpv | Innate vs adaptive immunity | treated_by>Partner treatment and screening
Microbiology & Infectious disease | HIV management and opportunistic infections | antiretroviral therapy, cd4 count, opportunistic infection prophylaxis, aids-defining illness | HIV pathogenesis | treated_by>Antiretroviral therapy
Microbiology & Infectious disease | Healthcare-associated infection and stewardship | nosocomial infection, catheter-associated infection, hand hygiene, antimicrobial stewardship, mrsa | Antibiotic mechanisms and resistance |
Microbiology & Infectious disease | Travel and tropical infections | dengue, typhoid, cholera, yellow fever, rabies, viral hemorrhagic fever | Innate vs adaptive immunity | differential_of>Malaria
Pediatrics | Neonatal assessment and resuscitation | apgar score, neonatal resuscitation, newborn examination, meconium | |
Pediatrics | Neonatal jaundice | physiological jaundice, kernicterus, phototherapy, breast milk jaundice | Bilirubin metabolism and jaundice | treated_by>Phototherapy by nomogram
Pediatrics | Prematurity and its complications | preterm birth, respiratory distress syndrome of the newborn, necrotising enterocolitis, retinopathy of prematurity, surfactant deficiency | Lung mechanics |
Pediatrics | Growth and developmental milestones | developmental milestones, growth chart, failure to thrive, short stature, developmental delay | |
Pediatrics | Childhood immunisation schedule | childhood vaccines, immunisation schedule, catch-up vaccination | Vaccines and immunisation principles |
Pediatrics | Common paediatric infections | otitis media, pharyngitis in children, croup, bronchiolitis, hand foot and mouth, scarlet fever | Innate vs adaptive immunity |
Pediatrics | The febrile infant | fever without source, serious bacterial infection, febrile seizure, neonatal sepsis | Innate vs adaptive immunity | treated_by>Age-based work-up and empiric antibiotics
Pediatrics | Paediatric respiratory emergencies | epiglottitis, foreign body aspiration, status asthmaticus in children, stridor | Respiratory anatomy and airways |
Pediatrics | Congenital gastrointestinal disorders | pyloric stenosis, intussusception, hirschsprung disease, malrotation, biliary atresia | Gastrointestinal motility and secretion |
Pediatrics | Paediatric genetic and metabolic screening | newborn screening, congenital hypothyroidism screening, metabolic screening | Inborn errors of amino acid metabolism |
Pediatrics | Child abuse and neglect | non-accidental injury, shaken baby, mandatory reporting, neglect | | treated_by>Protection and mandated reporting
Pediatrics | Adolescent medicine | puberty, tanner stages, adolescent confidentiality, risk behaviour screening | Menstrual cycle hormones |
Obstetrics & Gynecology | Physiology of pregnancy | pregnancy physiology, plasma volume expansion, hcg, placenta | Menstrual cycle hormones |
Obstetrics & Gynecology | Antenatal screening and fetal assessment | ultrasound dating, nuchal translucency, quad screen, cell-free dna, fetal monitoring, biophysical profile | Prenatal care |
Obstetrics & Gynecology | Early pregnancy complications | miscarriage, ectopic pregnancy, molar pregnancy, hyperemesis gravidarum | Physiology of pregnancy | presents_with>First-trimester bleeding or pain
Obstetrics & Gynecology | Hypertensive disorders of pregnancy | gestational hypertension, preeclampsia with severe features, eclampsia, hellp syndrome | Pre-eclampsia | treated_by>Magnesium sulfate and delivery
Obstetrics & Gynecology | Diabetes in pregnancy | gestational diabetes, glucose tolerance test in pregnancy, macrosomia | Insulin and glucose metabolism; Physiology of pregnancy |
Obstetrics & Gynecology | Antepartum haemorrhage | placenta previa, placental abruption, vasa previa | Physiology of pregnancy |
Obstetrics & Gynecology | Labour and delivery | stages of labour, fetal presentation, cesarean delivery, induction of labour, cardiotocography | Physiology of pregnancy |
Obstetrics & Gynecology | Postpartum complications | postpartum hemorrhage, endometritis, postpartum depression, lactation problems | Labour and delivery | treated_by>Uterotonics and uterine massage
Obstetrics & Gynecology | Contraception and family planning | contraception, oral contraceptive pill, iud, emergency contraception, sterilisation | Menstrual cycle hormones |
Obstetrics & Gynecology | Infertility and assisted reproduction | infertility, ovulation induction, ivf, semen analysis | Menstrual cycle hormones |
Obstetrics & Gynecology | Menstrual disorders | amenorrhea, dysmenorrhea, polycystic ovary syndrome, pcos, premenstrual syndrome | Menstrual cycle hormones |
Obstetrics & Gynecology | Abnormal uterine bleeding and fibroids | abnormal uterine bleeding, uterine fibroids, leiomyoma, endometrial hyperplasia | Menstrual cycle hormones |
Obstetrics & Gynecology | Endometriosis and pelvic pain | endometriosis, chronic pelvic pain, adenomyosis | Menstrual cycle hormones |
Obstetrics & Gynecology | Gynecologic malignancies | ovarian cancer, endometrial cancer, cervical cancer, ca-125 | Neoplasia principles | diagnosed_by>Cervical cytology and HPV testing
Obstetrics & Gynecology | Menopause | menopause, perimenopause, hormone replacement therapy, vasomotor symptoms | Menstrual cycle hormones |
Obstetrics & Gynecology | Pelvic infections | pelvic inflammatory disease, vaginitis, bacterial vaginosis, tubo-ovarian abscess | Sexually transmitted infections |
Surgery & Emergency | Primary survey and trauma resuscitation | atls, primary survey, abcde approach, focused assessment with sonography, damage control | Shock | treated_by>Airway, breathing, circulation in order
Surgery & Emergency | Head and spinal trauma | traumatic brain injury, cervical spine injury, canadian ct head rule, spinal immobilisation | Raised intracranial pressure |
Surgery & Emergency | Chest and abdominal trauma | tension pneumothorax management, hemothorax, splenic injury, penetrating abdominal trauma | Primary survey and trauma resuscitation |
Surgery & Emergency | Burns and wound care | burns, rule of nines, parkland formula, wound healing management, tetanus prophylaxis | Wound healing |
Surgery & Emergency | Acute abdomen | peritonitis, rebound tenderness, surgical abdomen, perforated viscus | Diverticular disease and appendicitis | diagnosed_by>Upright chest radiograph or CT
Surgery & Emergency | Hernias | inguinal hernia, femoral hernia, incarcerated hernia, strangulated hernia | |
Surgery & Emergency | Perioperative care | preoperative assessment, postoperative fever, venous thromboembolism prophylaxis, postoperative ileus, anesthesia complications | Wound healing |
Surgery & Emergency | Toxicology and overdose | poisoning, acetaminophen overdose, n-acetylcysteine, opioid overdose management, carbon monoxide, organophosphate, salicylate toxicity | Pharmacokinetics | treated_by>Antidote plus supportive care
Surgery & Emergency | Environmental emergencies | heat stroke, hypothermia management, drowning, altitude sickness, envenomation | Thermoregulation and fever |
Surgery & Emergency | Cardiac arrest and resuscitation | cardiopulmonary resuscitation, acls, defibrillation, return of spontaneous circulation | Ventricular arrhythmias |
Surgery & Emergency | Transplant surgery principles | organ transplantation, graft survival, donor matching | Transplant rejection |
Dermatology | Skin structure and lesion morphology | epidermis, dermis, macule, papule, plaque, vesicle, bulla, primary lesion | |
Dermatology | Eczema and papulosquamous disease | atopic dermatitis, contact dermatitis, psoriasis, lichen planus, seborrheic dermatitis | Skin structure and lesion morphology; Hypersensitivity reactions |
Dermatology | Skin infections and infestations | cellulitis, impetigo, erysipelas, tinea, scabies, herpes zoster, necrotising fasciitis | Skin structure and lesion morphology | treated_by>Antibiotics guided by severity
Dermatology | Skin cancers | melanoma, basal cell carcinoma, squamous cell carcinoma, actinic keratosis, abcde criteria | Neoplasia principles |
Dermatology | Blistering and severe drug eruptions | pemphigus vulgaris, bullous pemphigoid, stevens-johnson syndrome, toxic epidermal necrolysis, drug rash | Hypersensitivity reactions | treated_by>Stop the drug and supportive care
Dermatology | Acne and hair disorders | acne vulgaris, rosacea, alopecia, hirsutism | Skin structure and lesion morphology |
Dermatology | Skin signs of systemic disease | erythema nodosum, acanthosis nigricans, pyoderma gangrenosum, cutaneous signs of malignancy | Skin structure and lesion morphology |
Psychiatry | Psychiatric assessment and mental status | mental status examination, psychiatric history, risk assessment | |
Psychiatry | Obsessive-compulsive and related disorders | ocd, obsessions, compulsions, body dysmorphic disorder | Neurotransmitters and psychopharmacology |
Psychiatry | Trauma and stressor-related disorders | ptsd, acute stress disorder, adjustment disorder | Neurotransmitters and psychopharmacology |
Psychiatry | Personality disorders | borderline personality disorder, antisocial personality, cluster a, cluster b, cluster c | Psychiatric assessment and mental status |
Psychiatry | Somatic symptom and factitious disorders | somatic symptom disorder, conversion disorder, factitious disorder, malingering | Psychiatric assessment and mental status |
Psychiatry | Sleep disorders | insomnia, narcolepsy, parasomnia, sleep architecture, rem sleep | Neurotransmitters and psychopharmacology |
Psychiatry | Psychopharmacology in practice | antidepressant choice, serotonin syndrome, neuroleptic malignant syndrome, extrapyramidal symptoms, lithium toxicity, mood stabilisers | Neurotransmitters and psychopharmacology |
Psychiatry | Child and adolescent psychiatry | adhd, autism spectrum disorder, conduct disorder, tic disorder | Growth and developmental milestones |
Reproductive & Musculoskeletal | Bone physiology and remodelling | osteoblast, osteoclast, bone remodelling, bone mineral density | Calcium and PTH regulation |
Reproductive & Musculoskeletal | Fractures and orthopaedic injuries | fracture healing, compartment syndrome, dislocation, sports injury, meniscal tear | Bone physiology and remodelling |
Reproductive & Musculoskeletal | Osteoarthritis | degenerative joint disease, oa | Bone physiology and remodelling | differential_of>Rheumatoid arthritis
Reproductive & Musculoskeletal | Seronegative spondyloarthropathies | ankylosing spondylitis, psoriatic arthritis, reactive arthritis, hla-b27 | Hypersensitivity reactions |
Reproductive & Musculoskeletal | Crystal arthropathies | pseudogout, calcium pyrophosphate, monosodium urate | Gout |
Reproductive & Musculoskeletal | Bone and joint infection | septic arthritis, osteomyelitis, prosthetic joint infection | Acute inflammation | treated_by>Joint aspiration then antibiotics
Reproductive & Musculoskeletal | Muscle disease | myopathy, polymyositis, dermatomyositis, muscular dystrophy, duchenne, rhabdomyolysis | Muscle contraction |
Reproductive & Musculoskeletal | Male reproductive disorders | erectile dysfunction, testicular torsion, varicocele, prostate cancer, benign prostatic hyperplasia management, testicular cancer | Menstrual cycle hormones |
Reproductive & Musculoskeletal | Breast disease | breast cancer, fibroadenoma, mastitis, breast mass evaluation, brca | Neoplasia principles | diagnosed_by>Triple assessment
Pharmacology | Antihypertensive drug classes | calcium channel blocker, thiazide for hypertension, beta blocker for hypertension, antihypertensive choice | Blood pressure regulation |
Pharmacology | Heart failure pharmacotherapy | sacubitril, spironolactone in heart failure, digoxin, sglt2 in heart failure | Heart failure |
Pharmacology | Antiarrhythmic drugs | class i antiarrhythmic, amiodarone, sodium channel blocker antiarrhythmic, class iii antiarrhythmic | Cardiac action potential |
Pharmacology | Antiplatelet drugs | aspirin antiplatelet, clopidogrel, p2y12 inhibitor, dual antiplatelet therapy | Coagulation cascade |
Pharmacology | Antidiabetic drugs | sulfonylurea, dpp-4 inhibitor, thiazolidinedione, insulin types | Insulin and glucose metabolism |
Pharmacology | Analgesics and anaesthetics | nsaids, opioid analgesia, local anaesthetic, general anaesthesia, paracetamol | Pharmacokinetics |
Pharmacology | Antimicrobial classes in practice | penicillins, cephalosporins, macrolides, fluoroquinolones, aminoglycosides, vancomycin, antifungal drugs, antiviral drugs | Antibiotic mechanisms and resistance |
Pharmacology | Gastrointestinal and respiratory drugs | proton pump inhibitor, h2 blocker, antiemetic, laxative, inhaled bronchodilator, leukotriene antagonist | Gastrointestinal motility and secretion |
Pharmacology | Drugs in pregnancy and lactation | teratogenic drugs, pregnancy drug safety, lactation safety | Physiology of pregnancy |
Biostatistics, Ethics & Prevention | Screening principles | screening test, lead-time bias in screening, sensitivity of screening, overdiagnosis | Sensitivity and specificity |
Biostatistics, Ethics & Prevention | Diagnostic test evaluation | likelihood ratio, roc curve, pre-test probability, post-test probability, cut-off | Sensitivity and specificity |
Biostatistics, Ethics & Prevention | Epidemiological measures | incidence, prevalence, mortality rate, attributable risk, survival analysis | Study designs |
Biostatistics, Ethics & Prevention | Interpreting clinical trials | intention to treat, randomisation, blinding, external validity, meta-analysis, forest plot | Study designs; Hypothesis testing |
Biostatistics, Ethics & Prevention | End-of-life care and ethics | advance directive, do not resuscitate, palliative care, withdrawal of care, futility, hospice | Informed consent and capacity |
Biostatistics, Ethics & Prevention | Communication and difficult conversations | breaking bad news, spikes protocol, shared decision making, interpreter use, cultural competence | Informed consent and capacity |
Biostatistics, Ethics & Prevention | Health systems and cost-conscious care | health insurance, cost-effectiveness, access to care, quality measures, social determinants of health | Patient safety and quality |
Biostatistics, Ethics & Prevention | Occupational and environmental health | occupational exposure, lead poisoning, asbestos exposure, environmental toxin | Public health surveillance
Biostatistics, Ethics & Prevention | Public health surveillance | notifiable disease, outbreak investigation, contact tracing, quarantine | Study designs |
Biostatistics, Ethics & Prevention | Geriatric assessment | frailty, falls in older adults, polypharmacy, functional assessment, delirium prevention | Delirium and dementia |
Biostatistics, Ethics & Prevention | Nutrition and lifestyle counselling | nutrition assessment, malnutrition, exercise prescription, smoking cessation, alcohol counselling | Vitamins and their deficiencies |
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
  'Psychiatry',
  'Pediatrics',
  'Obstetrics & Gynecology',
  'Surgery & Emergency',
  'Dermatology',
  'Biostatistics, Ethics & Prevention',
];

export const RELATION_TYPES = ['causes', 'caused_by', 'inhibits', 'activates', 'associated_with', 'presents_with', 'diagnosed_by', 'treated_by', 'differential_of'];
