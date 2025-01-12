# Inked

Inked is a powerful drafting tool for novelists, report writers, and anyone working with long-form content. It provides an intuitive interface for drafting, revising, and finalizing written content through Claude's assistance.

## Core Features

### Quilling - Draft Management
- Create and manage content drafts through natural conversation with Claude
- Automatic draft versioning with unique IDs
- Persistent storage in PostgreSQL or SQLite database
- Flexible draft organization and retrieval

### Inking - Content Generation
- Transform drafts into polished long-form content
- Chapter-based organization for books and lengthy documents
- Customizable draft versioning (e.g., ch01-d1 for Chapter 1 Draft 1)
- Multiple output format support:
  - Markdown (.md)
  - Plain text (.txt)
  - Microsoft Word (.docx)
  - Apple Pages (.pages)

## Usage

### Draft Creation
```
"Hey Claude, I want to write a report about my findings in the annual sales data."
```
Claude will create a new draft with a unique ID and help you organize your thoughts.

### Chapter Management
```
"Let's create chapter 1 draft 1 with ID ch01-d1"
```
Drafts can be organized by chapters with versioning for iterative refinement.

### Content Generation
```
"Please ink my drafts into a markdown file"
```
Claude will compile your drafts into your chosen format, ready for further editing.

## Installation

```bash
# Clone the repository
git clone https://github.com/frgmt0/mcp-inked.git
cd mcp-inked

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `config.json` file in the project root to customize settings:

```json
{
  "database": {
    "type": "sqlite",  // or "postgres"
    "connection": {
      "filename": "inked.db",  // for SQLite
      // For PostgreSQL:
      // "host": "localhost",
      // "port": 5432,
      // "database": "inked",
      // "username": "user",
      // "password": "pass"
    }
  },
  "defaultFormat": "md",
  "storage": {
    "draftsPath": "./drafts",
    "outputPath": "./output"
  }
}
```

### Database Options

1. SQLite (default)
   - Lightweight, file-based database
   - Perfect for single-user setups
   - No additional setup required

2. PostgreSQL
   - Robust, multi-user support
   - Better for larger projects
   - Requires PostgreSQL server

### Output Formats

1. Markdown (.md)
   - Default format
   - Perfect for version control
   - Supports basic formatting
   - Includes YAML frontmatter

2. Plain Text (.txt)
   - Simple, universal format
   - No formatting overhead
   - Easy to process

3. Microsoft Word (.docx) - Coming Soon
   - Rich text formatting
   - Professional document layout
   - Template support

4. Apple Pages (.pages) - Coming Soon
   - Native macOS support
   - Rich formatting options
   - Template integration

## Usage Examples

### Creating a Draft

```typescript
// Create a new chapter draft
await use_mcp_tool({
  server_name: "inked",
  tool_name: "quill",
  arguments: {
    content: "# Chapter 1\n\nIt was a dark and stormy night...",
    type: "chapter",
    custom_id: "ch01-d1",
    parent_id: "book-1"
  }
});
```

### Generating Output

```typescript
// Compile drafts into a markdown file
await use_mcp_tool({
  server_name: "inked",
  tool_name: "ink",
  arguments: {
    draft_ids: ["ch01-d1", "ch02-d1"],
    format: "md",
    output_path: "./output/novel.md"
  }
});
```

### Listing Drafts

```typescript
// List all chapter drafts
await use_mcp_tool({
  server_name: "inked",
  tool_name: "list_drafts",
  arguments: {
    type: "chapter"
  }
});
```

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Contributing

Official Contributing and Development Templates Coming soon!
