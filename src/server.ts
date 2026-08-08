import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import qs from 'qs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadConfig } from './config.js';
import { Database } from './db.js';
import { BitrixClient, parseOperatorMessage } from './bitrix.js';
import { extractIncomingMessages, extractMessageStatuses, MetaClient, verifyMetaSignature } from './meta.js';
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
const secretFields = new Set(['META_APP_SECRET','META_VERIFY_TOKEN','META_ACCESS_TOKEN','BITRIX_CLIENT_SECRET']);
const adminCss = `:root{--navy:#071a33;--blue:#0b3970;--cyan:#25b7e8;--green:#18b96b;--ink:#10213a;--muted:#718096;--line:#dce5ef;--bg:#f3f7fb}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px Inter,Segoe UI,Arial,sans-serif}.shell{min-height:100vh;display:grid;grid-template-columns:245px 1fr}.side{background:linear-gradient(180deg,#06172e,#0b2d55);color:#fff;padding:28px 20px;position:sticky;top:0;height:100vh}.brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:800}.wa{width:42px;height:42px;border-radius:13px;background:#20c66b;display:grid;place-items:center;font-size:22px}.side p{color:#a8bdd4;line-height:1.5}.nav{margin-top:32px}.nav a{display:block;color:#c8d8e8;text-decoration:none;padding:12px;border-radius:10px;margin:5px 0}.nav a.active,.nav a:hover{background:#ffffff14;color:#fff}.main{padding:32px;max-width:1400px;width:100%}.hero{background:linear-gradient(120deg,#092d58,#0d4f86);color:#fff;border-radius:20px;padding:26px 30px;display:flex;justify-content:space-between;gap:20px;align-items:center;box-shadow:0 16px 50px #082b5624}.hero h1{margin:0 0 7px;font-size:27px}.hero p{margin:0;color:#c5d9eb}.pill{background:#1bc77822;border:1px solid #46df994d;color:#8df1bd;padding:8px 12px;border-radius:999px;font-weight:700;white-space:nowrap}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:20px 0}.metric,.card{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 28px #1634540a}.metric{padding:19px}.metric b{font-size:27px;display:block;margin-top:7px}.metric span{color:var(--muted)}.card{padding:24px;margin:18px 0}.card h2{margin:0 0 5px;font-size:19px}.subtitle{color:var(--muted);margin:0 0 20px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{display:flex;flex-direction:column;gap:7px}label{font-weight:700;font-size:13px}input{width:100%;padding:12px 13px;border:1px solid #cbd8e6;border-radius:10px;font-size:14px;background:#fbfdff;outline:none}input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px #25b7e81c}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}button{background:var(--blue);color:white;border:0;border-radius:10px;padding:12px 17px;font-weight:750;cursor:pointer}button.secondary{background:#eaf2f9;color:#16466f}button.green{background:var(--green)}.ok{background:#e9f9f0;color:#117341;border:1px solid #c8efd9;padding:12px;border-radius:10px}.muted{color:var(--muted)}.diag{white-space:pre-wrap;background:#071a33;color:#cfe7ff;border-radius:12px;padding:16px;min-height:72px;overflow:auto}.activity{width:100%;border-collapse:collapse}.activity th,.activity td{text-align:left;padding:10px 8px;border-bottom:1px solid #edf1f5}.activity th{color:var(--muted);font-size:12px}.badge{padding:4px 8px;border-radius:999px;background:#edf3f8;font-size:12px}.badge.failed{background:#ffeded;color:#b3261e}@media(max-width:900px){.shell{grid-template-columns:1fr}.side{position:relative;height:auto}.nav{display:none}.main{padding:18px}.metrics,.grid{grid-template-columns:1fr}.hero{align-items:flex-start;flex-direction:column}}`;

