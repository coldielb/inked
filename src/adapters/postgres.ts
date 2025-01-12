import { Client } from 'pg';
import {
  DatabaseAdapter,
  DatabaseConfig,
  Draft,
  DraftType,
  ErrorCode,
  InkedError,
} from '../types.js';

export class PostgresAdapter implements DatabaseAdapter {
  private client: Client;

  constructor(config: DatabaseConfig) {
    if (config.type !== 'postgres') {
      throw new InkedError(
        'Invalid database configuration',
        ErrorCode.INVALID_REQUEST
      );
    }

    this.client = new Client({
      host: config.connection.host,
      port: config.connection.port,
      database: config.connection.database,
      user: config.connection.username,
      password: config.connection.password,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      await this.initializeSchema();
    } catch (error) {
      throw new InkedError(
        'Failed to connect to PostgreSQL database',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.end();
    } catch (error) {
      throw new InkedError(
        'Failed to disconnect from PostgreSQL database',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  private async initializeSchema(): Promise<void> {
    try {
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS drafts (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          type TEXT NOT NULL,
          version INTEGER NOT NULL,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          parent_id TEXT,
          tags TEXT[]
        );
        
        CREATE INDEX IF NOT EXISTS idx_drafts_parent_id ON drafts(parent_id);
        CREATE INDEX IF NOT EXISTS idx_drafts_type ON drafts(type);
      `);
    } catch (error) {
      throw new InkedError(
        'Failed to initialize database schema',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  async createDraft(draft: Draft): Promise<void> {
    try {
      await this.client.query(
        `
        INSERT INTO drafts (
          id, content, type, version, created_at, updated_at, parent_id, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          draft.id,
          draft.content,
          draft.metadata.type,
          draft.metadata.version,
          draft.metadata.created_at,
          draft.metadata.updated_at,
          draft.metadata.parent_id,
          draft.metadata.tags,
        ]
      );
    } catch (error) {
      throw new InkedError(
        'Failed to create draft',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  async getDraft(id: string): Promise<Draft> {
    try {
      const result = await this.client.query(
        'SELECT * FROM drafts WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        throw new InkedError(
          `Draft not found: ${id}`,
          ErrorCode.NOT_FOUND
        );
      }

      const row = result.rows[0];
      return {
        id: row.id,
        content: row.content,
        metadata: {
          type: row.type as DraftType,
          version: row.version,
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at),
          parent_id: row.parent_id,
          tags: row.tags,
        },
      };
    } catch (error) {
      if (error instanceof InkedError) throw error;
      throw new InkedError(
        'Failed to retrieve draft',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  async updateDraft(id: string, updates: Partial<Draft>): Promise<void> {
    try {
      const setFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.content !== undefined) {
        setFields.push(`content = $${paramCount}`);
        values.push(updates.content);
        paramCount++;
      }

      if (updates.metadata) {
        if (updates.metadata.type !== undefined) {
          setFields.push(`type = $${paramCount}`);
          values.push(updates.metadata.type);
          paramCount++;
        }
        if (updates.metadata.version !== undefined) {
          setFields.push(`version = $${paramCount}`);
          values.push(updates.metadata.version);
          paramCount++;
        }
        if (updates.metadata.parent_id !== undefined) {
          setFields.push(`parent_id = $${paramCount}`);
          values.push(updates.metadata.parent_id);
          paramCount++;
        }
        if (updates.metadata.tags !== undefined) {
          setFields.push(`tags = $${paramCount}`);
          values.push(updates.metadata.tags);
          paramCount++;
        }
      }

      setFields.push(`updated_at = $${paramCount}`);
      values.push(new Date());
      values.push(id);

      const query = `
        UPDATE drafts 
        SET ${setFields.join(', ')}
        WHERE id = $${paramCount + 1}
      `;

      const result = await this.client.query(query, values);

      if (result.rowCount === 0) {
        throw new InkedError(
          `Draft not found: ${id}`,
          ErrorCode.NOT_FOUND
        );
      }
    } catch (error) {
      if (error instanceof InkedError) throw error;
      throw new InkedError(
        'Failed to update draft',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  async listDrafts(filters?: {
    type?: DraftType;
    parent_id?: string;
  }): Promise<Draft[]> {
    try {
      let query = 'SELECT * FROM drafts';
      const conditions: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (filters) {
        if (filters.type) {
          conditions.push(`type = $${paramCount}`);
          values.push(filters.type);
          paramCount++;
        }
        if (filters.parent_id) {
          conditions.push(`parent_id = $${paramCount}`);
          values.push(filters.parent_id);
          paramCount++;
        }
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC';

      const result = await this.client.query(query, values);

      return result.rows.map(row => ({
        id: row.id,
        content: row.content,
        metadata: {
          type: row.type as DraftType,
          version: row.version,
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at),
          parent_id: row.parent_id,
          tags: row.tags,
        },
      }));
    } catch (error) {
      throw new InkedError(
        'Failed to list drafts',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  async deleteDraft(id: string): Promise<void> {
    try {
      const result = await this.client.query(
        'DELETE FROM drafts WHERE id = $1',
        [id]
      );

      if (result.rowCount === 0) {
        throw new InkedError(
          `Draft not found: ${id}`,
          ErrorCode.NOT_FOUND
        );
      }
    } catch (error) {
      if (error instanceof InkedError) throw error;
      throw new InkedError(
        'Failed to delete draft',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }
}
