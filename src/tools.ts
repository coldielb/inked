import { z } from 'zod';
import { db } from './database.js';
import { FastSemanticSearch } from './search.js';

export const ReadToolSchema = z.object({
  search: z.string().min(1, 'Search query is required'),
  topr: z.number().int().min(1).max(5).optional().default(3)
});

export const WriteToolSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  sTool: z.enum(['NEW', 'DELETE'], {
    errorMap: () => ({ message: 'sTool must be either "NEW" or "DELETE"' })
  }),
  id: z.number().int().positive().optional()
});

export async function handleReadTool(
  params: z.infer<typeof ReadToolSchema>, 
  searchEngine: FastSemanticSearch
) {
  try {
    const { search, topr } = params;
    
    // Use semantic search engine
    const searchResults = await searchEngine.searchMemories(search, topr);
    
    if (searchResults.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No memories found matching "${search}". Try different search terms or add new memories first.`
        }]
      };
    }

    const resultsText = searchResults.map((memory, index) => {
      let resultText = `Memory ${index + 1} (ID: ${memory.id}):\n${memory.content}\nCreated: ${memory.created_at}`;
      
      // Add relevance information
      if (memory.relevanceScore > 0) {
        resultText += `\nRelevance: ${memory.relevanceScore} (${memory.matchType})`;
      }
      
      return resultText;
    }).join('\n---\n\n');

    return {
      content: [{
        type: "text" as const,
        text: `Found ${searchResults.length} relevant memories (semantic search):\n\n${resultsText}`
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: "text" as const,
        text: `Error searching memories: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

export async function handleWriteTool(
  params: z.infer<typeof WriteToolSchema>, 
  searchEngine: FastSemanticSearch
) {
  try {
    const { content, sTool, id } = params;

    if (sTool === 'NEW') {
      const newId = await db.addMemory(content);
      
      return {
        content: [{
          type: "text" as const,
          text: `Memory successfully saved with ID: ${newId}`
        }]
      };
    } 
    
    if (sTool === 'DELETE') {
      if (id) {
        const deleted = await db.deleteMemory(id);
        if (deleted) {
          return {
            content: [{
              type: "text" as const,
              text: `Memory with ID ${id} has been deleted successfully.`
            }]
          };
        } else {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `No memory found with ID ${id}. The memory may have already been deleted.`
            }]
          };
        }
      } else {
        // Use semantic search to find memory to delete
        const searchResults = await searchEngine.searchMemories(content, 1);
        
        if (searchResults.length === 0) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `No memory found matching "${content}". Please provide a more specific search term or the exact memory ID.`
            }]
          };
        }

        const memoryToDelete = searchResults[0];
        const deleted = await db.deleteMemory(memoryToDelete.id);
        if (deleted) {
          return {
            content: [{
              type: "text" as const,
              text: `Found and deleted memory (ID: ${memoryToDelete.id}, relevance: ${memoryToDelete.relevanceScore}):\n"${memoryToDelete.content.substring(0, 100)}${memoryToDelete.content.length > 100 ? '...' : ''}"`
            }]
          };
        } else {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Failed to delete memory with ID ${memoryToDelete.id}. Please try again.`
            }]
          };
        }
      }
    }

    return {
      isError: true,
      content: [{
        type: "text" as const,
        text: 'Invalid sTool value. Must be "NEW" or "DELETE".'
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: "text" as const,
        text: `Error processing memory operation: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}