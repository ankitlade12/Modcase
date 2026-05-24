export function stableHash(input: string): string {
  // Pure-TS fallback because crypto.subtle availability can vary by sandbox.
  let h = 0x811c9dc5;
  const salted = `modcase-v0:${input}`;
  for (let i = 0; i < salted.length; i += 1) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function makeId(prefix = 'id'): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}
