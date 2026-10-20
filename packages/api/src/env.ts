import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  APP_CANISTER_ID: z.string().min(1, 'APP_CANISTER_ID is required'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  ODIN_ENV: z.enum(['prod', 'staging', 'dev', 'local', 'legacy']).default('prod'),
  LOG_LEVEL: z.string().default('info'),
  POST_COOLDOWN_MS: z.coerce.number().int().min(0).default(30_000),
});

export type Env = z.infer<typeof envSchema>;

/** Validate `process.env` once; throws a readable error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment:\n  ${issues}`);
  }
  return parsed.data;
}
