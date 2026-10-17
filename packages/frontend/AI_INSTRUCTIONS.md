# AI_INSTRUCTIONS — `@odin-app/frontend`

Rules for working inside the frontend package. Read alongside the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this package is

A Vite + React + TypeScript app: the token-weighted message board UI. Users
sign in with Odin Connect; the app exchanges the delegation for a backend
session; votes carry the user's Odin balance read through the SDK.

```
src/
  main.tsx · App.tsx         # entry, router (/, /b/:tokenId, /b/:tokenId/t/:threadId)
  config.ts                  # APP_CANISTER_ID, API_URL from Vite env
  odin/                      # Odin Connect wiring (one instance, render from state)
  session/ · hooks/useSession.ts   # app session: login after connect, clear on disconnect
  api/                       # apiFetch + wire types + login exchange
  hooks/                     # data hooks (threads, comments, votes, boards, balance, token, profile)
  context/TokenMetaContext   # token id/ticker/divisibility/decimals for VoteControl
  components/ · routes/      # UI
  lib/                       # pure helpers (amounts, commentTree, time, tokenImage) with tests
  i18n/                      # en + zh; key sets must match (typecheck enforces)
```

## Hard rules

1. **Amounts are `bigint`** until the render edge; format with `lib/amounts.ts`
   using `divisibility + decimals` from the token.
2. **All Odin data goes through `odin.api.*`** (tokens, profiles, balances). No
   hand-rolled calls to `api.odin.fun`.
3. **Vote weight = `odin.api.getBalance(principal, tokenId)` fetched
   immediately before `POST /votes`.** Never cache it across votes. A `null`
   or zero balance means: do not submit (unless retracting), explain why.
4. **odin-connect 2.x: render from state, never from an awaited call.** One
   `OdinConnect` instance (`src/odin/client.ts`); start `connect()` from a
   handler without awaiting; keep `mode: "auto"` for wallet in-app browsers.
5. **Backend calls use the app session token** from `useSession()`, never the
   Odin JWT. On a 401 call `invalidate()` and retry once.
6. **No secrets or canister ids in code.** Read from Vite env.
7. **Strict TS, no `any`, 2-space, single quotes, semicolons.**

## Build & test

```sh
pnpm --filter @odin-app/frontend dev
pnpm --filter @odin-app/frontend typecheck
pnpm --filter @odin-app/frontend test
pnpm --filter @odin-app/frontend build
```
