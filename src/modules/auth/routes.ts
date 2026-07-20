import { Router } from 'express'
import { loginHandler } from './controller'

export const authRouter = Router()

authRouter.post('/login', loginHandler)
