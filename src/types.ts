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
}

export interface BitrixOperatorMessage {
  messageId: number;
  chatId: number;
  externalChatId: string;
  text: string;
}
