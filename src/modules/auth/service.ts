import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../../db/pool'
import { env } from '../../config/env'
import { unauthorized } from '../../lib/errors'
import { AuthUser, Role } from '../../types/auth'

interface UserRow {
  id: number
  password_hash: string
  role: Role
  department_id: number | null
}

export async function login(email: string, password: string) {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, password_hash, role, department_id FROM users WHERE email = $1',
    [email],
  )

  const user = rows[0]
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw unauthorized('Invalid credentials')
  }

  const payload: AuthUser = { userId: user.id, role: user.role, departmentId: user.department_id }
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })

  return { token }
}
