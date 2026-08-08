import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import type { IncomingMessage, MetaMessageStatus } from './types.js';
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
        const type = String(message.type ?? 'unknown');
        let text = message.text?.body ?? message.button?.text;
        let media: IncomingMessage['media'];
        if (message.interactive?.button_reply) text = `Resposta: ${message.interactive.button_reply.title}`;
        if (message.interactive?.list_reply) text = `Opção: ${message.interactive.list_reply.title}`;
        if (message.location) text = `📍 Localização: ${message.location.name ?? ''}\nhttps://maps.google.com/?q=${message.location.latitude},${message.location.longitude}`.trim();
        if (message.contacts?.length) text = message.contacts.map((contact: any) => `👤 ${contact.name?.formatted_name ?? 'Contato'}${contact.phones?.[0]?.phone ? ` — ${contact.phones[0].phone}` : ''}`).join('\n');
        if (message.reaction) text = `${message.reaction.emoji || 'Reação removida'} à mensagem ${message.reaction.message_id}`;
        const mediaPayload = message.image ?? message.audio ?? message.video ?? message.document ?? message.sticker;
        if (mediaPayload?.id) {
          media = { id: String(mediaPayload.id), mimeType: mediaPayload.mime_type, filename: mediaPayload.filename };
          const labels: Record<string,string> = { image:'🖼️ Imagem', audio:'🎧 Áudio', video:'🎬 Vídeo', document:'📄 Documento', sticker:'💬 Figurinha' };
          text = `${labels[type] ?? '📎 Mídia'}${mediaPayload.caption ? `\n${mediaPayload.caption}` : ''}`;
        }
        if (!text) text = `[Mensagem ${type} recebida]`;
        const normalized: IncomingMessage = { id: message.id, from: message.from, name: String(names.get(message.from) ?? message.from), timestamp: message.timestamp, type, text: String(text) };
        if (media) normalized.media = media;
        if (message.context?.id) normalized.replyTo = String(message.context.id);
        result.push(normalized);
      }
    }
  }
  return result;
}

export function extractMessageStatuses(payload: any): MetaMessageStatus[] {
  const result: MetaMessageStatus[] = [];
  for (const entry of payload?.entry ?? []) for (const change of entry?.changes ?? []) {
    for (const item of change?.value?.statuses ?? []) {
      const errors = [...(item.errors ?? []), ...(item.conversation?.errors ?? [])];
      result.push({ id: String(item.id), status: String(item.status), timestamp: String(item.timestamp ?? ''), recipientId: item.recipient_id, error: errors.map((e: any) => e.error_data?.details ?? e.message ?? e.title ?? e.code).filter(Boolean).join('; ') || undefined });
    }
  }
  return result;
}

export class MetaClient {
  constructor(private readonly config: Config, private readonly settings: SettingsStore) {}

  async sendText(to: string, body: string): Promise<string> {
    return this.sendMessage({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: true, body } });
  }

  private async request(path: string, init?: RequestInit): Promise<any> {
    const values = await this.settings.all();
    const response = await fetch(`https://graph.facebook.com/${values.META_GRAPH_VERSION}/${path}`, { ...init, headers: { Authorization: `Bearer ${values.META_ACCESS_TOKEN}`, Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) } });
    const data: any = await response.json();
    if (!response.ok) throw new Error(`Meta API ${response.status}: ${JSON.stringify(data)}`);
    return data;
  }

  async sendMessage(payload: Record<string, unknown>): Promise<string> {
    const values = await this.settings.all();
    const data = await this.request(`${values.META_PHONE_NUMBER_ID}/messages`, { method: 'POST', body: JSON.stringify(payload) });
    const id = data?.messages?.[0]?.id;
    if (!id) throw new Error('A Meta não retornou o ID da mensagem.');
    return id;
  }

  async accountOverview(): Promise<{ phone: any; templates: any[] }> {
    const values = await this.settings.all();
    const [phone, templates] = await Promise.all([
      this.request(`${values.META_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`),
      this.request(`${values.META_WABA_ID}/message_templates?fields=id,name,status,language,category&limit=100`)
    ]);
    return { phone, templates: templates.data ?? [] };
  }

  async mediaInfo(id: string): Promise<{ url: string; mime_type?: string; file_size?: number }> { return this.request(id); }

  async downloadMedia(id: string): Promise<{ body: Buffer; contentType: string }> {
    const values = await this.settings.all();
    const info = await this.mediaInfo(id);
    const response = await fetch(info.url, { headers: { Authorization: `Bearer ${values.META_ACCESS_TOKEN}` } });
    if (!response.ok) throw new Error(`Falha ao baixar mídia da Meta: ${response.status}`);
    return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? info.mime_type ?? 'application/octet-stream' };
  }
}
