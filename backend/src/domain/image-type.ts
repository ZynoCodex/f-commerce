/**
 * Detect image type by inspecting magic bytes at the start of the buffer.
 * This is more reliable than trusting the Content-Type header, which is
 * client controlled and can be spoofed.
 *
 * Returns the detected MIME type or null if the buffer does not match a
 * supported image format.
 */
export function detectImageType(buffer: Buffer): string | null {
  // JPEG: starts with FF D8 FF (3 bytes minimum)
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A (8 bytes)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: starts with "GIF87a" or "GIF89a" (6 bytes minimum)
  if (buffer.length >= 6) {
    const gif = buffer.toString('ascii', 0, 6);
    if (gif === 'GIF87a' || gif === 'GIF89a') {
      return 'image/gif';
    }
  }

  // WebP: RIFF....WEBP (12 bytes minimum, the 'WEBP' signature is at offset 8)
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}
