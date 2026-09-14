import { describe, it, expect } from 'vitest';
import { detectMediaTypeFromMagicBytes } from '../src/modules/scan/scan.service';

describe('detectMediaTypeFromMagicBytes', () => {
  it('detecta imágenes JPEG correctamente', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const b64 = jpegBuffer.toString('base64');
    expect(detectMediaTypeFromMagicBytes(b64)).toBe('image/jpeg');
  });

  it('detecta imágenes PNG correctamente', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const b64 = pngBuffer.toString('base64');
    expect(detectMediaTypeFromMagicBytes(b64)).toBe('image/png');
  });

  it('detecta imágenes GIF correctamente', () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
    const b64 = gifBuffer.toString('base64');
    expect(detectMediaTypeFromMagicBytes(b64)).toBe('image/gif');
  });

  it('detecta imágenes WebP correctamente', () => {
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
    ]);
    const b64 = webpBuffer.toString('base64');
    expect(detectMediaTypeFromMagicBytes(b64)).toBe('image/webp');
  });

  it('rechaza archivos de texto o binarios arbitrarios', () => {
    const textBuffer = Buffer.from('Este es un archivo de texto plano pretendiendo ser imagen');
    const b64 = textBuffer.toString('base64');
    expect(detectMediaTypeFromMagicBytes(b64)).toBeNull();
  });

  it('rechaza cadenas vacías o demasiado cortas', () => {
    expect(detectMediaTypeFromMagicBytes('')).toBeNull();
    expect(detectMediaTypeFromMagicBytes('AA==')).toBeNull();
  });
});
