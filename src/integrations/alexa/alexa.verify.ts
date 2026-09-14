import https from 'https';
import crypto from 'crypto';
import forge from 'node-forge';
import { NextFunction, Request, Response } from 'express';
import { env, isTest } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/http';

/**
 * Verifica que las peticiones a /api/v1/alexa/intent vengan realmente de
 * Amazon. Sin esto, cualquiera que conozca (o adivine) un alexa_user_id puede
 * llamar el endpoint directamente y mover datos reales (facturar, marcar
 * pagos, leer caja) sin pasar por Alexa. Réplica del proceso oficial descrito
 * en la documentación de Alexa Skills Kit para hosting fuera de AWS Lambda:
 * https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html
 */

const TIMESTAMP_TOLERANCE_MS = 150 * 1000;
const VALID_CERT_HOSTNAME = 's3.amazonaws.com';
const VALID_CERT_PATH_START = '/echo.api/';
const VALID_CERT_SAN = 'echo-api.amazon.com';

const certCache = new Map<string, string>();

function validateCertUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'signaturecertchainurl inválida';
  }
  if (parsed.protocol !== 'https:') return 'El certificado debe servirse por https';
  if (parsed.port && parsed.port !== '443') return 'Puerto de certificado inválido';
  if (parsed.hostname.toLowerCase() !== VALID_CERT_HOSTNAME) return 'Host de certificado no autorizado';
  if (!parsed.pathname.startsWith(VALID_CERT_PATH_START)) return 'Ruta de certificado no autorizada';
  return null;
}

function fetchCert(certUrl: string): Promise<string> {
  const cached = certCache.get(certUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    https
      .get(certUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`No se pudo descargar el certificado (${res.statusCode})`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          certCache.set(certUrl, body);
          resolve(body);
        });
      })
      .on('error', reject);
  });
}

/** SAN incluye echo-api.amazon.com y el certificado está vigente hoy. */
function validateCertContents(pemCert: string): string | null {
  try {
    const cert = forge.pki.certificateFromPem(pemCert);
    const altNames = cert.getExtension('subjectAltName') as
      | { altNames?: Array<{ value?: string }> }
      | undefined;
    const hasValidSan = altNames?.altNames?.some((n) => n.value === VALID_CERT_SAN);
    if (!hasValidSan) return 'El certificado no pertenece a echo-api.amazon.com';

    const now = Date.now();
    if (new Date(cert.validity.notAfter).getTime() <= now) return 'Certificado expirado';
    if (new Date(cert.validity.notBefore).getTime() >= now) return 'Certificado aún no vigente';
    return null;
  } catch (err) {
    return `Certificado inválido: ${(err as Error).message}`;
  }
}

function isSignatureValid(pemCert: string, signatureBase64: string, rawBody: string): boolean {
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(rawBody, 'utf8');
    return verifier.verify(pemCert, signatureBase64, 'base64');
  } catch {
    return false;
  }
}

function isTimestampFresh(rawBody: string): boolean {
  try {
    const parsed = JSON.parse(rawBody);
    const timestamp = parsed?.request?.timestamp;
    if (!timestamp) return false;
    const age = Date.now() - new Date(timestamp).getTime();
    // Toleramos también un pequeño desfase hacia el futuro (relojes no perfectamente sincronizados).
    return age < TIMESTAMP_TOLERANCE_MS && age > -TIMESTAMP_TOLERANCE_MS;
  } catch {
    return false;
  }
}

/** El applicationId de la petición debe ser exactamente el de nuestro skill. */
export function checkApplicationId(body: unknown): boolean {
  if (!env.ALEXA_SKILL_ID) return false; // fail-closed: sin ID configurado, no se confía en nada.
  const b = body as {
    context?: { System?: { application?: { applicationId?: string } } };
    session?: { application?: { applicationId?: string } };
  };
  const appId =
    b?.context?.System?.application?.applicationId ?? b?.session?.application?.applicationId;
  return appId === env.ALEXA_SKILL_ID;
}

/**
 * Middleware: exige applicationId correcto + firma de Amazon válida antes de
 * dejar pasar la petición a handleAlexaRequest. En NODE_ENV=test se omite la
 * verificación criptográfica (no hay certificados reales en los tests
 * unitarios) pero el chequeo de applicationId se mantiene activo.
 */
export async function verifyAlexaRequest(req: Request, _res: Response, next: NextFunction) {
  if (!checkApplicationId(req.body)) {
    logger.warn({ ip: req.ip }, 'Alexa: applicationId ausente o no coincide, petición rechazada');
    return next(ApiError.forbidden('Aplicación no autorizada'));
  }

  if (isTest) return next();

  const certUrl = req.headers['signaturecertchainurl'];
  const signature = req.headers['signature-256'] ?? req.headers['signature'];
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8');

  if (typeof certUrl !== 'string' || typeof signature !== 'string' || !rawBody) {
    logger.warn({ ip: req.ip }, 'Alexa: faltan cabeceras de firma, petición rechazada');
    return next(ApiError.unauthorized('Falta la firma de la petición'));
  }

  if (!isTimestampFresh(rawBody)) {
    logger.warn({ ip: req.ip }, 'Alexa: timestamp fuera de rango, posible replay');
    return next(ApiError.unauthorized('Petición expirada'));
  }

  const urlError = validateCertUrl(certUrl);
  if (urlError) {
    logger.warn({ ip: req.ip, urlError }, 'Alexa: URL de certificado inválida');
    return next(ApiError.unauthorized('Certificado inválido'));
  }

  try {
    const pemCert = await fetchCert(certUrl);
    const certError = validateCertContents(pemCert);
    if (certError) {
      logger.warn({ ip: req.ip, certError }, 'Alexa: certificado inválido');
      return next(ApiError.unauthorized('Certificado inválido'));
    }
    if (!isSignatureValid(pemCert, signature, rawBody)) {
      logger.warn({ ip: req.ip }, 'Alexa: firma inválida');
      return next(ApiError.unauthorized('Firma inválida'));
    }
  } catch (err) {
    logger.error({ err }, 'Alexa: error verificando la petición');
    return next(ApiError.unauthorized('No se pudo verificar la petición'));
  }

  next();
}
