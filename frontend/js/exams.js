/* Target exams (mirrors ai/teacher/modules.js EXAMS). */
import { state } from './state.js';

export const EXAMS = {
  step1: { label: 'USMLE Step 1', short: 'Step 1', hint: 'Mechanisms and basic science applied to disease' },
  step2ck: { label: 'USMLE Step 2 CK', short: 'Step 2 CK', hint: 'Diagnosis, next best step and management' },
  step3: { label: 'USMLE Step 3', short: 'Step 3', hint: 'Management over time, prevention, ethics and biostatistics' },
};
export const examKey = (e) => (EXAMS[e] ? e : 'step1');
export const currentExam = () => examKey(state.settings.exam);
export const examShort = (e = currentExam()) => EXAMS[examKey(e)].short;
export const examLabel = (e = currentExam()) => EXAMS[examKey(e)].label;
