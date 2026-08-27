import { AppHeader } from "@/components/AppHeader"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  )
}
