import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [salt, expectedHash] = stored.split(':');
  if (!salt || !expectedHash) {
    return false;
  }

  const passwordHashBuffer = scryptSync(password, salt, KEY_LENGTH);
  const expectedHashBuffer = Buffer.from(expectedHash, 'hex');

  if (passwordHashBuffer.length !== expectedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(passwordHashBuffer, expectedHashBuffer);
};
