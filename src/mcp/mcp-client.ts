import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { CallableTool, Tool } from '@google/genai';
import { MCPServerConfig, MCPServerStatus, MCPDiscoveryState, AuthProviderType, MCPOAuthConfig } from '../types/mcp-types';
import { MCPOAuthProvider } from './oauth-provider';
import { DiscoveredMCPTool } from './mcp-tool';

export interface StatusChangeListener {
  onStatusChange(serverName: string, status: MCPServerStatus): void;
}

export interface WorkspaceContext {
  getDirectories(): string[];
  onDirectoriesChanged(callback: () => void): void;
}

export interface Config {
  // Placeholder for now - we'll implement this properly later
}

export class McpClient {
  private client: Client | null = null;
  private transport: any = null;
  private status: MCPServerStatus = MCPServerStatus.DISCONNECTED;
  private discoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;
  private tools: Map<string, DiscoveredMCPTool> = new Map();
  private prompts: Map<string, any> = new Map();
  private statusChangeListeners: StatusChangeListener[] = [];
  private oauthProvider: MCPOAuthProvider | null = null;

  constructor(
    private serverName: string,
    private config: MCPServerConfig,
    private workspaceContext: WorkspaceContext,
    private debug: boolean = false
  ) {}

  getStatus(): MCPServerStatus {
    return this.status;
  }

  getDiscoveryState(): MCPDiscoveryState {
    return this.discoveryState;
  }

  getTools(): Map<string, DiscoveredMCPTool> {
    return this.tools;
  }

  getPrompts(): Map<string, any> {
    return this.prompts;
  }

  addStatusChangeListener(listener: StatusChangeListener): void {
    this.statusChangeListeners.push(listener);
  }

  removeStatusChangeListener(listener: StatusChangeListener): void {
    const index = this.statusChangeListeners.indexOf(listener);
    if (index > -1) {
      this.statusChangeListeners.splice(index, 1);
    }
  }

