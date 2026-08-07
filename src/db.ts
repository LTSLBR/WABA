import mysql, { Pool } from 'mysql2/promise';
import type { OAuthToken } from './types.js';

export class Database {
  readonly pool: Pool;
  constructor(url: string) { this.pool = mysql.createPool(url); }

  async migrate(): Promise<void> {
    const statements = [`CREATE TABLE IF NOT EXISTS oauth_tokens (
        member_id VARCHAR(255) PRIMARY KEY,
        domain VARCHAR(255) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )`, `CREATE TABLE IF NOT EXISTS processed_events (
        event_id VARCHAR(255) PRIMARY KEY,
        source ENUM('meta','bitrix') NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      )`, `CREATE TABLE IF NOT EXISTS outbound_messages (
        meta_message_id VARCHAR(255) PRIMARY KEY,
        bitrix_message_id BIGINT NOT NULL,
        bitrix_chat_id BIGINT NOT NULL,
        external_chat_id VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'sent',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_bitrix_message (bitrix_message_id)
      )`, `CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        encrypted_value TEXT NOT NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )`];
    for (const statement of statements) await this.pool.query(statement);
  }

  async getSetting(key: string): Promise<string | null> {
    const [rows] = await this.pool.execute<any[]>('SELECT encrypted_value FROM app_settings WHERE setting_key=? LIMIT 1', [key]);
    return rows[0]?.encrypted_value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.pool.execute('INSERT INTO app_settings(setting_key,encrypted_value) VALUES(?,?) ON DUPLICATE KEY UPDATE encrypted_value=VALUES(encrypted_value)', [key, value]);
  }

  async saveToken(token: OAuthToken): Promise<void> {
    await this.pool.execute(
      `INSERT INTO oauth_tokens(member_id,domain,access_token,refresh_token,expires_at)
       VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE domain=VALUES(domain),access_token=VALUES(access_token),refresh_token=VALUES(refresh_token),expires_at=VALUES(expires_at)`,
      [token.memberId, token.domain, token.accessToken, token.refreshToken, token.expiresAt]
    );
  }

  async getToken(memberId?: string): Promise<OAuthToken | null> {
    const [rows] = await this.pool.query<any[]>(
      memberId ? 'SELECT * FROM oauth_tokens WHERE member_id=? LIMIT 1' : 'SELECT * FROM oauth_tokens ORDER BY updated_at DESC LIMIT 1',
      memberId ? [memberId] : []
    );
    const row = rows[0];
    return row ? { accessToken: row.access_token, refreshToken: row.refresh_token, expiresAt: row.expires_at, domain: row.domain, memberId: row.member_id } : null;
  }

  async claimEvent(id: string, source: 'meta' | 'bitrix'): Promise<boolean> {
    try { await this.pool.execute('INSERT INTO processed_events(event_id,source) VALUES(?,?)', [id, source]); return true; }
    catch (error: any) { if (error?.code === 'ER_DUP_ENTRY') return false; throw error; }
  }

  async saveOutbound(metaId: string, bitrixId: number, chatId: number, externalChatId: string): Promise<void> {
    await this.pool.execute('INSERT INTO outbound_messages(meta_message_id,bitrix_message_id,bitrix_chat_id,external_chat_id) VALUES(?,?,?,?)', [metaId, bitrixId, chatId, externalChatId]);
  }
}
