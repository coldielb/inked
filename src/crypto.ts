import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

class CryptoManager {
  private key: Buffer | null = null;
  private readonly keyPath: string;

  constructor() {
    this.keyPath = join(homedir(), '.inked', 'key.dat');
  }

  private async ensureInkedDir(): Promise<void> {
    const inkedDir = join(homedir(), '.inked');
    try {
      await mkdir(inkedDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private async getOrCreateKey(): Promise<Buffer> {
    if (this.key) return this.key;

    await this.ensureInkedDir();

    try {
      const keyData = await readFile(this.keyPath);
      this.key = keyData;
      return this.key;
    } catch (error) {
      // Key doesn't exist, create new one
      this.key = randomBytes(32);
      await writeFile(this.keyPath, this.key, { mode: 0o600 });
      return this.key;
    }
  }

  async encrypt(text: string): Promise<string> {
    const key = await this.getOrCreateKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  async decrypt(encryptedText: string): Promise<string> {
    const key = await this.getOrCreateKey();
    const [ivHex, encrypted] = encryptedText.split(':');
    
    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

export const cryptoManager = new CryptoManager();