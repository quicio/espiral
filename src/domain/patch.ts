export function wouldCreateCycle(
  edges: Readonly<Record<string, readonly string[]>>,
  from: string,
  to: string
): boolean {
  if (from === to) return true;
  const stack = [to];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === from) return true;
    visited.add(current);
    (edges[current] ?? []).forEach(next => stack.push(next));
  }

  return false;
}
