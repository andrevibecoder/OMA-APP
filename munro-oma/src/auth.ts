import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "@/auth.config"
import { db } from "@/lib/db"

const schema = z.object({ email: z.string().email(), password: z.string().min(1) })

// Per-instance in-memory login throttle — fine for this single-instance internal app.
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_FAILS = 5
const WINDOW_MS = 15 * 60 * 1000

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return null

        const key = parsed.data.email.toLowerCase()
        const now = Date.now()
        const rec = attempts.get(key)
        if (rec && rec.resetAt > now && rec.count >= MAX_FAILS) return null

        const user = await db.user.findUnique({ where: { email: parsed.data.email } })
        const valid =
          !!user &&
          user.active &&
          (await bcrypt.compare(parsed.data.password, user.passwordHash))

        if (!valid || !user) {
          const cur = rec && rec.resetAt > now ? rec : { count: 0, resetAt: now + WINDOW_MS }
          cur.count += 1
          attempts.set(key, cur)
          return null
        }

        attempts.delete(key)
        // Awaited (not fire-and-forget) so it isn't dropped when the
        // serverless function freezes right after authorize() returns.
        // A logging failure still shouldn't block a real sign-in.
        try {
          await db.loginEvent.create({ data: { userId: user.id } })
        } catch {
          // ignore — logging is best-effort
        }
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
