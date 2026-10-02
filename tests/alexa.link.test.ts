import { describe, it, expect, vi } from 'vitest';
import { canjearCodigo } from '../src/integrations/alexa/alexa.link';

// Mockeamos adminClient para simular código no encontrado
vi.mock('../src/config/supabase', () => ({
  adminClient: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

describe('Alexa Link Codes Brute Force Protection (SEC-03)', () => {
  it('locks out user after 5 failed attempts', async () => {
    const attackerId = 'amzn1.ask.account.ATTACKER_TEST_123';

    // Primeros 4 intentos fallidos: debe dar 'no_existe'
    for (let i = 0; i < 4; i++) {
      const res = await canjearCodigo('123456', attackerId);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.motivo).toBe('no_existe');
      }
    }

    // 5to intento fallido
    const res5 = await canjearCodigo('654321', attackerId);
    expect(res5.ok).toBe(false);

    // 6to intento: debe estar bloqueado automáticamente
    const res6 = await canjearCodigo('999999', attackerId);
    expect(res6.ok).toBe(false);
    if (!res6.ok) {
      expect(res6.motivo).toBe('bloqueado');
    }
  });
});
