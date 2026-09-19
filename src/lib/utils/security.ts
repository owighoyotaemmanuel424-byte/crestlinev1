import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export function generateReference(prefix: string = 'CL'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return prefix + '-' + timestamp + '-' + random;
}

export function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateIdempotencyKey(): string {
  return generateToken(16);
}

export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function encryptData(data: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptData(encryptedData: string, key: string): string {
  const textParts = encryptedData.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) return '****';
  return data.slice(0, visibleChars) + '*' + data.slice(-visibleChars);
}

export function verifyToken(token: string): { userId: string; role: string; iat?: number; exp?: number } {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || '') as { userId: string; role: string; iat?: number; exp?: number };
  } catch {
    throw new Error('Invalid token');
  }
}

export function verifyHash(payload: string, signature: string, secret: string = process.env.JWT_SECRET || ''): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}
