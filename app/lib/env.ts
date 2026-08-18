import { z } from 'zod';

const envSchema = z.object({
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),
  POSTGRES_URL: z.string().min(1, 'POSTGRES_URL is required'),
  ZEBRA_API_BASE: z.string().url(),
  ZEBRA_EMAIL: z.string().email(),
  ZEBRA_PASSWORD: z.string().min(1, 'ZEBRA_PASSWORD is required'),
  ZEBRA_BRANCH_ID: z.coerce.number().default(20),
  ZEBRA_ACTIVE_ID: z.coerce.number().default(1),
});

// AUTH_SECRET falls back to NEXTAUTH_SECRET for compatibility with older next-auth tooling.
const parsed = envSchema.safeParse({
  ...process.env,
  AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration:\n${parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')}`
  );
}

export const env = parsed.data;
