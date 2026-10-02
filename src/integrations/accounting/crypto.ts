import crypto from 'crypto';
import { env } from '../../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Recomendado para GCM

function getDerivedKey(): Buffer {
  const secret = env.ACCOUNTING_ENCRYPTION_KEY || env.SUPABASE_JWT_SECRET;
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Cifra un objeto o string de credenciales usando AES-256-GCM.
 * Devuelve un string en formato: iv_hex:auth_tag_hex:ciphertext_hex
 */
export function encryptCredentials(data: Record<string, any> | string): string {
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getDerivedKey();

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descifra el string cifrado y devuelve el objeto original o string.
 */
export function decryptCredentials<T = any>(encryptedString: string): T {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de credenciales cifradas inválido');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');
  const key = getDerivedKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

  try {
    return JSON.parse(decrypted) as T;
  } catch {
    return decrypted as unknown as T;
  }
}

/**
 * Enmascara emails y tokens para evitar cualquier fuga en logs o respuestas API.
 */
export function maskSensitive(text?: string | null): string {
  if (!text) return '';
  if (text.includes('@')) {
    const [user, domain] = text.split('@');
    if (user.length <= 2) return `${user[0] ?? ''}***@${domain}`;
    return `${user.slice(0, 2)}***${user.slice(-1)}@${domain}`;
  }
  if (text.length <= 6) return '••••••';
  return `${text.slice(0, 3)}••••••••${text.slice(-3)}`;
}
