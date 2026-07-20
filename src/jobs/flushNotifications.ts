import { PoolClient } from 'pg'
import { pool } from '../db/pool'
import { withTransaction } from '../db/tx'

export async function flushNotifications() {
  return withTransaction(async (client) => {
    const { rows: claimed } = await client.query<{ project_id: number; created_at: Date }>(
      `UPDATE task_update_events SET processed_at = NOW()
       WHERE processed_at IS NULL
       RETURNING project_id, created_at`,
    )

    if (claimed.length === 0) return { groups: 0, notifications: 0 }

    const groups = new Map<number, { count: number; windowStart: Date }>()
    for (const event of claimed) {
      const group = groups.get(event.project_id)
      if (group) {
        group.count += 1
        if (event.created_at < group.windowStart) group.windowStart = event.created_at
      } else {
        groups.set(event.project_id, { count: 1, windowStart: event.created_at })
      }
    }

    let notifications = 0
    const lines: string[] = []

    for (const [projectId, group] of groups) {
      const { rows: projectRows } = await client.query<{ name: string; department_id: number }>(
        'SELECT name, department_id FROM projects WHERE id = $1',
        [projectId],
      )
      const project = projectRows[0]
      const message = `${group.count} task(s) updated in ${project.name}`
      const recipients = await getRecipients(client, project.department_id)

      for (const userId of recipients) {
        await client.query(
          `INSERT INTO notifications (user_id, project_id, message, task_count, window_start)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, projectId, message, group.count, group.windowStart],
        )
        notifications += 1
        lines.push(`  -> user ${userId}: "${message}"`)
      }
    }

    await client.query('DELETE FROM task_update_events WHERE processed_at IS NOT NULL')

    console.log(`[notifications] flush — ${groups.size} group(s), ${notifications} notification(s)`)
    lines.forEach((line) => console.log(line))

    return { groups: groups.size, notifications }
  })
}

async function getRecipients(client: PoolClient, departmentId: number) {
  const { rows } = await client.query<{ id: number }>(
    `SELECT id FROM users WHERE role = 'admin' OR (role = 'manager' AND department_id = $1)`,
    [departmentId],
  )
  return rows.map((r) => r.id)
}

if (require.main === module) {
  flushNotifications()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
