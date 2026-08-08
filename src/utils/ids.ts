/** Generates a reasonably unique id without pulling in a uuid dependency. */
export function generateId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${random}`;
}
