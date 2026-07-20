import { pool } from '../../db/pool'
import { buildPagination } from '../../lib/pagination'
import { AuthUser } from '../../types/auth'

interface Notification {
  id: number
  user_id: number
  project_id: number
  message: string
  task_count: number
  window_start: string
  created_at: string
}

export async function listNotifications(user: AuthUser, page: number, limit: number) {
  const { rows: countRows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1',
    [user.userId],
  )
  const total = Number(countRows[0].count)

  const { rows } = await pool.query<Notification>(
    `SELECT * FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [user.userId, limit, (page - 1) * limit],
  )

  return { data: rows, pagination: buildPagination(page, limit, total, false) }
}
