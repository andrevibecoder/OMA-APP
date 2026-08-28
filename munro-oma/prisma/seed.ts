import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const db = new PrismaClient()
const HASH = bcrypt.hashSync("munro-dev-2026", 10)

const DAY = 86_400_000
const DUE_BASE = new Date("2026-08-06").getTime() // due dates spread ~weekly from here
const DONE_BASE = new Date("2026-07-08").getTime() // completions staggered through July/Aug

// n actions, k completed — with staggered due + completion dates so the
// To-do / Done grouping on the OMA detail screen has something to sort
function actions(n: number, k: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => ({
    description: `${prefix} action ${i + 1}`,
    completed: i < k,
    completedAt: i < k ? new Date(DONE_BASE + i * 6 * DAY) : null,
    dueDate: new Date(DUE_BASE + i * 9 * DAY),
    order: i,
  }))
}

async function main() {
  // wipe (respect FK order)
  await db.action.deleteMany()
  await db.metric.deleteMany()
  await db.oMA.deleteMany()
  await db.user.deleteMany()
  await db.period.deleteMany()
  await db.businessUnit.deleteMany()

  // Half-year review periods. H2 is the active period.
  const periodSpecs = [
    { label: "H1 2026", shortLabel: "H1", kind: "HALF" as const, startDate: "2026-01-01" },
    { label: "H2 2026", shortLabel: "H2", kind: "HALF" as const, startDate: "2026-07-01", active: true },
  ]
  let period!: Awaited<ReturnType<typeof db.period.create>>
  for (const s of periodSpecs) {
    const p = await db.period.create({
      data: {
        label: s.label,
        shortLabel: s.shortLabel,
        kind: s.kind,
        year: 2026,
        startDate: new Date(s.startDate),
        isActive: s.active ?? false,
      },
    })
    if (s.active) period = p
  }

  const buNames = ["Marketing", "Sales", "Product", "Production", "Finance", "Systems", "HR"]
  const bus: Record<string, string> = {}
  for (let i = 0; i < buNames.length; i++) {
    const bu = await db.businessUnit.create({ data: { name: buNames[i], order: i } })
    bus[buNames[i]] = bu.id
  }

  const admin = await db.user.create({
    data: { name: "System Admin", email: "admin@munrofa.com", passwordHash: HASH, role: "ADMIN" },
  })
  const manager = await db.user.create({
    data: {
      name: "Manager",
      email: "manager@munrofa.com",
      passwordHash: HASH,
      role: "MANAGER",
      businessUnitId: bus.Marketing,
      managerId: admin.id,
    },
  })

  const mkUser = (name: string, email: string, buId: string) =>
    db.user.create({
      data: { name, email, passwordHash: HASH, role: "USER", businessUnitId: buId, managerId: manager.id },
    })

  const sharine = await mkUser("Sharine", "sharine@munrofa.com", bus.Marketing)
  const john = await mkUser("John", "john@munrofa.com", bus.Marketing)
  const sam = await mkUser("Sam", "sam@munrofa.com", bus.Marketing)

  // Sharine OMA 1 — 100%
  await db.oMA.create({
    data: {
      ownerId: sharine.id,
      periodId: period.id,
      sequence: 1,
      outcome:
        "Marketing delivers a steady flow of qualified leads the sales team can work without rework.",
      metrics: {
        create: [
          { measure: "Qualified leads", unit: "NUMBER", direction: "HIGHER_BETTER", target: 40, current: 40, order: 0 },
          { measure: "Rework rate on leads", unit: "PERCENT", direction: "LOWER_BETTER", target: 5, current: 5, order: 1 },
        ],
      },
      actions: {
        create: [
          { description: "Rework the lead form and scoring rules", completed: true, completedAt: new Date("2026-07-14"), dueDate: new Date("2026-07-31"), order: 0 },
          { description: "Run two paid tests per month", completed: true, completedAt: new Date("2026-07-28"), dueDate: new Date("2026-08-15"), order: 1 },
          { description: "Review the pipeline with Sales every Friday", completed: true, completedAt: new Date("2026-08-11"), dueDate: new Date("2026-08-29"), order: 2 },
        ],
      },
    },
  })

  // Sharine OMA 2 — 45% (11 actions, 5 done)
  await db.oMA.create({
    data: {
      ownerId: sharine.id,
      periodId: period.id,
      sequence: 2,
      outcome: "The brand shows up consistently across every channel prospects touch.",
      metrics: {
        create: [
          { measure: "Channel audit score", unit: "PERCENT", direction: "HIGHER_BETTER", target: 100, current: 45, order: 0 },
        ],
      },
      actions: { create: actions(11, 5, "Brand") },
    },
  })

  // Sharine OMA 3 — 0% (3 actions, none done)
  await db.oMA.create({
    data: {
      ownerId: sharine.id,
      periodId: period.id,
      sequence: 3,
      outcome: "Marketing can prove its contribution to revenue.",
      metrics: {
        create: [
          { measure: "Attributed pipeline", unit: "CURRENCY", direction: "HIGHER_BETTER", target: 2000000, current: 0, order: 0 },
        ],
      },
      actions: { create: actions(3, 0, "Attribution") },
    },
  })

  // John — 75% (1 OMA, 4 actions, 3 done)
  await db.oMA.create({
    data: {
      ownerId: john.id,
      periodId: period.id,
      sequence: 1,
      outcome: "Content engine ships on a predictable cadence.",
      metrics: {
        create: [
          { measure: "Posts published", unit: "NUMBER", direction: "HIGHER_BETTER", target: 8, current: 6, order: 0 },
        ],
      },
      actions: { create: actions(4, 3, "Content") },
    },
  })

  // Sam — 40% (1 OMA, 5 actions, 2 done)
  await db.oMA.create({
    data: {
      ownerId: sam.id,
      periodId: period.id,
      sequence: 1,
      outcome: "Events generate qualified conversations for Sales.",
      metrics: {
        create: [
          { measure: "Booked meetings", unit: "NUMBER", direction: "HIGHER_BETTER", target: 15, current: 6, order: 0 },
        ],
      },
      actions: { create: actions(5, 2, "Events") },
    },
  })

  // Other BUs — one synthetic user + one OMA to give the dashboard a spread.
  // [actions total, actions done, metric attainment %]
  const spread: Record<string, [number, number, number]> = {
    Sales: [10, 5, 50],
    Product: [10, 6, 60],
    Production: [10, 9, 90],
    Finance: [10, 1, 10],
    Systems: [10, 6, 60],
    HR: [10, 3, 30],
  }
  for (const [bu, [n, k, pct]] of Object.entries(spread)) {
    const u = await db.user.create({
      data: {
        name: `${bu} Lead`,
        email: `${bu.toLowerCase()}@munrofa.com`,
        passwordHash: HASH,
        role: "USER",
        businessUnitId: bus[bu],
        managerId: null,
      },
    })
    await db.oMA.create({
      data: {
        ownerId: u.id,
        periodId: period.id,
        sequence: 1,
        outcome: `${bu} delivers on its core commitment for the half.`,
        metrics: {
          create: [
            { measure: "Primary KPI", unit: "PERCENT", direction: "HIGHER_BETTER", target: 100, current: pct, order: 0 },
          ],
        },
        actions: { create: actions(n, k, bu) },
      },
    })
  }

  console.log("Seed complete.")
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
