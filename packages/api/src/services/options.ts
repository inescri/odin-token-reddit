export interface ServiceOptions {
  /** Clock override for tests. */
  now?: () => Date;
  /** Per-principal post cooldown in ms; `0` disables (tests). Default 30 s. */
  cooldownMs?: number;
}
