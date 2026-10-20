# odin-token-reddit

A token-weighted message board for [Odin Fun](https://odin.fun). Every Odin
token gets a board. Anyone signed in with Odin can post threads and comments.
Votes are weighted by how much of the board's token the voter holds at that
moment. Nothing ever leaves anyone's wallet.

## How it works

```mermaid
flowchart LR
    user([User])
    fe["Frontend<br/>(React + Vite)"]
    sdk["odin-connect SDK"]
    odinfe["Odin Fun<br/>sign-in (popup / redirect)"]
    odinapi["Odin API<br/>tokens · profiles · balances"]
    api["Backend<br/>(Express + Prisma)"]
    db[("MySQL")]
    can["Identity-anchor<br/>canister"]

    user --> fe
    fe --> sdk
    sdk -->|connect, requires_delegation<br/>targets=[canister]| odinfe
    odinfe -.->|icrc28_trusted_origins| can
    sdk -->|getTokens / getUser / getBalance| odinapi
    fe -->|"POST /auth/login (signed timestamp + delegation)"| api
    fe -->|"threads · comments · POST /votes {weight}"| api
    api --> db
```

1. **Sign in.** The frontend calls `odin.connect({ requires_delegation: true, targets: [APP_CANISTER_ID] })`.
   Odin issues a 48 h delegation scoped to the identity-anchor canister. The
   canister has no logic; it exists because Odin needs a target and publishes
   the trusted origins.
2. **App session.** The browser signs `"odin-token-reddit-login:v1\n" + timestamp`
   with the delegation's session key and posts it with the delegation chain.
   The backend verifies the chain (the same verifier code Odin's own login
   uses), checks the delegation targets this app, and issues a 24 h session.
3. **Vote.** Right before voting, the browser reads the user's balance of the
   board's token through `odin.api.getBalance` and submits it as the vote's
   weight. The backend records it as submitted. The weight is frozen on the
   vote; later buys or sells do not change past votes. Retracting a vote uses
   the stored weight, so a holder who sold everything can still undo exactly
   what they added.

### Trust model

The vote weight is **client-submitted and trusted**. This is a deliberate v1
decision: the Odin API blocks non-browser clients, so the backend cannot fetch
balances itself until its egress is allowed through Cloudflare. The hardening
path is a one-function swap in `packages/api/src/services/votes.service.ts`.
Every accepted vote is logged with principal, token, and weight so votes can
be reconciled against the API later.

Identity, by contrast, **is** verified cryptographically. A delegation issued
to another Odin app cannot log in here (target check + app-bound message).

## Packages

| Package | What |
|---|---|
| `packages/api` | Express 5 + Prisma 5 + MySQL 8. Boards, threads, comments, votes, login. |
| `packages/frontend` | React 19 + Vite 8 + odin-connect 2.x. Board UI. |
| `packages/canister` | Azle. Identity anchor: `icrc28_trusted_origins`, owner. Deploy once. |

## Quick start

Prerequisites: Node 22, pnpm, Docker (for MySQL). dfx only if you deploy the canister.

```sh
pnpm install
docker compose up -d mysql

cp packages/api/.env.example packages/api/.env
#   SESSION_SECRET: 32+ random chars; APP_CANISTER_ID: your anchor canister id
cp packages/frontend/.env.example packages/frontend/.env
#   VITE_APP_CANISTER_ID: same id; VITE_ODIN_ENV: prod | dev

pnpm --filter @odin-app/api prisma:migrate
pnpm dev:api        # http://localhost:3000
pnpm dev:frontend   # http://localhost:5173
```

### Deploying the identity-anchor canister

Odin's signer must be able to reach the canister, so it lives on the IC, not a
local replica. Edit `TRUSTED_ORIGINS` in `packages/canister/src/index.ts` to
list your frontend origins exactly (`http://localhost:5173` for dev, your
production origin for prod), then:

```sh
dfx deploy --network ic canister
```

Put the resulting id in both `.env` files. You only need to do this once per
set of origins.

## Backend API

See `specs/001-token-message-board/contracts/backend-api.md`. In short:

| Method | Path | Auth |
|---|---|---|
| POST | `/auth/login` | — |
| GET | `/auth/me` | session |
| GET | `/boards/stats?tokenIds=a,b` | — |
| GET | `/boards/:tokenId/threads?sort=top\|new\|hot&page&limit` | optional |
| POST | `/boards/:tokenId/threads` | session |
| GET / PATCH / DELETE | `/threads/:id` | optional / author |
| GET / POST | `/threads/:id/comments` | optional / session |
| PATCH / DELETE | `/comments/:id` | author |
| POST | `/votes` | session |

Big numbers are decimal strings on the wire. Errors are `{ error: { code, message } }`.

## Environment variables

**API** (`packages/api/.env`): `PORT`, `DATABASE_URL`, `TEST_DATABASE_URL`
(tests), `SESSION_SECRET`, `APP_CANISTER_ID`, `CORS_ORIGINS`, `ODIN_ENV`,
`POST_COOLDOWN_MS` (default 30000).

**Frontend** (`packages/frontend/.env`): `VITE_ODIN_APP_NAME`, `VITE_ODIN_ENV`,
`VITE_APP_CANISTER_ID`, `VITE_API_URL`.

## Scripts

```sh
pnpm typecheck     # all packages
pnpm test          # api unit tests always; route tests when TEST_DATABASE_URL is set
pnpm build         # frontend dist, api dist, canister wasm check (needs dfx)
```

## Deploy

- **Frontend**: any static host. Netlify works out of the box (`public/_redirects`
  handles SPA routes). Set `VITE_API_URL` and `VITE_APP_CANISTER_ID` at build time.
- **API**: any Node 22 host with a MySQL 8 database. Run
  `prisma migrate deploy` on release. Set `CORS_ORIGINS` to the frontend origin.
  The replay guard is in-memory; run one instance or move it to Redis/MySQL first.
- **Canister**: once, see above.

## Spec and plan

`specs/001-token-message-board/` holds the feature spec, implementation plan,
research notes, data model, API contracts, quickstart validation scenarios, and
the task list this repo was built from.
