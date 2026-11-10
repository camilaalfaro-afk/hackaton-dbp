/** Where to go after signing in. Only same-app paths are accepted as a return target. */
export function returnPath(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const { from } = state
    if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) return from
  }
  return '/files'
}