const loginCss = `.wrap{max-width:520px;margin:8vh auto;padding:20px}.wrap h1{margin-top:0}`;
app.get('/admin/login', async (_request, reply) => reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${adminCss}${loginCss}</style><div class="wrap"><div class="card"><h1>WABA LTSL</h1><p class="muted">Administração do conector</p><form method="post"><div class="field"><label>Senha administrativa</label><input name="password" type="password" required autofocus></div><br><button>Entrar</button></form></div></div>`));
app.post('/admin/login', async (request, reply) => {
  const password = String((request.body as any)?.password ?? '');
  const valid = password.length === config.ADMIN_PASSWORD.length && timingSafeEqual(Buffer.from(password), Buffer.from(config.ADMIN_PASSWORD));
  if (!valid) return reply.code(401).type('text/html').send('Senha inválida.');
  return reply.header('Set-Cookie', `waba_admin=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`).redirect('/admin');
});

app.get('/admin', async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  const values = await settings.all();
  const stats = await db.dashboard();
  const field = (key: keyof typeof values, label: string, type='text') => `<div class="field"><label>${label}</label><input name="${key}" type="${type}" value="${secretFields.has(key) ? '' : escapeHtml(values[key])}" placeholder="${secretFields.has(key) && values[key] ? 'Configurado — deixe vazio para manter' : ''}"></div>`;
  const recent = stats.recent.length ? stats.recent.map(row => `<tr><td>${escapeHtml(new Date(row.created_at).toLocaleString('pt-BR'))}</td><td>${row.direction === 'in' ? 'Entrada' : row.direction === 'out' ? 'Saída' : 'Sistema'}</td><td>${escapeHtml(row.event_type)}</td><td>${escapeHtml(row.contact_id ?? '—')}</td><td><span class="badge ${row.status === 'failed' ? 'failed' : ''}">${escapeHtml(row.status)}</span></td></tr>`).join('') : '<tr><td colspan="5" class="muted">Aguardando os primeiros eventos.</td></tr>';
  return reply.type('text/html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>WABA LTSL</title><style>${adminCss}</style></head><body><div class="shell"><aside class="side"><div class="brand"><span class="wa">◉</span>WABA LTSL</div><p>Central profissional do conector WhatsApp Cloud API com Bitrix24.</p><nav class="nav"><a class="active" href="#overview">Visão geral</a><a href="#meta">Meta Cloud API</a><a href="#bitrix">Bitrix24</a><a href="#diagnostics">Diagnóstico</a><a href="#activity">Atividade</a></nav></aside><main class="main"><section class="hero" id="overview"><div><h1>Central do conector</h1><p>Mensagens, credenciais e saúde operacional em um único lugar.</p></div><span class="pill">● Aplicação online</span></section><section class="metrics"><div class="metric"><span>Recebidas · 24h</span><b>${stats.inbound24h}</b></div><div class="metric"><span>Enviadas · 24h</span><b>${stats.outbound24h}</b></div><div class="metric"><span>Falhas · 24h</span><b>${stats.failed24h}</b></div></section>${(request.query as any)?.saved ? '<p class="ok">Configurações salvas com sucesso.</p>' : ''}<form method="post" action="/admin/settings"><section class="card" id="meta"><h2>Meta Cloud API</h2><p class="subtitle">Identidade do número, webhook e credenciais criptografadas.</p><div class="grid">${field('META_GRAPH_VERSION','Versão Graph API')}${field('META_WABA_ID','WABA ID')}${field('META_PHONE_NUMBER_ID','Phone Number ID')}${field('META_VERIFY_TOKEN','Verify Token','password')}${field('META_APP_SECRET','App Secret','password')}${field('META_ACCESS_TOKEN','Access Token permanente','password')}</div></section><section class="card" id="bitrix"><h2>Bitrix24</h2><p class="subtitle">Aplicativo OAuth e Canal Aberto responsável pelos atendimentos.</p><div class="grid">${field('BITRIX_DOMAIN','Domínio do portal')}${field('BITRIX_CLIENT_ID','Client ID')}${field('BITRIX_CLIENT_SECRET','Client Secret','password')}${field('BITRIX_LINE_ID','Canal Aberto')}${field('BITRIX_CONNECTOR_ID','Identificador do conector')}${field('BITRIX_CONNECTOR_NAME','Nome do conector')}</div><div class="actions"><button class="green">Salvar configurações</button></div></section></form><section class="card" id="diagnostics"><h2>Diagnóstico integrado</h2><p class="subtitle">Valida token, número, qualidade, templates e ativação do Canal Aberto.</p><div class="actions"><button type="button" onclick="diagnose()">Executar diagnóstico</button><button type="button" class="secondary" onclick="syncConnector()">Sincronizar conector</button></div><pre class="diag" id="diag">Nenhum diagnóstico executado nesta sessão.</pre></section><section class="card" id="activity"><h2>Atividade recente</h2><p class="subtitle">Últimos eventos processados pelo conector.</p><div style="overflow:auto"><table class="activity"><thead><tr><th>Data</th><th>Fluxo</th><th>Evento</th><th>Contato</th><th>Status</th></tr></thead><tbody>${recent}</tbody></table></div></section></main></div><script>async function action(url){const el=document.getElementById('diag');el.textContent='Processando...';try{const r=await fetch(url,{method:'POST'});const data=await r.json();el.textContent=JSON.stringify(data,null,2)}catch(e){el.textContent='Falha: '+e.message}}function diagnose(){action('/admin/api/diagnostics')}function syncConnector(){action('/admin/api/sync')}</script></body></html>`);
});

