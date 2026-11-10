import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { Permission } from '../types/api'

export function ForbiddenPage({ permission }: { permission: Permission }) {
  const { can } = useAuth()
  return <main className="mx-auto grid min-h-screen max-w-md content-center gap-5 px-5">
    <p className="text-sm tracking-widest text-amber-300">LUMON · ACCESO RESTRINGIDO</p>
    <h1 className="text-3xl font-semibold">Sin permiso</h1>
    <p>Tu cuenta no tiene permiso para acceder a esta sección. Consulta con el supervisor de tu cuadrilla si necesitas acceso.</p>
    <p className="text-sm text-slate-400">Permiso requerido: <code>{permission}</code></p>
    <nav className="flex flex-wrap gap-5" aria-label="Opciones de navegación">
      {can('files:read') && <Link to="/files" className="text-sky-300 underline">Ver archivos</Link>}
      <Link to="/estado" className="text-sky-300 underline">Ver estado</Link>
    </nav>
  </main>
}
