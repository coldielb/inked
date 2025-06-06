# Inked

A dead simple MCP server for memory management with Claude apps.


## Installation

### Option 1: NPX (Recommended)
```bash
npx install -g @frgmt/inked
npx @frgmt/inked
```

### Option 2: Local Development
```bash
git clone https://github.com/coldielb/inked.git
cd inked
npm install
npm run build
```

## Usage

Add to your MCP server configuration:

### With npx:
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

### Local installation:
```json
{
  "mcpServers": {
    "inked": {
      "command": "node",
      "args": ["/path/to/inked/dist/index.js"]
    }
  }
}
```
