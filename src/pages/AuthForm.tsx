import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError, fieldErrorsOf } from '../lib/http'
import { returnPath } from '../routes/returnPath'

type Field = 'teamName' | 'email' | 'password'
const inputClass = 'w-full rounded border border-slate-500 bg-slate-900 px-3 py-3 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400 aria-invalid:border-red-400'

export function AuthForm({ registering }: { registering: boolean }) {
  const { status, notice, login, register } = useAuth()
  const location = useLocation()
  const formRef = useRef<HTMLFormElement>(null)
  const submitting = useRef(false)
  const [values, setValues] = useState({ teamName: '', email: '', password: '' })
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const target = returnPath(location.state)

  function focusField(errors: Record<string, string>) {
    const first = (registering ? ['teamName', 'email', 'password'] : ['email', 'password']).find(name => errors[name])
    if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus())
  }

  function change(name: Field, value: string) {
    setValues(current => ({ ...current, [name]: value }))
    setFields(current => ({ ...current, [name]: '' }))
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const errors: Record<string, string> = {}
    if (registering && !values.teamName.trim()) errors.teamName = 'Ingresa el nombre de tu cuadrilla.'
    if (!values.email.trim()) errors.email = 'Ingresa tu correo.'
    else if (!formRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.validity.valid) errors.email = 'Ingresa un correo válido.'
    if (!values.password) errors.password = 'Ingresa tu contraseña.'
    setFields(errors)
    setError(null)
    if (Object.keys(errors).length) { focusField(errors); return }
    submitting.current = true
    setPending(true)
    try {
      if (registering) await register({ ...values, teamName: values.teamName.trim(), email: values.email.trim() })
      else await login(values.email.trim(), values.password)
    } catch (caught) {
      const serverFields = fieldErrorsOf(caught)
      setFields(serverFields)
      const known = (registering ? ['teamName', 'email', 'password'] : ['email', 'password'])
      if (!Object.keys(serverFields).length || Object.keys(serverFields).some(name => !known.includes(name))) {
        setError(caught instanceof ApiError ? caught.message : 'No se pudo completar la solicitud. Intenta nuevamente.')
      }
      focusField(serverFields)
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  if (status === 'restoring') return <main className="grid min-h-screen place-items-center" role="status">Verificando sesión…</main>
  if (status === 'authenticated') return <Navigate to={target} replace />

  function input(name: Field, label: string, type: string, autoComplete: string) {
    return <div className="grid gap-2">
      <label htmlFor={name} className="font-medium">{label}</label>
      <input id={name} name={name} type={type} autoComplete={autoComplete} required
        value={values[name]} onChange={event => change(name, event.target.value)}
        aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `${name}-error` : undefined}
        className={inputClass} />
      {fields[name] && <p id={`${name}-error`} className="text-sm text-red-300" role="alert">{fields[name]}</p>}
    </div>
  }

  return <main className="mx-auto grid min-h-screen w-full max-w-md content-center gap-6 px-5 py-10">
    <header className="grid gap-2">
      <p className="text-sm tracking-widest text-sky-300">LUMON · MACRODATA REFINEMENT</p>
      <h1 className="text-3xl font-semibold">{registering ? 'Registrar una cuadrilla' : 'Ingresar al piso'}</h1>
      <p className="text-slate-300">{registering ? 'Crea la cuenta de tu equipo para comenzar.' : 'Ingresa con la cuenta de tu cuadrilla.'}</p>
    </header>
    {notice && <p role="status" className="rounded border border-amber-400 p-3 text-amber-200">{notice}</p>}
    <form ref={formRef} onSubmit={submit} noValidate aria-busy={pending}>
      <fieldset disabled={pending} className="grid min-w-0 gap-5">
        <legend className="sr-only">{registering ? 'Datos de registro' : 'Credenciales de acceso'}</legend>
        {registering && input('teamName', 'Nombre de la cuadrilla', 'text', 'organization')}
        {input('email', 'Correo electrónico', 'email', 'username')}
        {input('password', 'Contraseña', 'password', registering ? 'new-password' : 'current-password')}
        {error && <p role="alert" className="rounded border border-red-400 p-3 text-red-200">{error}</p>}
        <button type="submit" className="rounded bg-sky-700 px-4 py-3 font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-60">
          {pending ? (registering ? 'Registrando…' : 'Ingresando…') : (registering ? 'Registrar cuadrilla' : 'Ingresar')}
        </button>
      </fieldset>
      <p role="status" className="sr-only">{pending ? 'Procesando solicitud.' : ''}</p>
    </form>
    <p className="text-slate-300">{registering ? '¿Ya tienes una cuenta? ' : '¿Sin cuadrilla? '}
      <Link to={registering ? '/login' : '/register'} state={location.state} className="text-sky-300 underline underline-offset-4">{registering ? 'Iniciar sesión' : 'Registrar una cuadrilla'}</Link>
    </p>
  </main>
}

