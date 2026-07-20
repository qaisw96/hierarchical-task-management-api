import bcrypt from 'bcryptjs'
import seedrandom from 'seedrandom'
import { QueryResultRow } from 'pg'
import { from as copyFrom } from 'pg-copy-streams'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { pool } from '../db/pool'
import { env } from '../config/env'

const CONFIG = {
  organizationName: 'Acme Corporation',
  departmentsAtFullScale: 100,
  projectsPerDepartment: { min: 50, max: 80 },
  tasksPerProject: { min: 100, max: 200 },
  employeesPerDepartment: { min: 5, max: 15 },
  unassignedTaskRatio: 0.2,
  insertBatchSize: 1000,
  progressEvery: 50_000,
  password: 'Password123!',
  bcryptRounds: 10,
  randomSeed: 'acme-seed',
}

const STATUSES = ['todo', 'in_progress', 'done']

const rng = seedrandom(CONFIG.randomSeed)
const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const pick = <T>(items: T[]) => items[Math.floor(rng() * items.length)]

interface Project {
  id: number
  departmentId: number
}

async function seed() {
  const scale = env.SEED_SCALE
  const departmentCount = Math.max(1, Math.round(CONFIG.departmentsAtFullScale * scale))

  console.log(`Seeding at SEED_SCALE=${scale} -> ${departmentCount} department(s)`)

  await pool.query(
    'TRUNCATE task_update_events, notifications, tasks, projects, users, departments, organizations RESTART IDENTITY CASCADE',
  )

  const organizationId = await insertOrganization()
  const departmentIds = await insertDepartments(organizationId, departmentCount)
  const { employeesByDepartment, userCount } = await insertUsers(departmentIds)
  const projects = await insertProjects(departmentIds)
  const taskCount = await copyTasks(projects, employeesByDepartment)

  await pool.query('ANALYZE')

  console.log(
    `Done: 1 organization, ${departmentIds.length} departments, ${userCount} users, ${projects.length} projects, ${taskCount} tasks`,
  )
  await pool.end()
}

async function batchInsert<T extends QueryResultRow>(
  table: string,
  columns: string[],
  rows: unknown[][],
  returning: string,
): Promise<T[]> {
  const result: T[] = []

  for (let start = 0; start < rows.length; start += CONFIG.insertBatchSize) {
    const batch = rows.slice(start, start + CONFIG.insertBatchSize)
    const params: unknown[] = []
    const tuples = batch.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value)
        return `$${params.length}`
      })
      return `(${placeholders.join(', ')})`
    })

    const { rows: inserted } = await pool.query<T>(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} RETURNING ${returning}`,
      params,
    )
    result.push(...inserted)
  }

  return result
}

async function insertOrganization() {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    [CONFIG.organizationName],
  )
  return rows[0].id
}

async function insertDepartments(organizationId: number, count: number) {
  const rows = Array.from({ length: count }, (_, i) => [organizationId, `Department ${i + 1}`])
  const inserted = await batchInsert<{ id: number }>('departments', ['organization_id', 'name'], rows, 'id')
  return inserted.map((r) => r.id)
}

async function insertUsers(departmentIds: number[]) {
  const passwordHash = bcrypt.hashSync(CONFIG.password, CONFIG.bcryptRounds)
  const rows: unknown[][] = [['admin@example.com', passwordHash, 'admin', null]]

  departmentIds.forEach((departmentId, deptIndex) => {
    const managerEmail = deptIndex === 0 ? 'manager@example.com' : `manager${deptIndex + 1}@example.com`
    rows.push([managerEmail, passwordHash, 'manager', departmentId])

    const employeeCount = randInt(CONFIG.employeesPerDepartment.min, CONFIG.employeesPerDepartment.max)
    for (let e = 1; e <= employeeCount; e++) {
      const email = deptIndex === 0 && e === 1 ? 'employee@example.com' : `employee-d${departmentId}-${e}@example.com`
      rows.push([email, passwordHash, 'employee', departmentId])
    }
  })

  const inserted = await batchInsert<{ id: number; role: string; department_id: number | null }>(
    'users',
    ['email', 'password_hash', 'role', 'department_id'],
    rows,
    'id, role, department_id',
  )

  const employeesByDepartment = new Map<number, number[]>()
  for (const user of inserted) {
    if (user.role === 'employee' && user.department_id !== null) {
      const list = employeesByDepartment.get(user.department_id) ?? []
      list.push(user.id)
      employeesByDepartment.set(user.department_id, list)
    }
  }

  return { employeesByDepartment, userCount: inserted.length }
}

async function insertProjects(departmentIds: number[]) {
  const rows: unknown[][] = []
  for (const departmentId of departmentIds) {
    const count = randInt(CONFIG.projectsPerDepartment.min, CONFIG.projectsPerDepartment.max)
    for (let p = 1; p <= count; p++) {
      rows.push([departmentId, `Project ${departmentId}-${p}`])
    }
  }

  const inserted = await batchInsert<{ id: number; department_id: number }>(
    'projects',
    ['department_id', 'name'],
    rows,
    'id, department_id',
  )
  return inserted.map((r) => ({ id: r.id, departmentId: r.department_id }))
}

async function copyTasks(projects: Project[], employeesByDepartment: Map<number, number[]>) {
  const client = await pool.connect()
  let total = 0

  function* rows() {
    for (const project of projects) {
      const employees = employeesByDepartment.get(project.departmentId) ?? []
      const taskCount = randInt(CONFIG.tasksPerProject.min, CONFIG.tasksPerProject.max)

      for (let t = 1; t <= taskCount; t++) {
        const unassigned = employees.length === 0 || rng() < CONFIG.unassignedTaskRatio
        const assignee = unassigned ? '\\N' : pick(employees)
        total += 1
        if (total % CONFIG.progressEvery === 0) console.log(`  ${total} tasks...`)
        yield `${project.id}\t${assignee}\tTask ${project.id}-${t}\t${pick(STATUSES)}\n`
      }
    }
  }

  try {
    const stream = client.query(copyFrom('COPY tasks (project_id, assignee_id, title, status) FROM STDIN'))
    await pipeline(Readable.from(rows()), stream)
  } finally {
    client.release()
  }

  return total
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
