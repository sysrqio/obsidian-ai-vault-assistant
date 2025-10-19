import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type GeminiPlugin from './main';
import { Logger, LogLevel } from './utils/logger';
import type { MCPServerConfig, MCPOAuthConfig } from './types/mcp-types';
import { McpSettingsTab } from './settings/mcp-settings-tab';

export type ToolPermission = 'ask' | 'always' | 'never';

export interface ToolPermissions {
	// Core file tools
	web_fetch: ToolPermission;
	write_file: ToolPermission;
	read_file: ToolPermission;
	list_files: ToolPermission;
	read_many_files: ToolPermission;
	google_web_search: ToolPermission;
	
	// MCP tools (dynamic - can be any tool name)
	[key: string]: ToolPermission;
	
	// Memory tools
	save_memory: ToolPermission;
	delete_memory: ToolPermission;
	
	// Vault navigation & discovery
	get_active_file: ToolPermission;
	open_file: ToolPermission;
	search_vault: ToolPermission;
	get_recent_files: ToolPermission;
	
	// Link & connection tools
	get_backlinks: ToolPermission;
	get_outgoing_links: ToolPermission;
	get_graph_neighbors: ToolPermission;
	
	// File management
	rename_file: ToolPermission;
	create_folder: ToolPermission;
	move_file: ToolPermission;
	delete_file: ToolPermission;
	
	// Metadata & organization
	get_file_metadata: ToolPermission;
	update_frontmatter: ToolPermission;
	get_tags: ToolPermission;
	
	// Workflow & templates
	get_daily_note: ToolPermission;
	create_from_template: ToolPermission;
	
	// Workspace management
	get_workspace_layout: ToolPermission;
	create_pane: ToolPermission;
}

export interface ContextSettings {
	maxVaultStructureItems: number;
	recentFilesCount: number;
	recentFilesHours: number;
}

export interface GeminiSettings {
	apiKey: string;
	model: string;
	useOAuth: boolean;
	oauthClientId?: string;
	oauthClientSecret?: string;
	oauthAccessToken?: string;
	oauthRefreshToken?: string;
	oauthExpiresAt?: number;
	oauthProxyUrl?: string;
	temperature: number;
	maxTokens: number;
	enableFileTools: boolean;
	fallbackMode: boolean;
	renderMarkdown: boolean;
	logLevel: LogLevel;
	toolPermissions: ToolPermissions;
	contextSettings: ContextSettings;
	// MCP Configuration
	enableMCP?: boolean;
	// View Configuration
	viewPosition?: 'left' | 'right' | 'tab';
	restoreViewOnStartup?: boolean;
}

export const DEFAULT_SETTINGS: GeminiSettings = {
	apiKey: '',
	model: 'gemini-2.5-pro',
	useOAuth: false,
	oauthClientId: undefined,
	oauthClientSecret: undefined,
	oauthAccessToken: undefined,
	oauthRefreshToken: undefined,
	oauthExpiresAt: undefined,
	oauthProxyUrl: '',
	temperature: 0.7,
	maxTokens: 8192,
	enableFileTools: true,
	fallbackMode: false,
	renderMarkdown: true,
	logLevel: 'warn', // Default to warn for production (only show warnings and errors)
	contextSettings: {
		maxVaultStructureItems: 50,
		recentFilesCount: 10,
		recentFilesHours: 24
	},
	// MCP Configuration
	enableMCP: true,
	// View Configuration
	viewPosition: 'right',
	restoreViewOnStartup: true,
	toolPermissions: {
		// Core file tools
		web_fetch: 'ask',
		write_file: 'ask',
		read_file: 'ask',
		list_files: 'ask',
		read_many_files: 'ask',
		google_web_search: 'ask',
		
		// MCP tools
		search_freelancermap_projects: 'ask',
		
		// Memory tools
		save_memory: 'ask',
		delete_memory: 'ask',
		
		// Vault navigation & discovery (read-only, safe to auto-allow)
		get_active_file: 'always',
		open_file: 'always',
		search_vault: 'always',
		get_recent_files: 'always',
		
		// Link & connection tools (read-only, safe to auto-allow)
		get_backlinks: 'always',
		get_outgoing_links: 'always',
		get_graph_neighbors: 'always',
		
		// File management (destructive, ask first)
		rename_file: 'ask',
		create_folder: 'ask',
		move_file: 'ask',
		delete_file: 'ask',
		
		// Metadata & organization
		get_file_metadata: 'always',  // Read-only
		update_frontmatter: 'ask',     // Modifies files
		get_tags: 'always',            // Read-only
		
		// Workflow & templates
		get_daily_note: 'always',      // Safe, common operation
		create_from_template: 'ask',   // Creates new files
		
		// Workspace management
		get_workspace_layout: 'always', // Read-only
		create_pane: 'always'           // UI operation, reversible
	}
};

