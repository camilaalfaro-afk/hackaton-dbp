import { Link } from 'react-router-dom'
import type { Permission } from '../types/api'

// TODO(B): final copy and styles.

export function ForbiddenPage({ permission }: { permission: Permission }) {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-md content-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Sin permiso</h1>
      <p>
        Tu rol no tiene el permiso <code>{permission}</code> que necesita esta página.
      </p>
      <Link to="/" className="underline">
        Volver al inicio
      </Link>
    </main>
  )
}
