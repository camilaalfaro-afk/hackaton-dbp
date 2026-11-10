import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../lib/http'
import { returnPath } from '../routes/returnPath'

export function LoginPage() {
  const { status, notice, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const target = returnPath(location.state)

  if (status === 'authenticated') return <Navigate to={target} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await login(email, password)
      navigate(target, { replace: true })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo iniciar sesión.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-sm content-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Ingresar al piso</h1>

      {notice && (
        <p role="status" className="rounded border border-amber-400 px-3 py-2 text-amber-200">
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
        <label className="grid gap-1">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-slate-600 bg-slate-900 px-3 py-2"
          />
        </label>

        <label className="grid gap-1">
          <span>Contraseña</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border border-slate-600 bg-slate-900 px-3 py-2"
          />
        </label>

        {error && (
          <p role="alert" className="text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-sky-600 px-3 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>

      <p>
        ¿Sin cuadrilla?{' '}
        <Link to="/register" state={location.state} className="underline">
          Registrar una cuadrilla
        </Link>
      </p>
    </main>
  )
}
