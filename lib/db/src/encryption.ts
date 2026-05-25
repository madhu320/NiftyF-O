/**
 * SECURITY FIX: API Key & Token Encryption Utility
 * Encrypts sensitive broker credentials before storing in database
 * 
 * Usage:
 *   const encrypted = encryptSensitive(apiKey, process.env.ENCRYPTION_KEY);
 *   const decrypted = decryptSensitive(encrypted, process.env.ENCRYPTION_KEY);
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const IV_LENGTH = 12;

interface EncryptedData {
  iv: string;
  encryptedData: string;
  authTag: string;
  salt: string;
}

/**
 * Derives encryption key from master key using PBKDF2
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypts sensitive data (API keys, tokens, secrets)
 * @param data Plain text to encrypt (API key, secret, token)
 * @param masterKey Encryption master key from environment (ENCRYPTION_KEY)
 * @returns Encrypted data object with IV, authTag, and salt embedded
 */
export function encryptSensitive(data: string, masterKey: string): string {
  if (!masterKey || masterKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive encryption key
  const key = deriveKey(masterKey, salt);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt data
  let encryptedData = cipher.update(data, 'utf8', 'hex');
  encryptedData += cipher.final('hex');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine all components into single string
  const encrypted: EncryptedData = {
    iv: iv.toString('hex'),
    encryptedData,
    authTag: authTag.toString('hex'),
    salt: salt.toString('hex'),
  };

  return Buffer.from(JSON.stringify(encrypted)).toString('base64');
}

/**
 * Decrypts encrypted sensitive data
 * @param encryptedString Base64 encoded encrypted data
 * @param masterKey Encryption master key from environment (ENCRYPTION_KEY)
 * @returns Decrypted plain text
 */
export function decryptSensitive(encryptedString: string, masterKey: string): string {
  if (!masterKey || masterKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }

  try {
    // Decode base64
    const encrypted: EncryptedData = JSON.parse(
      Buffer.from(encryptedString, 'base64').toString('utf8')
    );

    // Reconstruct components
    const salt = Buffer.from(encrypted.salt, 'hex');
    const iv = Buffer.from(encrypted.iv, 'hex');
    const authTag = Buffer.from(encrypted.authTag, 'hex');

    // Derive key with same salt
    const key = deriveKey(masterKey, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Hash API key for lookup/verification without decryption
 * Useful for finding a key without decrypting all keys
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}
