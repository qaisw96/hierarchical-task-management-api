import express from 'express'
import { errorHandler } from './middleware/errorHandler'
import { notFound } from './lib/errors'
import { authRouter } from './modules/auth/routes'
import { organizationsRouter } from './modules/organizations/routes'
import { tasksRouter } from './modules/tasks/routes'
import { departmentsRouter } from './modules/departments/routes'
import { projectsRouter } from './modules/projects/routes'
import { notificationsRouter } from './modules/notifications/routes'
import { authenticate } from './middleware/auth'

export const app = express()

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authRouter)
app.use('/organizations', authenticate, organizationsRouter)
app.use('/departments', authenticate, departmentsRouter)
app.use('/projects', authenticate, projectsRouter)
app.use('/tasks', authenticate, tasksRouter)
app.use('/notifications', authenticate, notificationsRouter)

app.use((_req, _res, next) => next(notFound('Route not found')))

app.use(errorHandler)
