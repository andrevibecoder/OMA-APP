# Munro FA — OMA

Performance app for Munro FA. Next.js 14 (App Router) + TypeScript + Tailwind, with the Munro brand system.

## Prerequisites

- Node 20
- A Supabase project (Postgres database)

## Setup

1. `cp .env.example .env`
2. Fill the three vars in `.env`: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`
   - `DATABASE_URL` / `DIRECT_URL`: Supabase → Settings → Database → Connection string
   - `AUTH_SECRET`: generate with `openssl rand -base64 33`
3. `npm install`
4. `npm run db:migrate`
5. `npm run db:seed`

## Run

`npm run dev` → http://localhost:3000

Log in as `admin@munrofa.com` / `munro-dev-2026`.

## Test

`npm run test`
