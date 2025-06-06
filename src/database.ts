import sqlite3 from 'sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir } from 'fs/promises';
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
      await mkdir(inkedDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async initialize(): Promise<void> {
    await this.ensureInkedDir();
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
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
              content,
              content_rowid UNINDEXED,
              content='memories',
              content_rowid='id'
            )
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Create triggers to keep FTS table in sync
            this.db!.run(`
              CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
                INSERT INTO memories_fts(rowid, content) VALUES (new.id, '');
              END
            `, (err) => {
              if (err) {
                reject(err);
                return;
              }

              this.db!.run(`
                CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
                  DELETE FROM memories_fts WHERE rowid = old.id;
                END
              `, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          });
        });
      });
    });
  }

  async addMemory(content: string): Promise<number> {
    const encryptedContent = await cryptoManager.encrypt(content);
    
    return new Promise((resolve, reject) => {
      const stmt = this.db!.prepare('INSERT INTO memories (encrypted_content) VALUES (?)');
      const self = this;
      stmt.run([encryptedContent], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        const insertedId = this.lastID;
        
        // Update FTS table with decrypted content for searching
        const updateStmt = self.db!.prepare('UPDATE memories_fts SET content = ? WHERE rowid = ?');
        updateStmt.run([content, insertedId], (err: any) => {
          if (err) reject(err);
          else resolve(insertedId);
        });
      });
    });
  }

  async searchMemories(query: string, limit: number = 3): Promise<Memory[]> {
    return new Promise(async (resolve, reject) => {
      const sql = `
        SELECT m.id, m.encrypted_content, m.created_at
        FROM memories m
        JOIN memories_fts fts ON m.id = fts.rowid
        WHERE memories_fts MATCH ?
        ORDER BY bm25(memories_fts)
        LIMIT ?
      `;

      this.db!.all(sql, [query, limit], async (err, rows: EncryptedMemory[]) => {
        if (err) {
          reject(err);
          return;
        }

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