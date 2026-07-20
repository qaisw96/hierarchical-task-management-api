import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('1h'),
  PORT: z.coerce.number().default(3000),
  SEED_SCALE: z.coerce.number().positive().default(1),
  NOTIFICATION_WINDOW_MS: z.coerce.number().int().positive().default(60000),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
