# LTSL Bitrix WABA

Conector oficial entre a **Meta WhatsApp Cloud API** e os **Canais Abertos do Bitrix24**. A aplicação recebe mensagens do WhatsApp, entrega ao Canal Aberto configurado e envia ao WhatsApp as respostas dos atendentes.

## Arquitetura

- Node.js 22 + TypeScript + Fastify
- MySQL 8 para OAuth, idempotência e correlação de mensagens
- Docker/Coolify
- OAuth do aplicativo local Bitrix24
- validação `X-Hub-Signature-256` da Meta
- renovação automática do token OAuth do Bitrix

## URLs públicas

Considerando `PUBLIC_URL=https://waba.ltsl.com.br`:

| Uso | URL |
|---|---|
| Healthcheck | `https://waba.ltsl.com.br/health` |
| Instalação do aplicativo Bitrix | `https://waba.ltsl.com.br/bitrix/install` |
| Manipulador principal do aplicativo | `https://waba.ltsl.com.br/bitrix/settings` |
| Evento interno `ONIMCONNECTORMESSAGEADD` | `https://waba.ltsl.com.br/webhooks/bitrix` |
| Webhook da Meta | `https://waba.ltsl.com.br/webhooks/meta` |

## Aplicativo local Bitrix24

Crie um aplicativo local do tipo **Servidor** e configure:

- URL inicial/instalação: `PUBLIC_URL/bitrix/install`
- URL do manipulador: `PUBLIC_URL/bitrix/settings`
- escopos: `imopenlines`, `imconnector`, `im`

Depois do primeiro acesso, a instalação registra o conector `ltsl_waba` e vincula o evento `ONIMCONNECTORMESSAGEADD`. Abra o Contact Center, selecione o conector **WhatsApp LTSL** e ative-o para a Linha `19`.

> Os métodos `imconnector.*` exigem OAuth de aplicativo Bitrix. Um webhook de entrada comum do Bitrix não substitui o aplicativo local.

## Meta WhatsApp Cloud API

No painel do aplicativo Meta, configure o produto WhatsApp:

- Callback URL: `PUBLIC_URL/webhooks/meta`
- Verify token: o mesmo valor de `META_VERIFY_TOKEN`
- assine o campo `messages`
- use um token permanente de usuário do sistema em `META_ACCESS_TOKEN`

Nunca grave tokens no repositório. Configure-os somente como variáveis secretas no Coolify.

## Variáveis do Coolify

Somente a infraestrutura e o acesso inicial ficam no Coolify:

```env
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://waba.ltsl.com.br
DATABASE_URL=mysql://waba:SENHA@mysql:3306/waba
ADMIN_PASSWORD=uma_senha_forte_com_12_ou_mais_caracteres
CREDENTIALS_ENCRYPTION_KEY=uma_chave_aleatoria_com_32_ou_mais_caracteres
```

Após o deploy, acesse `PUBLIC_URL/admin`. As credenciais da Meta e do Bitrix são gerenciadas nessa interface e armazenadas criptografadas no MySQL.

## Deploy no Coolify

1. Crie um recurso Docker Compose apontando para este repositório e branch `main`.
2. Cadastre as variáveis do `.env.example` como secrets.
3. Aponte o domínio HTTPS para a porta `3000` do serviço `app`.
4. Faça o deploy e confirme `GET /health`.
5. Instale o aplicativo local no Bitrix.
6. Ative o conector na Linha 19.
7. Configure e valide o webhook no painel da Meta.

## Desenvolvimento

```bash
npm install
npm run build
npm test
npm run dev
```

## Escopo da versão 1

- mensagens de texto, botões e respostas de listas na entrada;
- mensagens de texto na saída;
- criação automática da conversa no Canal Aberto;
- confirmação de entrega ao Bitrix após aceite da Meta;
- bloqueio de eventos duplicados;
- armazenamento e renovação do OAuth Bitrix.

Mídias, templates, reações e sincronização posterior dos estados `sent`, `delivered`, `read` e `failed` da Meta ficam preparados para a próxima etapa.
