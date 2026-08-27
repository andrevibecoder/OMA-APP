import { PageTitle } from "@/components/PageTitle"
import { RagBar } from "@/components/RagBar"

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <PageTitle>Main dashboard</PageTitle>
      <div className="mt-8">
        <RagBar label="Production" value={90} />
        <RagBar label="Sales" value={50} />
        <RagBar label="HR" value={30} />
        <RagBar label="Finance" value={0} />
      </div>
    </main>
  )
}
