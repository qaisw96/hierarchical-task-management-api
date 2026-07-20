import { Router } from 'express'
import * as controller from './controller'

export const notificationsRouter = Router()

notificationsRouter.get('/', controller.listNotifications)
