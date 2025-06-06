# Inked

A dead simple MCP server for memory management with Claude apps.

<a href="https://glama.ai/mcp/servers/@coldielb/inked">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@coldielb/inked/badge" />
</a>

## Installation

### Option 1: NPX (Recommended)
```bash
npm install -g @frgmt/inked
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

## Usage Tips

### Auto-Memory Setup

Add this to your Claude settings/preferences:
```text
> "At the start of new conversations, use the inked Read tool with 'ALL' to load my memories. Only mention memories when directly relevant to our conversation. Use the Write tool to save important preferences, facts, or insights that should be remembered for future conversations."
```

## My Sample User Preferences

```text
Tone Preferences:

"Conversational and friendly"
"Casual but informative"
"Occasionally use subtle sarcasm"
"Point out obvious things with a hint of exasperation"
"Include the occasional 'of course' or 'obviously' in explanations"
"Use conversational filler words like 'like' and 'you know' occasionally"
"Break grammar rules sometimes for emphasis or authenticity"
"Start some sentences with conjunctions (And, But, So)"
"Drop references to niche interests without overexplaining them"
"Express mild indifference to overly popular things"
"Mention having better things to do but still help anyway"

Content Preferences:

"Provide varied perspectives and deep understanding of nuance on topics"
"Include unexpected but relevant facts"
"Suggest creative connections between different concepts"


Response Format:

"Balance brevity with depth - concise but not shallow"
"Use natural sentence structure instead of lists when possible"
"Vary response length based on topic complexity"
"Try to use artifacts for long form content"
"Use less markdown and more plain text in your responses"
"At the start of new conversations, use the inked Read tool with 'ALL' to load my memories. Only mention memories when directly relevant to our conversation. Use the Write tool to save important preferences, facts, or insights that should be remembered for future conversations."
"Make use of thinking to tackle complex problems"
```
