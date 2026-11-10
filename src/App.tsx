import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { HealthGate } from './components/HealthGate'
import { FilesPage } from './pages/FilesPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RegisterPage } from './pages/RegisterPage'
import { StatusPage } from './pages/StatusPage'
import { RequireAuth } from './routes/RequireAuth'
import { RequirePermission } from './routes/RequirePermission'

// The grid is loaded on demand so it stays out of the initial bundle.
const RefinePage = lazy(() => import('./pages/RefinePage'))

// Shared file: every route is declared here once. Add a route, never rewrite the table.
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/files" replace /> },
      {
        path: '/files',
        element: (
          <RequirePermission permission="files:read">
            <FilesPage />
          </RequirePermission>
        ),
      },
      {
        path: '/files/:id/refine',
        element: (
          <RequirePermission permission="files:read">
            <Suspense fallback={<p className="px-4 py-8">Cargando la grilla…</p>}>
              <RefinePage />
            </Suspense>
          </RequirePermission>
        ),
      },
      { path: '/estado', element: <StatusPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export default function App() {
  return (
    <HealthGate>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </HealthGate>
  )
}
