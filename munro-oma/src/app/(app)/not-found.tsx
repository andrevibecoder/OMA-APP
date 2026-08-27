import Link from "next/link"

export default function NotFound() {
  return (
    <main className="py-10 text-center">
      <p className="text-3xl font-bold text-mfa-ink">Not found</p>
      <Link href="/" className="mt-4 inline-block text-mfa-red underline">
        Back to the dashboard
      </Link>
    </main>
  )
}
