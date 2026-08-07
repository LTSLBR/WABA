# LTSL Bitrix WABA

Conector oficial entre a **Meta WhatsApp Cloud API** e os **Canais Abertos do Bitrix24**. A aplicação recebe mensagens do WhatsApp, entrega ao Canal Aberto configurado e envia ao WhatsApp as respostas dos atendentes.

## Endpoints

- Instalação Bitrix: `https://waba.ltsl.com.br/bitrix/install`
- Manipulador Bitrix: `https://waba.ltsl.com.br/webhooks/bitrix`
- Configuração: `https://waba.ltsl.com.br/bitrix/settings`
- Webhook Meta: `https://waba.ltsl.com.br/webhooks/meta`
- Healthcheck: `https://waba.ltsl.com.br/health`

## Arquitetura

- Node.js 22 + TypeScript + Fastify
- MySQL 8 para OAuth, idempotência e correlação de mensagens
- Docker/Coolify
- OAuth do aplicativo local Bitrix24
- validação `X-Hub-Signature-256` da Meta
- renovação automática do token OAuth do Bitrix

## Aplicativo local Bitrix24

Crie um aplicativo local do tipo **Servidor** com:

- URL inicial/instalação: `PUBLIC_URL/bitrix/install`
- URL do manipulador: `PUBLIC_URL/webhooks/bitrix`
- escopos: `imopenlines`, `imconnector`, `im`

A instalação registra o conector `ltsl_waba` e vincula o evento `ONIMCONNECTORMESSAGEADD`. Abra o Contact Center, selecione **WhatsApp LTSL** e ative para a Linha `19`.

> Os métodos `imconnector.*` exigem OAuth de aplicativo Bitrix. Um webhook comum não substitui o aplicativo local.

## Meta WhatsApp Cloud API

- Callback URL: `PUBLIC_URL/webhooks/meta`
- Verify token: mesmo valor de `META_VERIFY_TOKEN`
- assine o campo `messages`
- use token permanente de usuário do sistema em `META_ACCESS_TOKEN`

Nunca grave tokens no repositório. Configure-os somente como secrets no Coolify.

## Deploy no Coolify

1. Crie um recurso Docker Compose para este repositório, branch `main`.
2. Cadastre as variáveis de `.env.example`.
3. Aponte o domínio HTTPS à porta `3000` do serviço `app`.
4. Confirme `GET /health`.
5. Instale o aplicativo local no Bitrix.
6. Ative o conector na Linha 19.
7. Valide o webhook no painel da Meta.

## Desenvolvimento

```bash
npm install
npm run build
npm test
npm run dev
```

## Escopo da versão 1

- texto, botões e respostas de listas na entrada;
- texto na saída;
- criação automática da conversa no Canal Aberto;
- confirmação de entrega após aceite da Meta;
- bloqueio de eventos duplicados;
- armazenamento e renovação do OAuth Bitrix.

Mídias, templates, reações e estados avançados ficam para a próxima etapa.