app.post('/admin/api/diagnostics', async (request, reply) => {
  if (!authenticated(request)) return reply.code(401).send({ error: 'unauthorized' });
  const [metaResult, bitrixResult] = await Promise.allSettled([meta.accountOverview(), bitrix.status()]);
  return reply.send({
    meta: metaResult.status === 'fulfilled' ? { ok: true, phone: metaResult.value.phone, templates: metaResult.value.templates } : { ok: false, error: metaResult.reason?.message },
    bitrix: bitrixResult.status === 'fulfilled' ? { ok: true, status: bitrixResult.value } : { ok: false, error: bitrixResult.reason?.message },
    endpoints: { metaWebhook: `${config.PUBLIC_URL}/webhooks/meta`, bitrixWebhook: `${config.PUBLIC_URL}/webhooks/bitrix` }
  });
});

app.post('/admin/api/sync', async (request, reply) => {
  if (!authenticated(request)) return reply.code(401).send({ error: 'unauthorized' });
  await bitrix.configureLine();
  const status = await bitrix.status();
  await db.logActivity('system', 'connector_sync', undefined, undefined, 'ok', JSON.stringify(status));
  return reply.send({ ok: true, status });
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
  for (const status of extractMessageStatuses(request.body)) {
    const eventId = `status:${status.id}:${status.status}:${status.timestamp}`;
    if (!(await db.claimEvent(eventId, 'meta'))) continue;
    const outbound = await db.getOutbound(status.id);
    await db.updateOutboundStatus(status.id, status.status);
    await db.logActivity('out', `meta_${status.status}`, status.id, status.recipientId, status.status === 'failed' ? 'failed' : 'ok', status.error);
    if (outbound && ['delivered','read'].includes(status.status) && !['delivered','read'].includes(outbound.status)) {
      await bitrix.markDelivered({ ...outbound, timestamp: status.timestamp });
    }
  }
  for (const message of extractIncomingMessages(request.body)) {
    if (!(await db.claimEvent(message.id, 'meta'))) continue;
    if (message.media) {
      const expires = Math.floor(Date.now() / 1000) + 6 * 24 * 3600;
      const sig = createHmac('sha256', config.CREDENTIALS_ENCRYPTION_KEY).update(`${message.media.id}:${expires}`).digest('hex');
      message.text += `\n${config.PUBLIC_URL}/media/${encodeURIComponent(message.media.id)}?expires=${expires}&sig=${sig}`;
    }
    await bitrix.receive(message);
    await db.logActivity('in', message.type, message.id, message.from, 'ok', message.text.slice(0, 180));
  }
});

