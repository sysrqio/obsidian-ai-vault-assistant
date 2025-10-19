import { App, Modal, Setting, Notice, TextComponent, DropdownComponent, TextAreaComponent } from 'obsidian';
import type GeminiPlugin from '../main';
import { MCPServerConfig, MCPServerStatus, MCPDiscoveryState, AuthProviderType } from '../types/mcp-types';

export class McpSettingsTab extends Modal {
  public plugin: GeminiPlugin;
  private servers: Record<string, MCPServerConfig> = {};

  constructor(app: App, plugin: GeminiPlugin) {
    super(app);
    this.plugin = plugin;
    this.loadServers();
  }

  private loadServers(): void {
    if (this.plugin.mcpConfigManager) {
      this.servers = { ...this.plugin.mcpConfigManager.getServers() };
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Reload servers from config manager
    this.loadServers();

    contentEl.createEl('h2', { text: 'MCP Server Configuration' });

    // Enable MCP Support toggle
    new Setting(contentEl)
      .setName('Enable MCP Support')
      .setDesc('Enable Model Context Protocol support to connect to external MCP servers')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableMCP || false)
        .onChange(async (value) => {
          this.plugin.settings.enableMCP = value;
          await this.plugin.saveSettings();
          this.onOpen(); // Refresh the modal
        }));

    if (!this.plugin.settings.enableMCP) {
      contentEl.createEl('p', { 
        text: 'Enable MCP support above to configure servers.',
        cls: 'setting-item-description'
      });
      return;
    }

    // MCP Discovery Status
    this.displayDiscoveryStatus(contentEl);

    // Server List
    this.displayServerList(contentEl);

    // Configuration Info
    if (this.plugin.mcpConfigManager) {
      const configInfo = this.plugin.mcpConfigManager.getConfigInfo();
      const configPath = this.plugin.mcpConfigManager.getConfigPath();
      
      new Setting(contentEl)
        .setName('Configuration File')
        .setDesc(`MCP configuration is stored in: ${configPath}`)
        .addText(text => text
          .setValue(configPath)
          .setDisabled(true));

      if (configInfo) {
        new Setting(contentEl)
          .setName('Configuration Info')
          .setDesc(`Version: ${configInfo.version} | Servers: ${configInfo.serverCount} | Last Updated: ${new Date(configInfo.lastUpdated).toLocaleString()}`)
          .addButton(button => button
            .setButtonText('Export Config')
            .onClick(async () => {
              try {
                const configJson = await this.plugin.mcpConfigManager!.exportConfig();
                const blob = new Blob([configJson], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'mcp-config.json';
                a.click();
                URL.revokeObjectURL(url);
                new Notice('MCP configuration exported successfully');
              } catch (error) {
                new Notice('Failed to export configuration: ' + (error as Error).message);
              }
            }))
          .addButton(button => button
            .setButtonText('Reset Config')
            .setWarning()
            .onClick(async () => {
              if (confirm('Are you sure you want to reset the MCP configuration? This will remove all servers.')) {
                try {
                  await this.plugin.mcpConfigManager!.resetConfig();
                  this.loadServers();
                  this.onOpen(); // Refresh the modal
                  new Notice('MCP configuration reset successfully');
                } catch (error) {
                  new Notice('Failed to reset configuration: ' + (error as Error).message);
                }
              }
            }));
      }
    }

    // Add Server Button
    new Setting(contentEl)
      .setName('Add MCP Server')
      .setDesc('Add a new MCP server configuration')
      .addButton(button => button
        .setButtonText('Add Server')
        .setCta()
        .onClick(() => {
          this.showServerModal();
        }))
      .addButton(button => button
        .setButtonText('Refresh Status')
        .onClick(() => {
          this.onOpen(); // Refresh the modal
        }));
  }

  private displayDiscoveryStatus(containerEl: HTMLElement): void {
    const statusEl = containerEl.createDiv({ cls: 'mcp-status-section' });
    statusEl.createEl('h3', { text: 'MCP Discovery Status' });

    // Overall status only
    const overallStatus = this.getOverallStatus();
    
    const statusSetting = new Setting(statusEl)
      .setName('Overall Status')
      .setDesc(`Discovery status: ${overallStatus}`)
      .addButton(button => button
        .setButtonText('Refresh')
        .onClick(() => {
          this.onOpen(); // Refresh the modal
        }));

    // Add status indicator to the setting name
    const statusIndicator = statusSetting.nameEl.createDiv({ cls: 'mcp-status-indicator' });
    statusIndicator.addClass(`mcp-status-${overallStatus}`);
    statusIndicator.setAttr('title', `Status: ${overallStatus}`);
  }

