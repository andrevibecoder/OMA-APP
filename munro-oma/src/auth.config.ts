import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // /login always renders. We can't verify the JWT's user still exists /
      // is active from the edge, so bouncing "logged-in" visitors away from
      // /login here risks a redirect loop with getSessionUser's DB check
      // (e.g. after the user row is deleted or deactivated). The login action
      // redirects to "/" on success, which is enough.
      if (nextUrl.pathname.startsWith("/login")) return true
      return !!auth?.user
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
