import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import qs from 'qs';
import { loadConfig } from './config.js';
import { Database } from './db.js';
import { BitrixClient, parseOperatorMessage } from './bitrix.js';
import { extractIncomingMessages, MetaClient, verifyMetaSignature } from './meta.js';

const config = loadConfig();
const db = new Database(config.DATABASE_URL);
const meta = new MetaClient(config);
const bitrix = new BitrixClient(config, db);
const app = Fastify({ logger: { redact: ['req.headers.authorization', 'body.auth', 'body.AUTH_ID', 'body.REFRESH_ID'] } });
await app.register(formbody, { parser: value => qs.parse(value) });

app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
  try { (request as any).rawBody = body; done(null, JSON.parse(body.toString('utf8'))); }
  catch (error) { done(error as Error, undefined); }
});

app.get('/health', async () => ({ status: 'ok', service: 'ltsl-bitrix-waba' }));

app.get('/webhooks/meta', async (request, reply) => {
  const query = request.query as Record<string, string>;
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === config.META_VERIFY_TOKEN) return reply.type('text/plain').send(query['hub.challenge']);
  return reply.code(403).send('Forbidden');
});

app.post('/webhooks/meta', async (request, reply) => {
  const raw = (request as any).rawBody as Buffer;
  if (!verifyMetaSignature(raw, request.headers['x-hub-signature-256'] as string | undefined, config.META_APP_SECRET)) return reply.code(401).send({ error: 'invalid_signature' });
  reply.code(200).send({ received: true });
  for (const message of extractIncomingMessages(request.body)) {
    if (await db.claimEvent(message.id, 'meta')) await bitrix.receive(message);
  }
});

app.post('/webhooks/bitrix', async (request, reply) => {
  const event = String((request.body as any)?.event ?? (request.body as any)?.EVENT ?? '').toUpperCase();
  if (event && event !== 'ONIMCONNECTORMESSAGEADD') return reply.send({ ignored: true });
  const message = parseOperatorMessage(request.body);
  if (!message) return reply.code(400).send({ error: 'invalid_bitrix_payload' });
  if (!(await db.claimEvent(`bitrix:${message.messageId}`, 'bitrix'))) return reply.send({ duplicate: true });
  const metaId = await meta.sendText(message.externalChatId, message.text);
  await db.saveOutbound(metaId, message.messageId, message.chatId, message.externalChatId);
  await bitrix.call('imconnector.send.status.delivery', { CONNECTOR: config.BITRIX_CONNECTOR_ID, LINE: config.BITRIX_LINE_ID, MESSAGES: [{ im: { chat_id: message.chatId, message_id: message.messageId }, message: { id: metaId }, chat: { id: message.externalChatId } }] });
  return reply.send({ success: true, meta_message_id: metaId });
});

app.post('/bitrix/install', async (request, reply) => {
  const body: any = request.body;
  const auth = body?.auth ?? body;
  const memberId = String(auth.member_id ?? auth.MEMBER_ID ?? '');
  const accessToken = String(auth.access_token ?? auth.AUTH_ID ?? '');
  const refreshToken = String(auth.refresh_token ?? auth.REFRESH_ID ?? '');
  const domain = String(auth.domain ?? auth.DOMAIN ?? config.BITRIX_DOMAIN);
  if (!memberId || !accessToken || !refreshToken) return reply.code(400).send({ error: 'missing_oauth_data' });
  await bitrix.install({ memberId, accessToken, refreshToken, domain, expiresAt: new Date(Date.now() + Number(auth.expires_in ?? 3600) * 1000) });
  return reply.type('text/html').send('<!doctype html><meta charset="utf-8"><h2>WhatsApp LTSL instalado</h2><p>Abra o Contact Center e ative o conector na Linha 19.</p>');
});

const renderSettings = async (_request: unknown, reply: any) => reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><style>body{font:16px Arial;padding:28px;color:#17233d}button{background:#25d366;color:white;border:0;border-radius:8px;padding:12px 20px;font-weight:bold}</style><h2>WhatsApp LTSL</h2><p>Vincular este conector ao Canal Aberto ${config.BITRIX_LINE_ID}.</p><form method="post" action="/bitrix/activate"><button type="submit">Ativar conector</button></form>`);
app.get('/bitrix/settings', renderSettings);
app.post('/bitrix/settings', renderSettings);
app.post('/bitrix/activate', async (_request, reply) => { await bitrix.activate(); return reply.type('text/html').send('<!doctype html><meta charset="utf-8"><h2>Conector ativado com sucesso.</h2>'); });

app.setErrorHandler((error, _request, reply) => { app.log.error(error); reply.code(500).send({ error: 'internal_error' }); });

await db.migrate();
await app.listen({ host: '0.0.0.0', port: config.PORT });
