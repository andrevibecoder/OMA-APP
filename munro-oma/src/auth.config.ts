import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isLogin = nextUrl.pathname.startsWith("/login")
      if (isLogin) return isLoggedIn ? Response.redirect(new URL("/", nextUrl)) : true
      return isLoggedIn
    },
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id
        token.role = (user as { role: import("@/types").Role }).role
        token.businessUnitId = (user as { businessUnitId: string | null }).businessUnitId
        token.managerId = (user as { managerId: string | null }).managerId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.businessUnitId = token.businessUnitId
      session.user.managerId = token.managerId
      return session
    },
  },
} satisfies NextAuthConfig
