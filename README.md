# Inked

A powerful MCP server for memory management with Claude apps. Fast, simple, and optionally enhanced with AI-powered search.

<a href="https://glama.ai/mcp/servers/@coldielb/inked">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@coldielb/inked/badge" />
</a>

## Features

- **Fast text search** - Lightning-fast memory retrieval by default
- **AI-powered search** - Optional embedding-based semantic search
- **AI reranking** - Experimental reranking for even better results
- **Simple storage** - Plain text storage in SQLite (no encryption overhead)
- **Secure** - All data stored locally in `~/.inked/`

## Installation

### Option 1: (Recommended)
```bash
npm install -g @frgmt/inked
```

### Option 2: Local Development
```bash
git clone https://github.com/frgmt/inked.git
cd inked
npm install
npm run build
node dist/index.js
```

## Basic Usage

Add to your MCP server configuration:

### Standard (fast text search):
```json
{
  "mcpServers": {
    "inked": {
      "command": "npx",
      "args": ["@frgmt/inked"]
    }
  }
}
```

### With AI embeddings (semantic search):
```json
{
  "mcpServers": {
    "inked": {
      "command": "npx",
      "args": ["@frgmt/inked", "--use-embeddings"]
    }
  }
}
```

### With embeddings + AI reranking (best results):
```json
{
  "mcpServers": {
    "inked": {
      "command": "npx",
      "args": ["@frgmt/inked", "--use-embeddings", "--use-reranking"]
    }
  }
}
```

## Experimental Features

### AI-Powered Search (Optional)

Inked supports experimental embedding-based search for more nuanced memory retrieval.

#### Embedding Models

| Flag | Model | Memory Usage | Best For |
|------|-------|--------------|----------|
| `--use-embeddings` | Qwen3-0.6B | ~2GB RAM | Short memories, quick responses |
| `--use-embeddings=4b` | Qwen3-4B | ~8GB RAM | Longer memories, better nuance |
| `--use-embeddings=8b` | Qwen3-8B | ~16GB RAM | Complex memories, documents |

#### Reranking Models (Requires embeddings)

| Flag | Model | Additional Memory | Best For |
|------|-------|-------------------|----------|
| `--use-reranking` | Qwen3-Reranker-0.6B | ~1GB RAM | Improved relevance |
| `--use-reranking=4b` | Qwen3-Reranker-4B | ~4GB RAM | Best result quality |

### How to Choose Models

**For most users:** Start with no flags (fast text search)

**For better semantic understanding:** Add `--use-embeddings`
- Good for finding memories by meaning rather than exact words
- First run downloads ~2GB model (one-time)

**For nuanced, longer memories:** Use `--use-embeddings=4b`
- Better at understanding context in longer text
- Handles more complex relationships between ideas

**For best results:** Add `--use-reranking` with embeddings
- AI re-scores top candidates for optimal ranking
- Significantly improves search quality

**For power users:** `--use-embeddings=8b --use-reranking=4b`
- Best possible search quality
- Requires 20+ GB RAM
- Good for research, documentation, complex projects

### Memory Requirements

| Configuration | RAM Needed | Download Size | First Launch |
|---------------|------------|---------------|--------------|
| Default (text) | ~50MB | 0MB | Instant |
| Basic embeddings | ~2GB | ~1.2GB | 2-5 minutes |
| 4B embeddings | ~8GB | ~4GB | 5-10 minutes |
| 8B embeddings | ~16GB | ~8GB | 10-20 minutes |
| + Reranking | +1-4GB | +0.5-2GB | +1-3 minutes |

*Models are cached locally and only downloaded once*

## Usage Guide

### Auto-Memory Setup
Add this to your Claude settings/preferences:

> "At the start of new conversations, use the inked Read tool with 'ALL' to load my memories. Only mention memories when directly relevant to our conversation. Use the Write tool to save important preferences, facts, or insights that should be remembered for future conversations."

### How It Works
- **Read once per conversation**: Memories stay in context after initial load
- **Silent operation**: Claude uses memories without mentioning them unless relevant
- **Smart writing**: Automatically saves important information for future sessions

### When to Write Memories
- User preferences and communication style
- Important project information and context
- Recurring topics or themes
- Facts that should persist across conversations
- Insights or patterns worth remembering

### Search Strategies

**Text Search (default):**
- Fast LIKE-based matching
- Good for exact terms and phrases
- Use `"ALL"` to see everything

**Embedding Search:**
- Semantic understanding
- Finds related concepts even with different words
- Better for complex queries

**Embedding + Reranking:**
- Highest quality results
- AI-powered relevance scoring
- Best for finding the most relevant memories

## Tools

### `read`
Search and retrieve memories.

**Parameters:**
- `search` (required): Query string or "ALL" for everything
- `topr` (optional): Number of results (1-5, default: 3)

### `write`
Add or delete memories.

**Parameters:**
- `content` (required): Memory text (NEW) or search query (DELETE)
- `sTool` (required): "NEW" or "DELETE"
- `id` (optional): Specific ID to delete

## License

AGPL v3 - Open source for personal use. Commercial use requires either open-sourcing your application or a commercial license.
