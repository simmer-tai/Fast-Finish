// Each transform is self-contained, so a skipped snapshot needs no recovery.
export function encodeTransform(values: number[]): number[] {
  let mask = 0;
  const packed = [0];
  for (let i = 0; i < 7; i++) {
    if (!Object.is(values[i], i === 6 ? 1 : 0)) { mask |= 1 << i; packed.push(values[i]); }
  }
  packed[0] = mask;
  return packed.length < 7 ? packed : values;
}

export function decodeTransform(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7
    || !value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000)) return null;
  if (value.length === 7) return value;
  const mask = value[0];
  if (!Number.isInteger(mask) || mask < 0 || mask >= 128) return null;
  const result: number[] = [];
  let index = 1;
  for (let i = 0; i < 7; i++) result.push(mask & (1 << i) ? value[index++] : i === 6 ? 1 : 0);
  return index === value.length ? result : null;
}
