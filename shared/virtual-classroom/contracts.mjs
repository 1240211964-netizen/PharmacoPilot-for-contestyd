export const SIMULATION_SCHEMA_VERSION = '1.0.0';
export const CRITICAL_MOMENT_TYPES = Object.freeze(['SILENCE','MISCONCEPTION','CONFLICT','OFF_TOPIC','PACE_ANOMALY','ASSESSMENT_AMBIGUITY']);
export function assertSimulationInput(input) {
  const required = ['workflowInstanceId','teachingDesignVersionId','courseId','chapterId','lessonHours','seed','studentProfiles','studentGroups','lessonTimeline','learningActivities','formativeSignals','adaptiveActions','performanceTask','rubric','scenarioConfig'];
  for (const key of required) if (input?.[key] == null) throw new Error(`SIMULATION_INPUT_INVALID:${key}`);
  if (!Array.isArray(input.studentProfiles) || !Array.isArray(input.lessonTimeline)) throw new Error('SIMULATION_INPUT_INVALID:arrays');
  return true;
}