  private displayServerList(containerEl: HTMLElement): void {
    const serversEl = containerEl.createDiv({ cls: 'mcp-servers-section' });
    serversEl.createEl('h3', { text: 'Configured Servers' });

    if (Object.keys(this.servers).length === 0) {
      serversEl.createEl('p', { 
        text: 'No MCP servers configured. Click "Add Server" to get started.',
        cls: 'setting-item-description'
      });
      return;
    }

    for (const [serverName, config] of Object.entries(this.servers)) {
      const serverEl = serversEl.createDiv({ cls: 'mcp-server-item' });
      
      const serverStatus = this.getServerStatus(serverName);
      const serverSetting = new Setting(serverEl)
        .setName(serverName)
        .setDesc(`${config.description || 'No description'} - ${this.getTransportType(config)} - Status: ${serverStatus}`)
        .addButton(button => button
          .setButtonText('Edit')
          .onClick(() => {
            this.showServerModal(serverName, config);
          }))
        .addButton(button => button
          .setButtonText('Delete')
          .setWarning()
          .onClick(async () => {
            if (confirm(`Delete server "${serverName}"?`)) {
              if (this.plugin.mcpConfigManager) {
                await this.plugin.mcpConfigManager.removeServer(serverName);
                this.loadServers();
                
                // If MCP is enabled, disconnect the server from the client manager
                if (this.plugin.settings.enableMCP && this.plugin.mcpClientManager) {
                  try {
                    await this.plugin.mcpClientManager.disconnectAll();
                    await this.plugin.mcpClientManager.discoverAll();
                    new Notice(`✅ MCP server "${serverName}" removed and disconnected`);
                  } catch (error) {
                    console.error('Failed to disconnect MCP server:', error);
                    new Notice(`⚠️ MCP server "${serverName}" removed but disconnection failed`);
                  }
                }
                
                this.onOpen(); // Refresh the modal
              }
            }
          }));

      // Add status indicator to the setting name
      const statusIndicator = serverSetting.nameEl.createDiv({ cls: 'mcp-status-indicator' });
      statusIndicator.addClass(`mcp-status-${serverStatus}`);
      statusIndicator.setAttr('title', `Status: ${serverStatus}`);
    }
  }

  private getOverallStatus(): string {
    // Get status from MCP client manager
    if (!this.plugin.mcpClientManager) {
      console.log('MCP Settings: No MCP client manager available for overall status');
      return 'not_started';
    }
    
    const stats = this.plugin.mcpClientManager.getServerStats();
    console.log('MCP Settings: Server stats:', stats);
    
    if (stats.connected > 0) {
      return 'completed';
    } else if (stats.discovering > 0) {
      return 'in_progress';
    } else {
      return 'not_started';
    }
  }

  private getServerStatus(serverName: string): string {
    // Get status from MCP client manager
    if (!this.plugin.mcpClientManager) {
      console.log('MCP Settings: No MCP client manager available');
      return 'disconnected';
    }
    
    const status = this.plugin.mcpClientManager.getServerStatus(serverName);
    console.log(`MCP Settings: Server ${serverName} status: ${status}`);
    return status;
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'connected':
      case 'completed':
        return 'green';
      case 'connecting':
      case 'in_progress':
        return 'yellow';
      case 'disconnected':
      case 'not_started':
      default:
        return 'red';
    }
  }

  private getTransportType(config: MCPServerConfig): string {
    if (config.command) return 'Stdio';
    if (config.url) return 'SSE';
    if (config.httpUrl) return 'HTTP';
    return 'Unknown';
  }

  private showServerModal(serverName?: string, existingConfig?: MCPServerConfig): void {
    new McpServerModal(this.app, this, serverName, existingConfig).open();
  }

  public async updateServer(serverName: string, config: MCPServerConfig): Promise<void> {
    if (this.plugin.mcpConfigManager) {
      await this.plugin.mcpConfigManager.setServer(serverName, config);
      this.loadServers();
      
      // If MCP is enabled, reconnect the client manager to discover the new server
      if (this.plugin.settings.enableMCP && this.plugin.mcpClientManager) {
        try {
          await this.plugin.mcpClientManager.discoverAll();
          new Notice(`✅ MCP server "${serverName}" added and connected successfully`);
        } catch (error) {
          console.error('Failed to connect new MCP server:', error);
          new Notice(`⚠️ MCP server "${serverName}" added but connection failed. Try refreshing the status.`);
        }
      }
      
      this.onOpen(); // Refresh the modal
    }
  }
}

