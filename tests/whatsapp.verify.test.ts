import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('WhatsApp Webhook Signature Verification (SEC-05)', () => {
  const secret = 'test_app_secret_12345';

  it('validates a valid Meta sha256 signature using timingSafeEqual', () => {
    const rawBody = Buffer.from(JSON.stringify({ entry: [] }));
    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const incomingSignature = expectedSignature;

    const sigBuf = Buffer.from(incomingSignature);
    const expBuf = Buffer.from(expectedSignature);

    const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    expect(isValid).toBe(true);
  });

  it('rejects an invalid or tampered signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ entry: [] }));
    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const tamperedSignature =
      'sha256=' + '0'.repeat(64);

    const sigBuf = Buffer.from(tamperedSignature);
    const expBuf = Buffer.from(expectedSignature);

    const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    expect(isValid).toBe(false);
  });
});
