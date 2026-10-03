# Boss Bank

Boss Bank is a development-only SSP digital wallet. It is not connected to banks,
mobile-money providers, payment processors, cards, withdrawals, or external financial
accounts. Development deposits are simulated ledger entries only.

## Stack

- `apps/web`: React, TypeScript, Vite
- `apps/api`: Node.js, Express, TypeScript
- `packages/shared`: shared Zod schemas and API types
- `packages/db`: Prisma schema and PostgreSQL client

All wallet amounts are integer SSP minor units (100 minor units per SSP). Wallet-to-wallet transfers and
development deposits are committed with paired ledger entries in a serializable
PostgreSQL transaction. Sessions use random opaque tokens stored as SHA-256 hashes
and are sent only in HTTP-only cookies.

## Development

Requirements: Node.js 20+, npm 10+, and Docker Compose.

1. Copy `.env.example` to `.env` and change `SESSION_SECRET` to a random value.
2. Install packages with `npm install`.
3. Start PostgreSQL using `docker compose up -d postgres`.
4. Generate Prisma and apply migrations with `npm run db:deploy`.
5. Start the API and web app with `npm run dev`.
6. Open <http://localhost:5173> and register an account.

To promote an existing account to admin, run `npm run admin:promote -- email@example.com`.
Promotion is an explicit local CLI operation; public registration always creates a
member account. Development deposits are available only while the API runs with
`NODE_ENV=development`.

Run API integration tests against a migrated test database with `npm test`. Configure
`TEST_DATABASE_URL` to use a separate database; tests clear that dedicated test database.
Never point tests at production data.

## Operational notes

Use HTTPS in production and set `NODE_ENV=production`, `WEB_ORIGIN`, and a strong
`SESSION_SECRET`. The API rejects cross-origin cookie mutations, uses same-site
HTTP-only cookies, rate-limits authentication, validates inputs on the server, and
records security and money-movement audit events. The bundled in-memory rate limiter
is appropriate for a single development process; use a shared store before running
multiple API replicas. This starter does not implement external payment rails.
