import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import type { IncomingMessage } from './types.js';
import type { SettingsStore } from './settings.js';

export function verifyMetaSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const received = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function extractIncomingMessages(payload: any): IncomingMessage[] {
  const result: IncomingMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const names = new Map((value.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name ?? c.wa_id]));
      for (const message of value.messages ?? []) {
        const text = message.text?.body
          ?? message.button?.text
          ?? message.interactive?.button_reply?.title
          ?? message.interactive?.list_reply?.title
          ?? `[${message.type ?? 'mensagem'}]`;
        result.push({ id: message.id, from: message.from, name: String(names.get(message.from) ?? message.from), timestamp: message.timestamp, type: message.type, text });
      }
    }
  }
  return result;
}

export class MetaClient {
  constructor(private readonly config: Config, private readonly settings: SettingsStore) {}

  async sendText(to: string, body: string): Promise<string> {
    const values = await this.settings.all();
    const response = await fetch(`https://graph.facebook.com/${values.META_GRAPH_VERSION}/${values.META_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${values.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } })
    });
    const data: any = await response.json();
    if (!response.ok) throw new Error(`Meta API ${response.status}: ${JSON.stringify(data)}`);
    const id = data?.messages?.[0]?.id;
    if (!id) throw new Error('A Meta não retornou o ID da mensagem.');
    return id;
  }
}
