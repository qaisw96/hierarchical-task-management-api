import { QueryResultRow } from 'pg'
import { pool } from '../db/pool'
import { buildPagination } from './pagination'

export async function paginatedList<T extends QueryResultRow>(
  table: string,
  where: string,
  params: unknown[],
  page: number,
  limit: number,
) {
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${table} ${where}`,
    params,
  )
  const total = Number(countRows[0].count)

  const { rows } = await pool.query<T>(
    `SELECT * FROM ${table} ${where}
     ORDER BY id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  )

  return { data: rows, pagination: buildPagination(page, limit, total, false) }
}
