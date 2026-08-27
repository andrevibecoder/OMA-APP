import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "@/auth.config"
import { db } from "@/lib/db"

const schema = z.object({ email: z.string().email(), password: z.string().min(1) })

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return null
        const user = await db.user.findUnique({ where: { email: parsed.data.email } })
        if (!user || !user.active) return null
        if (!bcrypt.compareSync(parsed.data.password, user.passwordHash)) return null
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          businessUnitId: user.businessUnitId,
          managerId: user.managerId,
        }
      },
    }),
  ],
})
