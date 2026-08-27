"use client"

import { useState, useTransition } from "react"
import type { AdminData } from "@/lib/admin"
import {
  createBusinessUnit,
  createPeriod,
  createUser,
  deleteUser,
  moveBusinessUnit,
  renameBusinessUnit,
  resetUserPassword,
  setActivePeriod,
  setUserActive,
  updateUser,
} from "@/app/(app)/admin/actions"

type Result = { error?: string }
type Role = "ADMIN" | "MANAGER" | "USER"
type Kind = "QUARTER" | "HALF" | "ANNUAL"

const band = "bg-mfa-panel px-4 py-2 text-sm font-semibold text-mfa-red"
const input = "rounded border border-mfa-track px-2 py-1 text-sm"
const btn = "rounded-full bg-mfa-red px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
const ghostBtn = "rounded-full border border-mfa-track px-3 py-1 text-sm"

function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  function run(fn: () => Promise<Result>, onOk?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res?.error) setError(res.error)
      else onOk?.()
    })
  }
  return { pending, error, setError, run }
}

export function AdminConsole({ data, viewerId }: { data: AdminData; viewerId: string }) {
  return (
    <div className="space-y-10">
      <BusinessUnitsSection data={data} />
      <PeriodsSection data={data} />
      <UsersSection data={data} viewerId={viewerId} />
    </div>
  )
}

// --------------------------------------------------------------------------

