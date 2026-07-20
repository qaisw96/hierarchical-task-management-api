import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler'
import { paginationSchema } from '../../lib/pagination'
import * as service from './service'

const idParam = z.coerce.number().int().positive()
const updateSchema = z.object({ name: z.string().min(1) })

export const listOrganizations = asyncHandler(async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query)
  res.json(await service.listOrganizations(page, limit))
})

export const updateOrganization = asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id)
  const { name } = updateSchema.parse(req.body)
  res.json(await service.updateOrganization(id, name))
})