export class GeminiSettingTab extends PluginSettingTab {
	plugin: GeminiPlugin;

	constructor(app: App, plugin: GeminiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'AI Vault Assistant Settings' });

		// Authentication Section
	containerEl.createEl('h3', { text: 'Authentication' });

	new Setting(containerEl)
		.setName('Use OAuth')
		.setDesc('Use OAuth authentication (Login with Google) - Consumer door like gemini-cli')
		.addToggle(toggle => toggle
			.setValue(this.plugin.settings.useOAuth)
			.onChange(async (value) => {
				this.plugin.settings.useOAuth = value;
				await this.plugin.saveSettings();
				
				// Re-initialize the client when authentication method changes
				try {
					await (this.plugin as any).geminiClient?.initialize();
					new Notice('✅ Client re-initialized with new authentication method');
				} catch (error) {
					Logger.error('Settings', 'Failed to re-initialize client:', error);
					new Notice(`❌ Failed to re-initialize: ${(error as Error).message}`);
				}
				
				this.display(); // Refresh to show/hide API key field
			}));

	if (this.plugin.settings.useOAuth) {
		// OAuth credentials info
		const infoDesc = document.createDocumentFragment();
		infoDesc.createEl('div', { text: 'Get OAuth credentials from gemini-cli source code:' });
		const link = infoDesc.createEl('a', { 
			text: 'https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/oauth2.ts',
			href: 'https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/oauth2.ts'
		});
		link.setAttr('target', '_blank');
		infoDesc.createEl('div', { text: 'Look for OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET constants.' });
		
		new Setting(containerEl)
			.setName('OAuth Credentials')
			.setDesc(infoDesc);
		
		new Setting(containerEl)
			.setName('OAuth Client ID')
			.setDesc('Client ID from gemini-cli source (starts with 681255809395-...)')
			.addText(text => text
				.setPlaceholder('Paste OAUTH_CLIENT_ID from gemini-cli')
				.setValue(this.plugin.settings.oauthClientId || '')
				.onChange(async (value) => {
					this.plugin.settings.oauthClientId = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('OAuth Client Secret')
			.setDesc('Client secret from gemini-cli source (starts with GOCSPX-...)')
			.addText(text => text
				.setPlaceholder('Paste OAUTH_CLIENT_SECRET from gemini-cli')
				.setValue(this.plugin.settings.oauthClientSecret || '')
				.onChange(async (value) => {
					this.plugin.settings.oauthClientSecret = value;
					await this.plugin.saveSettings();
				}));
		const status = this.plugin.settings.oauthAccessToken 
			? '✅ Authenticated' 
			: '❌ Not authenticated';
		
		new Setting(containerEl)
			.setName('OAuth Status')
			.setDesc(status)
			.addButton(button => button
				.setButtonText('Authenticate')
				.setCta()
				.onClick(async () => {
					await (this.plugin as any).startOAuthFlow();
				}))
			.addButton(button => button
				.setButtonText('Clear Tokens')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.oauthAccessToken = '';
					this.plugin.settings.oauthRefreshToken = '';
					this.plugin.settings.oauthExpiresAt = 0;
					await this.plugin.saveSettings();
					new Notice('OAuth tokens cleared');
					this.display();
				}))
			.addButton(button => button
				.setButtonText('Test API')
				.onClick(async () => {
					await this.testOAuthAPI();
				}));
	} else {
		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your Gemini API key from https://aistudio.google.com/apikey')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));
	}

		// Model Configuration
		containerEl.createEl('h3', { text: 'Model Configuration' });

	new Setting(containerEl)
		.setName('Model')
		.setDesc('Gemini model to use (will auto-fallback to Flash if Pro quota exceeded)')
		.addDropdown(dropdown => dropdown
			.addOption('gemini-2.5-pro', 'Gemini 2.5 Pro')
			.addOption('gemini-2.5-flash', 'Gemini 2.5 Flash')
			.addOption('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite')
			.setValue(this.plugin.settings.model)
			.onChange(async (value) => {
				this.plugin.settings.model = value;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Render Markdown')
			.setDesc('Render AI responses as formatted markdown. When disabled, shows raw markdown text.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.renderMarkdown)
				.onChange(async (value) => {
					this.plugin.settings.renderMarkdown = value;
					await this.plugin.saveSettings();
				}));

	new Setting(containerEl)
		.setName('Log Level')
		.setDesc('Control console logging verbosity. Default: Warn (recommended for production). Use Debug for troubleshooting.')
		.addDropdown(dropdown => dropdown
			.addOption('warn', 'Warn (Recommended - Warnings & Errors only)')
			.addOption('error', 'Error (Errors only)')
			.addOption('info', 'Info (Important events)')
			.addOption('debug', 'Debug (All logs - verbose)')
			.addOption('none', 'None (Silent)')
			.setValue(this.plugin.settings.logLevel)
				.onChange(async (value: LogLevel) => {
					this.plugin.settings.logLevel = value;
					Logger.setLevel(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Controls randomness in responses (0.0 = deterministic, 1.0 = creative)')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.1)
				.setValue(this.plugin.settings.temperature)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.temperature = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max Tokens')
			.setDesc('Maximum tokens in response')
			.addText(text => text
				.setPlaceholder('8192')
				.setValue(String(this.plugin.settings.maxTokens))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.maxTokens = num;
						await this.plugin.saveSettings();
					}
				}));

		// Context Settings
		containerEl.createEl('h3', { text: 'Context Configuration' });
		containerEl.createEl('p', { 
			text: 'All context features are enabled by default to provide the AI with comprehensive vault information.' 
		});

		new Setting(containerEl)
			.setName('Max Vault Structure Items')
			.setDesc('Maximum number of files/folders to include in vault structure (to prevent context overflow)')
			.addText(text => text
				.setPlaceholder('50')
				.setValue(String(this.plugin.settings.contextSettings.maxVaultStructureItems))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.contextSettings.maxVaultStructureItems = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Recent Files Count')
			.setDesc('Number of recent files to include in context')
			.addText(text => text
				.setPlaceholder('10')
				.setValue(String(this.plugin.settings.contextSettings.recentFilesCount))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.contextSettings.recentFilesCount = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Recent Files Time Window')
			.setDesc('Hours to look back for recent files')
			.addText(text => text
				.setPlaceholder('24')
				.setValue(String(this.plugin.settings.contextSettings.recentFilesHours))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.contextSettings.recentFilesHours = num;
						await this.plugin.saveSettings();
					}
				}));

		// Tool Permissions
		containerEl.createEl('h3', { text: 'Tool Permissions' });

		new Setting(containerEl)
			.setName('Enable File Tools')
			.setDesc('Allow Gemini to read and modify files in your vault')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableFileTools)
				.onChange(async (value) => {
					this.plugin.settings.enableFileTools = value;
					await this.plugin.saveSettings();
				}));

		// Tool Permissions Settings
		containerEl.createEl('h4', { text: 'Tool Permissions' });
		containerEl.createEl('p', { 
			text: 'Control when tools can execute without asking for confirmation',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('Web Fetch Permission')
			.setDesc('Control when Gemini can fetch content from URLs on the internet')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask each time')
				.addOption('always', 'Always allow')
				.addOption('never', 'Never allow')
				.setValue(this.plugin.settings.toolPermissions.web_fetch)
				.onChange(async (value: ToolPermission) => {
					this.plugin.settings.toolPermissions.web_fetch = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Write File Permission')
			.setDesc('Control when Gemini can create or modify files in your vault')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask each time')
				.addOption('always', 'Always allow')
				.addOption('never', 'Never allow')
				.setValue(this.plugin.settings.toolPermissions.write_file)
				.onChange(async (value: ToolPermission) => {
					this.plugin.settings.toolPermissions.write_file = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Read File Permission')
			.setDesc('Control when Gemini can read files from your vault')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask each time')
				.addOption('always', 'Always allow')
				.addOption('never', 'Never allow')
				.setValue(this.plugin.settings.toolPermissions.read_file)
				.onChange(async (value: ToolPermission) => {
					this.plugin.settings.toolPermissions.read_file = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('List Files Permission')
			.setDesc('Control when Gemini can list files in your vault')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask each time')
				.addOption('always', 'Always allow')
				.addOption('never', 'Never allow')
				.setValue(this.plugin.settings.toolPermissions.list_files)
				.onChange(async (value: ToolPermission) => {
					this.plugin.settings.toolPermissions.list_files = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Read Many Files Permission')
			.setDesc('Control when Gemini can read multiple files using glob patterns')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask each time')
				.addOption('always', 'Always allow')
				.addOption('never', 'Never allow')
				.setValue(this.plugin.settings.toolPermissions.read_many_files)
				.onChange(async (value: ToolPermission) => {
					this.plugin.settings.toolPermissions.read_many_files = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Google Web Search Permission')
			.setDesc('Control when Gemini can search the web using Google Search')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask each time')
				.addOption('always', 'Always allow')
				.addOption('never', 'Never allow')
				.setValue(this.plugin.settings.toolPermissions.google_web_search)
				.onChange(async (value: ToolPermission) => {
					this.plugin.settings.toolPermissions.google_web_search = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Save Memory Permission')
			.setDesc('Control when Gemini can save information to long-term memory')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask each time')
				.addOption('always', 'Always allow')
				.addOption('never', 'Never allow')
			.setValue(this.plugin.settings.toolPermissions.save_memory)
			.onChange(async (value: ToolPermission) => {
				this.plugin.settings.toolPermissions.save_memory = value;
				await this.plugin.saveSettings();
			}));

	// MCP Settings Section
	containerEl.createEl('h3', { text: 'MCP (Model Context Protocol)' });
	
	new Setting(containerEl)
		.setName('Enable MCP Support')
		.setDesc('Enable Model Context Protocol support to connect to external MCP servers')
		.addToggle(toggle => toggle
			.setValue(this.plugin.settings.enableMCP || false)
			.onChange(async (value) => {
				this.plugin.settings.enableMCP = value;
				await this.plugin.saveSettings();
				this.display(); // Refresh to show/hide MCP settings
			}));

	if (this.plugin.settings.enableMCP) {
		new Setting(containerEl)
			.setName('Configure MCP Servers')
			.setDesc('Open MCP server configuration dialog')
			.addButton(button => button
				.setButtonText('Open MCP Settings')
				.setCta()
				.onClick(() => {
					new McpSettingsTab(this.app, this.plugin).open();
				}));
	}

	// View Configuration Section
	containerEl.createEl('h3', { text: 'View Configuration' });
	
	new Setting(containerEl)
		.setName('Restore View on Startup')
		.setDesc('Automatically restore the chat view to its last position when Obsidian starts')
		.addToggle(toggle => toggle
			.setValue(this.plugin.settings.restoreViewOnStartup ?? true)
			.onChange(async (value) => {
				this.plugin.settings.restoreViewOnStartup = value;
				await this.plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Default View Position')
		.setDesc('Where to open the chat view by default')
		.addDropdown(dropdown => dropdown
			.addOption('right', 'Right Sidebar')
			.addOption('left', 'Left Sidebar')
			.addOption('tab', 'New Tab')
			.setValue(this.plugin.settings.viewPosition ?? 'right')
			.onChange(async (value) => {
				this.plugin.settings.viewPosition = value as 'left' | 'right' | 'tab';
				await this.plugin.saveSettings();
			}));

	// Memories Section
	this.displayMemoriesSection(containerEl);
	}

	private displayMemoriesSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Memories' });
		containerEl.createEl('p', { 
			text: 'Manage facts and information that Gemini remembers about you',
			cls: 'setting-item-description'
		});

		const memoryManager = (this.plugin as any).geminiClient?.getMemoryManager();
		if (!memoryManager) {
			containerEl.createEl('p', { 
				text: '⚠️ Memory manager not available. Please restart the plugin.',
				cls: 'setting-item-description'
			});
			return;
		}

		const memories = memoryManager.getMemories();

		// Memory count and actions
		const headerSetting = new Setting(containerEl)
			.setName(`Saved Memories (${memories.length})`)
			.setDesc('View and manage all saved memories')
			.addButton(button => button
				.setButtonText('Refresh')
				.onClick(() => {
					this.display();
				}))
			.addButton(button => button
				.setButtonText('Clear All')
				.setWarning()
				.onClick(async () => {
					if (confirm(`Are you sure you want to delete all ${memories.length} memories? This cannot be undone.`)) {
						await memoryManager.clearMemories();
						new Notice('All memories cleared');
						this.display();
					}
				}));

		if (memories.length === 0) {
			containerEl.createEl('p', { 
				text: 'No memories saved yet. Ask Gemini to remember something!',
				cls: 'setting-item-description'
			});
			return;
		}

		// List all memories
		const memoriesContainer = containerEl.createDiv({ cls: 'gemini-memories-container' });
		
		memories.forEach((memory, index) => {
			const memoryDiv = memoriesContainer.createDiv({ cls: 'gemini-memory-item' });
			
			// Memory header with category badge
			const headerDiv = memoryDiv.createDiv({ cls: 'gemini-memory-header' });
			
			if (memory.category) {
				headerDiv.createEl('span', { 
					text: memory.category,
					cls: 'gemini-memory-category'
				});
			}
			
			const dateStr = new Date(memory.timestamp).toLocaleString();
			headerDiv.createEl('span', { 
				text: dateStr,
				cls: 'gemini-memory-date'
			});

			// Memory content (editable)
			const contentDiv = memoryDiv.createDiv({ cls: 'gemini-memory-content' });
			const textarea = contentDiv.createEl('textarea', {
				text: memory.fact,
				cls: 'gemini-memory-textarea'
			});

			// Action buttons
			const actionsDiv = memoryDiv.createDiv({ cls: 'gemini-memory-actions' });
			
			// Save button (only shows if edited)
		const saveButton = actionsDiv.createEl('button', {
			text: 'Save',
			cls: 'mod-cta gemini-memory-save-btn is-hidden'
		});
		
		saveButton.addEventListener('click', async () => {
			const newFact = textarea.value.trim();
			if (newFact && newFact !== memory.fact) {
				await memoryManager.deleteMemory(memory.id);
				await memoryManager.addMemory(newFact, memory.category);
				new Notice('Memory updated');
				this.display();
			}
		});

		// Show save button when textarea changes
		textarea.addEventListener('input', () => {
			const hasChanges = textarea.value.trim() !== memory.fact;
			if (hasChanges) {
				saveButton.removeClass('is-hidden');
				saveButton.addClass('is-visible');
			} else {
				saveButton.removeClass('is-visible');
				saveButton.addClass('is-hidden');
			}
		});

			// Delete button
			const deleteButton = actionsDiv.createEl('button', {
				text: 'Delete',
				cls: 'mod-warning gemini-memory-delete-btn'
			});
			
			deleteButton.addEventListener('click', async () => {
				if (confirm(`Delete this memory?\n\n"${memory.fact}"`)) {
					await memoryManager.deleteMemory(memory.id);
					new Notice('Memory deleted');
					this.display();
				}
			});
		});
	}

	/**
	 * Test OAuth API connection
	 * Tests the complete gemini-cli flow: userinfo → loadCodeAssist → generateContent
	 */
	async testOAuthAPI(): Promise<void> {
		if (!this.plugin.settings.oauthAccessToken) {
			new Notice('❌ No OAuth token. Please authenticate first.');
			return;
		}

		try {
			Logger.info('OAuth Test', 'Starting OAuth API test...');
			
			// DEBUGGING: Inspect the access token to see what scopes it actually has
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('🔍 OAUTH TOKEN INSPECTION');
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('CURRENT ACCESS TOKEN:', this.plugin.settings.oauthAccessToken);
			console.log('Token expires at:', new Date((this.plugin.settings.oauthExpiresAt || 0) * 1000).toISOString());
			
			// Inspect token scopes using Google's tokeninfo endpoint
			const tokenInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${this.plugin.settings.oauthAccessToken}`);
			const tokenInfo = await tokenInfoResponse.json();
			
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('📋 TOKEN INFO FROM GOOGLE:');
			console.log(JSON.stringify(tokenInfo, null, 2));
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			
			if (tokenInfo.scope) {
				const scopes = tokenInfo.scope.split(' ');
				console.log('🔐 GRANTED SCOPES:');
				scopes.forEach((scope: string) => {
					const hasCloudPlatform = scope.includes('cloud-platform');
					console.log(`  ${hasCloudPlatform ? '✅' : '  '} ${scope}`);
				});
				
				const hasRequiredScope = scopes.some((s: string) => s.includes('cloud-platform'));
				if (!hasRequiredScope) {
					console.error('❌ MISSING REQUIRED SCOPE: https://www.googleapis.com/auth/cloud-platform');
					console.error('   You need to:');
					console.error('   1. Update your GCP OAuth consent screen to include cloud-platform scope');
					console.error('   2. Log out and re-authenticate in the plugin settings');
					new Notice('❌ Token missing cloud-platform scope! Check console for details.');
					return;
				} else {
					console.log('✅ Token has cloud-platform scope!');
				}
			}
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			
		// Test complete gemini-cli OAuth flow
		Logger.info('OAuth Test', '🧪 Testing via DirectGeminiAPIClient (gemini-cli format)...');
		Logger.info('OAuth Test', 'Flow: userinfo → loadCodeAssist → generateContent');
		
		if (!this.plugin.geminiClient || !this.plugin.geminiClient['directAPIClient']) {
			new Notice('❌ OAuth Direct API client not initialized. Please authenticate first.');
			return;
		}
		
		const directClient = this.plugin.geminiClient['directAPIClient'];
		
		// This will automatically call:
		// 1. fetchUserInfo() - GET /oauth2/v2/userinfo
		// 2. loadCodeAssist() - POST /v1internal:loadCodeAssist  
		// 3. streamGenerateContent - POST /v1internal:streamGenerateContent
		const resp = await directClient.generateContent(
			'gemini-2.5-flash',
			[{ role: 'user', parts: [{ text: 'Hello! Just testing the OAuth API. Please respond with "OK".' }] }],
			'',
			[],
			{ temperature: 0.7, maxOutputTokens: 128 }
		);
		
		const text = resp?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text';
		Logger.info('OAuth Test', `✅ Test successful! Response: ${text.substring(0, 50)}...`);
		new Notice(`✅ OAuth API test successful! Response: ${text.substring(0, 50)}...`);
		} catch (error) {
			new Notice(`❌ OAuth API test error: ${(error as Error).message}`);
		}
	}
}

