import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/env')>();
  return { ...actual, env: { ...actual.env, ALEXA_SKILL_ID: 'amzn1.ask.skill.test-fixture' } };
});

const { checkApplicationId, verifyAlexaRequest } = await import('../src/integrations/alexa/alexa.verify');

const VALID_ID = 'amzn1.ask.skill.test-fixture';

function bodyWithAppId(appId: string | undefined) {
  return { context: { System: { application: { applicationId: appId } } } };
}

describe('checkApplicationId', () => {
  it('acepta cuando el applicationId coincide con ALEXA_SKILL_ID', () => {
    expect(checkApplicationId(bodyWithAppId(VALID_ID))).toBe(true);
  });

  it('rechaza cuando el applicationId no coincide', () => {
    expect(checkApplicationId(bodyWithAppId('amzn1.ask.skill.otro-skill'))).toBe(false);
  });

  it('rechaza cuando falta el applicationId', () => {
    expect(checkApplicationId(bodyWithAppId(undefined))).toBe(false);
  });

  it('acepta el applicationId también desde session.application (formato alterno)', () => {
    expect(
      checkApplicationId({ session: { application: { applicationId: VALID_ID } } }),
    ).toBe(true);
  });
});

describe('verifyAlexaRequest (NODE_ENV=test, sin verificación criptográfica)', () => {
  function mockRes() {
    return {} as any;
  }

  it('deja pasar una petición con applicationId correcto', async () => {
    const req = { body: bodyWithAppId(VALID_ID), headers: {}, ip: '127.0.0.1' } as any;
    const next = vi.fn();
    await verifyAlexaRequest(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(); // sin argumentos = continúa
  });

  it('rechaza una petición con applicationId incorrecto, sin llegar a los datos', async () => {
    const req = { body: bodyWithAppId('amzn1.ask.skill.otro-skill'), headers: {}, ip: '127.0.0.1' } as any;
    const next = vi.fn();
    await verifyAlexaRequest(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
  });
});
