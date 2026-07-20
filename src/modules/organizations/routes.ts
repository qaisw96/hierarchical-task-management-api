import { Router } from 'express'
import { requireRole } from '../../middleware/rbac'
import * as controller from './controller'

export const organizationsRouter = Router()

organizationsRouter.get('/', requireRole('admin'), controller.listOrganizations)
organizationsRouter.patch('/:id', requireRole('admin'), controller.updateOrganization)
