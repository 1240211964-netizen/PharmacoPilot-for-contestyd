import { assertSimulationInput } from './contracts.mjs';
import { seededRng } from './rng.mjs';
import { detectCriticalMoments } from './critical-moment-detector.mjs';
// 通用、无 DOM 的确定性事件引擎。领域细节由 scenarioConfig.ruleEvents 显式提供；不把 SWOT 写成 CH06 规则。
export function runDeterministicSimulation(input) {
  assertSimulationInput(input); const rng = seededRng(input.seed); const configured = Array.isArray(input.scenarioConfig.ruleEvents) ? input.scenarioConfig.ruleEvents : [];
  const events = configured.map((rule,index) => ({ eventId:`evt_${String(index + 1).padStart(3,'0')}`, lessonOffset:Number(rule.lessonOffset ?? index * 60), studentId:rule.studentId ?? input.studentProfiles[index % Math.max(1,input.studentProfiles.length)]?.studentId ?? null, groupId:rule.groupId ?? null, eventType:rule.eventType, relatedStage:rule.relatedStage ?? 'S5', relatedFieldPath:rule.relatedFieldPath ?? 's5LearningActivities', observedSignal:rule.observedSignal ?? rule.eventType, evidence:{ ruleId:rule.ruleId ?? `rule-${index + 1}`, seedDraw:Number(rng().toFixed(8)) }, severity:Number(rule.severity ?? 3) }));
  const criticalMoments = detectCriticalMoments(events);
  return { events, criticalMoments, metrics:{ eventCount:events.length, criticalMomentCount:criticalMoments.length }, warnings: events.length ? [] : ['NO_RULE_EVENTS'] };
}
