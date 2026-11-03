import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Optional: without a key the enquiry router uses deterministic rules instead of an LLM.
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
  AI_MODEL: z.string().optional().transform((v) => v || 'claude-haiku-5-5'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with variable names only; never print values.
  const names = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${names.join('\n')}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
