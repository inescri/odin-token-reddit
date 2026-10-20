# Quickstart & Validation: Token-Weighted Message Board

**Branch**: `001-token-message-board` | **Date**: 2026-10-17 (revised)

## Dev setup

1. `pnpm install` (adds `react-router-dom` to frontend; creates `packages/api`).
2. `docker compose up -d mysql` → MySQL 8 on `localhost:3306`. Copy `packages/api/.env.example` to `.env`: `DATABASE_URL`, `SESSION_SECRET` (32+ random bytes), `APP_CANISTER_ID`, `CORS_ORIGINS=http://localhost:5173`, `ODIN_ENV=dev`.
3. `pnpm --filter @odin-app/api prisma migrate dev` then `pnpm --filter @odin-app/api dev` → http://localhost:3000.
4. Canister: deploy the trimmed canister once (`dfx deploy --network ic canister`, or reuse an existing deployment) with `TRUSTED_ORIGINS` including `http://localhost:5173`. Put its id in `packages/frontend/.env` as `VITE_APP_CANISTER_ID` and in the API `.env` as `APP_CANISTER_ID`. A local replica is not sufficient: Odin's signer must reach the canister.
5. `packages/frontend/.env`: `VITE_ODIN_ENV=dev`, `VITE_API_URL=http://localhost:3000`, `VITE_APP_CANISTER_ID`.
6. `pnpm dev:frontend` → http://localhost:5173.
7. Two Odin dev accounts with different balances of one dev token.

## Automated checks

```sh
pnpm test        # api: vote-delta, validation, amounts, login message, session; route tests (needs MySQL)
                 # frontend: amounts, commentTree, authStatus, locale
pnpm typecheck
pnpm build       # frontend tsc + vite; api tsc; dfx build canister --check
```

## Manual validation scenarios

### V1 — Weighted voting, no custody (US1 / SC-001, SC-007)
1. Account A (balance a) and account B (balance b) open the same thread.
2. Both upvote. **Pass**: score = a + b in display units, raw up count 2, no approval popup or redirect at any point; DevTools shows one `GET /user/{p}/balances?token_in=` from the SDK and one `POST /votes` per click.
3. A upvotes again. **Pass**: score = b. A downvotes. **Pass**: score = b − a′ where a′ is A's balance at that moment.

### V2 — Threads and comments (US2)
1. Sign in, create a thread. **Pass**: first under New, author chip shows Odin username and avatar.
2. Reply, reply to reply. **Pass**: nested; signed-out browser can read all.
3. Edit thread → "edited" marker. Delete the reply → placeholder, child still visible.
4. Empty title, 201-char title, whitespace-only comment. **Pass**: `INVALID_INPUT` with the rule; nothing saved.
5. From B, `PATCH` A's thread. **Pass**: `FORBIDDEN`.

### V3 — Refusals (SC-005, FR-017)
1. Zero-balance account votes. **Pass**: UI shows the no-balance message and sends no request; forcing `weight: "0"` via DevTools returns `NO_BALANCE`.
2. Signed out, click vote. **Pass**: sign-in prompt, no request.
3. Vote on a deleted comment. **Pass**: `DELETED`.
4. Expired session (edit the stored token). **Pass**: `UNAUTHORIZED`, UI re-logs in silently while the Odin session is valid.

### V4 — Frozen snapshot (SC-004)
1. A upvotes with balance a, sells all on odin.fun, reloads. **Pass**: score still includes a; voting power display reads 0.
2. A upvotes again (retract). **Pass**: score drops by exactly a.

### V5 — Ranking and browsing (US3)
1. Seed threads with varied scores and ages; switch Top, New, Hot. **Pass**: orderings match data-model SQL.
2. Thread view: comments by score; switch to newest. **Pass**.
3. Home: search a ticker; open a token with no threads. **Pass**: empty board with composer.

### V6 — Rapid toggling (SC-003)
1. Fire 100 alternating up/down `POST /votes` from one session concurrently (script).
2. **Pass**: at most one `Vote` row for that user and item; counts ≥ 0; score equals the sum of remaining vote weights.

### V7 — Login hardening
1. Replay the same login body twice. **Pass**: second returns `REPLAY`.
2. Login with a delegation whose `targets` omit this canister. **Pass**: `LOGIN_REJECTED`.
3. Timestamp 10 min old. **Pass**: `LOGIN_REJECTED`.
4. Wallet in-app browser (OKX or Xverse): sign in via redirect on a thread page. **Pass**: returns to the thread, auto-login to the backend succeeds, voting works.
