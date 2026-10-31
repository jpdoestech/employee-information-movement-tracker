import { expect, it, vi } from 'vitest';
vi.mock('../../src/api', () => ({ query: vi.fn() }));
import { clientIdError, normalizeClientId } from '../../src/clientIdentity';
it('normalizes manual IDs without losing leading zeroes', () => {
 expect(normalizeClientId(' ab-00023 ')).toBe('AB-00023');
 expect(normalizeClientId(' 00023 ')).toBe('00023');
 expect(clientIdError(' a_1/2.3-4 ')).toBeUndefined();
});
it('rejects empty, invalid and oversized identifiers', () => {
 for (const value of ['', ' ', '-ABC', 'AB C', 'A\nB', 'é123', 'A'.repeat(65)]) expect(clientIdError(value)).toBeTruthy();
 expect(clientIdError('A'.repeat(64))).toBeUndefined();
});
