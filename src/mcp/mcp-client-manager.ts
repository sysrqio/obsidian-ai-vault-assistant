import { MCPServerConfig, MCPServerStatus, MCPDiscoveryState } from '../types/mcp-types';
import { McpClient, StatusChangeListener, WorkspaceContext } from './mcp-client';
import { DiscoveredMCPTool } from './mcp-tool';

export interface ToolRegistry {
  registerTool(name: string, tool: any): void;
  getTool(name: string): any;
  getAllTools(): Map<string, any>;
}

export interface PromptRegistry {
  registerPrompt(name: string, prompt: any): void;
  getPrompt(name: string): any;
  getAllPrompts(): Map<string, any>;
}

export class McpClientManager implements StatusChangeListener {
  private clients: Map<string, McpClient> = new Map();
  private toolRegistry: ToolRegistry;
  private promptRegistry: PromptRegistry;
  private workspaceContext: WorkspaceContext;
  private debug: boolean;

  constructor(
    private servers: Record<string, MCPServerConfig>,
    toolRegistry: ToolRegistry,
    promptRegistry: PromptRegistry,
    workspaceContext: WorkspaceContext,
    debug: boolean = false
  ) {
    this.toolRegistry = toolRegistry;
    this.promptRegistry = promptRegistry;
    this.workspaceContext = workspaceContext;
    this.debug = debug;
  }

  /**
   * Get a specific MCP client
   */
  getClient(serverName: string): McpClient | undefined {
    return this.clients.get(serverName);
  }

  /**
   * Get all MCP clients
   */
  getAllClients(): Map<string, McpClient> {
    return this.clients;
  }

  /**
   * Get the status of a specific server
   */
  getServerStatus(serverName: string): MCPServerStatus {
    const client = this.clients.get(serverName);
    return client ? client.getStatus() : MCPServerStatus.DISCONNECTED;
  }

  /**
   * Get the discovery state of a specific server
   */
  getServerDiscoveryState(serverName: string): MCPDiscoveryState {
    const client = this.clients.get(serverName);
    return client ? client.getDiscoveryState() : MCPDiscoveryState.NOT_STARTED;
  }

  /**
   * Get all discovered tools from all servers
   */
  getAllTools(): Map<string, DiscoveredMCPTool> {
    const allTools = new Map<string, DiscoveredMCPTool>();
    
    for (const [serverName, client] of this.clients) {
      const serverTools = client.getTools();
      for (const [toolName, tool] of serverTools) {
        allTools.set(`${serverName}:${toolName}`, tool);
      }
    }
    
    return allTools;
  }

  /**
   * Get all discovered prompts from all servers
   */
  getAllPrompts(): Map<string, any> {
    const allPrompts = new Map<string, any>();
    
    for (const [serverName, client] of this.clients) {
      const serverPrompts = client.getPrompts();
      for (const [promptName, prompt] of serverPrompts) {
        allPrompts.set(`${serverName}:${promptName}`, prompt);
      }
    }
    
    return allPrompts;
  }

  /**
   * Discover all MCP servers
   */
  async discoverAll(): Promise<void> {
    if (this.debug) {
      console.log(`Discovering ${Object.keys(this.servers).length} MCP servers...`);
    }

    for (const [serverName, config] of Object.entries(this.servers)) {
      try {
        await this.discoverServer(serverName, config);
      } catch (error) {
        console.error(`Failed to discover server ${serverName}:`, error);
      }
    }
  }

  /**
   * Discover a specific MCP server
   */
  async discoverServer(serverName: string, config: MCPServerConfig): Promise<void> {
    try {
      if (this.debug) {
        console.log(`Discovering server: ${serverName}`);
      }

      // Create and connect to the server
      const client = new McpClient(serverName, config, this.workspaceContext, this.debug);
      client.addStatusChangeListener(this);
      
      await client.connect();
      await client.discoverAll();
      
      // Register tools and prompts
      this.registerServerTools(serverName, client);
      this.registerServerPrompts(serverName, client);
      
      // Store the client
      this.clients.set(serverName, client);
      
      if (this.debug) {
        console.log(`Successfully discovered server: ${serverName}`);
      }
    } catch (error) {
      console.error(`Failed to discover server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Register tools from a specific server
   */
  private registerServerTools(serverName: string, client: McpClient): void {
    const tools = client.getTools();
    
    for (const [toolName, tool] of tools) {
      const fullToolName = `${serverName}:${toolName}`;
      this.toolRegistry.registerTool(fullToolName, tool);
      
      if (this.debug) {
        console.log(`Registered tool: ${fullToolName}`);
      }
    }
  }

  /**
   * Register prompts from a specific server
   */
  private registerServerPrompts(serverName: string, client: McpClient): void {
    const prompts = client.getPrompts();
    
    for (const [promptName, prompt] of prompts) {
      const fullPromptName = `${serverName}:${promptName}`;
      this.promptRegistry.registerPrompt(fullPromptName, prompt);
      
      if (this.debug) {
        console.log(`Registered prompt: ${fullPromptName}`);
      }
    }
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverName);
      
      if (this.debug) {
        console.log(`Disconnected from server: ${serverName}`);
      }
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    if (this.debug) {
      console.log('Disconnecting from all MCP servers...');
    }

    const disconnectPromises = Array.from(this.clients.keys()).map(serverName => 
      this.disconnectServer(serverName)
    );
    
    await Promise.all(disconnectPromises);
    
    if (this.debug) {
      console.log('Disconnected from all MCP servers');
    }
  }

  /**
   * Update server configuration
   */
  async updateServerConfig(serverName: string, config: MCPServerConfig): Promise<void> {
    // Disconnect from the old server if it exists
    await this.disconnectServer(serverName);
    
    // Update the configuration
    this.servers[serverName] = config;
    
    // Reconnect with the new configuration
    await this.discoverServer(serverName, config);
  }

  /**
   * Remove a server
   */
  async removeServer(serverName: string): Promise<void> {
    await this.disconnectServer(serverName);
    delete this.servers[serverName];
  }

  /**
   * Add a new server
   */
  async addServer(serverName: string, config: MCPServerConfig): Promise<void> {
    this.servers[serverName] = config;
    await this.discoverServer(serverName, config);
  }

  /**
   * Handle status changes from MCP clients
   */
  onStatusChange(serverName: string, status: MCPServerStatus): void {
    if (this.debug) {
      console.log(`Server ${serverName} status changed to: ${status}`);
    }
    
    // Handle status changes (e.g., update UI, retry connection, etc.)
    if (status === MCPServerStatus.DISCONNECTED) {
      // Optionally attempt to reconnect
      // this.reconnectServer(serverName);
    }
  }

  /**
   * Get server statistics
   */
  getServerStats(): { total: number; connected: number; disconnected: number; discovering: number } {
    let connected = 0;
    let disconnected = 0;
    let discovering = 0;
    
    for (const client of this.clients.values()) {
      const status = client.getStatus();
      switch (status) {
        case MCPServerStatus.CONNECTED:
          connected++;
          break;
        case MCPServerStatus.DISCONNECTED:
          disconnected++;
          break;
        case MCPServerStatus.CONNECTING:
        case MCPServerStatus.DISCONNECTING:
          discovering++;
          break;
      }
    }
    
    return {
      total: this.clients.size,
      connected,
      disconnected,
      discovering,
    };
  }
}