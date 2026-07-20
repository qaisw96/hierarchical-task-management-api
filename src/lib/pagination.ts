import { z } from 'zod'

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

export function buildPagination(page: number, limit: number, total: number, totalEstimated: boolean) {
  return {
    page,
    limit,
    total,
    totalEstimated,
    totalPages: Math.ceil(total / limit),
  }
}
