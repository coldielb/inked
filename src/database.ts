import sqlite3 from 'sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir, access, constants, chmod } from 'fs/promises';
import { cryptoManager } from './crypto.js';

export interface Memory {
  id: number;
  content: string;
  created_at: string;
}

export interface EncryptedMemory {
  id: number;
  encrypted_content: string;
  created_at: string;
}

class DatabaseManager {
  private db: sqlite3.Database | null = null;
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

        // Create main memories table
        this.db!.run(`
          CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            encrypted_content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Create FTS5 virtual table for search
          this.db!.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
              content
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
    });
  }

  async addMemory(content: string): Promise<number> {
    const encryptedContent = await cryptoManager.encrypt(content);
    
    return new Promise((resolve, reject) => {
      // Insert into main table
      const stmt = this.db!.prepare('INSERT INTO memories (encrypted_content) VALUES (?)');
      const self = this;
      stmt.run([encryptedContent], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        const insertedId = this.lastID;
        
        // Insert into FTS table with the content for searching
        const ftsStmt = self.db!.prepare('INSERT INTO memories_fts (rowid, content) VALUES (?, ?)');
        ftsStmt.run([insertedId, content], (err: any) => {
          if (err) reject(err);
          else resolve(insertedId);
        });
      });
    });
  }

  async searchMemories(query: string, limit: number = 3): Promise<Memory[]> {
    return new Promise(async (resolve, reject) => {
      // Special case: if query is "ALL", return all memories (up to reasonable limit)
      if (query.toUpperCase() === 'ALL') {
        const sql = `
          SELECT id, encrypted_content, created_at
          FROM memories
          ORDER BY created_at DESC
          LIMIT ?
        `;
        
        this.db!.all(sql, [Math.min(limit * 3, 20)], async (err, rows: EncryptedMemory[]) => {
          if (err) {
            reject(err);
            return;
          }

          try {
            const decryptedMemories: Memory[] = [];
            let totalTokens = 0;
            
            for (const row of rows) {
              const decryptedContent = await cryptoManager.decrypt(row.encrypted_content);
              const estimatedTokens = decryptedContent.length / 4; // Rough token estimate
              
              if (totalTokens + estimatedTokens > 8000) {
                break; // Stop if we'd exceed ~8k tokens
              }
              
              decryptedMemories.push({
                id: row.id,
                content: decryptedContent,
                created_at: row.created_at
              });
              
              totalTokens += estimatedTokens;
            }
            resolve(decryptedMemories);
          } catch (decryptError) {
            reject(decryptError);
          }
        });
        return;
      }

      // Try FTS search first
      const ftsSearch = `
        SELECT m.id, m.encrypted_content, m.created_at
        FROM memories m
        WHERE m.id IN (
          SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?
        )
        ORDER BY m.id DESC
        LIMIT ?
      `;

      this.db!.all(ftsSearch, [query, limit], async (err, rows: EncryptedMemory[]) => {
        if (err || rows.length === 0) {
          // Fallback to LIKE search if FTS fails or returns no results
          const likeSearch = `
            SELECT id, encrypted_content, created_at
            FROM memories
            ORDER BY created_at DESC
            LIMIT ?
          `;
          
          this.db!.all(likeSearch, [limit * 2], async (fallbackErr, fallbackRows: EncryptedMemory[]) => {
            if (fallbackErr) {
              reject(fallbackErr);
              return;
            }

            try {
              const decryptedMemories: Memory[] = [];
              const searchTerms = query.toLowerCase().split(' ');
              
              for (const row of fallbackRows) {
                const decryptedContent = await cryptoManager.decrypt(row.encrypted_content);
                const contentLower = decryptedContent.toLowerCase();
                
                // Check if any search term matches
                const matches = searchTerms.some(term => contentLower.includes(term));
                if (matches) {
                  decryptedMemories.push({
                    id: row.id,
                    content: decryptedContent,
                    created_at: row.created_at
                  });
                }
                
                if (decryptedMemories.length >= limit) break;
              }
              
              resolve(decryptedMemories);
            } catch (decryptError) {
              reject(decryptError);
            }
          });
        } else {
          // FTS search succeeded
          try {
            const decryptedMemories: Memory[] = [];
            for (const row of rows) {
              const decryptedContent = await cryptoManager.decrypt(row.encrypted_content);
              decryptedMemories.push({
                id: row.id,
                content: decryptedContent,
                created_at: row.created_at
              });
            }
            resolve(decryptedMemories);
          } catch (decryptError) {
            reject(decryptError);
          }
        }
      });
    });
  }

  async deleteMemory(id: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const self = this;
      // Delete from main table first
      this.db!.run('DELETE FROM memories WHERE id = ?', [id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        const deleted = this.changes > 0;
        
        if (deleted) {
          // Delete from FTS table
          const ftsStmt = self.db!.prepare('DELETE FROM memories_fts WHERE rowid = ?');
          ftsStmt.run([id], (err: any) => {
            if (err) reject(err);
            else resolve(true);
          });
        } else {
          resolve(false);
        }
      });
    });
  }

  async findMemoryToDelete(query: string): Promise<Memory | null> {
    const memories = await this.searchMemories(query, 1);
    return memories.length > 0 ? memories[0] : null;
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