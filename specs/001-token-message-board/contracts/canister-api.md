# Contract: Identity-Anchor Canister

**Branch**: `001-token-message-board` | **Date**: 2026-10-17 (revised)

The canister exists only so Odin Connect can issue a delegation scoped to it. The app's frontend and backend never call it. Odin's signer calls `icrc28_trusted_origins` before issuing a delegation and refuses if the app origin is missing.

```candid
service : {
  getOwner : () -> (opt principal) query;
  icrc28_trusted_origins : () -> (record { trusted_origins : vec text });
}
```

- `@init` records the deploying principal as `owner` in `config` (stable memory id 1). Memory id 0 stays reserved.
- `TRUSTED_ORIGINS` must list the exact frontend origins (`http://localhost:5173`, `http://localhost:5174`, production host). Bare origins, no trailing slash.
- Removed from the template: `deposit`, `withdraw`, `getBalance`, `getBalances`, `ledger.ts`, `odin.ts`. The canister holds no funds and makes no inter-canister calls.
- Deploy once to mainnet. Its id becomes `VITE_APP_CANISTER_ID` (frontend `targets`) and `APP_CANISTER_ID` (backend target check).
