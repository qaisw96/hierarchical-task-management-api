import { Router } from 'express'
import { requireRole } from '../../middleware/rbac'
import * as controller from './controller'

export const tasksRouter = Router()

tasksRouter.get('/', controller.listTasks)
tasksRouter.get('/:id', controller.getTask)
tasksRouter.post('/', requireRole('admin', 'manager'), controller.createTask)
tasksRouter.patch('/:id', controller.updateTask)
tasksRouter.delete('/:id', requireRole('admin'), controller.deleteTask)
