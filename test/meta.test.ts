import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { extractIncomingMessages, extractMessageStatuses, verifyMetaSignature } from '../src/meta.js';

test('valida assinatura SHA-256 da Meta', () => {
  const body = Buffer.from('{"ok":true}');
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body, signature, 'secret'), true);
  assert.equal(verifyMetaSignature(body, signature, 'wrong'), false);
});

test('normaliza mídia, localização e estados do webhook', () => {
  const payload = { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '5541999', profile: { name: 'Cliente' } }],
    messages: [
      { id: 'wamid.img', from: '5541999', timestamp: '10', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'Comprovante' } },
      { id: 'wamid.loc', from: '5541999', timestamp: '11', type: 'location', location: { latitude: -25.4, longitude: -49.2, name: 'Destino' } }
    ],
    statuses: [{ id: 'wamid.out', status: 'delivered', timestamp: '12', recipient_id: '5541999' }]
  } }] }] };
  const messages = extractIncomingMessages(payload);
  assert.equal(messages.length, 2);
  assert.equal(messages[0]!.media?.id, 'media-1');
  assert.match(messages[0]!.text, /Comprovante/);
  assert.match(messages[1]!.text, /maps\.google\.com/);
  assert.deepEqual(extractMessageStatuses(payload), [{ id: 'wamid.out', status: 'delivered', timestamp: '12', recipientId: '5541999', error: undefined }]);
});

test('extrai mensagem de texto do webhook', () => {
  const payload = { entry: [{ changes: [{ value: { contacts: [{ wa_id: '5541999', profile: { name: 'Cliente' } }], messages: [{ id: 'wamid.1', from: '5541999', timestamp: '1786110000', type: 'text', text: { body: 'Olá' } }] } }] }] };
  assert.deepEqual(extractIncomingMessages(payload), [{ id: 'wamid.1', from: '5541999', name: 'Cliente', timestamp: '1786110000', type: 'text', text: 'Olá' }]);
});
