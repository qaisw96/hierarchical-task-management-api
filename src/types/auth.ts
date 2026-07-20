export type Role = 'admin' | 'manager' | 'employee'

export interface AuthUser {
  userId: number
  role: Role
  departmentId: number | null
}
