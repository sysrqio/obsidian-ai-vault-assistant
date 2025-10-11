import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { GeminiView, VIEW_TYPE_GEMINI } from './gemini-view';
import { GeminiSettings, GeminiSettingTab, DEFAULT_SETTINGS } from './settings';
import { VaultAdapter } from './utils/vault-adapter';
import { GeminiClient } from './gemini-client';
import { OAuthHandler } from './oauth-handler';
import { Logger } from './utils/logger';

export default class GeminiPlugin extends Plugin {
	settings: GeminiSettings;
	vaultAdapter: VaultAdapter;
	geminiClient: GeminiClient | null = null;

	async onload() {
		// Wrap console to respect log levels (do this first!)
		Logger.wrapConsole();
		
		Logger.info('Plugin', 'Loading AI Vault Assistant...');
		
		await this.loadSettings();

		this.vaultAdapter = new VaultAdapter(this.app.vault);
		Logger.debug('Plugin', 'Vault adapter initialized');

		const vaultPath = (this.app.vault.adapter as any).basePath || '';
		const pluginDataPath = this.manifest.dir || this.app.vault.configDir + '/plugins/gemini-assistant';
		Logger.debug('Plugin', `Vault path: ${vaultPath}`);
		Logger.debug('Plugin', `Plugin data path: ${pluginDataPath}`);
		this.geminiClient = new GeminiClient(this.settings, this.vaultAdapter, vaultPath, pluginDataPath, this.app);
		Logger.debug('Plugin', 'Gemini client created');

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
			name: 'Open AI Vault Assistant',
			callback: () => {
				this.activateView();
			}
		});

		this.addSettingTab(new GeminiSettingTab(this.app, this));

		Logger.info('Plugin', 'AI Vault Assistant loaded successfully');
	}

	async onunload() {
		Logger.info('Plugin', 'Unloading AI Vault Assistant...');
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_GEMINI);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_GEMINI, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
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
	}

	async startOAuthFlow(): Promise<void> {
		try {
			console.log('[Plugin] Starting OAuth flow...');
			
			const proxyUrl = this.settings.oauthProxyUrl || 'https://oauth.sysrq.io/obsidian-ai-note-organizer';
			console.log('[Plugin] Using proxy URL:', proxyUrl);
			
			const tokens = await OAuthHandler.startOAuthFlow(proxyUrl);
			
			this.settings.oauthAccessToken = tokens.access_token;
			this.settings.oauthRefreshToken = tokens.refresh_token;
			this.settings.oauthExpiresAt = Date.now() / 1000 + tokens.expires_in;
			
			await this.saveSettings();
			
			new Notice('✅ OAuth authentication successful!');

			await this.geminiClient?.initialize();

		} catch (error) {
			new Notice('❌ OAuth failed: ' + error.message);
			console.error('[Plugin] OAuth error:', error);
		}
	}
}
