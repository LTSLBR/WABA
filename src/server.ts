import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import qs from 'qs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadConfig } from './config.js';
import { Database } from './db.js';
import { BitrixClient, parseOperatorMessage } from './bitrix.js';
import { extractIncomingMessages, MetaClient, verifyMetaSignature } from './meta.js';
import { settingKeys, SettingsStore } from './settings.js';

const config = loadConfig();
const db = new Database(config.DATABASE_URL);
const settings = new SettingsStore(db, config);
const meta = new MetaClient(config, settings);
const bitrix = new BitrixClient(config, db, settings);
const app = Fastify({ logger: { redact: ['req.headers.authorization', 'body.auth', 'body.AUTH_ID', 'body.REFRESH_ID'] } });
await app.register(formbody, { parser: value => qs.parse(value) });

app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
  try { (request as any).rawBody = body; done(null, JSON.parse(body.toString('utf8'))); }
  catch (error) { done(error as Error, undefined); }
});

app.get('/health', async () => ({ status: 'ok', service: 'ltsl-bitrix-waba' }));

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]!);
const sessionToken = () => createHmac('sha256', config.CREDENTIALS_ENCRYPTION_KEY).update(`admin:${config.ADMIN_PASSWORD}`).digest('hex');
const authenticated = (request: any) => {
  const token = String(request.headers.cookie ?? '').split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith('waba_admin='))?.slice(11) ?? '';
  const expected = sessionToken();
  return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
};
const requireAdmin = (request: any, reply: any) => authenticated(request) ? true : (reply.redirect('/admin/login'), false);
const secretFields = new Set(['META_APP_SECRET','META_ACCESS_TOKEN','BITRIX_CLIENT_SECRET']);
const adminCss = `body{margin:0;background:#f3f6fa;color:#17233d;font:15px Arial,sans-serif}.wrap{max-width:1000px;margin:36px auto;padding:0 20px}.card{background:white;border:1px solid #dce4ee;border-radius:14px;padding:26px;box-shadow:0 8px 30px #17233d0d}h1{margin:0 0 8px}h2{margin-top:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{display:flex;flex-direction:column;gap:6px}label{font-weight:700}input{padding:12px;border:1px solid #becadc;border-radius:8px;font-size:14px}button{background:#173d6b;color:white;border:0;border-radius:8px;padding:12px 18px;font-weight:bold;cursor:pointer}.ok{background:#e6f7ed;color:#15733d;padding:12px;border-radius:8px}.muted{color:#65758b}@media(max-width:700px){.grid{grid-template-columns:1fr}}`;

app.get('/admin/login', async (_request, reply) => reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${adminCss}</style><div class="wrap"><div class="card"><h1>WABA LTSL</h1><p class="muted">Administração do conector</p><form method="post"><div class="field"><label>Senha administrativa</label><input name="password" type="password" required autofocus></div><br><button>Entrar</button></form></div></div>`));
app.post('/admin/login', async (request, reply) => {
  const password = String((request.body as any)?.password ?? '');
  const valid = password.length === config.ADMIN_PASSWORD.length && timingSafeEqual(Buffer.from(password), Buffer.from(config.ADMIN_PASSWORD));
  if (!valid) return reply.code(401).type('text/html').send('Senha inválida.');
  return reply.header('Set-Cookie', `waba_admin=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`).redirect('/admin');
});

app.get('/admin', async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  const values = await settings.all();
  const field = (key: keyof typeof values, label: string, type='text') => `<div class="field"><label>${label}</label><input name="${key}" type="${type}" value="${secretFields.has(key) ? '' : escapeHtml(values[key])}" placeholder="${secretFields.has(key) && values[key] ? 'Configurado — deixe vazio para manter' : ''}"></div>`;
  return reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>WABA LTSL</title><style>${adminCss}</style><div class="wrap"><div class="card"><h1>WABA LTSL</h1><p class="muted">Credenciais criptografadas e configuração do conector.</p>${(request.query as any)?.saved ? '<p class="ok">Configurações salvas com sucesso.</p>' : ''}<form method="post" action="/admin/settings"><h2>Meta Cloud API</h2><div class="grid">${field('META_GRAPH_VERSION','Versão Graph API')}${field('META_WABA_ID','WABA ID')}${field('META_PHONE_NUMBER_ID','Phone Number ID')}${field('META_VERIFY_TOKEN','Verify Token','password')}${field('META_APP_SECRET','App Secret','password')}${field('META_ACCESS_TOKEN','Access Token permanente','password')}</div><h2>Bitrix24</h2><div class="grid">${field('BITRIX_DOMAIN','Domínio do portal')}${field('BITRIX_CLIENT_ID','Client ID')}${field('BITRIX_CLIENT_SECRET','Client Secret','password')}${field('BITRIX_LINE_ID','Canal Aberto')}${field('BITRIX_CONNECTOR_ID','Identificador do conector')}${field('BITRIX_CONNECTOR_NAME','Nome do conector')}</div><br><button>Salvar configurações</button></form></div></div>`);
});

