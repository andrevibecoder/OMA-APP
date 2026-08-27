import { AppHeader } from "@/components/AppHeader"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-mfa-black">
      <AppHeader />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="rounded-2xl bg-mfa-white px-6 py-10 sm:px-10 sm:py-12">{children}</div>
      </div>
    </div>
  )
}
