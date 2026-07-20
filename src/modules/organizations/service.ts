import { pool } from '../../db/pool'
import { paginatedList } from '../../lib/listQuery'
import { notFound } from '../../lib/errors'

interface Organization {
  id: number
  name: string
  created_at: string
}

export async function listOrganizations(page: number, limit: number) {
  return paginatedList<Organization>('organizations', '', [], page, limit)
}

export async function updateOrganization(id: number, name: string) {
  const { rows } = await pool.query<Organization>(
    'UPDATE organizations SET name = $1 WHERE id = $2 RETURNING *',
    [name, id],
  )

  if (!rows[0]) throw notFound('Organization not found')
  return rows[0]
}
