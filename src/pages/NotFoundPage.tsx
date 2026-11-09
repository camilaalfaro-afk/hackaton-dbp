import { Link } from 'react-router-dom'

// TODO(B): final copy and styles.

export function NotFoundPage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-md content-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p>La dirección que abriste no existe en esta consola.</p>
      <Link to="/" className="underline">
        Volver al inicio
      </Link>
    </main>
  )
}
