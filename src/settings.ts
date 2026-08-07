import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Config } from './config.js';
import type { Database } from './db.js';

export const settingKeys = ['META_GRAPH_VERSION','META_APP_SECRET','META_VERIFY_TOKEN','META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_WABA_ID','BITRIX_CLIENT_ID','BITRIX_CLIENT_SECRET','BITRIX_DOMAIN','BITRIX_LINE_ID','BITRIX_CONNECTOR_ID','BITRIX_CONNECTOR_NAME'] as const;
export type SettingKey = typeof settingKeys[number];

export class SettingsStore {
  private readonly key: Buffer;
  constructor(private readonly db: Database, private readonly config: Config) {
    this.key = createHash('sha256').update(config.CREDENTIALS_ENCRYPTION_KEY).digest();
  }
  private encrypt(value: string): string {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
  }
  private decrypt(value: string): string {
    const [iv, tag, data] = value.split('.');
    if (!iv || !tag || !data) throw new Error('Credencial criptografada inválida.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }
  async get(key: SettingKey): Promise<string> {
    const stored = await this.db.getSetting(key);
    if (stored) return this.decrypt(stored);
    return String((this.config as any)[key] ?? '');
  }
  async set(key: SettingKey, value: string): Promise<void> { await this.db.setSetting(key, this.encrypt(value)); }
  async all(): Promise<Record<SettingKey,string>> {
    const entries = await Promise.all(settingKeys.map(async key => [key, await this.get(key)] as const));
    return Object.fromEntries(entries) as Record<SettingKey,string>;
  }
}
