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
| Configuração do conector Bitrix | `https://waba.ltsl.com.br/bitrix/settings` |
| Evento do Bitrix | `https://waba.ltsl.com.br/webhooks/bitrix` |
| Webhook da Meta | `https://waba.ltsl.com.br/webhooks/meta` |

## Aplicativo local Bitrix24

Crie um aplicativo local do tipo **Servidor** e configure:

- URL inicial/instalação: `PUBLIC_URL/bitrix/install`
- URL do manipulador: `PUBLIC_URL/webhooks/bitrix`
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

Copie todas as chaves de `.env.example`. Valores principais:

```env
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://waba.ltsl.com.br
DATABASE_URL=mysql://waba:SENHA@mysql:3306/waba

META_GRAPH_VERSION=v23.0
META_APP_SECRET=
META_VERIFY_TOKEN=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_WABA_ID=

BITRIX_CLIENT_ID=
BITRIX_CLIENT_SECRET=
BITRIX_MEMBER_ID=
BITRIX_DOMAIN=seuportal.bitrix24.com.br
BITRIX_LINE_ID=19
BITRIX_CONNECTOR_ID=ltsl_waba
BITRIX_CONNECTOR_NAME=WhatsApp LTSL
```

`BITRIX_MEMBER_ID` pode ficar vazio na primeira instalação. Depois, ele pode ser preenchido com o `member_id` recebido pelo aplicativo.

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
