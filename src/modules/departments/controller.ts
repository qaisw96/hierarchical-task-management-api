import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler'
import { paginationSchema } from '../../lib/pagination'
import * as service from './service'

const idParam = z.coerce.number().int().positive()
const updateSchema = z.object({ name: z.string().min(1) })
const createSchema = z.object({ organizationId: z.number().int().positive(), name: z.string().min(1) })

export const listDepartments = asyncHandler(async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query)
  res.json(await service.listDepartments(req.user!, page, limit))
})

export const createDepartment = asyncHandler(async (req, res) => {
  const { organizationId, name } = createSchema.parse(req.body)
  res.status(201).json(await service.createDepartment(organizationId, name))
})

export const deleteDepartment = asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id)
  await service.deleteDepartment(id)
  res.status(204).send()
})

export const updateDepartment = asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id)
  const { name } = updateSchema.parse(req.body)
  res.json(await service.updateDepartment(req.user!, id, name))
})
