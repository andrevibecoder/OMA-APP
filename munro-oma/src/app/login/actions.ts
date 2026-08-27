"use server"

import { AuthError } from "next-auth"
import { signIn } from "@/auth"

export async function login(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    })
    return {}
  } catch (err) {
    if (err instanceof AuthError) return { error: "Wrong email or password." }
    throw err
  }
}