  private setStatus(status: MCPServerStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusChangeListeners.forEach(listener => {
        listener.onStatusChange(this.serverName, status);
      });
    }
  }

  private setDiscoveryState(state: MCPDiscoveryState): void {
    this.discoveryState = state;
  }

  async connect(): Promise<void> {
    if (this.status === MCPServerStatus.CONNECTED || this.status === MCPServerStatus.CONNECTING) {
      return;
    }

    this.setStatus(MCPServerStatus.CONNECTING);

    try {
      // Initialize OAuth provider if needed
      if (this.config.oauth && this.config.authProviderType === AuthProviderType.DYNAMIC_DISCOVERY) {
        this.oauthProvider = new MCPOAuthProvider(this.config.oauth);
        await this.oauthProvider.initialize();
      }

      // Create transport based on configuration
      this.transport = await this.createTransport();
      
      // Create MCP client
      this.client = new Client(
        {
          name: 'obsidian-gemini-assistant',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
          },
        }
      );

      // Connect the client
      await this.client.connect(this.transport);
      
      this.setStatus(MCPServerStatus.CONNECTED);
      
      if (this.debug) {
        console.log(`MCP client connected to ${this.serverName}`);
      }
    } catch (error) {
      this.setStatus(MCPServerStatus.DISCONNECTED);
      
      // Provide more helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('spawn') && error.message.includes('ENOENT')) {
          const enhancedError = new Error(
            `Failed to start MCP server "${this.serverName}": Command not found. ` +
            `This usually means the executable (${this.config.command}) is not available in the system PATH. ` +
            `Try using the full path to the executable (e.g., /opt/homebrew/bin/node). ` +
            `Original error: ${error.message}`
          );
          throw enhancedError;
        }
      }
      
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.status === MCPServerStatus.DISCONNECTED) {
      return;
    }

    this.setStatus(MCPServerStatus.DISCONNECTING);

    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
      }
      
      if (this.transport) {
        this.transport = null;
      }

      this.tools.clear();
      this.prompts.clear();
      this.setDiscoveryState(MCPDiscoveryState.NOT_STARTED);
      this.setStatus(MCPServerStatus.DISCONNECTED);
      
      if (this.debug) {
        console.log(`MCP client disconnected from ${this.serverName}`);
      }
    } catch (error) {
      console.error(`Error disconnecting from ${this.serverName}:`, error);
      this.setStatus(MCPServerStatus.DISCONNECTED);
    }
  }

  private async createTransport(): Promise<any> {
    if (this.config.command) {
      // Stdio transport
      let command = this.config.command;
      
      // Handle common Node.js executable issues
      if (command === 'node' || command === 'nodejs') {
        // Try to find the full path to node
        const possiblePaths = [
          '/opt/homebrew/bin/node',  // Homebrew on Apple Silicon
          '/usr/local/bin/node',     // Homebrew on Intel Mac
          '/usr/bin/node',           // System node
          'node'                     // Fallback to PATH
        ];
        
        // For now, use the most common path
        command = '/opt/homebrew/bin/node';
        
        if (this.debug) {
          console.log(`MCP Client: Using Node.js at ${command}`);
        }
      }
      
      if (this.debug) {
        console.log(`MCP Client: Creating stdio transport with command: ${command}`);
        console.log(`MCP Client: Args:`, this.config.args);
        console.log(`MCP Client: Env:`, this.config.env);
        console.log(`MCP Client: CWD:`, this.config.cwd);
      }
      
      return new StdioClientTransport({
        command: command,
        args: this.config.args || [],
        env: this.config.env || {},
        cwd: this.config.cwd,
      });
    } else if (this.config.url) {
      // SSE transport
      const headers: Record<string, string> = { ...this.config.headers };
      
      // Add OAuth token if available
      if (this.oauthProvider) {
        const token = await this.oauthProvider.getAccessToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      return new SSEClientTransport(new URL(this.config.url));
    } else if (this.config.httpUrl) {
      // HTTP transport (streamable)
      const headers: Record<string, string> = { ...this.config.headers };
      
      // Add OAuth token if available
      if (this.oauthProvider) {
        const token = await this.oauthProvider.getAccessToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      // For now, we'll use SSE transport for HTTP URLs
      // In a full implementation, we'd use a proper HTTP transport
      return new SSEClientTransport(new URL(this.config.httpUrl));
    } else {
      throw new Error('No transport configuration found');
    }
  }

  async discoverTools(): Promise<void> {
    if (!this.client || this.status !== MCPServerStatus.CONNECTED) {
      throw new Error('Client not connected');
    }

    this.setDiscoveryState(MCPDiscoveryState.IN_PROGRESS);

    try {
      const toolsResponse = await this.client.listTools();
      
      this.tools.clear();
      
      for (const tool of toolsResponse.tools) {
        // Apply include/exclude filters
        if (this.config.includeTools && !this.config.includeTools.includes(tool.name)) {
          continue;
        }
        if (this.config.excludeTools && this.config.excludeTools.includes(tool.name)) {
          continue;
        }

        const discoveredTool = new DiscoveredMCPTool(
          tool,
          this.serverName,
          this.config.trust || false
        );
        
        this.tools.set(tool.name, discoveredTool);
      }
      
      this.setDiscoveryState(MCPDiscoveryState.COMPLETED);
      
      if (this.debug) {
        console.log(`Discovered ${this.tools.size} tools from ${this.serverName}`);
      }
    } catch (error) {
      this.setDiscoveryState(MCPDiscoveryState.NOT_STARTED);
      throw error;
    }
  }

  async discoverPrompts(): Promise<void> {
    if (!this.client || this.status !== MCPServerStatus.CONNECTED) {
      throw new Error('Client not connected');
    }

    try {
      const promptsResponse = await this.client.listPrompts();
      
      this.prompts.clear();
      
      for (const prompt of promptsResponse.prompts) {
        this.prompts.set(prompt.name, prompt);
      }
      
      if (this.debug) {
        console.log(`Discovered ${this.prompts.size} prompts from ${this.serverName}`);
      }
    } catch (error) {
      // Handle "Method not found" gracefully - many MCP servers don't support prompts
      if (error instanceof Error && error.message.includes('-32601')) {
        if (this.debug) {
          console.log(`Server ${this.serverName} does not support prompts (Method not found)`);
        }
      } else {
        console.error(`Error discovering prompts from ${this.serverName}:`, error);
      }
    }
  }

  async discoverAll(): Promise<void> {
    await this.discoverTools();
    await this.discoverPrompts();
  }
}

export async function discoverMcpTools(
  servers: Record<string, MCPServerConfig>,
  workspaceContext: WorkspaceContext,
  debug: boolean = false
): Promise<Map<string, DiscoveredMCPTool>> {
  const allTools = new Map<string, DiscoveredMCPTool>();
  
  for (const [serverName, config] of Object.entries(servers)) {
    try {
      const client = new McpClient(serverName, config, workspaceContext, debug);
      await client.connect();
      await client.discoverAll();
      
      const serverTools = client.getTools();
      for (const [toolName, tool] of serverTools) {
        allTools.set(`${serverName}:${toolName}`, tool);
      }
      
      await client.disconnect();
    } catch (error) {
      console.error(`Failed to discover tools from ${serverName}:`, error);
    }
  }
  
  return allTools;
}

export async function connectToMcpServer(
  serverName: string,
  config: MCPServerConfig,
  workspaceContext: WorkspaceContext,
  debug: boolean = false
): Promise<McpClient> {
  const client = new McpClient(serverName, config, workspaceContext, debug);
  await client.connect();
  return client;
}