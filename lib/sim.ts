export function getSimId(): number | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('simId')
  return raw ? Number(raw) : null
}
