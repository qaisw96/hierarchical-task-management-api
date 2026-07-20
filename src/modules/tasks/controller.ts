import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler'
import { paginationSchema } from '../../lib/pagination'
import * as service from './service'

const status = z.enum(['todo', 'in_progress', 'done'])

const listQuerySchema = paginationSchema.extend({
  projectId: z.coerce.number().int().positive().optional(),
  status: status.optional(),
})

const createSchema = z.object({
  projectId: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.number().int().positive().optional(),
  status: status.optional(),
})

const updateSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: status.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update' })

const idParam = z.coerce.number().int().positive()

export const listTasks = asyncHandler(async (req, res) => {
  const options = listQuerySchema.parse(req.query)
  res.json(await service.listTasks(req.user!, options))
})

export const getTask = asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id)
  res.json(await service.getTask(req.user!, id))
})

export const createTask = asyncHandler(async (req, res) => {
  const input = createSchema.parse(req.body)
  res.status(201).json(await service.createTask(req.user!, input))
})

export const updateTask = asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id)
  const input = updateSchema.parse(req.body)
  res.json(await service.updateTask(req.user!, id, input))
})

export const deleteTask = asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id)
  await service.deleteTask(id)
  res.status(204).send()
})
