/**
 * App config read from Vite env. See `.env.example`.
 */

/**
 * The identity-anchor canister's principal. Passed to Odin Connect as the
 * delegation target; the backend checks the delegation names it. The app
 * never calls this canister itself.
 */
export const APP_CANISTER_ID = import.meta.env.VITE_APP_CANISTER_ID ?? '';

/** Backend base URL, no trailing slash. */
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
