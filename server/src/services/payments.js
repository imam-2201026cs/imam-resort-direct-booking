import { randomBytes } from 'node:crypto';

/**
 * Mock payment gateway (test mode). The server never receives card numbers:
 * the client only chooses a test scenario, mirroring how hosted gateways return a token.
 */
export function chargeTest({ method, testCase }) {
  if (testCase === 'decline') {
    return { ok: false, message: 'The test card was declined. Try another payment method.' };
  }
  return { ok: true, txnId: `TEST-${method.toUpperCase()}-${randomBytes(5).toString('hex').toUpperCase()}` };
}
