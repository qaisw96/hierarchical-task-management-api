import { pool } from '../../db/pool'
import { paginatedList } from '../../lib/listQuery'
import { notFound } from '../../lib/errors'
import { AuthUser } from '../../types/auth'

interface Department {
  id: number
  organization_id: number
  name: string
  created_at: string
}

export async function listDepartments(user: AuthUser, page: number, limit: number) {
  const params: unknown[] = []
  let where = ''
  if (user.role === 'manager') {
    params.push(user.departmentId)
    where = `WHERE id = $${params.length}`
  }

  return paginatedList<Department>('departments', where, params, page, limit)
}

export async function createDepartment(organizationId: number, name: string) {
  const { rows: orgs } = await pool.query('SELECT id FROM organizations WHERE id = $1', [organizationId])
  if (!orgs[0]) throw notFound('Organization not found')

  const { rows } = await pool.query<Department>(
    'INSERT INTO departments (organization_id, name) VALUES ($1, $2) RETURNING *',
    [organizationId, name],
  )
  return rows[0]
}

export async function deleteDepartment(id: number) {
  const { rows } = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING id', [id])
  if (!rows[0]) throw notFound('Department not found')
}

export async function updateDepartment(user: AuthUser, id: number, name: string) {
  const params: unknown[] = [name, id]
  let scope = ''
  if (user.role === 'manager') {
    params.push(user.departmentId)
    scope = ` AND id = $${params.length}`
  }

  const { rows } = await pool.query<Department>(
    `UPDATE departments SET name = $1 WHERE id = $2${scope} RETURNING *`,
    params,
  )

  if (!rows[0]) throw notFound('Department not found')
  return rows[0]
}
