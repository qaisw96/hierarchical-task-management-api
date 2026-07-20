import { Router } from 'express'
import { requireRole } from '../../middleware/rbac'
import * as controller from './controller'

export const departmentsRouter = Router()

departmentsRouter.get('/', requireRole('admin', 'manager'), controller.listDepartments)
departmentsRouter.post('/', requireRole('admin'), controller.createDepartment)
departmentsRouter.patch('/:id', requireRole('admin', 'manager'), controller.updateDepartment)
departmentsRouter.delete('/:id', requireRole('admin'), controller.deleteDepartment)
