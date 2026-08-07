import type { Config } from './config.js';
import type { Database } from './db.js';
import type { BitrixOperatorMessage, IncomingMessage, OAuthToken } from './types.js';
import type { SettingsStore } from './settings.js';

export class BitrixClient {
  constructor(private readonly config: Config, private readonly db: Database, private readonly settings: SettingsStore) {}

  private async token(): Promise<OAuthToken> {
    const current = await this.db.getToken(this.config.BITRIX_MEMBER_ID);
    if (!current) throw new Error('Aplicativo Bitrix ainda não instalado.');
    if (current.expiresAt.getTime() > Date.now() + 60_000) return current;
    const values = await this.settings.all();
    const response = await fetch('https://oauth.bitrix.info/oauth/token/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: values.BITRIX_CLIENT_ID, client_secret: values.BITRIX_CLIENT_SECRET, refresh_token: current.refreshToken })
    });
    const data: any = await response.json();
    if (!response.ok || data.error) throw new Error(`Falha ao renovar OAuth Bitrix: ${JSON.stringify(data)}`);
    const updated = { ...current, accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000) };
    await this.db.saveToken(updated);
    return updated;
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const auth = await this.token();
    const base = auth.domain.startsWith('http')
      ? new URL(auth.domain.endsWith('/') ? auth.domain : `${auth.domain}/`)
      : new URL(`https://${auth.domain.replace(/\/$/, '')}/rest/`);
    const endpoint = new URL(`${method}.json`, base);
    const response = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params)
    });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); }
    catch { throw new Error(`Bitrix ${method} em ${endpoint.origin}${endpoint.pathname} retornou ${response.status} ${response.headers.get('content-type') ?? ''}: ${raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)}`); }
    if (!response.ok || data.error) throw new Error(`Bitrix ${method}: ${data.error_description ?? data.error ?? response.status}`);
    return data.result as T;
  }

  async install(token: OAuthToken): Promise<void> {
    const values = await this.settings.all();
    await this.db.saveToken(token);
    const icon = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="white" d="M32 6a24 24 0 0 0-20.7 36.2L8 58l16.2-3.1A24 24 0 1 0 32 6Zm0 43a19 19 0 0 1-9.7-2.7l-1.1-.6-7.2 1.4 1.5-7-.7-1.1A19 19 0 1 1 32 49Z"/></svg>`);
    await this.call('imconnector.register', {
      ID: values.BITRIX_CONNECTOR_ID,
      NAME: values.BITRIX_CONNECTOR_NAME,
      ICON: { DATA_IMAGE: `data:image/svg+xml,${icon}`, COLOR: '#25D366', SIZE: '90%', POSITION: 'center' },
      PLACEMENT_HANDLER: `${this.config.PUBLIC_URL}/bitrix/settings`,
      CHAT_GROUP: false, NEED_SIGNATURE: true, EDIT_INTERNAL_MESSAGES: false, DEL_INTERNAL_MESSAGES: false
    });
    try {
      await this.call('event.bind', { event: 'ONIMCONNECTORMESSAGEADD', handler: `${this.config.PUBLIC_URL}/webhooks/bitrix` });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (!message.includes('already binded') && !message.includes('already bound')) throw error;
    }
  }

  async configureLine(lineId?: number, active = 1): Promise<void> {
    const values = await this.settings.all();
    const line = lineId ?? Number(values.BITRIX_LINE_ID);
    const base = { CONNECTOR: values.BITRIX_CONNECTOR_ID, LINE: line };
    await this.call('imconnector.activate', { ...base, ACTIVE: active ? '1' : '0' });
    if (active) {
      await this.call('imconnector.connector.data.set', { ...base, DATA: { ID: `${values.BITRIX_CONNECTOR_ID}_line_${line}`, URL: this.config.PUBLIC_URL, URL_IM: this.config.PUBLIC_URL, NAME: values.BITRIX_CONNECTOR_NAME } });
    }
  }

  async activate(): Promise<void> { await this.configureLine(); }

  async receive(message: IncomingMessage): Promise<void> {
    const values = await this.settings.all();
    await this.call('imconnector.send.messages', {
      CONNECTOR: values.BITRIX_CONNECTOR_ID,
      LINE: Number(values.BITRIX_LINE_ID),
      MESSAGES: [{
        user: { id: message.from, name: message.name },
        message: { id: message.id, date: Number(message.timestamp), text: message.text },
        chat: { id: message.from, name: message.name, url: `https://wa.me/${message.from}` }
      }]
    });
  }
}

export function parseOperatorMessage(body: any): BitrixOperatorMessage | null {
  const data = body?.data ?? body?.DATA ?? body;
  const message = data?.MESSAGES?.[0] ?? data?.messages?.[0] ?? data;
  const text = message?.message?.text ?? message?.MESSAGE?.TEXT ?? message?.MESSAGE;
  const externalChatId = message?.chat?.id ?? message?.CHAT?.ID ?? message?.USER?.ID;
  const messageId = Number(message?.im?.message_id ?? message?.IM?.MESSAGE_ID ?? message?.MESSAGE_ID);
  const chatId = Number(message?.im?.chat_id ?? message?.IM?.CHAT_ID ?? message?.CHAT_ID);
  if (!text || !externalChatId || !Number.isFinite(messageId) || !Number.isFinite(chatId)) return null;
  return { text: String(text), externalChatId: String(externalChatId), messageId, chatId };
}
