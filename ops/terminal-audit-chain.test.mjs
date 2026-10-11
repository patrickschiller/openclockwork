import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  auditKeys,
  canonicalEvent,
  verifyAudit,
} from './terminal-audit-chain.mjs';

const key = 'synthetic-test-audit-key-independent-000001';
function snapshot() {
  const row = {
    sequence: '1',
    keyVersion: '1',
    id: 'synthetic-event',
    occurredAt: '2026-09-30T10:00:00.000Z',
    event: 'Booking',
    result: 'SUCCESS',
    method: 'PIN',
  };
  row.previousHash = '0'.repeat(64);
  row.canonicalPayload = canonicalEvent(row);
  row.hash = createHmac('sha256', key)
    .update(`${row.previousHash}\n${row.canonicalPayload}`)
    .digest('hex');
  return {
    format: 1,
    database: 'openclockwork_test',
    head: { sequence: '1', hash: row.hash },
    events: [row],
  };
}
test('valid chain and independently retained head match', () => {
  const data = snapshot();
  assert.deepEqual(
    verifyAudit(
      data,
      { 1: key },
      { format: 1, database: data.database, head: data.head },
    ),
    data.head,
  );
});
test('changed DB fields, canonical content, HMAC and sequence gaps are detected', () => {
  for (const mutate of [
    (data) => (data.events[0].result = 'FAILED'),
    (data) => (data.events[0].canonicalPayload += ' '),
    (data) => (data.events[0].hash = 'f'.repeat(64)),
    (data) => (data.events[0].previousHash = 'f'.repeat(64)),
    (data) => (data.events[0].sequence = '2'),
  ]) {
    const data = snapshot();
    mutate(data);
    assert.throws(() => verifyAudit(data, { 1: key }));
  }
});
test('truncated chain cannot match an external anchor even with recomputed local head', () => {
  const original = snapshot();
  const empty = {
    ...original,
    events: [],
    head: { sequence: '0', hash: '0'.repeat(64) },
  };
  assert.throws(
    () =>
      verifyAudit(
        empty,
        { 1: key },
        { format: 1, database: original.database, head: original.head },
      ),
    /external anchor/,
  );
});
test('historical keys are needed after rotation and wrong keys fail', () => {
  assert.throws(() => verifyAudit(snapshot(), {}), /historical/);
  assert.throws(() => verifyAudit(snapshot(), { 1: key + 'x' }), /HMAC/);
  assert.deepEqual(
    auditKeys({
      TERMINAL_AUDIT_KEY: key,
      TERMINAL_AUDIT_KEY_VERSION: '2',
      TERMINAL_AUDIT_PREVIOUS_KEYS: JSON.stringify({ 1: key }),
    }),
    { 1: key, 2: key },
  );
  assert.throws(() => auditKeys({ TERMINAL_AUDIT_KEY: 'short' }));
});
test('a later key version extends the chain while retaining the previous external anchor', () => {
  const data = snapshot();
  const anchor = { format: 1, database: data.database, head: { ...data.head } };
  const rotatedKey = key + '-rotated';
  const row = {
    ...data.events[0],
    sequence: '2',
    keyVersion: '2',
    id: 'second-event',
    previousHash: data.head.hash,
  };
  row.canonicalPayload = canonicalEvent(row);
  row.hash = createHmac('sha256', rotatedKey)
    .update(`${row.previousHash}\n${row.canonicalPayload}`)
    .digest('hex');
  data.events.push(row);
  data.head = { sequence: '2', hash: row.hash };
  assert.deepEqual(
    verifyAudit(data, { 1: key, 2: rotatedKey }, anchor),
    data.head,
  );
  assert.throws(
    () => verifyAudit(data, { 2: rotatedKey }, anchor),
    /historical/,
  );
});
test('rewriting a chain with a compromised key still conflicts with the external anchor', () => {
  const data = snapshot();
  const anchor = { format: 1, database: data.database, head: { ...data.head } };
  const row = data.events[0];
  row.result = 'REWRITTEN';
  row.canonicalPayload = canonicalEvent(row);
  row.hash = createHmac('sha256', key)
    .update(`${row.previousHash}\n${row.canonicalPayload}`)
    .digest('hex');
  data.head.hash = row.hash;
  assert.deepEqual(verifyAudit(data, { 1: key }), data.head);
  assert.throws(() => verifyAudit(data, { 1: key }, anchor), /external anchor/);
});
test('inherited object properties are never accepted as historical key versions', () => {
  const data = snapshot();
  data.events[0].keyVersion = 'constructor';
  data.events[0].canonicalPayload = canonicalEvent(data.events[0]);
  assert.throws(() => verifyAudit(data, {}), /historical/);
  const keys = auditKeys({
    TERMINAL_AUDIT_KEY: key,
    TERMINAL_AUDIT_KEY_VERSION: '__proto__',
  });
  assert.equal(Object.hasOwn(keys, '__proto__'), true);
  assert.equal(keys.__proto__, key);
});
