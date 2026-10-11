import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function auditKeys(env = process.env) {
  let keys = JSON.parse(env.TERMINAL_AUDIT_PREVIOUS_KEYS ?? '{}');
  if (!keys || Array.isArray(keys) || typeof keys !== 'object')
    throw new Error('Invalid audit key map');
  if (env.TERMINAL_AUDIT_KEY)
    keys = {
      ...keys,
      [env.TERMINAL_AUDIT_KEY_VERSION ?? '1']: env.TERMINAL_AUDIT_KEY,
    };
  for (const [version, key] of Object.entries(keys)) {
    if (
      !/^[A-Za-z0-9_.-]{1,40}$/.test(version) ||
      typeof key !== 'string' ||
      key.length < 32
    )
      throw new Error('Invalid audit key');
  }
  return keys;
}

export function canonicalEvent(row) {
  return JSON.stringify({
    format: 1,
    sequence: String(row.sequence),
    keyVersion: row.keyVersion,
    id: row.id,
    occurredAt: new Date(row.occurredAt).toISOString(),
    event: row.event,
    result: row.result,
    method: row.method ?? null,
    action: row.action ?? null,
    employeeId: row.employeeId ?? null,
    actorId: row.actorId ?? null,
    terminalId: row.terminalId ?? null,
    deviceId: row.deviceId ?? null,
    terminalName: row.terminalName ?? null,
    locationLabel: row.locationLabel ?? null,
    timeEntryId: row.timeEntryId ?? null,
  });
}

export function verifyAudit(snapshot, keys, anchor) {
  if (snapshot.format !== 1 || !Array.isArray(snapshot.events))
    throw new Error('Invalid audit snapshot');
  let previousHash = '0'.repeat(64);
  let sequence = 0n;
  for (const row of snapshot.events) {
    if (
      !/^[1-9][0-9]*$/.test(String(row.sequence)) ||
      BigInt(row.sequence) !== sequence + 1n
    )
      throw new Error('Audit sequence gap');
    if (
      row.previousHash !== previousHash ||
      row.canonicalPayload !== canonicalEvent(row)
    )
      throw new Error('Audit payload/link mismatch');
    const key = Object.hasOwn(keys, row.keyVersion)
      ? keys[row.keyVersion]
      : undefined;
    if (!key) throw new Error('Missing historical audit key');
    const expected = createHmac('sha256', key)
      .update(`${previousHash}\n${row.canonicalPayload}`)
      .digest();
    if (
      !/^[a-f0-9]{64}$/.test(row.hash) ||
      !timingSafeEqual(expected, Buffer.from(row.hash, 'hex'))
    )
      throw new Error('Audit HMAC mismatch');
    sequence += 1n;
    previousHash = row.hash;
  }
  const head = { sequence: sequence.toString(), hash: previousHash };
  if (JSON.stringify(snapshot.head) !== JSON.stringify(head))
    throw new Error('Audit head mismatch');
  if (anchor) {
    if (
      anchor.format !== 1 ||
      anchor.database !== snapshot.database ||
      !/^[0-9]+$/.test(anchor.head?.sequence ?? '')
    )
      throw new Error('Invalid audit anchor');
    const anchoredSequence = BigInt(anchor.head.sequence);
    const anchoredEvent = snapshot.events.find(
      (event) => String(event.sequence) === anchor.head.sequence,
    );
    const anchoredHash =
      anchoredSequence === 0n ? '0'.repeat(64) : anchoredEvent?.hash;
    if (anchoredSequence > sequence || anchoredHash !== anchor.head.hash)
      throw new Error('Audit differs from external anchor');
  }
  return head;
}

export function snapshotDigest(content) {
  return createHash('sha256').update(content).digest('hex');
}
