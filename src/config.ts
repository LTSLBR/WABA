import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(12),
  CREDENTIALS_ENCRYPTION_KEY: z.string().min(32),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v25.0'),
  META_APP_SECRET: z.string().default(''),
  META_VERIFY_TOKEN: z.string().default(''),
  META_ACCESS_TOKEN: z.string().default(''),
  META_PHONE_NUMBER_ID: z.string().default(''),
  META_WABA_ID: z.string().default(''),
  BITRIX_CLIENT_ID: z.string().default(''),
  BITRIX_CLIENT_SECRET: z.string().default(''),
  BITRIX_MEMBER_ID: z.string().optional(),
  BITRIX_DOMAIN: z.string().default(''),
  BITRIX_LINE_ID: z.coerce.number().int().positive().default(19),
  BITRIX_CONNECTOR_ID: z.string().regex(/^[a-z0-9_]+$/).default('ltsl_waba'),
  BITRIX_CONNECTOR_NAME: z.string().default('WhatsApp LTSL')
});

export type Config = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
