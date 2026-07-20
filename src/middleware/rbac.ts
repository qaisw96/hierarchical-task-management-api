import { RequestHandler } from 'express'
import { forbidden, unauthorized } from '../lib/errors'
import { AuthUser, Role } from '../types/auth'

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (!roles.includes(req.user.role)) return next(forbidden())
    next()
  }
}

export function taskScopeCondition(user: AuthUser, params: unknown[]): string | null {
  if (user.role === 'admin') return null

  if (user.role === 'manager') {
    params.push(user.departmentId)
    return `p.department_id = $${params.length}`
  }

  params.push(user.userId)
  return `t.assignee_id = $${params.length}`
}
