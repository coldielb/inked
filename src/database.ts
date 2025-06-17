import sqlite3 from 'sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir, access, constants, chmod } from 'fs/promises';

export interface Memory {
  id: number;
  content: string;
  created_at: string;
}

class DatabaseManager {
  public db: sqlite3.Database | null = null;
  private readonly dbPath: string;

  constructor() {
    this.dbPath = join(homedir(), '.inked', 'memories.db');
  }

  private async ensureInkedDir(): Promise<void> {
    const inkedDir = join(homedir(), '.inked');
    try {
      await mkdir(inkedDir, { recursive: true, mode: 0o755 });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create inked directory: ${error.message}`);
      }
    }
  }

  async initialize(): Promise<void> {
    await this.ensureInkedDir();
    
    // Check if we can write to the directory
    try {
      await access(join(homedir(), '.inked'), constants.W_OK);
    } catch (error) {
      throw new Error(`Cannot write to ~/.inked directory. Please check permissions.`);
    }
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
        if (err) {
          reject(new Error(`Failed to open database: ${err.message}`));
          return;
        }

        // Ensure database file has correct permissions
        try {
          await chmod(this.dbPath, 0o644);
        } catch (chmodErr) {
          console.warn('Could not set database file permissions:', chmodErr);
        }

        // Create simple memories table
        this.db!.run(`
          CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Test that we can write to the database
          this.db!.run('PRAGMA journal_mode=WAL', (pragmaErr) => {
            if (pragmaErr) {
              reject(new Error(`Database is read-only: ${pragmaErr.message}`));
            } else {
              resolve();
            }
          });
        });
      });
    });
  }

  async addMemory(content: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const stmt = this.db!.prepare('INSERT INTO memories (content) VALUES (?)');
      stmt.run([content], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        resolve(this.lastID);
      });
    });
  }

  async deleteMemory(id: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db!.run('DELETE FROM memories WHERE id = ?', [id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

export const db = new DatabaseManager();