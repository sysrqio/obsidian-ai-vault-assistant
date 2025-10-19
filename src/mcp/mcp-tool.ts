import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CallableTool } from '@google/genai';

export interface ToolConfirmationResult {
  confirmed: boolean;
  trustTool?: boolean;
  trustServer?: boolean;
}

export class DiscoveredMCPTool {
  public readonly name: string;
  public readonly description: string;
  public readonly parameterSchema: any;
  public readonly serverName: string;
  public readonly trusted: boolean;

  constructor(
    tool: Tool,
    serverName: string,
    trusted: boolean = false
  ) {
    this.name = tool.name;
    this.description = tool.description || '';
    this.parameterSchema = tool.inputSchema || {};
    this.serverName = serverName;
    this.trusted = trusted;
  }

  /**
   * Convert to Gemini Tool format for the API
   */
  toGeminiTool(): any {
    return {
      functionDeclarations: [{
        name: this.name,
        description: this.description,
        parameters: this.parameterSchema as any,
      }]
    };
  }


  /**
   * Execute the tool with the given parameters
   */
  async execute(parameters: any, client: any): Promise<any> {
    if (!client) {
      throw new Error('MCP client not available');
    }

    try {
      // Use the MCP SDK's callTool method
      const result = await client.client.callTool({
        name: this.name,
        arguments: parameters,
      });

      return this.processResponse(result);
    } catch (error) {
      console.error(`Error executing tool ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Process the response from the MCP server
   */
  private processResponse(response: any): string {
    if (!response.content) {
      return JSON.stringify(response);
    }

    // Handle rich content (text, images, etc.)
    const processedContent = response.content.map((item: any) => {
      if (item.type === 'text') {
        return item.text;
      } else if (item.type === 'image') {
        return `[Image: ${item.mimeType || 'unknown type'}]`;
      } else {
        return JSON.stringify(item);
      }
    });

    // Return as a single string for the Gemini client
    return processedContent.join('\n');
  }

  /**
   * Check if this tool requires confirmation
   */
  requiresConfirmation(): boolean {
    return !this.trusted;
  }

  /**
   * Get a human-readable description of what this tool does
   */
  getDescription(): string {
    return `${this.description} (from ${this.serverName})`;
  }
}

export class DiscoveredMCPToolInvocation {
  private tool: DiscoveredMCPTool;
  private parameters: any;
  private client: any;

  constructor(tool: DiscoveredMCPTool, parameters: any, client: any) {
    this.tool = tool;
    this.parameters = parameters;
    this.client = client;
  }

  /**
   * Execute the tool invocation
   */
  async execute(): Promise<any> {
    return await this.tool.execute(this.parameters, this.client);
  }

  /**
   * Get the tool name
   */
  getToolName(): string {
    return this.tool.name;
  }

  /**
   * Get the server name
   */
  getServerName(): string {
    return this.tool.serverName;
  }

  /**
   * Get the parameters
   */
  getParameters(): any {
    return this.parameters;
  }

  /**
   * Check if this invocation requires confirmation
   */
  requiresConfirmation(): boolean {
    return this.tool.requiresConfirmation();
  }

  /**
   * Get a human-readable description of this invocation
   */
  getDescription(): string {
    const paramStr = Object.keys(this.parameters).length > 0 
      ? ` with parameters: ${JSON.stringify(this.parameters, null, 2)}`
      : '';
    return `${this.tool.getDescription()}${paramStr}`;
  }
}