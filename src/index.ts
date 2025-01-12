#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode as McpErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import {
  DatabaseConfig,
  QuillRequest,
  InkRequest,
  ListDraftsRequest,
  ErrorCode,
  InkedError,
  OutputFormat,
  DatabaseAdapter,
  ContentProcessor,
  Draft,
  ServerConfig,
} from './types.js';
import { InkedFactory } from './factory.js';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

class InkedServer {
  private server: Server;
  private adapter: DatabaseAdapter;
  private processor: ContentProcessor;

  constructor(config: ServerConfig) {
    this.adapter = InkedFactory.createDatabaseAdapter(config.database);
    this.processor = InkedFactory.createContentProcessor(config.defaultFormat);
    this.server = new Server(
      {
        name: 'mcp-inked',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'quill',
          description: 'Create or update a content draft',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Draft content',
              },
              type: {
                type: 'string',
                enum: ['chapter', 'section', 'report'],
                description: 'Type of content',
              },
              parent_id: {
                type: 'string',
                description: 'Optional parent draft ID',
              },
              custom_id: {
                type: 'string',
                description: 'Optional custom ID (e.g., ch01-d1)',
              },
            },
            required: ['content', 'custom_id', 'parent_id'],
          },
        },
        {
          name: 'ink',
          description: 'Generate formatted content from drafts',
          inputSchema: {
            type: 'object',
            properties: {
              draft_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of draft IDs to compile',
              },
              format: {
                type: 'string',
                enum: ['md', 'txt', 'docx', 'pages'],
                description: 'Output format',
              },
              output_path: {
                type: 'string',
                description: 'Path to save the output file',
              },
            },
            required: ['draft_ids', 'format', 'output_path'],
          },
        },
        {
          name: 'list_drafts',
          description: 'List available drafts',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['chapter', 'section', 'report'],
                description: 'Filter by content type',
              },
              parent_id: {
                type: 'string',
                description: 'Filter by parent draft ID',
              },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.adapter || !this.processor) {
        throw new McpError(
          McpErrorCode.InternalError,
          'Database or processor not initialized'
        );
      }

      switch (request.params.name) {
        case 'quill':
          return this.handleQuillDraft(request.params.arguments);
        case 'ink':
          return this.handleInkContent(request.params.arguments);
        case 'list_drafts':
          return this.handleListDrafts(request.params.arguments);
        default:
          throw new McpError(
            McpErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleQuillDraft(args: any) {
    try {
      const request = args as QuillRequest;
      
      const draft: Draft = {
        id: request.custom_id,
        content: request.content,
        metadata: {
          type: request.type || 'section',
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
          parent_id: request.parent_id,
        },
      };

      await this.adapter.createDraft(draft);
      await this.processor.validateContent(draft);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ draft_id: draft.id }),
          },
        ],
      };
    } catch (error) {
      if (error instanceof InkedError) {
        throw new McpError(McpErrorCode.InvalidParams, error.message);
      }
      throw error;
    }
  }

  private async handleInkContent(args: any) {
    try {
      const request = args as InkRequest;
      
      // Fetch all requested drafts
      const drafts = await Promise.all(
        request.draft_ids.map(id => this.adapter.getDraft(id))
      );

      // Create processor for requested format
      const processor = InkedFactory.createContentProcessor(request.format);

      // Generate content
      const toc = await processor.generateTableOfContents(drafts);
      const content = await processor.formatContent(drafts, request.format);
      const fullContent = `${toc}\n\n${content}`;

      // Ensure output directory exists
      await fs.mkdir(dirname(request.output_path), { recursive: true });

      // Write to file
      await fs.writeFile(request.output_path, fullContent, 'utf8');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ output_path: request.output_path }),
          },
        ],
      };
    } catch (error) {
      if (error instanceof InkedError) {
        throw new McpError(McpErrorCode.InvalidParams, error.message);
      }
      throw error;
    }
  }

  private async handleListDrafts(args: any) {
    try {
      const request = args as ListDraftsRequest;
      const drafts = await this.adapter.listDrafts({
        type: request.type,
        parent_id: request.parent_id,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ drafts }),
          },
        ],
      };
    } catch (error) {
      if (error instanceof InkedError) {
        throw new McpError(McpErrorCode.InvalidParams, error.message);
      }
      throw error;
    }
  }

  private async cleanup() {
    if (this.adapter) {
      await this.adapter.disconnect();
    }
  }

  async start() {
    try {
      await this.adapter.connect();
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Inked MCP server running on stdio');
    } catch (error) {
      console.error('Failed to start Inked server:', error);
      throw error;
    }
  }
}

async function loadConfig(): Promise<ServerConfig> {
  const defaultConfig: ServerConfig = {
    database: {
      type: 'sqlite',
      connection: {
        filename: 'inked.db',
        database: 'inked',
      },
    },
    defaultFormat: 'md',
  };

  try {
    const configPath = join(process.cwd(), 'config.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    const userConfig = JSON.parse(configContent);

    // Create storage directories if they exist in config
    if (userConfig.storage) {
      const { draftsPath, outputPath } = userConfig.storage;
      if (draftsPath) {
        await fs.mkdir(draftsPath, { recursive: true });
      }
      if (outputPath) {
        await fs.mkdir(outputPath, { recursive: true });
      }
    }

    // Merge with defaults, preferring user config
    return {
      ...defaultConfig,
      ...userConfig,
      // Deep merge database config
      database: {
        ...defaultConfig.database,
        ...userConfig.database,
        connection: {
          ...defaultConfig.database.connection,
          ...userConfig.database?.connection,
        },
      },
    };
  } catch (error) {
    console.error('Failed to load config, using defaults:', error);
    return defaultConfig;
  }
}

// Start server
loadConfig()
  .then(config => {
    const server = new InkedServer(config);
    return server.start();
  })
  .catch(console.error);
