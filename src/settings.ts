import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type GeminiPlugin from './main';
import { Logger, LogLevel } from './utils/logger';

export type ToolPermission = 'ask' | 'always' | 'never';

export interface ToolPermissions {
	// Core file tools
	web_fetch: ToolPermission;
	write_file: ToolPermission;
	read_file: ToolPermission;
	list_files: ToolPermission;
	read_many_files: ToolPermission;
	google_web_search: ToolPermission;
	
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

export interface GeminiSettings {
	apiKey: string;
	model: string;
	useOAuth: boolean;
	oauthAccessToken?: string;
	oauthRefreshToken?: string;
	oauthExpiresAt?: number;
	oauthProxyUrl?: string;
	temperature: number;
	maxTokens: number;
	enableFileTools: boolean;
	enableShellTools: boolean;
	fallbackMode: boolean;
	renderMarkdown: boolean;
	logLevel: LogLevel;
	toolPermissions: ToolPermissions;
}

export const DEFAULT_SETTINGS: GeminiSettings = {
	apiKey: '',
	model: 'gemini-2.5-pro',
	useOAuth: false,
	oauthAccessToken: undefined,
	oauthRefreshToken: undefined,
	oauthExpiresAt: undefined,
	oauthProxyUrl: '',
	temperature: 0.7,
	maxTokens: 8192,
	enableFileTools: true,
	enableShellTools: false,
	fallbackMode: false,
	renderMarkdown: true,
	logLevel: 'info',
	toolPermissions: {
		// Core file tools
		web_fetch: 'ask',
		write_file: 'ask',
		read_file: 'ask',
		list_files: 'ask',
		read_many_files: 'ask',
		google_web_search: 'ask',
		
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
			.setDesc('Use OAuth authentication (Login with Google) - uses gemini-cli credentials')
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
						console.error('Failed to re-initialize client:', error);
						new Notice(`❌ Failed to re-initialize: ${error.message}`);
					}
					
					this.display(); // Refresh to show/hide API key field
				}));

		if (this.plugin.settings.useOAuth) {
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

			new Setting(containerEl)
				.setName('OAuth Proxy URL (Optional)')
				.setDesc('Use a proxy server to hide client secret (default: https://oauth.sysrq.io/obsidian-ai-note-organizer)')
				.addText(text => text
					.setPlaceholder('https://oauth.sysrq.io/obsidian-ai-note-organizer')
					.setValue(this.plugin.settings.oauthProxyUrl || '')
					.onChange(async (value) => {
						this.plugin.settings.oauthProxyUrl = value;
						await this.plugin.saveSettings();
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
			.setName('Fallback Mode')
			.setDesc('When enabled, automatically uses Flash model instead of Pro (follows gemini-cli pattern)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.fallbackMode)
				.onChange(async (value) => {
					this.plugin.settings.fallbackMode = value;
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
			.setDesc('Control console logging verbosity. Debug shows all logs, Info shows important events, Warn shows only warnings, Error shows only errors, None disables all logs.')
			.addDropdown(dropdown => dropdown
				.addOption('debug', 'Debug (All logs)')
				.addOption('info', 'Info (Default)')
				.addOption('warn', 'Warn (Warnings only)')
				.addOption('error', 'Error (Errors only)')
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

		new Setting(containerEl)
			.setName('Enable Shell Tools')
			.setDesc('Allow Gemini to execute shell commands (use with caution)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableShellTools)
				.onChange(async (value) => {
					this.plugin.settings.enableShellTools = value;
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
				cls: 'mod-cta gemini-memory-save-btn'
			});
			saveButton.style.display = 'none';
			
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
				saveButton.style.display = hasChanges ? 'inline-block' : 'none';
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
	 */
	async testOAuthAPI(): Promise<void> {
		if (!this.plugin.settings.oauthAccessToken) {
			new Notice('❌ No OAuth token. Please authenticate first.');
			return;
		}

		try {
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
			
			// Test API call using the OAuth token with Code Assist API (gemini-cli format)
			console.log('🧪 Testing Code Assist API endpoint (gemini-cli format)...');
			
			// Generate session and prompt IDs like gemini-cli
			const generateUUID = () => {
				return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
					const r = Math.random() * 16 | 0;
					const v = c === 'x' ? r : (r & 0x3 | 0x8);
					return v.toString(16);
				});
			};
			
			const sessionId = generateUUID();
			const userPromptId = `${generateUUID()}########1`;
			
			const response = await fetch('https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.plugin.settings.oauthAccessToken}`,
					'Content-Type': 'application/json',
					'User-Agent': 'AIVaultAssistant/0.1.0 (Obsidian) google-api-nodejs-client/9.15.1',
					'x-goog-api-client': 'gl-node/0.1.0'
				},
				body: JSON.stringify({
					model: 'gemini-2.5-flash',
					project: 'natural-citron-81vqp',
					user_prompt_id: userPromptId,
					request: {
						contents: [{
							role: 'user',
							parts: [{ text: 'Hello! Just testing the OAuth API. Please respond with "OK".' }]
						}],
						generationConfig: {
							temperature: 0.7,
							topP: 1
						}
					},
					session_id: sessionId
				})
			});

			if (response.ok) {
				const responseText = await response.text();
				console.log('🔍 Raw SSE response:', responseText.substring(0, 500));
				
				// Parse SSE format: extract last "data:" line
				const lines = responseText.split('\n');
				const dataLines = lines.filter(line => line.trim().startsWith('data:'));
				
				if (dataLines.length > 0) {
					const lastDataLine = dataLines[dataLines.length - 1];
					const jsonStr = lastDataLine.substring(5).trim(); // Remove "data:" prefix
					const data = JSON.parse(jsonStr);
					
					const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text';
					console.log('✅ Parsed response text:', text);
					new Notice(`✅ OAuth API test successful! Response: ${text.substring(0, 50)}...`);
				} else {
					console.error('❌ No data lines in SSE response');
					new Notice('❌ OAuth API test failed: Invalid SSE response format');
				}
			} else {
				const errorText = await response.text();
				console.error('❌ API error:', errorText);
				new Notice(`❌ OAuth API test failed: ${response.status} ${errorText.substring(0, 100)}`);
			}
		} catch (error) {
			new Notice(`❌ OAuth API test error: ${(error as Error).message}`);
		}
	}
}

