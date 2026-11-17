/** SYNTHETIC geometry and accessibility attributes. Never a real field survey. */
export const SYNTHETIC_TAG = 'routing-synthetic-v1';
export const SYNTHETIC_PREFIX = '[SYNTHETIC routing-v1]';
export const syntheticNodes = [
  { key: 'origin', coord: [110.4, -7.8], type: 'gate' },
  { key: 'destination', coord: [110.4005, -7.8], type: 'entrance' },
  { key: 'stairs', coord: [110.40025, -7.8001], type: 'stairs' },
  { key: 'ramp', coord: [110.40025, -7.80032], type: 'ramp' },
  { key: 'covered', coord: [110.40025, -7.7996], type: 'junction' },
  { key: 'guided', coord: [110.40025, -7.79943], type: 'junction' },
  { key: 'isolated', coord: [110.401, -7.8], type: 'entrance' },
] as const;
// Four parallel branches. Costs come ONLY from the existing profile seed weights.
export const syntheticBranches = [
  { key: 'stairs', width: 140, steps: 4, covered: true, guided: false },
  { key: 'ramp', width: 200, steps: 0, covered: false, guided: false },
  { key: 'covered', width: 180, steps: 0, covered: true, guided: false },
  { key: 'guided', width: 180, steps: 0, covered: true, guided: true },
] as const;
