import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { extractIncomingMessages, verifyMetaSignature } from '../src/meta.js';

test('valida assinatura SHA-256 da Meta', () => {
  const body = Buffer.from('{"ok":true}');
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body, signature, 'secret'), true);
  assert.equal(verifyMetaSignature(body, signature, 'wrong'), false);
});

test('extrai mensagem de texto do webhook', () => {
  const payload = { entry: [{ changes: [{ value: { contacts: [{ wa_id: '5541999', profile: { name: 'Cliente' } }], messages: [{ id: 'wamid.1', from: '5541999', timestamp: '1786110000', type: 'text', text: { body: 'Olá' } }] } }] }] };
  assert.deepEqual(extractIncomingMessages(payload), [{ id: 'wamid.1', from: '5541999', name: 'Cliente', timestamp: '1786110000', type: 'text', text: 'Olá' }]);
});
