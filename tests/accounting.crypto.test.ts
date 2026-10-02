import { describe, it, expect } from 'vitest';
import {
  encryptCredentials,
  decryptCredentials,
  maskSensitive,
} from '../src/integrations/accounting/crypto';

describe('accounting crypto', () => {
  it('cifra y descifra correctamente un objeto de credenciales de Alegra', () => {
    const creds = { email: 'admin@pyme.com', token: 'alegra_sec_token_98765' };
    const encrypted = encryptCredentials(creds);

    expect(encrypted).not.toContain('admin@pyme.com');
    expect(encrypted).not.toContain('alegra_sec_token_98765');
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = decryptCredentials<typeof creds>(encrypted);
    expect(decrypted).toEqual(creds);
  });

  it('falla si el string cifrado fue manipulado', () => {
    const creds = { token: 'supersecret' };
    const encrypted = encryptCredentials(creds);
    const tampered = encrypted.slice(0, -4) + '0000';

    expect(() => decryptCredentials(tampered)).toThrow();
  });

  it('enmascara correos y tokens adecuadamente', () => {
    expect(maskSensitive('contacto@empresa.com')).toBe('co***o@empresa.com');
    expect(maskSensitive('a@b.com')).toBe('a***@b.com');
    expect(maskSensitive('1234567890abcdef')).toBe('123••••••••def');
    expect(maskSensitive('123')).toBe('••••••');
  });
});
