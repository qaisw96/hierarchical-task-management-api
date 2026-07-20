import { pool } from '../../db/pool'
import { withTransaction } from '../../db/tx'
import { taskScopeCondition } from '../../middleware/rbac'
import { buildPagination } from '../../lib/pagination'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { AuthUser } from '../../types/auth'

interface Task {
  id: number
  project_id: number
  assignee_id: number | null
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

interface ListOptions {
  page: number
  limit: number
  projectId?: number
  status?: string
}

interface CreateInput {
  projectId: number
  title: string
  description?: string
  assigneeId?: number
  status?: string
}

interface UpdateInput {
  title?: string
  description?: string
  status?: string
}

export async function listTasks(user: AuthUser, options: ListOptions) {
  const params: unknown[] = []
  const conditions: string[] = []

  const scope = taskScopeCondition(user, params)
  if (scope) conditions.push(scope)

  if (options.projectId !== undefined) {
    params.push(options.projectId)
    conditions.push(`t.project_id = $${params.length}`)
  }
  if (options.status !== undefined) {
    params.push(options.status)
    conditions.push(`t.status = $${params.length}`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const hasFilters = options.projectId !== undefined || options.status !== undefined

  const { total, estimated } = await countTasks(user, where, params, hasFilters)

  params.push(options.limit)
  const limitIdx = params.length
  params.push((options.page - 1) * options.limit)
  const offsetIdx = params.length

  const { rows } = await pool.query<Task>(
    `SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id
     ${where}
     ORDER BY t.id
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  )

  return { data: rows, pagination: buildPagination(options.page, options.limit, total, estimated) }
}

async function countTasks(user: AuthUser, where: string, params: unknown[], hasFilters: boolean) {
  if (user.role === 'admin' && !hasFilters) {
    const { rows } = await pool.query<{ estimate: string }>(
      `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = 'tasks'`,
    )
    const estimate = Number(rows[0]?.estimate ?? -1)
    if (estimate >= 0) return { total: estimate, estimated: true }
  }

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM tasks t JOIN projects p ON p.id = t.project_id ${where}`,
    params,
  )
  return { total: Number(rows[0].count), estimated: false }
}

export async function getTask(user: AuthUser, id: number) {
  const params: unknown[] = [id]
  const conditions = ['t.id = $1']

  const scope = taskScopeCondition(user, params)
  if (scope) conditions.push(scope)

  const { rows } = await pool.query<Task>(
    `SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE ${conditions.join(' AND ')}`,
    params,
  )

  if (!rows[0]) throw notFound('Task not found')
  return rows[0]
}

export async function createTask(user: AuthUser, input: CreateInput) {
  const { rows: projects } = await pool.query<{ department_id: number }>(
    'SELECT department_id FROM projects WHERE id = $1',
    [input.projectId],
  )
  const project = projects[0]
  if (!project) throw notFound('Project not found')
  if (user.role === 'manager' && project.department_id !== user.departmentId) {
    throw forbidden('Project is not in your department')
  }

  if (input.assigneeId !== undefined) {
    const { rows: employees } = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'employee'`,
      [input.assigneeId],
    )
    if (!employees[0]) throw badRequest('Assignee must be an existing employee')
  }

  const { rows } = await pool.query<Task>(
    `INSERT INTO tasks (project_id, assignee_id, title, description, status)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'todo'))
     RETURNING *`,
    [input.projectId, input.assigneeId ?? null, input.title, input.description ?? null, input.status ?? null],
  )
  return rows[0]
}

export async function deleteTask(id: number) {
  const { rows } = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id])
  if (!rows[0]) throw notFound('Task not found')
}

export async function updateTask(user: AuthUser, id: number, input: UpdateInput) {
  const setClauses: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(input)) {
    params.push(value)
    setClauses.push(`${key} = $${params.length}`)
  }
  setClauses.push('updated_at = NOW()')

  params.push(id)
  const conditions = [`t.id = $${params.length}`]

  const scope = taskScopeCondition(user, params)
  if (scope) conditions.push(scope)

  return withTransaction(async (client) => {
    const { rows } = await client.query<Task>(
      `UPDATE tasks t
       SET ${setClauses.join(', ')}
       FROM projects p
       WHERE p.id = t.project_id AND ${conditions.join(' AND ')}
       RETURNING t.*`,
      params,
    )

    const task = rows[0]
    if (!task) throw notFound('Task not found')

    await client.query(
      'INSERT INTO task_update_events (task_id, project_id, actor_id) VALUES ($1, $2, $3)',
      [task.id, task.project_id, user.userId],
    )
    return task
  })
}
