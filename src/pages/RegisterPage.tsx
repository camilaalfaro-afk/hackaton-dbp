import { Link } from 'react-router-dom'

// TODO(B): form with teamName, email and password that calls useAuth().register(),
// shows server errors next to each field with fieldErrorsOf(), and then goes to the app.

export function RegisterPage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-sm content-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Registrar una cuadrilla</h1>
      <p>Formulario pendiente.</p>
      <Link to="/login" className="underline">
        Ya tengo una cuenta
      </Link>
    </main>
  )
}
