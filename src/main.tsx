import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { GeminiView, VIEW_TYPE_GEMINI } from './gemini-view';
import { GeminiSettings, GeminiSettingTab, DEFAULT_SETTINGS } from './settings';
import { VaultAdapter } from './utils/vault-adapter';
import { GeminiClient } from './gemini-client';
import { OAuthHandler } from './oauth-handler';
import { Logger } from './utils/logger';
import { McpClientManager } from './mcp/mcp-client-manager';
import { MCPConfigManager } from './mcp/mcp-config-manager';
import { ToolRegistry } from './tools/tool-registry';
import { PromptRegistry } from './prompts/prompt-registry';

export default class GeminiPlugin extends Plugin {
	settings: GeminiSettings;
	vaultAdapter: VaultAdapter;
	geminiClient: GeminiClient | null = null;
	mcpClientManager: McpClientManager | null = null;
	mcpConfigManager: MCPConfigManager | null = null;
	toolRegistry: ToolRegistry | null = null;
	promptRegistry: PromptRegistry | null = null;

	async onload() {
		// Wrap console to respect log levels (do this first!)
		Logger.wrapConsole();
		
		Logger.info('Plugin', 'Loading AI Vault Assistant...');
		Logger.debug('Plugin', '🚀 PLUGIN RELOADED - NEW VERSION WITH DEBUG LOGS');
		
		await this.loadSettings();

		this.vaultAdapter = new VaultAdapter(this.app.vault);
		Logger.debug('Plugin', 'Vault adapter initialized');

		// Initialize tool and prompt registries
		this.toolRegistry = new ToolRegistry();
		this.promptRegistry = new PromptRegistry();
		Logger.debug('Plugin', 'Tool and prompt registries initialized');

		// Initialize MCP config manager
		this.mcpConfigManager = new MCPConfigManager(this.app.vault);
		await this.mcpConfigManager.loadConfig();
		Logger.debug('Plugin', 'MCP config manager initialized');

		const vaultPath = (this.app.vault.adapter as any).basePath || '';
		const pluginDataPath = this.manifest.dir || this.app.vault.configDir + '/plugins/gemini-assistant';
		Logger.debug('Plugin', `Vault path: ${vaultPath}`);
		Logger.debug('Plugin', `Plugin data path: ${pluginDataPath}`);

		// Initialize MCP client manager FIRST if MCP is enabled
		Logger.debug('Plugin', `MCP enabled in settings: ${this.settings.enableMCP}`);
		if (this.settings.enableMCP) {
			Logger.debug('Plugin', 'Initializing MCP client manager...');
			await this.initializeMcpClientManager();
			Logger.debug('Plugin', 'MCP client manager initialization completed');
		} else {
			Logger.debug('Plugin', 'MCP not enabled, skipping MCP initialization');
		}

		// Then create Gemini client (so it can access MCP tools)
		this.geminiClient = new GeminiClient(this.settings, this.vaultAdapter, vaultPath, pluginDataPath, this.app, this);
		Logger.debug('Plugin', 'Gemini client created');

		// Reload tools in Gemini client to include MCP tools (if MCP was initialized)
		if (this.settings.enableMCP && this.mcpClientManager) {
			Logger.debug('Plugin', 'Reloading tools in Gemini client to include MCP tools...');
			this.geminiClient.reloadTools();
		}

		this.registerView(
			VIEW_TYPE_GEMINI,
			(leaf) => new GeminiView(leaf, this.geminiClient!, this)
		);

		const ribbonIconEl = this.addRibbonIcon('message-circle', 'AI Vault Assistant', (evt: MouseEvent) => {
			this.activateView();
		});
		ribbonIconEl.addClass('gemini-ribbon-class');

	this.addCommand({
		id: 'open-ai-vault-assistant',
		name: 'Open assistant',
		callback: () => {
			this.activateView();
		}
	});

		this.addSettingTab(new GeminiSettingTab(this.app, this));

		// Always restore view on startup
		// Use setTimeout to ensure the workspace is fully loaded
		setTimeout(() => {
			this.restoreViewOnStartup();
		}, 1000);

		Logger.info('Plugin', 'AI Vault Assistant loaded successfully');
	}

	async onunload() {
		Logger.info('Plugin', 'Unloading AI Vault Assistant...');
		
		// Shutdown MCP client manager
		if (this.mcpClientManager) {
			await this.mcpClientManager.disconnectAll();
			Logger.debug('Plugin', 'MCP client manager shutdown');
		}
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_GEMINI);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			// Create new leaf based on saved position or default
			const position = this.settings.viewPosition || 'right';
			
