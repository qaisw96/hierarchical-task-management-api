import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler'
import { paginationSchema } from '../../lib/pagination'
import * as service from './service'

const idParam = z.coerce.number().int().positive()
const updateSchema = z.object({ name: z.string().min(1) })
const createSchema = z.object({ departmentId: z.number().int().positive(), name: z.string().min(1) })

export const listProjects = asyncHandler(async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query)
  res.json(await service.listProjects(req.user!, page, limit))
})

export const createProject = asyncHandler(async (req, res) => {
  const { departmentId, name } = createSchema.parse(req.body)
  res.status(201).json(await service.createProject(departmentId, name))
})

export const deleteProject = asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id)
  await service.deleteProject(id)
  res.status(204).send()
})

export const updateProject = asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id)
  const { name } = updateSchema.parse(req.body)
  res.json(await service.updateProject(req.user!, id, name))
})
