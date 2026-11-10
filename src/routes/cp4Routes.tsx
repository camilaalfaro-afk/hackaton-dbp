import type { RouteObject } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { RequirePermission } from './RequirePermission'

/** Spread inside the existing RequireAuth children. Pages and storage load only when needed. */
export const cp4Routes: RouteObject[] = [
  { element: <RequirePermission permission="refiners:read"><Outlet /></RequirePermission>, children: [
    { path: '/refiners', lazy: async () => ({ Component: (await import('../pages/RefinersPage')).RefinersPage }) },
  ] },
  { element: <RequirePermission permission="incidents:read"><Outlet /></RequirePermission>, children: [
    { path: '/incidents', lazy: async () => ({ Component: (await import('../pages/IncidentsPage')).IncidentsPage }) },
  ] },
  { element: <RequirePermission permission="incidents:create"><Outlet /></RequirePermission>, children: [
    { path: '/incidents/new', lazy: async () => ({ Component: (await import('../pages/IncidentNewPage')).IncidentNewPage }) },
  ] },
]
