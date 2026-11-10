import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError, fieldErrorsOf } from '../lib/http'
import { returnPath } from '../routes/returnPath'

const FIELDS = [
  { name: 'teamName', label: 'Nombre de la cuadrilla', type: 'text', autoComplete: 'organization' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'username' },
  { name: 'password', label: 'Contraseña', type: 'password', autoComplete: 'new-password' },
] as const

type FieldName = (typeof FIELDS)[number]['name']

export function RegisterPage() {
  const { status, register } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<FieldName, string>>({ teamName: '', email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const target = returnPath(location.state)

  if (status === 'authenticated') return <Navigate to={target} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      await register(values)
      navigate(target, { replace: true })
    } catch (caught) {
      // The server decides: its message goes next to the field it names.
      const byField = fieldErrorsOf(caught)
      setFieldErrors(byField)
      if (Object.keys(byField).length === 0 || byField._) {
        setError(byField._ ?? (caught instanceof ApiError ? caught.message : 'No se pudo registrar.'))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-sm content-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Registrar una cuadrilla</h1>

      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
        {FIELDS.map((field) => {
          const message = fieldErrors[field.name]
          return (
            <label key={field.name} className="grid gap-1">
              <span>{field.label}</span>
              <input
                type={field.type}
                name={field.name}
                autoComplete={field.autoComplete}
                required
                value={values[field.name]}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? `${field.name}-error` : undefined}
                className="rounded border border-slate-600 bg-slate-900 px-3 py-2 aria-[invalid=true]:border-red-400"
              />
              {message && (
                <span id={`${field.name}-error`} role="alert" className="text-sm text-red-300">
                  {message}
                </span>
              )}
            </label>
          )
        })}

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
          {pending ? 'Registrando…' : 'Registrar y entrar'}
        </button>
      </form>

      <Link to="/login" state={location.state} className="underline">
        Ya tengo una cuenta
      </Link>
    </main>
  )
}
