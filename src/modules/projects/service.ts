import { pool } from '../../db/pool'
import { paginatedList } from '../../lib/listQuery'
import { notFound } from '../../lib/errors'
import { AuthUser } from '../../types/auth'

interface Project {
  id: number
  department_id: number
  name: string
  created_at: string
}

export async function listProjects(user: AuthUser, page: number, limit: number) {
  const params: unknown[] = []
  let where = ''
  if (user.role === 'manager') {
    params.push(user.departmentId)
    where = `WHERE department_id = $${params.length}`
  }

  return paginatedList<Project>('projects', where, params, page, limit)
}

export async function createProject(departmentId: number, name: string) {
  const { rows: depts } = await pool.query('SELECT id FROM departments WHERE id = $1', [departmentId])
  if (!depts[0]) throw notFound('Department not found')

  const { rows } = await pool.query<Project>(
    'INSERT INTO projects (department_id, name) VALUES ($1, $2) RETURNING *',
    [departmentId, name],
  )
  return rows[0]
}

export async function deleteProject(id: number) {
  const { rows } = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id])
  if (!rows[0]) throw notFound('Project not found')
}

export async function updateProject(user: AuthUser, id: number, name: string) {
  const params: unknown[] = [name, id]
  let scope = ''
  if (user.role === 'manager') {
    params.push(user.departmentId)
    scope = ` AND department_id = $${params.length}`
  }

  const { rows } = await pool.query<Project>(
    `UPDATE projects SET name = $1 WHERE id = $2${scope} RETURNING *`,
    params,
  )

  if (!rows[0]) throw notFound('Project not found')
  return rows[0]
}
