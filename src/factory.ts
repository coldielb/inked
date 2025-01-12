import {
  DatabaseAdapter,
  DatabaseConfig,
  ContentProcessor,
  OutputFormat,
  ErrorCode,
  InkedError,
} from './types.js';
import { PostgresAdapter } from './adapters/postgres.js';
import { SQLiteAdapter } from './adapters/sqlite.js';
import { MarkdownProcessor } from './processors/markdown.js';

export class InkedFactory {
  static createDatabaseAdapter(config: DatabaseConfig): DatabaseAdapter {
    switch (config.type) {
      case 'postgres':
        return new PostgresAdapter(config);
      case 'sqlite':
        return new SQLiteAdapter(config);
      default:
        throw new InkedError(
          `Unsupported database type: ${config.type}`,
          ErrorCode.INVALID_REQUEST
        );
    }
  }

  static createContentProcessor(format: OutputFormat): ContentProcessor {
    switch (format) {
      case 'md':
        return new MarkdownProcessor();
      case 'txt':
        // For now, use markdown processor for txt (strips formatting)
        return new MarkdownProcessor();
      case 'docx':
        // TODO: Implement DocxProcessor
        throw new InkedError(
          'DOCX format not yet implemented',
          ErrorCode.INVALID_REQUEST
        );
      case 'pages':
        // TODO: Implement PagesProcessor
        throw new InkedError(
          'Pages format not yet implemented',
          ErrorCode.INVALID_REQUEST
        );
      default:
        throw new InkedError(
          `Unsupported output format: ${format}`,
          ErrorCode.INVALID_REQUEST
        );
    }
  }
}
