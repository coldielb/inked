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
import {
  ReadToolSchema,
  WriteToolSchema,
  handleReadTool,
  handleWriteTool,
} from "./tools.js";

class InkedServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "inked",
        version: "1.0.0",
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
              "Search and retrieve memories. Use 'ALL' to get all memories (up to 8k tokens), or search terms to find specific memories.",
            inputSchema: {
              type: "object",
              properties: {
                search: {
                  type: "string",
                  description: "Search query. Use 'ALL' to retrieve all memories, or specific terms to search.",
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
              'Add new memories or delete existing ones. Use sTool="NEW" to add, sTool="DELETE" to remove. When making new memories using a scratchpad style of writing, where not everything is a coherent sentence and can be a simple thought.',
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
            return await handleReadTool(validatedArgs);
          }

          case "write": {
            const validatedArgs = WriteToolSchema.parse(args);
            return await handleWriteTool(validatedArgs);
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

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("Inked MCP server started successfully");
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

const server = new InkedServer();
server.start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
