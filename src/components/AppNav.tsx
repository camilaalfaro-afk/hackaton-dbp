import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function AppNav() {
  const { me, logout } = useAuth()

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-slate-700 px-4 py-3">
      <strong>Lumon MDR</strong>
      <nav aria-label="Principal" className="flex gap-4">
        <Link to="/files" className="underline">
          Archivos
        </Link>
        <Link to="/estado" className="underline">
          Estado
        </Link>
      </nav>
      <span className="ml-auto text-sm text-slate-300">
        {me?.displayName} · {me?.team.code} · {me?.role.name}
      </span>
      <button type="button" onClick={() => void logout()} className="underline">
        Cerrar sesión
      </button>
    </header>
  )
}