			if (position === 'left') {
				leaf = workspace.getLeftLeaf(false);
			} else if (position === 'tab') {
				leaf = workspace.getLeaf('tab');
			} else {
				leaf = workspace.getRightLeaf(false);
			}
			
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_GEMINI, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
			// Save the current position for next time
			await this.saveViewPosition(leaf);
		}
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		
		// Deep merge to ensure new toolPermissions are included
		this.settings = {
			...DEFAULT_SETTINGS,
			...loadedData,
			toolPermissions: {
				...DEFAULT_SETTINGS.toolPermissions,
				...(loadedData?.toolPermissions || {})
			}
		};
		
		// Initialize logger with saved log level
		Logger.setLevel(this.settings.logLevel || 'info');
		
		Logger.info('Plugin', `Settings loaded with ${Object.keys(this.settings.toolPermissions).length} tool permissions`);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		if (this.vaultAdapter && this.geminiClient) {
			const vaultPath = (this.app.vault.adapter as any).basePath || '';
			const pluginDataPath = this.manifest.dir || this.app.vault.configDir + '/plugins/gemini-assistant';
			this.geminiClient = new GeminiClient(this.settings, this.vaultAdapter, vaultPath, pluginDataPath, this.app);
			
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GEMINI);
			leaves.forEach(leaf => {
				const view = leaf.view as GeminiView;
				if (view && view.setGeminiClient) {
					view.setGeminiClient(this.geminiClient!);
				}
			});
		}

		// Reinitialize MCP client manager if MCP settings changed
		if (this.settings.enableMCP && this.toolRegistry && this.promptRegistry) {
			if (this.mcpClientManager) {
				await this.mcpClientManager.disconnectAll();
			}
			await this.initializeMcpClientManager();
		} else if (!this.settings.enableMCP && this.mcpClientManager) {
			await this.mcpClientManager.disconnectAll();
			this.mcpClientManager = null;
		}
	}

	async startOAuthFlow(): Promise<void> {
		try {
			Logger.debug('Plugin', 'Starting OAuth flow...');
			
			// Check if OAuth credentials are configured
			if (!this.settings.oauthClientId || !this.settings.oauthClientSecret) {
				new Notice('❌ Please configure OAuth Client ID and Client Secret in settings first');
				return;
			}
			
			const oauthHandler = new OAuthHandler();
			
			Logger.debug('Plugin', 'Initializing OAuth handler...');
			await oauthHandler.initialize(this.settings.oauthClientId, this.settings.oauthClientSecret);
			
			Logger.debug('Plugin', 'Starting desktop OAuth flow (local HTTP server)...');
			const tokens = await oauthHandler.startOAuthFlow();
			
			this.settings.oauthAccessToken = tokens.access_token;
			this.settings.oauthRefreshToken = tokens.refresh_token;
			this.settings.oauthExpiresAt = Date.now() / 1000 + tokens.expires_in;
			
			await this.saveSettings();
			
			new Notice('✅ OAuth authentication successful!');
			Logger.debug('Plugin', 'OAuth tokens saved successfully');

			// Reinitialize Gemini client with new tokens
			await this.geminiClient?.initialize();

		} catch (error) {
			new Notice('❌ OAuth failed: ' + (error as Error).message);
			Logger.error('Plugin', 'OAuth error:', error);
		}
	}

	async initializeMcpClientManager(): Promise<void> {
		Logger.debug('Plugin', 'initializeMcpClientManager() called');
		
		if (!this.toolRegistry || !this.promptRegistry || !this.mcpConfigManager) {
			Logger.error('Plugin', 'Tool and prompt registries and MCP config manager must be initialized before MCP client manager');
			Logger.error('Plugin', `toolRegistry: ${!!this.toolRegistry}, promptRegistry: ${!!this.promptRegistry}, mcpConfigManager: ${!!this.mcpConfigManager}`);
			return;
		}

		try {
			Logger.debug('Plugin', 'Initializing MCP client manager...');
			
			// Create a simple workspace context adapter
			const workspaceContext = {
				getDirectories: () => [],
				onDirectoriesChanged: () => {},
			} as any;

			// Get MCP servers from config manager
			const mcpServers = this.mcpConfigManager.getServers();

			this.mcpClientManager = new McpClientManager(
				mcpServers,
				this.toolRegistry,
				this.promptRegistry,
				workspaceContext,
				this.settings.logLevel === 'debug'
			);

			// Discover MCP servers
			await this.mcpClientManager.discoverAll();
			Logger.info('Plugin', `MCP client manager initialized with ${Object.keys(mcpServers).length} servers`);

			// Register MCP tools in the tool registry
			await this.registerMcpTools();

			// Reload tools in Gemini client to include MCP tools
			if (this.geminiClient) {
				this.geminiClient.reloadTools();
			}
		} catch (error) {
			Logger.error('Plugin', 'Failed to initialize MCP client manager:', error);
			new Notice('Failed to initialize MCP client manager: ' + (error as Error).message);
		}
		
		Logger.debug('Plugin', 'initializeMcpClientManager() completed');
	}

	/**
	 * Register MCP tools in the tool registry
	 */
	private async registerMcpTools(): Promise<void> {
		Logger.debug('Plugin', 'registerMcpTools() called');
		
		if (!this.mcpClientManager || !this.toolRegistry) {
			Logger.warn('Plugin', 'Cannot register MCP tools: missing client manager or tool registry');
			return;
		}

		try {
			// Clear existing MCP tools first
			const allTools = this.toolRegistry.getAllTools();
			for (const [toolName, toolEntry] of allTools) {
				if (toolEntry && typeof (toolEntry as any).invoke === 'function') {
					// This is likely an MCP tool, remove it
					this.toolRegistry.unregisterTool(toolName);
					Logger.debug('Plugin', `Removed existing MCP tool: ${toolName}`);
				}
			}
			
			// Also clear tools that might have been registered with server prefixes
			for (const [toolName, toolEntry] of allTools) {
				if (toolName.includes(':') && toolEntry && typeof (toolEntry as any).invoke === 'function') {
					this.toolRegistry.unregisterTool(toolName);
					Logger.debug('Plugin', `Removed existing MCP tool with server prefix: ${toolName}`);
				}
			}

			// Get all MCP clients
			const clients = this.mcpClientManager.getAllClients();
			let totalRegistered = 0;
			
			for (const [serverName, client] of clients) {
				if (client.getStatus() === 'connected') {
					// Get tools from this MCP client
					const tools = client.getTools();
					
					for (const [toolName, tool] of tools) {
						// Use the tool's name property instead of the key to avoid server prefix conflicts
						const finalToolName = tool.name;
						
						// Register the tool in the tool registry
						// The MCP tool already has the correct structure, so we can register it directly
						this.toolRegistry.registerTool(finalToolName, tool as any);
						
						// Add to tool permissions if not already present
						if (!(finalToolName in this.settings.toolPermissions)) {
							this.settings.toolPermissions[finalToolName as keyof typeof this.settings.toolPermissions] = 'ask';
							Logger.debug('Plugin', `Added MCP tool to permissions: ${finalToolName}`);
						}
						
						totalRegistered++;
						Logger.debug('Plugin', `Registered MCP tool: ${finalToolName} from server: ${serverName}`);
					}
				} else {
					Logger.debug('Plugin', `Skipping server ${serverName}: status ${client.getStatus()}`);
				}
			}
			
			Logger.info('Plugin', `Registered ${totalRegistered} MCP tools from ${clients.size} servers`);
		} catch (error) {
			Logger.error('Plugin', 'Failed to register MCP tools:', error);
		}
	}

	/**
	 * Save the current view position for restoration on startup
	 */
	async saveViewPosition(leaf: WorkspaceLeaf): Promise<void> {
		try {
			const { workspace } = this.app;
			
			// Determine the position of the leaf
			let position: 'left' | 'right' | 'tab' = 'right';
			
			if (leaf.getRoot() === workspace.leftSplit) {
				position = 'left';
			} else if (leaf.getRoot() === workspace.rightSplit) {
				position = 'right';
			} else if (leaf.getRoot() === workspace.rootSplit) {
				position = 'tab';
			}
			
			// Only update if position has changed
			if (this.settings.viewPosition !== position) {
				this.settings.viewPosition = position;
				await this.saveSettings();
				Logger.debug('Plugin', `View position saved: ${position}`);
			}
		} catch (error) {
			Logger.error('Plugin', 'Failed to save view position:', error);
		}
	}

	/**
	 * Restore the view on startup if it was open when Obsidian was closed
	 */
	async restoreViewOnStartup(): Promise<void> {
		try {
			const { workspace } = this.app;
			
			// Check if there are any existing Gemini views
			const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_GEMINI);
			
			if (existingLeaves.length === 0) {
				// No existing view, create one in the saved position
				Logger.debug('Plugin', 'Restoring view on startup...');
				await this.activateView();
			} else {
				// View already exists, just reveal it
				Logger.debug('Plugin', 'View already exists, revealing...');
				workspace.revealLeaf(existingLeaves[0]);
			}
		} catch (error) {
			Logger.error('Plugin', 'Failed to restore view on startup:', error);
		}
	}

}
