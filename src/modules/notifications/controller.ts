import { asyncHandler } from '../../lib/asyncHandler'
import { paginationSchema } from '../../lib/pagination'
import * as service from './service'

export const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query)
  res.json(await service.listNotifications(req.user!, page, limit))
})
