import Link from "next/link"

export default function NotFound() {
  return (
    <main className="mx-auto max-w-4xl px-8 py-24 text-center">
      <p className="font-serif text-3xl font-light text-mfa-ink">Not found</p>
      <Link href="/" className="mt-4 inline-block text-mfa-red underline">
        Back to the dashboard
      </Link>
    </main>
  )
}
