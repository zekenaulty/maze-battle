import type { AgenticaCapability, AgenticaStart } from '../../../services/agentica/contracts';
import { fields } from '../roster/codec';
import { check, integer, isObject, jsonBytes } from '../validation';
import { snapshotJson, wireId } from './validation';
import { MAX_LAUNCH_START_BYTES, type LaunchStarted } from './launch.types';

function capability(input: AgenticaCapability) {
  const c = fields(input, 'id name description kind effect inputSchema', 'durableHandoff');
  check(['maze.observe', 'maze.inspect', 'maze.navigate', 'maze.explore', 'maze.interact'].includes(c.id as string), 'unsupported launch capability');
  wireId(c.name); check(typeof c.description === 'string' && c.description.length <= 512, 'invalid capability description');
  const navigation = c.id === 'maze.navigate' || c.id === 'maze.explore' || c.id === 'maze.interact';
  check(c.kind === (navigation ? 'action' : 'query') && c.effect === (navigation ? 'writesLocalState' : 'readOnly')
    && (navigation ? c.durableHandoff === true : c.durableHandoff === undefined), 'invalid launch capability effect');
  const schema = fields(c.inputSchema, 'fields allowAdditionalProperties');
  check(schema.allowAdditionalProperties === false && Array.isArray(schema.fields)
    && schema.fields.length <= (c.id === 'maze.inspect' ? 8 : 6), 'invalid launch schema');
  const names = new Set<string>();
  for (const input of schema.fields) {
    const f = fields(input, 'name type required', 'description allowedValues minimum maximum'); wireId(f.name);
    check(!names.has(f.name) && ['string', 'integer'].includes(f.type as string) && typeof f.required === 'boolean', 'invalid capability field'); names.add(f.name);
    if (f.description !== undefined) check(typeof f.description === 'string' && f.description.length <= 256, 'invalid field description');
    if (f.allowedValues !== undefined) { check(f.type === 'string' && Array.isArray(f.allowedValues) && f.allowedValues.length <= 16, 'invalid field choices'); f.allowedValues.forEach(wireId); }
    for (const key of ['minimum', 'maximum']) if (f[key] !== undefined) check(f.type === 'integer' && Number.isSafeInteger(f[key]), 'invalid field range');
    if (f.minimum !== undefined && f.maximum !== undefined) check(Number(f.minimum) <= Number(f.maximum), 'invalid field range');
  }
}
export function launchProvider(input: unknown): AgenticaStart['provider'] {
  const p = fields(input, 'provider contextWindowTokens maxOutputTokens', 'model thinkingEffort includeThoughtSummaries');
  check(['fixture', 'openai'].includes(p.provider as string) && integer(p.contextWindowTokens, 1) && integer(p.maxOutputTokens, 1)
    && p.maxOutputTokens <= p.contextWindowTokens, 'invalid launch provider');
  for (const key of ['model', 'thinkingEffort']) if (p[key] !== undefined) wireId(p[key]);
  check(p.includeThoughtSummaries === undefined || typeof p.includeThoughtSummaries === 'boolean', 'invalid launch provider option');
  return snapshotJson(p) as unknown as AgenticaStart['provider'];
}
export function launchStart(input: AgenticaStart): AgenticaStart {
  const value = snapshotJson(input, MAX_LAUNCH_START_BYTES);
  const s = fields(value, 'protocolVersion hostId sessionId sessionEpoch scopeId perspectiveId objectiveId objective observation capabilities provider limits');
  check(s.protocolVersion === 1 && s.hostId === 'maze-battle' && s.perspectiveId === 'party', 'invalid launch protocol');
  for (const key of ['sessionId', 'sessionEpoch', 'scopeId', 'objectiveId']) wireId(s[key]);
  check(typeof s.objective === 'string' && s.objective.trim().length > 0 && s.objective.length <= 512, 'invalid launch objective');
  const o = fields(s.observation, 'observationId revision observedAt data', 'facts'); wireId(o.observationId);
  check(integer(o.revision) && typeof o.observedAt === 'string' && Number.isFinite(Date.parse(o.observedAt)) && isObject(o.data), 'invalid launch observation');
  check(o.facts === undefined || Array.isArray(o.facts) && o.facts.length <= 32, 'invalid launch facts');
  check(Array.isArray(value.capabilities) && value.capabilities.length > 0 && value.capabilities.length <= 5
    && new Set(value.capabilities.map(c => c.id)).size === value.capabilities.length, 'invalid launch manifests'); value.capabilities.forEach(capability);
  launchProvider(s.provider);
  const limits = fields(s.limits, 'maxSteps maxRefinements maxPlanContinuations timeoutSeconds actionTimeoutSeconds');
  for (const key of Object.keys(limits)) check(integer(limits[key], ['maxRefinements', 'maxPlanContinuations'].includes(key) ? 0 : 1), 'invalid launch limits');
  return value;
}
export function launchStarted(input: LaunchStarted, start: AgenticaStart): LaunchStarted {
  const value = snapshotJson(input, 2048);
  // The SDK permits additional service metadata; retain it exactly without treating it as authority.
  check(isObject(value), 'invalid run announcement');
  wireId(value.runId); check(typeof value.manifestHash === 'string' && /^sha256:[a-f0-9]{64}$/.test(value.manifestHash), 'invalid announced manifest hash');
  for (const key of ['hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId'] as const)
    check(value[key] === start[key], 'run announcement binding changed');
  jsonBytes(value, 2048); return value;
}
