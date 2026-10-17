import { IDL, init, msgCaller, query, StableBTreeMap, update } from 'azle';
import { Principal } from '@dfinity/principal';

/**
 * ⚠️ EDIT BEFORE DEPLOY — must list the exact origin(s) your frontend is served
 * from, or Odin Connect login will fail with "origin is not trusted".
 *
 * ICRC-28 trusted origins: the web origins allowed to request a delegation
 * that targets this canister. Before issuing a delegation, Odin Connect (the
 * signer) calls `icrc28_trusted_origins` on every target canister and refuses
 * the whole auth if the relying-party origin is absent — or if the endpoint is
 * missing entirely. The origin is the page that opened the signer, NOT this
 * canister's own URL.
 *
 * Each entry MUST be a bare origin: `scheme://host[:port]`, no trailing slash,
 * no path. https only, except `http://localhost`/`127.0.0.1` for local dev.
 * The signer does an exact string match, so e.g. a trailing `/` will not match.
 */
const TRUSTED_ORIGINS: string[] = [
    // Local dev — Vite dev server (default port).
    'http://localhost:5173',
    // Local dev — Vite dev server (fallback port when 5173 is taken).
    'http://localhost:5174',
    // EDIT BEFORE DEPLOY — production frontend origin, e.g.
    // 'https://board.example.com',
];

/**
 * odin-token-reddit identity-anchor canister.
 *
 * This canister exists for exactly one reason: Odin Connect only issues a
 * delegation when the app names at least one target canister, and the app's
 * backend verifies that delegation to authenticate users. Nothing else lives
 * here — no board data, no balances, no inter-canister calls, no funds.
 *
 * The frontend and backend never call this canister. Only the Odin signer
 * does, to read `icrc28_trusted_origins`.
 *
 * Stable memory ids: `0` is reserved (held the template's ledger; never
 * reuse), `1` is `config`.
 */
export default class {
    /** Canister config (the deploying admin principal). Memory id 1. */
    config = new StableBTreeMap<string, string>(1);

    /** Record the deploying principal as the owner — a generic admin handle. */
    @init([])
    initialize(): void {
        this.config.insert('owner', msgCaller().toText());
    }

    /** Read the configured owner principal. */
    @query([], IDL.Opt(IDL.Principal))
    getOwner(): [Principal] | [] {
        const owner = this.config.get('owner');
        return owner === undefined ? [] : [Principal.fromText(owner)];
    }

    /**
     * ICRC-28: the web origins this canister trusts to request a delegation
     * on a user's behalf. Configure the list in `TRUSTED_ORIGINS` above.
     *
     * MUST be `@update`, not `@query`: the signer issues a replicated call so
     * the response is consensus-certified — a query reply comes from a single
     * replica and is spoofable, so signers reject it.
     */
    @update([], IDL.Record({ trusted_origins: IDL.Vec(IDL.Text) }))
    icrc28_trusted_origins(): { trusted_origins: string[] } {
        return { trusted_origins: TRUSTED_ORIGINS };
    }
}
