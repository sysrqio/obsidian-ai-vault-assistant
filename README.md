# AI Vault Assistant for Obsidian

AI-powered assistant with 26 comprehensive vault tools for navigation, search, file management, and knowledge organization. Currently powered by Google Gemini with support for multiple AI models.

## Features

### 🤖 AI Integration
- Sidebar chat interface with streaming responses
- OAuth or API key authentication
- Model selection (Gemini Pro, Flash, Flash Lite) with automatic fallback
- Multi-turn conversations with full context retention
- Support for future AI model integrations

### 🔧 Comprehensive Tool System (26 Tools)

**Core File Operations (5)**
1. **read_file** - Read file contents
2. **list_files** - List vault files
3. **read_many_files** - Read multiple files with glob patterns
4. **write_file** - Create/modify files (auto-sanitizes filenames)
5. **web_fetch** - Fetch web content with redirect support

**Web & Search (1)**
6. **google_web_search** - Web search with grounded citations (superscript format)

**Memory Management (2)**
7. **save_memory** - Persistent memory storage
8. **delete_memory** - Memory cleanup and correction

**Vault Navigation (4)**
9. **get_active_file** - Current file information
10. **open_file** - Open files in current or new pane
11. **search_vault** - Full-text search (Omnisearch integration when available)
12. **get_recent_files** - Recently modified files

**Links & Graph (3)**
13. **get_backlinks** - Incoming links
14. **get_outgoing_links** - Outgoing links
15. **get_graph_neighbors** - Connected notes

**File Management (4)**
16. **rename_file** - Rename with auto-backlink updates
17. **create_folder** - Create folders recursively
18. **move_file** - Organize files into folders
19. **delete_file** - Safe deletion (trash or permanent)

**Metadata & Organization (3)**
20. **get_file_metadata** - Comprehensive file info
21. **update_frontmatter** - YAML metadata management
22. **get_tags** - Tag discovery

**Workflows & Templates (2)**
23. **get_daily_note** - Daily notes integration
24. **create_from_template** - Template-based file creation

**Workspace Management (2)**
25. **get_workspace_layout** - View open panes
26. **create_pane** - Multi-pane workflows

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

1. Copy this folder to `.obsidian/plugins/gemini-assistant/`
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile
4. Enable the plugin in Obsidian settings

## Configuration

### Authentication

**Option 1: API Key**
1. Get an API key from https://aistudio.google.com/apikey
2. Enter in plugin settings
3. Start chatting!

**Option 2: OAuth (Recommended)**
1. Toggle "Use OAuth" in settings
2. Click "Authenticate"
3. Login with your Google account
4. Tokens are securely stored

### Tool Permissions

Configure each tool's permission level:
- **Ask each time** - Show confirmation modal
- **Always allow** - Auto-execute without confirmation
- **Never allow** - Reject all requests

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

## License

MIT
