import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOperatorMessage } from '../src/bitrix.js';

test('normaliza resposta do operador Bitrix', () => {
  assert.deepEqual(parseOperatorMessage({ data: { MESSAGES: [{ message: { text: 'Resposta' }, chat: { id: '5541999' }, im: { message_id: 55, chat_id: 77 } }] } }), { text: 'Resposta', externalChatId: '5541999', messageId: 55, chatId: 77 });
});
