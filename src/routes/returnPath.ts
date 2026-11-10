/** Preserve only safe, same-app return paths. */
export function returnPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return '/files'
  const from = state.from
  if (
    typeof from !== 'string' ||
    !from.startsWith('/') ||
    from.startsWith('//') ||
    from.includes('\\') ||
    Array.from(from).some(character => character.charCodeAt(0) <= 32)
  ) return '/files'
  const path = from.split(/[?#]/)[0].replace(/\/+$/, '')
  return path === '/login' || path === '/register' ? '/files' : from
}
