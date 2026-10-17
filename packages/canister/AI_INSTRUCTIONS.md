# AI_INSTRUCTIONS — `@odin-app/canister`

Rules for working inside the Azle canister package. Read alongside the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this package is

An **identity-anchor canister**. Odin Connect issues a delegation only when the
app names a target canister, and the backend (`packages/api`) verifies that
delegation to authenticate users. This canister therefore exposes
`icrc28_trusted_origins` and an owner record, and nothing else.

```
src/
  index.ts      # @init owner, getOwner, icrc28_trusted_origins
```

It stores no board data, holds no funds, and makes no inter-canister calls.
The app's own frontend and backend never call it; only Odin's signer does.

## Hard rules

1. **Do not add balance, token, or fund-moving logic here.** Board data lives
   in the backend database. If a task needs a canister to hold value, stop and
   surface it to a human.
2. **Stable memory ids**: `0` is reserved (the template's former ledger) and
   must never be reused; `1` is `config`. New maps, if ever needed, start at 2.
3. `icrc28_trusted_origins` MUST stay an `@update` (replicated) call and MUST
   list exact bare origins.

## Build & test

```sh
dfx build canister --check      # compile to wasm (run from repo root)
pnpm --filter @odin-app/canister test   # no tests today; passes with none
```

Type-checking with plain `tsc` fails because Azle ships raw `.ts`; the Azle
compiler (`dfx build`) is the real type gate.

## Gotchas

- The canister builds via dfx, which invokes Azle's `npm exec`. The repo's
  `.npmrc` sets `node-linker=hoisted` so those binaries resolve under pnpm.
- Stable mode only.
