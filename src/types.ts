export interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  domain: string;
  memberId: string;
}

export interface IncomingMessage {
  id: string;
  from: string;
  name: string;
  timestamp: string;
  type: string;
  text: string;
  media?: {
    id: string;
    mimeType?: string;
    filename?: string;
  };
  replyTo?: string;
}

export interface MetaMessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted' | string;
  timestamp: string;
  recipientId?: string;
  error?: string;
}

export interface OutboundMessage {
  metaMessageId: string;
  bitrixMessageId: number;
  bitrixChatId: number;
  externalChatId: string;
  status: string;
}

export interface BitrixOperatorMessage {
  messageId: number;
  chatId: number;
  externalChatId: string;
  text: string;
}
