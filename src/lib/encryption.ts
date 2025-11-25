import crypto from 'crypto';

/**
 * Token encryption utility using AES-256-GCM
 *
 * Environment Variables Required:
 * - ENCRYPTION_KEY: 32-byte encryption key (64 hex characters)
 *   Generate with: openssl rand -hex 32
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

/**
 * Get encryption key from environment variable
 * If not set, throws an error
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }

  // Convert hex string to buffer
  if (key.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be 32 bytes (64 hex characters). ' +
      'Current length: ' + key.length
    );
  }

  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string
 * Returns a base64-encoded string containing: salt + iv + authTag + encrypted data
 *
 * @param plaintext - The text to encrypt
 * @returns Base64-encoded encrypted string
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey();

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the plaintext
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine salt + iv + authTag + encrypted data
    const result = Buffer.concat([salt, iv, authTag, encrypted]);

    // Return as base64
    return result.toString('base64');
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypt an encrypted string
 * Expects a base64-encoded string containing: salt + iv + authTag + encrypted data
 *
 * @param encryptedData - Base64-encoded encrypted string
 * @returns Decrypted plaintext string
 */
export function decrypt(encryptedData: string): string {
  try {
    const key = getEncryptionKey();

    // Convert from base64
    const buffer = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, TAG_POSITION);
    const authTag = buffer.subarray(TAG_POSITION, ENCRYPTED_POSITION);
    const encrypted = buffer.subarray(ENCRYPTED_POSITION);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if encryption is properly configured
 * @returns true if ENCRYPTION_KEY is set and valid
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a new encryption key
 * This is a utility function for development/setup
 * In production, generate the key securely and set it as an environment variable
 *
 * @returns Hex-encoded 32-byte encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Test encryption/decryption to ensure it's working properly
 * @returns true if test passes, throws error otherwise
 */
export function testEncryption(): boolean {
  const testString = 'test-encryption-' + Date.now();
  const encrypted = encrypt(testString);
  const decrypted = decrypt(encrypted);

  if (decrypted !== testString) {
    throw new Error('Encryption test failed: decrypted value does not match original');
  }

  return true;
}
