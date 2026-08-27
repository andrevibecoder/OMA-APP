import type { Role } from "@/types"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name: string
      role: Role
      businessUnitId: string | null
      managerId: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: Role
    businessUnitId: string | null
    managerId: string | null
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    role: Role
    businessUnitId: string | null
    managerId: string | null
  }
}