class McpServerModal extends Modal {
  private parent: McpSettingsTab;
  private serverName: string = '';
  private config: MCPServerConfig;
  private isEdit: boolean = false;

  constructor(app: App, parent: McpSettingsTab, serverName?: string, existingConfig?: MCPServerConfig) {
    super(app);
    this.parent = parent;
    this.isEdit = !!serverName && !!existingConfig;
    this.serverName = serverName || '';
    this.config = existingConfig || new MCPServerConfig();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: this.isEdit ? 'Edit MCP Server' : 'Add MCP Server' });

    // Server Name
    new Setting(contentEl)
      .setName('Server Name')
      .setDesc('Unique name for this MCP server')
      .addText(text => text
        .setPlaceholder('my-mcp-server')
        .setValue(this.serverName)
        .onChange(value => this.serverName = value));

    // Transport Type
    let transportType: 'stdio' | 'sse' | 'http' = 'stdio';
    if (this.config.url) transportType = 'sse';
    if (this.config.httpUrl) transportType = 'http';

    new Setting(contentEl)
      .setName('Transport Type')
      .setDesc('How to connect to the MCP server')
      .addDropdown(dropdown => dropdown
        .addOption('stdio', 'Stdio (Local Command)')
        .addOption('sse', 'SSE (Server-Sent Events)')
        .addOption('http', 'HTTP (Streamable)')
        .setValue(transportType)
        .onChange(value => {
          transportType = value as 'stdio' | 'sse' | 'http';
          this.updateTransportInputs(contentEl, transportType);
        }));

    // Transport-specific inputs
    this.updateTransportInputs(contentEl, transportType);

    // MCP Server Functions (if connected)
    if (this.isEdit && this.parent.plugin.mcpClientManager) {
      this.displayServerFunctions(contentEl);
    }

    // Common settings
    this.addCommonSettings(contentEl);

    // OAuth settings
    this.addOAuthSettings(contentEl);

    // Action buttons
    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('Cancel')
        .onClick(() => this.close()))
      .addButton(button => button
        .setButtonText(this.isEdit ? 'Update' : 'Add')
        .setCta()
        .onClick(() => this.saveServer()));
  }

  private updateTransportInputs(containerEl: HTMLElement, transportType: 'stdio' | 'sse' | 'http'): void {
    // Remove existing transport inputs
    const existingInputs = containerEl.querySelectorAll('.transport-input');
    existingInputs.forEach(input => input.remove());

    if (transportType === 'stdio') {
      this.addStdioInputs(containerEl);
    } else if (transportType === 'sse') {
      this.addSseInputs(containerEl);
    } else if (transportType === 'http') {
      this.addHttpInputs(containerEl);
    }
  }

  private addStdioInputs(containerEl: HTMLElement): void {
    const stdioSection = containerEl.createDiv({ cls: 'transport-input' });
    stdioSection.createEl('h3', { text: 'Stdio Configuration' });
    
    // Add helpful note about Node.js paths
    const noteEl = stdioSection.createDiv({ cls: 'setting-item-description' });
    noteEl.createEl('p', { 
      text: 'Common Node.js paths:',
      cls: 'setting-item-description'
    });
    noteEl.createEl('ul', { cls: 'setting-item-description' });
    const ul = noteEl.querySelector('ul');
    if (ul) {
      ul.createEl('li', { text: 'macOS (Homebrew Apple Silicon): /opt/homebrew/bin/node' });
      ul.createEl('li', { text: 'macOS (Homebrew Intel): /usr/local/bin/node' });
      ul.createEl('li', { text: 'Linux: /usr/bin/node' });
      ul.createEl('li', { text: 'Windows: C:\\Program Files\\nodejs\\node.exe' });
    }

    new Setting(stdioSection)
      .setName('Command')
      .setDesc('Command to execute the MCP server. Use full path for executables (e.g., /opt/homebrew/bin/node)')
      .addText(text => text
        .setPlaceholder('/opt/homebrew/bin/node')
        .setValue(this.config.command || '')
        .onChange(value => this.config = new MCPServerConfig(
          value,
          this.config.args,
          this.config.env,
          this.config.cwd,
          undefined, // url
          undefined, // httpUrl
          this.config.headers,
          this.config.tcp,
          this.config.timeout,
          this.config.trust,
          this.config.description,
          this.config.includeTools,
          this.config.excludeTools,
          this.config.extensionName,
          this.config.oauth,
          this.config.authProviderType,
          this.config.targetAudience,
          this.config.targetServiceAccount
        )));

    new Setting(stdioSection)
      .setName('Arguments')
      .setDesc('Command line arguments (one per line)')
      .addTextArea(text => text
        .setPlaceholder('--root\n/Users/username/Documents')
        .setValue((this.config.args || []).join('\n'))
        .onChange(value => {
          const args = value.split('\n').filter(arg => arg.trim());
          this.config = new MCPServerConfig(
            this.config.command,
            args,
            this.config.env,
            this.config.cwd,
            undefined, // url
            undefined, // httpUrl
            this.config.headers,
            this.config.tcp,
            this.config.timeout,
            this.config.trust,
            this.config.description,
            this.config.includeTools,
            this.config.excludeTools,
            this.config.extensionName,
            this.config.oauth,
            this.config.authProviderType,
            this.config.targetAudience,
            this.config.targetServiceAccount
          );
        }));

    new Setting(stdioSection)
      .setName('Working Directory')
      .setDesc('Working directory for the command')
      .addText(text => text
        .setPlaceholder('/Users/username')
        .setValue(this.config.cwd || '')
        .onChange(value => this.config = new MCPServerConfig(
          this.config.command,
          this.config.args,
          this.config.env,
          value,
          undefined, // url
          undefined, // httpUrl
          this.config.headers,
          this.config.tcp,
          this.config.timeout,
          this.config.trust,
          this.config.description,
          this.config.includeTools,
          this.config.excludeTools,
          this.config.extensionName,
          this.config.oauth,
          this.config.authProviderType,
          this.config.targetAudience,
          this.config.targetServiceAccount
        )));
  }

  private addSseInputs(containerEl: HTMLElement): void {
    const sseSection = containerEl.createDiv({ cls: 'transport-input' });
    sseSection.createEl('h3', { text: 'SSE Configuration' });

    new Setting(sseSection)
      .setName('URL')
      .setDesc('SSE endpoint URL for the MCP server')
      .addText(text => text
        .setPlaceholder('https://api.example.com/mcp/sse')
        .setValue(this.config.url || '')
        .onChange(value => this.config = new MCPServerConfig(
          undefined, // command
          undefined, // args
          undefined, // env
          undefined, // cwd
          value,
          undefined, // httpUrl
          this.config.headers,
          this.config.tcp,
          this.config.timeout,
          this.config.trust,
          this.config.description,
          this.config.includeTools,
          this.config.excludeTools,
          this.config.extensionName,
          this.config.oauth,
          this.config.authProviderType,
          this.config.targetAudience,
          this.config.targetServiceAccount
        )));

    this.addHeadersInput(sseSection);
  }

  private addHttpInputs(containerEl: HTMLElement): void {
    const httpSection = containerEl.createDiv({ cls: 'transport-input' });
    httpSection.createEl('h3', { text: 'HTTP Configuration' });

    new Setting(httpSection)
      .setName('HTTP URL')
      .setDesc('HTTP endpoint URL for the MCP server')
      .addText(text => text
        .setPlaceholder('https://api.example.com/mcp/http')
        .setValue(this.config.httpUrl || '')
        .onChange(value => this.config = new MCPServerConfig(
          undefined, // command
          undefined, // args
          undefined, // env
          undefined, // cwd
          undefined, // url
          value,
          this.config.headers,
          this.config.tcp,
          this.config.timeout,
          this.config.trust,
          this.config.description,
          this.config.includeTools,
          this.config.excludeTools,
          this.config.extensionName,
          this.config.oauth,
          this.config.authProviderType,
          this.config.targetAudience,
          this.config.targetServiceAccount
        )));

    this.addHeadersInput(httpSection);
  }

  private addHeadersInput(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Headers')
      .setDesc('Additional HTTP headers (JSON format)')
      .addTextArea(text => text
        .setPlaceholder('{\n  "Authorization": "Bearer token",\n  "X-Custom-Header": "value"\n}')
        .setValue(JSON.stringify(this.config.headers || {}, null, 2))
        .onChange(value => {
          try {
            const headers = JSON.parse(value);
            this.config = new MCPServerConfig(
              this.config.command,
              this.config.args,
              this.config.env,
              this.config.cwd,
              this.config.url,
              this.config.httpUrl,
              headers,
              this.config.tcp,
              this.config.timeout,
              this.config.trust,
              this.config.description,
              this.config.includeTools,
              this.config.excludeTools,
              this.config.extensionName,
              this.config.oauth,
              this.config.authProviderType,
              this.config.targetAudience,
              this.config.targetServiceAccount
            );
          } catch (error) {
            // Invalid JSON, keep existing headers
          }
        }));
  }

  private addCommonSettings(containerEl: HTMLElement): void {
    const commonSection = containerEl.createDiv({ cls: 'transport-input' });
    commonSection.createEl('h3', { text: 'Common Settings' });

    new Setting(commonSection)
      .setName('Description')
      .setDesc('Human-readable description of this server')
      .addText(text => text
        .setPlaceholder('Filesystem access server')
        .setValue(this.config.description || '')
        .onChange(value => this.config = new MCPServerConfig(
          this.config.command,
          this.config.args,
          this.config.env,
          this.config.cwd,
          this.config.url,
          this.config.httpUrl,
          this.config.headers,
          this.config.tcp,
          this.config.timeout,
          this.config.trust,
          value,
          this.config.includeTools,
          this.config.excludeTools,
          this.config.extensionName,
          this.config.oauth,
          this.config.authProviderType,
          this.config.targetAudience,
          this.config.targetServiceAccount
        )));

    new Setting(commonSection)
      .setName('Timeout (ms)')
      .setDesc('Connection timeout in milliseconds')
      .addText(text => text
        .setPlaceholder('600000')
        .setValue(String(this.config.timeout || 600000))
        .onChange(value => {
          const timeout = parseInt(value) || 600000;
          this.config = new MCPServerConfig(
            this.config.command,
            this.config.args,
            this.config.env,
            this.config.cwd,
            this.config.url,
            this.config.httpUrl,
            this.config.headers,
            this.config.tcp,
            timeout,
            this.config.trust,
            this.config.description,
            this.config.includeTools,
            this.config.excludeTools,
            this.config.extensionName,
            this.config.oauth,
            this.config.authProviderType,
            this.config.targetAudience,
            this.config.targetServiceAccount
          );
        }));

    new Setting(commonSection)
      .setName('Trust Server')
      .setDesc('Automatically trust tools from this server (skip confirmation)')
      .addToggle(toggle => toggle
        .setValue(this.config.trust || false)
        .onChange(value => this.config = new MCPServerConfig(
          this.config.command,
          this.config.args,
          this.config.env,
          this.config.cwd,
          this.config.url,
          this.config.httpUrl,
          this.config.headers,
          this.config.tcp,
          this.config.timeout,
          value,
          this.config.description,
          this.config.includeTools,
          this.config.excludeTools,
          this.config.extensionName,
          this.config.oauth,
          this.config.authProviderType,
          this.config.targetAudience,
          this.config.targetServiceAccount
        )));

    new Setting(commonSection)
      .setName('Include Tools')
      .setDesc('Only include these tools (comma-separated, leave empty for all)')
      .addText(text => text
        .setPlaceholder('read_file,write_file')
        .setValue((this.config.includeTools || []).join(','))
        .onChange(value => {
          const includeTools = value.split(',').map(tool => tool.trim()).filter(tool => tool);
          this.config = new MCPServerConfig(
            this.config.command,
            this.config.args,
            this.config.env,
            this.config.cwd,
            this.config.url,
            this.config.httpUrl,
            this.config.headers,
            this.config.tcp,
            this.config.timeout,
            this.config.trust,
            this.config.description,
            includeTools,
            this.config.excludeTools,
            this.config.extensionName,
            this.config.oauth,
            this.config.authProviderType,
            this.config.targetAudience,
            this.config.targetServiceAccount
          );
        }));

    new Setting(commonSection)
      .setName('Exclude Tools')
      .setDesc('Exclude these tools (comma-separated)')
      .addText(text => text
        .setPlaceholder('delete_file,format_disk')
        .setValue((this.config.excludeTools || []).join(','))
        .onChange(value => {
          const excludeTools = value.split(',').map(tool => tool.trim()).filter(tool => tool);
          this.config = new MCPServerConfig(
            this.config.command,
            this.config.args,
            this.config.env,
            this.config.cwd,
            this.config.url,
            this.config.httpUrl,
            this.config.headers,
            this.config.tcp,
            this.config.timeout,
            this.config.trust,
            this.config.description,
            this.config.includeTools,
            excludeTools,
            this.config.extensionName,
            this.config.oauth,
            this.config.authProviderType,
            this.config.targetAudience,
            this.config.targetServiceAccount
          );
        }));
  }

  private addOAuthSettings(containerEl: HTMLElement): void {
    const oauthSection = containerEl.createDiv({ cls: 'transport-input' });
    oauthSection.createEl('h3', { text: 'OAuth Configuration' });

    new Setting(oauthSection)
      .setName('Enable OAuth')
      .setDesc('Enable OAuth authentication for this server')
      .addToggle(toggle => toggle
        .setValue(!!this.config.oauth)
        .onChange(value => {
          if (value && !this.config.oauth) {
            this.config = new MCPServerConfig(
              this.config.command,
              this.config.args,
              this.config.env,
              this.config.cwd,
              this.config.url,
              this.config.httpUrl,
              this.config.headers,
              this.config.tcp,
              this.config.timeout,
              this.config.trust,
              this.config.description,
              this.config.includeTools,
              this.config.excludeTools,
              this.config.extensionName,
              {
                serverUrl: '',
                redirectUri: 'http://localhost:8080/oauth/callback',
                scope: 'openid profile email',
                dynamicClientRegistration: true,
              },
              this.config.authProviderType,
              this.config.targetAudience,
              this.config.targetServiceAccount
            );
          } else if (!value) {
            this.config = new MCPServerConfig(
              this.config.command,
              this.config.args,
              this.config.env,
              this.config.cwd,
              this.config.url,
              this.config.httpUrl,
              this.config.headers,
              this.config.tcp,
              this.config.timeout,
              this.config.trust,
              this.config.description,
              this.config.includeTools,
              this.config.excludeTools,
              this.config.extensionName,
              undefined,
              this.config.authProviderType,
              this.config.targetAudience,
              this.config.targetServiceAccount
            );
          }
        }));

    if (this.config.oauth) {
      new Setting(oauthSection)
        .setName('Server URL')
        .setDesc('OAuth server URL')
        .addText(text => text
          .setPlaceholder('https://api.example.com')
          .setValue(this.config.oauth?.serverUrl || '')
          .onChange(value => {
            if (this.config.oauth) {
              this.config = new MCPServerConfig(
                this.config.command,
                this.config.args,
                this.config.env,
                this.config.cwd,
                this.config.url,
                this.config.httpUrl,
                this.config.headers,
                this.config.tcp,
                this.config.timeout,
                this.config.trust,
                this.config.description,
                this.config.includeTools,
                this.config.excludeTools,
                this.config.extensionName,
                { ...this.config.oauth, serverUrl: value },
                this.config.authProviderType,
                this.config.targetAudience,
                this.config.targetServiceAccount
              );
            }
          }));

      new Setting(oauthSection)
        .setName('Redirect URI')
        .setDesc('OAuth redirect URI')
        .addText(text => text
          .setPlaceholder('http://localhost:8080/oauth/callback')
          .setValue(this.config.oauth?.redirectUri || '')
          .onChange(value => {
            if (this.config.oauth) {
              this.config = new MCPServerConfig(
                this.config.command,
                this.config.args,
                this.config.env,
                this.config.cwd,
                this.config.url,
                this.config.httpUrl,
                this.config.headers,
                this.config.tcp,
                this.config.timeout,
                this.config.trust,
                this.config.description,
                this.config.includeTools,
                this.config.excludeTools,
                this.config.extensionName,
                { ...this.config.oauth, redirectUri: value },
                this.config.authProviderType,
                this.config.targetAudience,
                this.config.targetServiceAccount
              );
            }
          }));

      new Setting(oauthSection)
        .setName('Scope')
        .setDesc('OAuth scope')
        .addText(text => text
          .setPlaceholder('openid profile email')
          .setValue(this.config.oauth?.scope || '')
          .onChange(value => {
            if (this.config.oauth) {
              this.config = new MCPServerConfig(
                this.config.command,
                this.config.args,
                this.config.env,
                this.config.cwd,
                this.config.url,
                this.config.httpUrl,
                this.config.headers,
                this.config.tcp,
                this.config.timeout,
                this.config.trust,
                this.config.description,
                this.config.includeTools,
                this.config.excludeTools,
                this.config.extensionName,
                { ...this.config.oauth, scope: value },
                this.config.authProviderType,
                this.config.targetAudience,
                this.config.targetServiceAccount
              );
            }
          }));
    }
  }

  private displayServerFunctions(contentEl: HTMLElement): void {
    const client = this.parent.plugin.mcpClientManager?.getClient(this.serverName);
    if (!client) {
      return;
    }

    const status = client.getStatus();
    if (status !== 'connected') {
      return;
    }

    // Create functions section
    const functionsSection = contentEl.createDiv({ cls: 'mcp-functions-section' });
    functionsSection.createEl('h3', { text: 'Available Functions' });

    // Get tools
    const tools = client.getTools();
    if (tools.size > 0) {
      const toolsDiv = functionsSection.createDiv({ cls: 'mcp-tools-list' });
      toolsDiv.createEl('h4', { text: `Tools (${tools.size})` });
      
      for (const [toolName, tool] of tools) {
        const toolDiv = toolsDiv.createDiv({ cls: 'mcp-tool-item' });
        toolDiv.createEl('strong', { text: toolName });
        toolDiv.createEl('div', { 
          text: tool.description || 'No description available',
          cls: 'mcp-tool-description'
        });
        
        // Show parameters if available
        if (tool.parameterSchema && tool.parameterSchema.properties) {
          const paramsDiv = toolDiv.createDiv({ cls: 'mcp-tool-parameters' });
          paramsDiv.createEl('div', { text: 'Parameters:', cls: 'mcp-param-label' });
          
          for (const [paramName, paramDef] of Object.entries(tool.parameterSchema.properties)) {
            const paramDiv = paramsDiv.createDiv({ cls: 'mcp-param-item' });
            paramDiv.createEl('span', { 
              text: `${paramName} (${(paramDef as any).type || 'any'})`,
              cls: 'mcp-param-name'
            });
            if ((paramDef as any).description) {
              paramDiv.createEl('div', { 
                text: (paramDef as any).description,
                cls: 'mcp-param-description'
              });
            }
          }
        }
      }
    }

    // Get prompts
    const prompts = client.getPrompts();
    if (prompts.size > 0) {
      const promptsDiv = functionsSection.createDiv({ cls: 'mcp-prompts-list' });
      promptsDiv.createEl('h4', { text: `Prompts (${prompts.size})` });
      
      for (const [promptName, prompt] of prompts) {
        const promptDiv = promptsDiv.createDiv({ cls: 'mcp-prompt-item' });
        promptDiv.createEl('strong', { text: promptName });
        promptDiv.createEl('div', { 
          text: prompt.description || 'No description available',
          cls: 'mcp-prompt-description'
        });
      }
    }

    if (tools.size === 0 && prompts.size === 0) {
      functionsSection.createEl('div', { 
        text: 'No functions available. Make sure the server is connected and supports tools/prompts.',
        cls: 'mcp-no-functions'
      });
    }
  }

  private async saveServer(): Promise<void> {
    if (!this.serverName.trim()) {
      new Notice('Server name is required');
      return;
    }

    await this.parent.updateServer(this.serverName, this.config);
    this.close();
  }
}