import { EventEmitter } from 'events';

export interface Tool {
  name: string;
  description: string;
  parameters?: any;
  execute: (parameters: any) => Promise<any>;
}

export interface ToolRegistryEntry {
  name: string;
  tool: Tool;
}

export class ToolRegistry extends EventEmitter {
  private tools: Map<string, ToolRegistryEntry> = new Map();

  /**
   * Register a tool with the registry
   */
  public registerTool(name: string, tool: Tool): void;
  public registerTool(tool: any): void;
  public registerTool(nameOrTool: string | any, tool?: Tool): void {
    if (typeof nameOrTool === 'string' && tool) {
      // Two-parameter version: registerTool(name, tool)
      this.tools.set(nameOrTool, {
        name: nameOrTool,
        tool,
      });
      this.emit('tool-registered', nameOrTool, tool);
    } else {
      // Single-parameter version: registerTool(tool) - interface compatibility
      const toolObj = nameOrTool;
      if (toolObj.name) {
        this.tools.set(toolObj.name, {
          name: toolObj.name,
          tool: toolObj,
        });
        this.emit('tool-registered', toolObj.name, toolObj);
      }
    }
  }

  /**
   * Get a tool by name
   */
  public getTool(name: string): Tool | undefined {
    const entry = this.tools.get(name);
    return entry ? entry.tool : undefined;
  }

  /**
   * Get all tools
   */
  public getAllTools(): Map<string, Tool> {
    const result = new Map<string, Tool>();
    for (const [name, entry] of this.tools) {
      result.set(name, entry.tool);
    }
    return result;
  }

  /**
   * Check if a tool is registered
   */
  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool
   */
  public unregisterTool(name: string): void {
    if (this.tools.has(name)) {
      const entry = this.tools.get(name);
      this.tools.delete(name);
      this.emit('tool-unregistered', name, entry?.tool);
    }
  }

  /**
   * Get tool count
   */
  public getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  public clearTools(): void {
    this.tools.clear();
    this.emit('tools-cleared');
  }

  /**
   * Get tool names
   */
  public getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}