// Capture initial mutable state without replacing shared Set or Vector references.
export function snapshotState<T extends object>(state: T): () => void {
  const entries = Object.entries(state).map(([key, value]) => [key, value instanceof Set ? new Set(value) : value?.clone && typeof value.clone === 'function' ? value.clone() : value] as const);
  return () => {
    const target = state as Record<string, any>;
    for (const [key, value] of entries) {
      if (value instanceof Set && target[key] instanceof Set) { target[key].clear(); for (const item of value) target[key].add(item); }
      else if (value?.clone && typeof value.clone === 'function' && target[key]?.copy) target[key].copy(value);
      else target[key] = value;
    }
  };
}
