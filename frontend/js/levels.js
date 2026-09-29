/* Learner levels (mirrors ai/teacher/pedagogy.js LEVELS). */
export const LEVELS = [
  ['auto', 'Detect from my question'],
  ['beginner', 'Beginner / pre-medical'],
  ['student', 'Medical student'],
  ['exam', 'Exam candidate'],
  ['resident', 'Resident'],
  ['specialist', 'Specialist / advanced'],
];
export const levelKey = (l) => (LEVELS.some(([k]) => k === l) ? l : 'auto');
