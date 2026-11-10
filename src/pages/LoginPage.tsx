import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../lib/http'
import { returnPath } from '../routes/returnPath'

export function LoginPage() {
  return <AuthForm registering={false} />
}
