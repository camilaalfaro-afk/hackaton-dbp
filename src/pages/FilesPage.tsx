import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Placeholder until checkpoint 2. It only proves that the session works.

export function FilesPage() {
  const { me, logout } = useAuth()

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Archivos de datos</h1>
      <p>
        {me?.displayName} · {me?.team.code} · {me?.role.name}
      </p>
      <nav className="flex gap-4">
        <Link to="/estado" className="underline">
          Estado
        </Link>
        <button type="button" onClick={() => void logout()} className="underline">
          Cerrar sesión
        </button>
      </nav>
    </main>
  )
}
