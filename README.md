# AI Vault Assistant for Obsidian

**Like [gemini-cli](https://github.com/google-gemini/gemini-cli) for Obsidian** — an AI-powered assistant with 27+ comprehensive vault tools for navigation, search, file management, and knowledge organization. Features **Model Context Protocol (MCP) support** for extending capabilities with external tools and services. Currently powered by Google Gemini with support for multiple AI models. **Available on Desktop and Mobile**.

## Features

### 🤖 AI Integration
- Sidebar chat interface with streaming responses
- OAuth or API key authentication
- Model selection (Gemini Pro, Flash, Flash Lite) with automatic fallback
- Multi-turn conversations with full context retention
- Support for future AI model integrations

### 🔧 Comprehensive Tool System (27+ Tools)

#### **Core File Operations (6)**
- **read_file** - Read file contents
- **list_files** - List vault files  
- **read_many_files** - Read multiple files with glob patterns
- **write_file** - Create/modify files (auto-sanitizes filenames)
- **edit_file** - Make semantic, context-aware edits (add to lists, insert at sections, replace patterns)
- **web_fetch** - Fetch web content with redirect support

#### **Web & Search (1)**
- **google_web_search** - Web search with grounded citations (superscript format)

#### **Memory Management (2)**
- **save_memory** - Persistent memory storage
- **delete_memory** - Memory cleanup and correction

#### **Vault Navigation (4)**
- **get_active_file** - Current file information
- **open_file** - Open files in current or new pane
- **search_vault** - Full-text search (Omnisearch integration when available)
- **get_recent_files** - Recently modified files

#### **Links & Graph (3)**
- **get_backlinks** - Incoming links
- **get_outgoing_links** - Outgoing links
- **get_graph_neighbors** - Connected notes

#### **File Management (4)**
- **rename_file** - Rename with auto-backlink updates
- **create_folder** - Create folders recursively
- **move_file** - Organize files into folders
- **delete_file** - Safe deletion (trash or permanent)

#### **Metadata & Organization (3)**
- **get_file_metadata** - Comprehensive file info
- **update_frontmatter** - YAML metadata management
- **get_tags** - Tag discovery

#### **Workflows & Templates (2)**
- **get_daily_note** - Daily notes integration
- **create_from_template** - Template-based file creation

#### **Workspace Management (2)**
- **get_workspace_layout** - View open panes
- **create_pane** - Multi-pane workflows

### 🔌 Model Context Protocol (MCP) Support

**Extend your AI assistant with external tools and services!**

- **Multiple Transport Types**: Stdio, Server-Sent Events (SSE), and HTTP
- **OAuth Authentication**: Full OAuth 2.0 support for secure remote MCP servers
- **User-Friendly Configuration**: GUI with status indicators (🟢 connected, 🟡 connecting, 🔴 disconnected)
- **Tool Discovery**: Automatic discovery of available tools and prompts from MCP servers
- **Integrated Permissions**: MCP tools use the same permission system as built-in tools
- **Dedicated Configuration**: Separate `mcp.json` file for MCP server settings

#### **MCP Server Types**
- **Local Tools**: Run local scripts and applications via stdio transport
- **Remote APIs**: Connect to web services via HTTP/SSE transport
- **Custom Integrations**: Build your own MCP servers for specialized workflows

#### **Example MCP Servers**
- **GitHub**: Repository management and issue tracking
- **Database Tools**: Query and manage databases
- **Custom APIs**: Connect to any REST API or service
- **Local Scripts**: Run custom tools and utilities

### 🧠 Advanced Memory System
- Persistent memory across sessions with DataAdapter
- Memory management UI in settings (view/edit/delete)
- `/memories` command for quick access
- Automatic context injection
- Category-based organization

### 🔒 Security & Permissions
- Granular tool permissions (ask/always/never)
- User confirmation for sensitive operations
- "Remember my choice" functionality
- Auto-accept read-only operations option

### 🎨 User Interface
- Clean, modern chat interface
- Auto-scrolling message history
- Tool execution status display
- Color-coded messages (user/assistant/system/error)

## Installation

### Desktop
1. Copy this folder to `.obsidian/plugins/gemini-assistant/`
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile
4. Enable the plugin in Obsidian settings

### Mobile
1. Install the plugin on desktop first (follow desktop installation steps)
2. Sync your vault to mobile (via Obsidian Sync or manual sync)
3. Enable the plugin in mobile Obsidian settings
4. The plugin works on both iOS and Android

## Configuration

### Authentication

**Option 1: API Key**
1. Get an API key from https://aistudio.google.com/apikey
2. Enter in plugin settings
3. Start chatting!

**Option 2: OAuth (Recommended - Like gemini-cli)**
1. Get OAuth credentials from gemini-cli source:
   - Visit: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/oauth2.ts
   - Copy `OAUTH_CLIENT_ID` constant value
   - Copy `OAUTH_CLIENT_SECRET` constant value
2. Toggle "Use OAuth" in settings
3. Paste the Client ID and Client Secret into the settings fields
4. Click "Authenticate" button
5. Login with your Google account in the browser
6. Tokens are automatically saved and refreshed

### Tool Permissions

Configure each tool's permission level:
- **Ask each time** - Show confirmation modal
- **Always allow** - Auto-execute without confirmation
- **Never allow** - Reject all requests

### MCP Configuration

**Enable MCP Support**
1. Go to plugin settings → MCP (Model Context Protocol)
2. Toggle "Enable MCP Support"
3. Click "Configure MCP Servers" to open the MCP settings

**Add MCP Server**
1. Click "Add Server" in MCP settings
2. Configure server details:
   - **Name**: Unique identifier for the server
   - **Transport**: Choose stdio, SSE, or HTTP
   - **Connection Details**: Command/URL based on transport type
   - **OAuth** (if needed): Configure authentication for remote servers
3. Save configuration
4. Server will automatically connect and discover available tools

**MCP Server Examples**

*Stdio Transport (Local Scripts)*:
```json
{
  "name": "my-script",
  "command": "node",
  "args": ["/path/to/script.js"],
  "transport": "stdio"
}
```

*HTTP Transport (Remote API)*:
```json
{
  "name": "api-server", 
  "url": "https://api.example.com/mcp",
  "transport": "http",
  "oauth": {
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret"
  }
}
```

## Usage

### Chat Commands
- Type naturally to interact with Gemini
- `/tools` - Show available tools and examples
- Clear Chat button - Reset conversation

### Memory Examples
- "Remember that my preferred language is Python"
- "Save that the project name is 'my-app'"
- Memories persist across sessions

### File Operations
- "List all markdown files"
- "Read all TypeScript files in src/"
- "Summarize my README file"

### Web Operations
- "Search for latest AI developments"
- "Summarize https://example.com/article"

### MCP Tool Usage
- "Search for Python projects on GitHub" (using GitHub MCP)
- "Query my database for user statistics" (using Database MCP)
- "Run my custom analysis script" (using Local Script MCP)
- MCP tools integrate seamlessly with built-in tools
- Use natural language - the AI will choose the appropriate MCP tool

## License

MIT
