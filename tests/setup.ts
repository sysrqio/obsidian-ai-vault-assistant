/**
 * Test setup and mock utilities
 */

import { Vault, TFile, TFolder, App, Workspace, MetadataCache } from 'obsidian';

/**
 * Mock Vault for testing
 */
export class MockVault {
	private files: Map<string, string> = new Map();

	constructor(initialFiles: Record<string, string> = {}) {
		for (const [path, content] of Object.entries(initialFiles)) {
			this.files.set(path, content);
		}
	}

	private createMockFile(path: string): TFile {
		// Create a proper mock TFile object with all required properties
		return Object.assign(Object.create(TFile.prototype), {
			path,
			name: path.split('/').pop() || '',
			basename: path.split('/').pop()?.replace(/\.[^/.]+$/, '') || '',
			extension: path.split('.').pop() || '',
			stat: { ctime: Date.now(), mtime: Date.now(), size: 0 },
			vault: this
		});
	}

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		if (this.files.has(path)) {
			const file = this.createMockFile(path);
			// Check if it's actually a TFile instance
			if (file instanceof TFile || Object.getPrototypeOf(file) === TFile.prototype) {
				return file;
			}
		}
		return null;
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path) || '';
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(file.path, content);
	}

	async create(path: string, content: string): Promise<TFile> {
		this.files.set(path, content);
		return this.createMockFile(path);
	}

	getFiles(): TFile[] {
		return Array.from(this.files.keys()).map(path => this.createMockFile(path));
	}

	getAllLoadedFiles(): TFile[] {
		return this.getFiles();
	}

	getRoot(): TFolder {
		return { path: '/', children: [] } as unknown as TFolder;
	}
}

/**
 * Mock settings for testing
 */
export const mockSettings = {
	apiKey: 'test-api-key',
	model: 'gemini-2.5-flash',
	temperature: 0.7,
	maxTokens: 8192,
	useOAuth: false,
	oauthProxyUrl: '',
	oauthAccessToken: '',
	oauthRefreshToken: '',
	oauthTokenExpiry: 0,
	enableFileTools: true,
	enableShellTools: false,
	fallbackMode: false,
	renderMarkdown: true,
	logLevel: 'error' as const, // Suppress logs in tests
	toolPermissions: {
		web_fetch: 'ask' as const,
		write_file: 'ask' as const,
		read_file: 'ask' as const,
		list_files: 'ask' as const,
		read_many_files: 'ask' as const,
		google_web_search: 'ask' as const,
		save_memory: 'ask' as const,
		delete_memory: 'ask' as const,
		get_active_file: 'always' as const,
		open_file: 'always' as const,
		search_vault: 'always' as const,
		get_recent_files: 'always' as const,
		get_backlinks: 'always' as const,
		get_outgoing_links: 'always' as const,
		get_graph_neighbors: 'always' as const,
		rename_file: 'ask' as const,
		create_folder: 'ask' as const,
		move_file: 'ask' as const,
		delete_file: 'ask' as const,
		get_file_metadata: 'always' as const,
		update_frontmatter: 'ask' as const,
		get_tags: 'always' as const,
		get_daily_note: 'always' as const,
		create_from_template: 'ask' as const,
		get_workspace_layout: 'always' as const,
		create_pane: 'always' as const
	}
};

/**
 * Mock VaultAdapter
 */
export class MockVaultAdapter {
	constructor(public vault: MockVault) {}

	async readFile(filePath: string): Promise<string> {
		const file = this.vault.getAbstractFileByPath(filePath);
		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}
		// Use instanceof check to ensure it's a TFile
		if (!(file instanceof TFile) && !(Object.getPrototypeOf(file) === TFile.prototype)) {
			throw new Error(`Path is not a file: ${filePath}`);
		}
		return await this.vault.read(file as TFile);
	}

	async listFiles(directory?: string): Promise<string[]> {
		const allFiles = this.vault.getFiles();
		if (!directory) {
			return allFiles.map(file => file.path);
		}
		const filtered = allFiles.filter(file => 
			file.path.startsWith(directory + '/') || file.path === directory
		);
		return filtered.map(file => file.path);
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(filePath);
		if (file) {
			// Use instanceof check to ensure it's a TFile
			if (!(file instanceof TFile) && !(Object.getPrototypeOf(file) === TFile.prototype)) {
				throw new Error(`Path is not a file: ${filePath}`);
			}
			await this.vault.modify(file as TFile, content);
		} else {
			await this.vault.create(filePath, content);
		}
	}
}

/**
 * Mock App for testing
 */
export const createMockApp = (vault: MockVault): any => {
	return {
		vault,
		workspace: {
			getActiveFile: () => null,
			getLeaf: () => ({
				openFile: async () => {}
			}),
			getLeavesOfType: () => [],
			activeLeaf: null
		},
		metadataCache: {
			getFileCache: () => null,
			getBacklinksForFile: () => ({ count: () => 0, data: new Map() }),
			getFirstLinkpathDest: () => null
		},
		fileManager: {
			renameFile: async () => {},
			processFrontMatter: async () => {}
		}
	};
};

/**
 * Create test GeminiClient with mock app
 */
export const createTestClient = (settings: any, vault: MockVault, vaultPath: string = '/test/vault') => {
	const mockVaultAdapter = new MockVaultAdapter(vault);
	const mockApp = createMockApp(vault);
	const GeminiClient = require('../src/gemini-client').GeminiClient;
	return new GeminiClient(settings, mockVaultAdapter, vaultPath, '/test/data', mockApp);
};