app.post('/admin/settings', async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  const body = request.body as Record<string,string>;
  for (const key of settingKeys) { const value = String(body[key] ?? '').trim(); if (value) await settings.set(key, value); }
  return reply.redirect('/admin?saved=1');
});

app.get('/webhooks/meta', async (request, reply) => {
  const query = request.query as Record<string, string>;
  const verifyToken = await settings.get('META_VERIFY_TOKEN');
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken) return reply.type('text/plain').send(query['hub.challenge']);
  return reply.code(403).send('Forbidden');
});

app.post('/webhooks/meta', async (request, reply) => {
  const raw = (request as any).rawBody as Buffer;
  const appSecret = await settings.get('META_APP_SECRET');
  if (!verifyMetaSignature(raw, request.headers['x-hub-signature-256'] as string | undefined, appSecret)) return reply.code(401).send({ error: 'invalid_signature' });
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
  const values = await settings.all();
  await bitrix.call('imconnector.send.status.delivery', { CONNECTOR: values.BITRIX_CONNECTOR_ID, LINE: Number(values.BITRIX_LINE_ID), MESSAGES: [{ im: { chat_id: message.chatId, message_id: message.messageId }, message: { id: metaId }, chat: { id: message.externalChatId } }] });
  return reply.send({ success: true, meta_message_id: metaId });
});

app.post('/bitrix/install', async (request, reply) => {
  const body: any = request.body;
  const auth = body?.auth ?? body;
  const memberId = String(auth.member_id ?? auth.MEMBER_ID ?? '');
  const accessToken = String(auth.access_token ?? auth.AUTH_ID ?? '');
  const refreshToken = String(auth.refresh_token ?? auth.REFRESH_ID ?? '');
  const domain = String(auth.client_endpoint ?? auth.CLIENT_ENDPOINT ?? auth.domain ?? auth.DOMAIN ?? await settings.get('BITRIX_DOMAIN'));
  if (!memberId || !accessToken || !refreshToken) return reply.code(400).send({ error: 'missing_oauth_data' });
  await bitrix.install({ memberId, accessToken, refreshToken, domain, expiresAt: new Date(Date.now() + Number(auth.expires_in ?? 3600) * 1000) });
  const lineId = await settings.get('BITRIX_LINE_ID');
  return reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><style>body{font:16px Arial;padding:28px;color:#17233d}h2{margin-bottom:8px}.ok{display:inline-block;background:#e6f7ed;color:#15733d;padding:8px 12px;border-radius:8px;font-weight:bold}</style><h2>WhatsApp LTSL instalado</h2><p class="ok">Instalação concluída com sucesso</p><p>Abra o Contact Center e ative o conector no Canal Aberto ${escapeHtml(lineId)}.</p>`);
});

const renderSettings = async (_request: unknown, reply: any) => reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><style>body{font:16px Arial;padding:28px;color:#17233d}button{background:#25d366;color:white;border:0;border-radius:8px;padding:12px 20px;font-weight:bold}</style><h2>WhatsApp LTSL</h2><p>Abra o painel administrativo para configurar as credenciais e o Canal Aberto.</p><a href="/admin" target="_top">Abrir painel administrativo</a>`);
app.get('/bitrix/settings', renderSettings);
app.post('/bitrix/settings', renderSettings);
app.post('/bitrix/activate', async (_request, reply) => { await bitrix.activate(); return reply.type('text/html').send('<!doctype html><meta charset="utf-8"><h2>Conector ativado com sucesso.</h2>'); });

app.setErrorHandler((error, _request, reply) => { app.log.error(error); reply.code(500).send({ error: 'internal_error' }); });

await db.migrate();
await app.listen({ host: '0.0.0.0', port: config.PORT });
