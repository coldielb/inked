#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { db } from "./database.js";
import { FastSemanticSearch } from "./search.js";
import {
  ReadToolSchema,
  WriteToolSchema,
  handleReadTool,
  handleWriteTool,
} from "./tools.js";

// Global search engine instance
let searchEngine: FastSemanticSearch;

class InkedServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "inked",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "read",
            description:
              "Search and retrieve memories using powerful semantic search. Use 'ALL' to get all memories, or search terms for intelligent matching including synonyms, fuzzy matching, and context understanding.",
            inputSchema: {
              type: "object",
              properties: {
                search: {
                  type: "string",
                  description: "Search query. Use 'ALL' to retrieve all memories, or any terms for semantic search.",
                },
                topr: {
                  type: "number",
                  description:
                    "Number of top results to return (1-5, default: 3)",
                  minimum: 1,
                  maximum: 5,
                  default: 3,
                },
              },
              required: ["search"],
            },
          },
          {
            name: "write",
            description:
              'Add new memories or delete existing ones. Use sTool="NEW" to add, sTool="DELETE" to remove. Memories can be any format - structured notes, preferences, facts, or simple thoughts.',
            inputSchema: {
              type: "object",
              properties: {
                content: {
                  type: "string",
                  description:
                    "Memory content to add (for NEW) or search query to find memory to delete (for DELETE)",
                },
                sTool: {
                  type: "string",
                  enum: ["NEW", "DELETE"],
                  description:
                    'Sub-tool: "NEW" to add memory, "DELETE" to remove memory',
                },
                id: {
                  type: "number",
                  description:
                    'Optional: Specific memory ID to delete (only used with sTool="DELETE")',
                },
              },
              required: ["content", "sTool"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "read": {
            const validatedArgs = ReadToolSchema.parse(args);
            return await handleReadTool(validatedArgs, searchEngine);
          }

          case "write": {
            const validatedArgs = WriteToolSchema.parse(args);
            return await handleWriteTool(validatedArgs, searchEngine);
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    try {
      await db.initialize();
      
      // Initialize fast semantic search engine
      searchEngine = new FastSemanticSearch(db);

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("Inked v2.0 MCP server started successfully");
      console.error("✓ Fast semantic search enabled");
    } catch (error) {
      console.error("Failed to start Inked MCP server:", error);
      process.exit(1);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await db.close();
      console.error("Inked MCP server stopped");
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }
}

// Start the server directly - no complex CLI flags needed
const server = new InkedServer();
server.start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});