import { Vault } from 'obsidian';
import { MCPServerConfig } from '../types/mcp-types';
import { Logger } from '../utils/logger';

export interface MCPConfig {
  servers: Record<string, MCPServerConfig>;
  version: string;
  lastUpdated: number;
}

export class MCPConfigManager {
  private vault: Vault;
  private configPath: string = '.obsidian/plugins/gemini-assistant/mcp.json';
  private config: MCPConfig | null = null;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  /**
   * Load MCP configuration from file
   */
  async loadConfig(): Promise<MCPConfig> {
    try {
      if (await this.vault.adapter.exists(this.configPath)) {
        const content = await this.vault.adapter.read(this.configPath);
        this.config = JSON.parse(content);
        Logger.debug('MCP Config', `Loaded configuration with ${Object.keys(this.config?.servers || {}).length} servers`);
        return this.config!;
      } else {
        // Create default config if file doesn't exist
        this.config = this.createDefaultConfig();
        await this.saveConfig();
        Logger.debug('MCP Config', 'Created default MCP configuration');
        return this.config!;
      }
    } catch (error) {
      Logger.error('MCP Config', 'Failed to load MCP configuration:', error);
      this.config = this.createDefaultConfig();
      return this.config!;
    }
  }

  /**
   * Save MCP configuration to file
   */
  async saveConfig(): Promise<void> {
    if (!this.config) {
      Logger.warn('MCP Config', 'No configuration to save');
      return;
    }

    try {
      // Ensure directory exists
      const dirPath = '.obsidian/plugins/gemini-assistant';
      if (!(await this.vault.adapter.exists(dirPath))) {
        await this.vault.adapter.mkdir(dirPath);
      }

      // Update timestamp
      this.config.lastUpdated = Date.now();

      // Save to file
      const content = JSON.stringify(this.config, null, 2);
      await this.vault.adapter.write(this.configPath, content);
      
      Logger.debug('MCP Config', `Saved configuration with ${Object.keys(this.config.servers).length} servers`);
    } catch (error) {
      Logger.error('MCP Config', 'Failed to save MCP configuration:', error);
      throw error;
    }
  }

  /**
   * Get all MCP servers
   */
  getServers(): Record<string, MCPServerConfig> {
    return this.config?.servers || {};
  }

  /**
   * Get a specific MCP server
   */
  getServer(serverName: string): MCPServerConfig | undefined {
    return this.config?.servers[serverName];
  }

  /**
   * Add or update an MCP server
   */
  async setServer(serverName: string, config: MCPServerConfig): Promise<void> {
    if (!this.config) {
      this.config = this.createDefaultConfig();
    }

    this.config.servers[serverName] = config;
    await this.saveConfig();
    Logger.debug('MCP Config', `Updated server: ${serverName}`);
  }

  /**
   * Remove an MCP server
   */
  async removeServer(serverName: string): Promise<void> {
    if (!this.config) {
      return;
    }

    delete this.config.servers[serverName];
    await this.saveConfig();
    Logger.debug('MCP Config', `Removed server: ${serverName}`);
  }

  /**
   * Get server count
   */
  getServerCount(): number {
    return Object.keys(this.config?.servers || {}).length;
  }

  /**
   * Check if server exists
   */
  hasServer(serverName: string): boolean {
    return serverName in (this.config?.servers || {});
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get configuration metadata
   */
  getConfigInfo(): { version: string; lastUpdated: number; serverCount: number } | null {
    if (!this.config) {
      return null;
    }

    return {
      version: this.config.version,
      lastUpdated: this.config.lastUpdated,
      serverCount: Object.keys(this.config.servers).length
    };
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): MCPConfig {
    return {
      servers: {},
      version: '1.0.0',
      lastUpdated: Date.now()
    };
  }

  /**
   * Export configuration (for backup/sharing)
   */
  async exportConfig(): Promise<string> {
    if (!this.config) {
      await this.loadConfig();
    }
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration (from backup/sharing)
   */
  async importConfig(configJson: string): Promise<void> {
    try {
      const importedConfig = JSON.parse(configJson) as MCPConfig;
      
      // Validate the imported config
      if (!importedConfig.servers || typeof importedConfig.servers !== 'object') {
        throw new Error('Invalid configuration format');
      }

      this.config = {
        ...importedConfig,
        version: '1.0.0', // Always use current version
        lastUpdated: Date.now()
      };

      await this.saveConfig();
      Logger.info('MCP Config', 'Configuration imported successfully');
    } catch (error) {
      Logger.error('MCP Config', 'Failed to import configuration:', error);
      throw new Error('Invalid configuration format');
    }
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(): Promise<void> {
    this.config = this.createDefaultConfig();
    await this.saveConfig();
    Logger.info('MCP Config', 'Configuration reset to defaults');
  }

}
