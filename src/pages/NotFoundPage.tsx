import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function NotFoundPage() {
  const { status, can } = useAuth()
  const target = status === 'authenticated' ? (can('files:read') ? '/files' : '/estado') : '/login'
  return <main className="mx-auto grid min-h-screen max-w-md content-center gap-5 px-5">
    <p className="text-6xl font-semibold text-sky-300">404</p>
    <h1 className="text-3xl font-semibold">Página no encontrada</h1>
    <p>La dirección que abriste no existe en esta consola. Revisa la URL o vuelve a una sección disponible.</p>
    <Link to={target} className="text-sky-300 underline">{status === 'authenticated' ? 'Volver a la consola' : 'Ir al login'}</Link>
  </main>
}