function BusinessUnitsSection({ data }: { data: AdminData }) {
  const { businessUnits: bus } = data
  const { pending, error, run } = useAction()
  const [newName, setNewName] = useState("")

  return (
    <section className="overflow-hidden rounded-xl border border-mfa-track">
      <div className={band}>Business units</div>
      <ul className="divide-y divide-mfa-track">
        {bus.map((bu, i) => (
          <BusinessUnitRow
            key={bu.id}
            bu={bu}
            isFirst={i === 0}
            isLast={i === bus.length - 1}
          />
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-mfa-track px-4 py-3">
        <input
          className={`${input} flex-1`}
          placeholder="New business unit"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          className={btn}
          disabled={pending || !newName.trim()}
          onClick={() => run(() => createBusinessUnit(newName), () => setNewName(""))}
        >
          Add
        </button>
      </div>
      {error && <p className="px-4 pb-3 text-sm text-mfa-red">{error}</p>}
    </section>
  )
}

function BusinessUnitRow({
  bu,
  isFirst,
  isLast,
}: {
  bu: AdminData["businessUnits"][number]
  isFirst: boolean
  isLast: boolean
}) {
  const { pending, error, run } = useAction()
  const [name, setName] = useState(bu.name)
  const dirty = name.trim() !== bu.name

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2">
      <input className={`${input} min-w-[10rem] flex-1`} value={name} onChange={(e) => setName(e.target.value)} />
      {dirty && (
        <button
          className={ghostBtn}
          disabled={pending}
          onClick={() => run(() => renameBusinessUnit(bu.id, name))}
        >
          Save
        </button>
      )}
      <span className="text-xs text-mfa-muted">
        {bu._count.users} {bu._count.users === 1 ? "person" : "people"}
      </span>
      <div className="flex gap-1">
        <button
          className={ghostBtn}
          disabled={pending || isFirst}
          onClick={() => run(() => moveBusinessUnit(bu.id, "up"))}
          aria-label="Move up"
        >
          ↑
        </button>
        <button
          className={ghostBtn}
          disabled={pending || isLast}
          onClick={() => run(() => moveBusinessUnit(bu.id, "down"))}
          aria-label="Move down"
        >
          ↓
        </button>
      </div>
      {error && <p className="w-full text-sm text-mfa-red">{error}</p>}
    </li>
  )
}

// --------------------------------------------------------------------------

const KIND_LABEL: Record<Kind, string> = {
  QUARTER: "Quarter",
  HALF: "Half",
  ANNUAL: "Full year",
}

function defaultStart(kind: Kind, num: number, year: number): string {
  const monthByQuarter = [0, 3, 6, 9]
  const month = kind === "ANNUAL" ? 0 : kind === "HALF" ? (num === 2 ? 6 : 0) : monthByQuarter[num - 1] ?? 0
  return `${year}-${String(month + 1).padStart(2, "0")}-01`
}

function PeriodsSection({ data }: { data: AdminData }) {
  const { periods } = data
  const { pending, error, run } = useAction()
  const [kind, setKind] = useState<Kind>("QUARTER")
  const [num, setNum] = useState(1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [start, setStart] = useState(defaultStart("QUARTER", 1, new Date().getFullYear()))
  const maxNum = kind === "QUARTER" ? 4 : kind === "HALF" ? 2 : 1

  function sync(k: Kind, n: number, y: number) {
    setKind(k)
    setNum(n)
    setYear(y)
    setStart(defaultStart(k, n, y))
  }

  return (
    <section className="overflow-hidden rounded-xl border border-mfa-track">
      <div className={band}>Review periods</div>
      <ul className="divide-y divide-mfa-track">
        {periods.map((p) => (
          <PeriodRow key={p.id} p={p} />
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3 border-t border-mfa-track px-4 py-3 text-sm">
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Kind</span>
          <select
            className={input}
            value={kind}
            onChange={(e) => sync(e.target.value as Kind, 1, year)}
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        {kind !== "ANNUAL" && (
          <label className="flex flex-col">
            <span className="text-xs text-mfa-muted">{kind === "QUARTER" ? "Quarter" : "Half"}</span>
            <select
              className={input}
              value={num}
              onChange={(e) => sync(kind, Number(e.target.value), year)}
            >
              {Array.from({ length: maxNum }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {kind === "QUARTER" ? `Q${n}` : `H${n}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Year</span>
          <input
            type="number"
            className={`${input} w-24`}
            value={year}
            onChange={(e) => sync(kind, num, Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Start date</span>
          <input
            type="date"
            className={input}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <button
          className={btn}
          disabled={pending}
          onClick={() =>
            run(() =>
              createPeriod({
                kind,
                number: kind === "ANNUAL" ? null : num,
                year,
                startDate: start,
              }),
            )
          }
        >
          Add period
        </button>
      </div>
      {error && <p className="px-4 pb-3 text-sm text-mfa-red">{error}</p>}
    </section>
  )
}

function PeriodRow({ p }: { p: AdminData["periods"][number] }) {
  const { pending, error, run } = useAction()
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="active-period"
          checked={p.isActive}
          disabled={pending || p.isActive}
          onChange={() => run(() => setActivePeriod(p.id))}
          className="accent-mfa-red"
        />
        <span className="font-semibold">{p.label}</span>
      </label>
      <span className="text-xs text-mfa-muted">{KIND_LABEL[p.kind as Kind]}</span>
      <span className="text-xs text-mfa-muted">
        starts {new Date(p.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
      </span>
      <span className="text-xs text-mfa-muted">
        {p._count.omas} {p._count.omas === 1 ? "OMA" : "OMAs"}
      </span>
      {p.isActive && <span className="text-xs font-semibold text-mfa-red">ACTIVE</span>}
      {error && <p className="w-full text-sm text-mfa-red">{error}</p>}
    </li>
  )
}

// --------------------------------------------------------------------------

const ROLES: Role[] = ["USER", "MANAGER", "ADMIN"]

function UsersSection({ data, viewerId }: { data: AdminData; viewerId: string }) {
  const { users, businessUnits } = data
  const managerOptions = users.filter((u) => u.role === "MANAGER" || u.role === "ADMIN")
  const { pending, error, run } = useAction()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>("USER")
  const [buId, setBuId] = useState("")
  const [mgrId, setMgrId] = useState("")

  function reset() {
    setName("")
    setEmail("")
    setPassword("")
    setRole("USER")
    setBuId("")
    setMgrId("")
  }

  return (
    <section className="overflow-hidden rounded-xl border border-mfa-track">
      <div className={band}>People</div>

      <div className="flex flex-wrap items-end gap-3 border-b border-mfa-track px-4 py-3 text-sm">
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Email</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Initial password</span>
          <input className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Role</span>
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Business unit</span>
          <select className={input} value={buId} onChange={(e) => setBuId(e.target.value)}>
            <option value="">—</option>
            {businessUnits.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-mfa-muted">Manager</span>
          <select className={input} value={mgrId} onChange={(e) => setMgrId(e.target.value)}>
            <option value="">—</option>
            {managerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className={btn}
          disabled={pending || !name.trim() || !email.trim() || password.length < 6}
          onClick={() =>
            run(
              () =>
                createUser({
                  name,
                  email,
                  password,
                  role,
                  businessUnitId: buId || null,
                  managerId: mgrId || null,
                }),
              reset,
            )
          }
        >
          Add person
        </button>
        {error && <p className="w-full text-sm text-mfa-red">{error}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-widest text-mfa-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Email</th>
              <th className="px-4 py-2 font-semibold">Role</th>
              <th className="px-4 py-2 font-semibold">Business unit</th>
              <th className="px-4 py-2 font-semibold">Manager</th>
              <th className="px-4 py-2 font-semibold">Active</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mfa-track">
            {users.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                isSelf={u.id === viewerId}
                businessUnits={businessUnits}
                managerOptions={managerOptions.filter((m) => m.id !== u.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function UserRow({
  u,
  isSelf,
  businessUnits,
  managerOptions,
}: {
  u: AdminData["users"][number]
  isSelf: boolean
  businessUnits: AdminData["businessUnits"]
  managerOptions: AdminData["users"]
}) {
  const { pending, error, run } = useAction()
  const [name, setName] = useState(u.name)
  const [email, setEmail] = useState(u.email)
  const [role, setRole] = useState<Role>(u.role as Role)
  const [buId, setBuId] = useState(u.businessUnitId ?? "")
  const [mgrId, setMgrId] = useState(u.managerId ?? "")
  const [pw, setPw] = useState("")

  const dirty =
    name.trim() !== u.name ||
    email.trim() !== u.email ||
    role !== u.role ||
    buId !== (u.businessUnitId ?? "") ||
    mgrId !== (u.managerId ?? "")

  function confirmDelete() {
    const extras: string[] = []
    if (u._count.omas > 0) extras.push(`${u._count.omas} OMA${u._count.omas === 1 ? "" : "s"} and their history`)
    if (u._count.team > 0) extras.push(`${u._count.team} report${u._count.team === 1 ? "" : "s"} will lose their manager`)
    const tail = extras.length ? `\n\nThis also removes: ${extras.join("; ")}.` : ""
    if (window.confirm(`Delete ${u.name} (${u.email})?${tail}\n\nThis cannot be undone.`)) {
      run(() => deleteUser(u.id))
    }
  }

  return (
    <>
      <tr className={u.active ? "" : "opacity-50"}>
        <td className="px-4 py-2">
          <input className={`${input} w-40`} value={name} onChange={(e) => setName(e.target.value)} />
        </td>
        <td className="px-4 py-2">
          <input
            className={`${input} w-52`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </td>
        <td className="px-4 py-2">
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2">
          <select className={input} value={buId} onChange={(e) => setBuId(e.target.value)}>
            <option value="">—</option>
            {businessUnits.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2">
          <select className={input} value={mgrId} onChange={(e) => setMgrId(e.target.value)}>
            <option value="">—</option>
            {managerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2">
          <input
            type="checkbox"
            checked={u.active}
            disabled={pending}
            onChange={(e) => run(() => setUserActive(u.id, e.target.checked))}
            className="h-4 w-4 accent-mfa-red"
          />
        </td>
        <td className="px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <button
                className={ghostBtn}
                disabled={pending}
                onClick={() =>
                  run(() =>
                    updateUser(u.id, {
                      name,
                      email,
                      role,
                      businessUnitId: buId || null,
                      managerId: mgrId || null,
                    }),
                  )
                }
              >
                Save
              </button>
            )}
            <input
              className={`${input} w-32`}
              placeholder="New password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            {pw.length >= 6 && (
              <button
                className={ghostBtn}
                disabled={pending}
                onClick={() => run(() => resetUserPassword(u.id, pw), () => setPw(""))}
              >
                Set
              </button>
            )}
            {!isSelf && (
              <button
                className="rounded-full border border-mfa-red px-3 py-1 text-sm text-mfa-red"
                disabled={pending}
                onClick={confirmDelete}
              >
                Delete
              </button>
            )}
          </div>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="px-4 pb-2 text-sm text-mfa-red">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}
