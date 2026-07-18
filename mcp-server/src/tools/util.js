// util.js — shared helpers for tool handlers.
export const PHASE_ORDER = ['phase_0', 'phase_0_5', 'phase_1', 'phase_2', 'phase_3', 'phase_4'];

export function ok(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}
export function fail(message) {
  return {
    content: [{ type: 'text', text: `ERROR: ${message}` }],
    isError: true,
  };
}
export function req(v, name) {
  if (v === undefined || v === null || v === '') {
    throw new Error(`missing required argument: ${name}`);
  }
  return v;
}
export function isDone(status) {
  return status === 'done';
}
