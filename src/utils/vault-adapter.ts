import { Vault, TFile, TFolder } from 'obsidian';

/**
 * Adapter for Obsidian Vault operations
 * Provides abstraction layer for file operations
 */
export class VaultAdapter {
	constructor(public vault: Vault) {} // Made public for direct access

	/**
	 * Read file content
	 */
	async readFile(filePath: string): Promise<string> {
		const file = this.vault.getAbstractFileByPath(filePath);
		
		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}
		
		if (!(file instanceof TFile)) {
			throw new Error(`Path is not a file: ${filePath}`);
		}
		
		return await this.vault.read(file);
	}

	/**
	 * List all files in vault or specific directory
	 */
	async listFiles(directory?: string): Promise<string[]> {
		const allFiles = this.vault.getFiles();
		
		if (!directory) {
			return allFiles.map(file => file.path);
		}
		
		// Filter files in specific directory
		const filtered = allFiles.filter(file => 
			file.path.startsWith(directory + '/') || file.path === directory
		);
		
		return filtered.map(file => file.path);
	}

	/**
	 * Write or create file
	 */
	async writeFile(filePath: string, content: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(filePath);
		
		if (file instanceof TFile) {
			// File exists, modify it
			await this.vault.modify(file, content);
		} else {
			// Create new file
			await this.vault.create(filePath, content);
		}
	}
}
