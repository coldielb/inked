// Core types for the Inked MCP server

export type DraftType = 'chapter' | 'section' | 'report';
export type OutputFormat = 'md' | 'txt' | 'docx' | 'pages';

export interface DraftMetadata {
  type: DraftType;
  version: number;
  created_at: Date;
  updated_at: Date;
  parent_id?: string;
  tags?: string[];
}

export interface Draft {
  id: string;
  content: string;
  metadata: DraftMetadata;
}

export interface DatabaseConfig {
  type: 'postgres' | 'sqlite';
  connection: {
    host?: string;
    port?: number;
    database: string;
    username?: string;
    password?: string;
    filename?: string; // For SQLite
  };
}

export interface ServerConfig {
  database: DatabaseConfig;
  defaultFormat: OutputFormat;
}

// Database adapter interface
export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createDraft(draft: Draft): Promise<void>;
  getDraft(id: string): Promise<Draft>;
  updateDraft(id: string, updates: Partial<Draft>): Promise<void>;
  listDrafts(filters?: { type?: DraftType; parent_id?: string }): Promise<Draft[]>;
  deleteDraft(id: string): Promise<void>;
}

// Content processor interface
export interface ContentProcessor {
  formatContent(drafts: Draft[], format: OutputFormat): Promise<string>;
  generateTableOfContents(drafts: Draft[]): Promise<string>;
  validateContent(draft: Draft): Promise<boolean>;
}

// MCP Tool request/response types
export interface QuillRequest {
  content: string;
  type?: DraftType;
  parent_id: string;  // Now required
  custom_id: string;  // Now required
}

export interface QuillResponse {
  draft_id: string;
}

export interface InkRequest {
  draft_ids: string[];
  format: OutputFormat;
  output_path: string;
}

export interface InkResponse {
  output_path: string;
}

export interface ListDraftsRequest {
  type?: DraftType;
  parent_id?: string;
}

export interface ListDraftsResponse {
  drafts: Draft[];
}

// Error handling
export enum ErrorCode {
  DATABASE_ERROR = 'DATABASE_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  NOT_FOUND = 'NOT_FOUND',
}

export class InkedError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'InkedError';
  }
}
