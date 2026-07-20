import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler'
import * as service from './service'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const loginHandler = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)
  const result = await service.login(email, password)
  res.json(result)
})
