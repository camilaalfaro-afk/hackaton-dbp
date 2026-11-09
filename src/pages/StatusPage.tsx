import { config } from '../lib/config'

// TODO(C): API health, GET /integrations/status, GET /clearance and the button that
// runs POST /clearance/check.

export function StatusPage() {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Estado</h1>
      <p>
        Build desplegado: <code>{config.buildSha}</code>
      </p>
    </main>
  )
}
