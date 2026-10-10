import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateCertContents } from '../src/integrations/alexa/alexa.verify';

// Certificados públicos autofirmados generados con openssl solo para pruebas (sin claves privadas).
const CERT_OK = readFileSync(join(__dirname, 'fixtures', 'echo-api-cert.pem'), 'utf8');
const CERT_OTHER_SAN = readFileSync(join(__dirname, 'fixtures', 'other-san-cert.pem'), 'utf8');

describe('validateCertContents (X509 nativo)', () => {
  afterEach(() => vi.useRealTimers());

  // Los certificados de prueba valen de oct 2026 a oct 2027: fijamos la fecha a mitad de ese rango.
  const MID_VALIDITY = new Date('2027-03-01T00:00:00Z');

  it('acepta un certificado vigente con SAN echo-api.amazon.com', () => {
    vi.useFakeTimers();
    vi.setSystemTime(MID_VALIDITY);
    expect(validateCertContents(CERT_OK)).toBeNull();
  });

  it('rechaza un certificado cuyo SAN no es echo-api.amazon.com', () => {
    vi.useFakeTimers();
    vi.setSystemTime(MID_VALIDITY);
    expect(validateCertContents(CERT_OTHER_SAN)).toMatch(/no pertenece a echo-api\.amazon\.com/);
  });

  it('rechaza un certificado expirado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2032-01-01T00:00:00Z'));
    expect(validateCertContents(CERT_OK)).toBe('Certificado expirado');
  });

  it('rechaza un certificado aún no vigente', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    expect(validateCertContents(CERT_OK)).toBe('Certificado aún no vigente');
  });

  it('rechaza basura que no es un certificado', () => {
    expect(validateCertContents('no soy un certificado')).toMatch(/^Certificado inválido/);
  });
});
