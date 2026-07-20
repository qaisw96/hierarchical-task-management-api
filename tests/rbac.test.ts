import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../src/app'
import { pool } from '../src/db/pool'

const OWN_TASK = 1
const OTHER_DEPT_TASK = 2
const UNASSIGNED_TASK = 3

let adminToken: string
let managerToken: string
let employeeToken: string

async function login(email: string) {
  const res = await request(app).post('/auth/login').send({ email, password: 'Password123!' })
  return res.body.token as string
}

beforeAll(async () => {
  const hash = bcrypt.hashSync('Password123!', 10)

  await pool.query(
    'TRUNCATE task_update_events, notifications, tasks, projects, users, departments, organizations RESTART IDENTITY CASCADE',
  )
  await pool.query(`INSERT INTO organizations (name) VALUES ('Test Org')`)
  await pool.query(`INSERT INTO departments (organization_id, name) VALUES (1, 'Dept A'), (1, 'Dept B')`)
  await pool.query(
    `INSERT INTO users (email, password_hash, role, department_id) VALUES
      ('admin@example.com', $1, 'admin', NULL),
      ('manager@example.com', $1, 'manager', 1),
      ('employee@example.com', $1, 'employee', 1)`,
    [hash],
  )
  await pool.query(`INSERT INTO projects (department_id, name) VALUES (1, 'Project A'), (2, 'Project B')`)
  await pool.query(
    `INSERT INTO tasks (project_id, assignee_id, title) VALUES
      (1, 3, 'Assigned to employee'),
      (2, NULL, 'In another department'),
      (1, NULL, 'Unassigned in manager department')`,
  )

  adminToken = await login('admin@example.com')
  managerToken = await login('manager@example.com')
  employeeToken = await login('employee@example.com')
})

afterAll(async () => {
  await pool.end()
})

describe('Authentication', () => {
  it('rejects a request with no token', async () => {
    await request(app).get('/tasks').expect(401)
  })

  it('rejects a login with the wrong password', async () => {
    await request(app).post('/auth/login').send({ email: 'admin@example.com', password: 'wrong' }).expect(401)
  })
})

describe('Admin', () => {
  it('sees tasks from every department', async () => {
    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(res.body.pagination.total).toBe(3)
  })
})

describe('Manager', () => {
  it('sees only their own department tasks', async () => {
    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${managerToken}`).expect(200)
    expect(res.body.pagination.total).toBe(2)
  })

  it('gets 404 for a task in another department', async () => {
    await request(app).get(`/tasks/${OTHER_DEPT_TASK}`).set('Authorization', `Bearer ${managerToken}`).expect(404)
  })
})

describe('Employee', () => {
  it('sees only tasks assigned to them', async () => {
    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${employeeToken}`).expect(200)
    expect(res.body.pagination.total).toBe(1)
  })

  it('gets 404 for a task that is not assigned to them', async () => {
    await request(app).get(`/tasks/${UNASSIGNED_TASK}`).set('Authorization', `Bearer ${employeeToken}`).expect(404)
  })

  it('cannot create a task', async () => {
    await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ projectId: 1, title: 'Nope' })
      .expect(403)
  })

  it('can update a task assigned to them, and it records an update event', async () => {
    await request(app)
      .patch(`/tasks/${OWN_TASK}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'done' })
      .expect(200)

    const { rows } = await pool.query('SELECT COUNT(*) FROM task_update_events WHERE task_id = $1', [OWN_TASK])
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(1)
  })

  it('cannot update a task that is not assigned to them', async () => {
    await request(app)
      .patch(`/tasks/${UNASSIGNED_TASK}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'done' })
      .expect(404)
  })
})
