import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import type { Permission } from '../types/api'

interface RequirePermissionProps {
  permission: Permission
  children: ReactNode
}

/** Shows the "no permission" page in place, so the URL the user opened is kept. */
export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { can } = useAuth()
  return can(permission) ? children : <ForbiddenPage permission={permission} />
}