app.get('/media/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { expires, sig } = request.query as { expires?: string; sig?: string };
  const expected = createHmac('sha256', config.CREDENTIALS_ENCRYPTION_KEY).update(`${id}:${expires}`).digest('hex');
  if (!expires || Number(expires) < Math.floor(Date.now() / 1000) || !sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return reply.code(403).send('Link expirado ou inválido.');
  const mediaFile = await meta.downloadMedia(id);
  return reply.header('Content-Type', mediaFile.contentType).header('Cache-Control', 'private, max-age=300').send(mediaFile.body);
});

app.post('/webhooks/bitrix', async (request, reply) => {
  const event = String((request.body as any)?.event ?? (request.body as any)?.EVENT ?? '').toUpperCase();
  if (event && event !== 'ONIMCONNECTORMESSAGEADD') return reply.send({ ignored: true });
  const message = parseOperatorMessage(request.body);
  if (!message) return reply.code(400).send({ error: 'invalid_bitrix_payload' });
  if (!(await db.claimEvent(`bitrix:${message.messageId}`, 'bitrix'))) return reply.send({ duplicate: true });
  try {
    const metaId = await meta.sendText(message.externalChatId, message.text);
    await db.saveOutbound(metaId, message.messageId, message.chatId, message.externalChatId);
    await db.logActivity('out', 'text', metaId, message.externalChatId, 'accepted', message.text.slice(0, 180));
    return reply.send({ success: true, meta_message_id: metaId, status: 'accepted' });
  } catch (error) {
    await db.logActivity('out', 'text', undefined, message.externalChatId, 'failed', error instanceof Error ? error.message : String(error));
    throw error;
  }
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
app.post('/bitrix/settings', async (request, reply) => {
  const body = request.body as Record<string, any>;
  const rawOptions = body?.PLACEMENT_OPTIONS ?? body?.placement_options;
  if (!rawOptions) return renderSettings(request, reply);
  let options: Record<string, any>;
  try { options = typeof rawOptions === 'string' ? JSON.parse(rawOptions) : rawOptions; }
  catch { return reply.code(400).type('text/html').send('<!doctype html><meta charset="utf-8"><h2>Configuração inválida</h2><p>O Bitrix não enviou PLACEMENT_OPTIONS em formato válido.</p>'); }
  const line = Number(options.LINE ?? options.line);
  const activeRaw = options.ACTIVE_STATUS ?? options.active_status ?? 1;
  const active = !['0', 'N', 'false', ''].includes(String(activeRaw));
  if (!Number.isInteger(line) || line <= 0) return reply.code(400).type('text/html').send('<!doctype html><meta charset="utf-8"><h2>Canal Aberto inválido</h2>');
  await settings.set('BITRIX_LINE_ID', String(line));
  await bitrix.configureLine(line, active ? 1 : 0);
  return reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><style>body{font:16px Arial;padding:28px;color:#17233d}.ok{background:#e6f7ed;color:#15733d;padding:12px;border-radius:8px;display:inline-block}</style><h2>WhatsApp LTSL</h2><p class="ok">Conector ${active ? 'ativado' : 'desativado'} no Canal Aberto ${line}.</p>`);
});
app.post('/bitrix/activate', async (_request, reply) => { await bitrix.activate(); return reply.type('text/html').send('<!doctype html><meta charset="utf-8"><h2>Conector ativado com sucesso.</h2>'); });

app.setErrorHandler((error, _request, reply) => { app.log.error(error); reply.code(500).send({ error: 'internal_error' }); });

await db.migrate();
await app.listen({ host: '0.0.0.0', port: config.PORT });
