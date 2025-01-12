import sqlite3 from 'sqlite3';
import {
  DatabaseAdapter,
  DatabaseConfig,
  Draft,
  DraftType,
  ErrorCode,
  InkedError,
} from '../types.js';

interface DraftRow {
  id: string;
  content: string;
  type: string;
  version: number;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
  tags: string | null;
}

export class SQLiteAdapter implements DatabaseAdapter {
  private db: sqlite3.Database;

  constructor(config: DatabaseConfig) {
    if (config.type !== 'sqlite') {
      throw new InkedError(
        'Invalid database configuration',
        ErrorCode.INVALID_REQUEST
      );
    }

    if (!config.connection.filename) {
      throw new InkedError(
        'SQLite filename is required',
        ErrorCode.INVALID_REQUEST
      );
    }

    this.db = new sqlite3.Database(config.connection.filename);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        try {
          // Enable foreign keys
          this.db.run('PRAGMA foreign_keys = ON');
          
          // Create schema
          this.db.run(`
            CREATE TABLE IF NOT EXISTS drafts (
              id TEXT PRIMARY KEY,
              content TEXT NOT NULL,
              type TEXT NOT NULL,
              version INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              parent_id TEXT,
              tags TEXT
            )
          `);

          // Create indexes
          this.db.run('CREATE INDEX IF NOT EXISTS idx_drafts_parent_id ON drafts(parent_id)');
          this.db.run('CREATE INDEX IF NOT EXISTS idx_drafts_type ON drafts(type)');

          resolve();
        } catch (error) {
          reject(new InkedError(
            'Failed to initialize SQLite database',
            ErrorCode.DATABASE_ERROR,
            error
          ));
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(new InkedError(
            'Failed to close SQLite database',
            ErrorCode.DATABASE_ERROR,
            err
          ));
        } else {
          resolve();
        }
      });
    });
  }

  async createDraft(draft: Draft): Promise<void> {
    return new Promise((resolve, reject) => {
      const tags = draft.metadata.tags ? JSON.stringify(draft.metadata.tags) : null;
      
      this.db.run(
        `INSERT INTO drafts (
          id, content, type, version, created_at, updated_at, parent_id, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          draft.id,
          draft.content,
          draft.metadata.type,
          draft.metadata.version,
          draft.metadata.created_at.toISOString(),
          draft.metadata.updated_at.toISOString(),
          draft.metadata.parent_id,
          tags,
        ],
        (err) => {
          if (err) {
            reject(new InkedError(
              'Failed to create draft',
              ErrorCode.DATABASE_ERROR,
              err
            ));
          } else {
            resolve();
          }
        }
      );
    });
  }

  async getDraft(id: string): Promise<Draft> {
    return new Promise((resolve, reject) => {
      this.db.get<DraftRow>(
        'SELECT * FROM drafts WHERE id = ?',
        [id],
        (err, row: DraftRow | undefined) => {
          if (err) {
            reject(new InkedError(
              'Failed to retrieve draft',
              ErrorCode.DATABASE_ERROR,
              err
            ));
            return;
          }

          if (!row) {
            reject(new InkedError(
              `Draft not found: ${id}`,
              ErrorCode.NOT_FOUND
            ));
            return;
          }

          resolve({
            id: row.id,
            content: row.content,
            metadata: {
              type: row.type as DraftType,
              version: row.version,
              created_at: new Date(row.created_at),
              updated_at: new Date(row.updated_at),
              parent_id: row.parent_id ?? undefined,
              tags: row.tags ? JSON.parse(row.tags) : undefined,
            },
          });
        }
      );
    });
  }

  async updateDraft(id: string, updates: Partial<Draft>): Promise<void> {
    return new Promise((resolve, reject) => {
      const setFields: string[] = [];
      const values: any[] = [];

      if (updates.content !== undefined) {
        setFields.push('content = ?');
        values.push(updates.content);
      }

      if (updates.metadata) {
        if (updates.metadata.type !== undefined) {
          setFields.push('type = ?');
          values.push(updates.metadata.type);
        }
        if (updates.metadata.version !== undefined) {
          setFields.push('version = ?');
          values.push(updates.metadata.version);
        }
        if (updates.metadata.parent_id !== undefined) {
          setFields.push('parent_id = ?');
          values.push(updates.metadata.parent_id);
        }
        if (updates.metadata.tags !== undefined) {
          setFields.push('tags = ?');
          values.push(JSON.stringify(updates.metadata.tags));
        }
      }

      setFields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const query = `
        UPDATE drafts 
        SET ${setFields.join(', ')}
        WHERE id = ?
      `;

      this.db.run(query, values, function(err) {
        if (err) {
          reject(new InkedError(
            'Failed to update draft',
            ErrorCode.DATABASE_ERROR,
            err
          ));
          return;
        }

        if (this.changes === 0) {
          reject(new InkedError(
            `Draft not found: ${id}`,
            ErrorCode.NOT_FOUND
          ));
          return;
        }

        resolve();
      });
    });
  }

  async listDrafts(filters?: {
    type?: DraftType;
    parent_id?: string;
  }): Promise<Draft[]> {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM drafts';
      const conditions: string[] = [];
      const values: any[] = [];

      if (filters) {
        if (filters.type) {
          conditions.push('type = ?');
          values.push(filters.type);
        }
        if (filters.parent_id) {
          conditions.push('parent_id = ?');
          values.push(filters.parent_id);
        }
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC';

      this.db.all<DraftRow>(query, values, (err, rows: DraftRow[]) => {
        if (err) {
          reject(new InkedError(
            'Failed to list drafts',
            ErrorCode.DATABASE_ERROR,
            err
          ));
          return;
        }

        resolve(rows.map(row => ({
          id: row.id,
          content: row.content,
          metadata: {
            type: row.type as DraftType,
            version: row.version,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at),
            parent_id: row.parent_id ?? undefined,
            tags: row.tags ? JSON.parse(row.tags) : undefined,
          },
        })));
      });
    });
  }

  async deleteDraft(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM drafts WHERE id = ?',
        [id],
        function(err) {
          if (err) {
            reject(new InkedError(
              'Failed to delete draft',
              ErrorCode.DATABASE_ERROR,
              err
            ));
            return;
          }

          if (this.changes === 0) {
            reject(new InkedError(
              `Draft not found: ${id}`,
              ErrorCode.NOT_FOUND
            ));
            return;
          }

          resolve();
        }
      );
    });
  }
}
