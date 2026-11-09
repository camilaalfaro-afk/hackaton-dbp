import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/** Guards the private routes and remembers where the user wanted to go. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'restoring') {
    return (
      <main className="grid min-h-screen place-items-center" role="status" aria-live="polite">
        <p>Verificando sesión…</p>
      </main>
    )
  }

  if (status === 'anonymous') {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  return <Outlet />
}
