import { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { unauthorized } from '../lib/errors'
import { AuthUser } from '../types/auth'

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Missing or invalid Authorization header'))
  }

  try {
    req.user = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser
    next()
  } catch {
    next(unauthorized('Invalid or expired token'))
  }
}
