import { Router } from 'express'
import { requireRole } from '../../middleware/rbac'
import * as controller from './controller'

export const projectsRouter = Router()

projectsRouter.get('/', requireRole('admin', 'manager'), controller.listProjects)
projectsRouter.post('/', requireRole('admin'), controller.createProject)
projectsRouter.patch('/:id', requireRole('admin', 'manager'), controller.updateProject)
projectsRouter.delete('/:id', requireRole('admin'), controller.deleteProject)
