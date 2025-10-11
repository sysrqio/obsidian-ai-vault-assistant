import { App, TFile, TFolder, WorkspaceLeaf, Notice, getAllTags } from 'obsidian';
import { VaultAdapter } from './utils/vault-adapter';

/**
 * Vault Tools - Advanced Obsidian vault operations
 * Provides comprehensive access to vault navigation, metadata, and workspace management
 */
export class VaultTools {
	constructor(
		private app: App,
		private vaultAdapter: VaultAdapter
	) {}

	// ============================================================================
	// Phase 1: Essential Tools
	// ============================================================================

	/**
	 * Get information about the currently active file
	 */
	async getActiveFile(): Promise<string> {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile) {
			return 'No file is currently open in the active pane.';
		}

		const content = await this.app.vault.read(activeFile);
		const metadata = this.app.metadataCache.getFileCache(activeFile);
		
		let result = `# Active File: ${activeFile.basename}\n\n`;
		result += `**Path**: ${activeFile.path}\n`;
		result += `**Extension**: ${activeFile.extension}\n`;
		result += `**Size**: ${activeFile.stat.size} bytes\n`;
		result += `**Created**: ${new Date(activeFile.stat.ctime).toLocaleString()}\n`;
		result += `**Modified**: ${new Date(activeFile.stat.mtime).toLocaleString()}\n\n`;
		
		if (metadata?.frontmatter) {
			result += `## Frontmatter\n\`\`\`yaml\n${JSON.stringify(metadata.frontmatter, null, 2)}\n\`\`\`\n\n`;
		}
		
		if (metadata?.tags && metadata.tags.length > 0) {
			result += `## Tags\n${metadata.tags.map(t => `- ${t.tag}`).join('\n')}\n\n`;
		}
		
		result += `## Content Preview\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`;
		
		return result;
	}

	/**
	 * Open a file in Obsidian
	 */
	async openFile(filePath: string, newPane: boolean = false): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}
		
		if (!(file instanceof TFile)) {
			throw new Error(`Path is not a file: ${filePath}`);
		}
		
		if (newPane) {
			const leaf = this.app.workspace.getLeaf('split');
			await leaf.openFile(file);
		} else {
			const leaf = this.app.workspace.getLeaf();
			await leaf.openFile(file);
		}
		
		return `Opened file: ${filePath}${newPane ? ' (in new pane)' : ''}`;
	}

	/**
	 * Search vault content using Omnisearch if available, otherwise fallback to simple search
	 */
	async searchVault(query: string, limit: number = 20): Promise<string> {
		// Check if Omnisearch plugin is installed and has API
		const omnisearchPlugin = (this.app as any).plugins?.plugins?.['omnisearch'];
		
		// If plugin exists and has API, use it (don't check 'enabled' as it may not exist)
		if (omnisearchPlugin?.api) {
			console.log('[VaultTools] ✅ Using Omnisearch plugin for search');
			return await this.searchWithOmnisearch(query, limit, omnisearchPlugin.api);
		}
		
		console.log('[VaultTools] ℹ️ Using built-in search (Omnisearch not available)');
		console.log('[VaultTools] Reason: Omnisearch plugin', omnisearchPlugin ? 'found but no API' : 'not found');
		return await this.searchBuiltin(query, limit);
	}

	/**
	 * Search using Omnisearch plugin API
	 */
	private async searchWithOmnisearch(query: string, limit: number, omnisearchAPI: any): Promise<string> {
		try {
			console.log(`[VaultTools] 🔍 Using Omnisearch for query: "${query}"`);
			
			// Use Omnisearch API
			const results = await omnisearchAPI.search(query);
			
			console.log(`[VaultTools] ✅ Omnisearch returned ${results?.length || 0} results`);
			
			if (!results || results.length === 0) {
				return `No results found for: "${query}"\n\n*Searched using Omnisearch plugin*`;
			}
			
			const limitedResults = results.slice(0, limit);
			
			let output = `# 🔍 Search Results for "${query}"\n\n`;
			output += `*✨ Powered by Omnisearch plugin (fuzzy matching, relevance scoring)*\n\n`;
			output += `Found ${results.length} ${results.length === 1 ? 'result' : 'results'}`;
			if (results.length > limit) {
				output += ` (showing top ${limit})`;
			}
			output += ':\n\n';
			
			limitedResults.forEach((result: any, idx: number) => {
				const score = result.score ? ` (${Math.round(result.score * 100)}% match)` : '';
				output += `${idx + 1}. **[[${result.basename || result.path}]]**${score}\n`;
				output += `   *${result.path}*\n`;
				
				// Add excerpt/context if available
				if (result.excerpt || result.matches?.[0]?.excerpt) {
					const excerpt = result.excerpt || result.matches[0].excerpt;
					output += `   ${excerpt}\n`;
				}
				
				output += '\n';
			});
			
			return output;
		} catch (error) {
			console.warn('[VaultTools] ⚠️ Omnisearch failed, falling back to built-in search:', error);
			return await this.searchBuiltin(query, limit);
		}
	}

	/**
	 * Built-in search implementation (fallback)
	 */
	private async searchBuiltin(query: string, limit: number): Promise<string> {
		console.log(`[VaultTools] 🔍 Built-in search for query: "${query}"`);
		
		const files = this.app.vault.getMarkdownFiles();
		const results: Array<{ file: TFile; matches: string[] }> = [];
		
		const searchTermLower = query.toLowerCase();
		
		for (const file of files) {
			const content = await this.app.vault.read(file);
			const contentLower = content.toLowerCase();
			
			if (contentLower.includes(searchTermLower)) {
				// Extract context around matches
				const lines = content.split('\n');
				const matches: string[] = [];
				
				lines.forEach((line, idx) => {
					if (line.toLowerCase().includes(searchTermLower)) {
						// Get context: current line + 1 before + 1 after
						const context: string[] = [];
						if (idx > 0) context.push(lines[idx - 1]);
						context.push(`> ${line}`);
						if (idx < lines.length - 1) context.push(lines[idx + 1]);
						
						matches.push(context.join('\n'));
					}
				});
				
				if (matches.length > 0) {
					results.push({ file, matches: matches.slice(0, 3) }); // Max 3 matches per file
				}
			}
			
			if (results.length >= limit) break;
		}
		
		console.log(`[VaultTools] ✅ Built-in search found ${results.length} results`);
		
		if (results.length === 0) {
			return `No results found for: "${query}"`;
		}
		
		let output = `# Search Results for "${query}"\n\n`;
		output += `Found ${results.length} ${results.length === 1 ? 'file' : 'files'} with matches:\n\n`;
		
		results.forEach(({ file, matches }) => {
			output += `## [[${file.basename}]]\n`;
			output += `*${file.path}*\n\n`;
			matches.forEach(match => {
				output += `${match}\n\n`;
			});
			output += '---\n\n';
		});
		
		return output;
	}

	/**
	 * Get recently modified files
	 */
	async getRecentFiles(count: number = 10, hoursBack: number = 24): Promise<string> {
		const files = this.app.vault.getMarkdownFiles();
		const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
		
		const recentFiles = files
			.filter(f => f.stat.mtime > cutoffTime)
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, count);
		
		if (recentFiles.length === 0) {
			return `No files modified in the last ${hoursBack} hours.`;
		}
		
		let result = `# Recent Files (Last ${hoursBack} hours)\n\n`;
		result += `Found ${recentFiles.length} ${recentFiles.length === 1 ? 'file' : 'files'}:\n\n`;
		
		recentFiles.forEach(file => {
			const timeAgo = this.formatTimeAgo(Date.now() - file.stat.mtime);
			result += `- **[[${file.basename}]]** - ${file.path}\n`;
			result += `  *Modified ${timeAgo} ago*\n`;
		});
		
		return result;
	}

	// ============================================================================
	// Phase 2: High Value Tools
	// ============================================================================

	/**
	 * Get backlinks to a file
	 */
	async getBacklinks(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filePath}`);
		}
		
		const backlinks = (this.app.metadataCache as any).getBacklinksForFile?.(file);
		
		if (!backlinks || backlinks.count() === 0) {
			return `No backlinks found for: ${file.basename}`;
		}
		
		let result = `# Backlinks to [[${file.basename}]]\n\n`;
		result += `Found ${backlinks.count()} ${backlinks.count() === 1 ? 'backlink' : 'backlinks'}:\n\n`;
		
		for (const [linkPath, links] of backlinks.data) {
			const linkFile = this.app.vault.getAbstractFileByPath(linkPath);
			if (linkFile instanceof TFile) {
				result += `## [[${linkFile.basename}]]\n`;
				result += `*${linkPath}*\n`;
				result += `- ${links.length} ${links.length === 1 ? 'reference' : 'references'}\n\n`;
			}
		}
		
		return result;
	}

	/**
	 * Get outgoing links from a file
	 */
	async getOutgoingLinks(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filePath}`);
		}
		
		const metadata = this.app.metadataCache.getFileCache(file);
		
		if (!metadata?.links || metadata.links.length === 0) {
			return `No outgoing links found in: ${file.basename}`;
		}
		
		let result = `# Outgoing Links from [[${file.basename}]]\n\n`;
		result += `Found ${metadata.links.length} ${metadata.links.length === 1 ? 'link' : 'links'}:\n\n`;
		
		metadata.links.forEach(link => {
			result += `- [[${link.link}]]`;
			if (link.displayText && link.displayText !== link.link) {
				result += ` (displayed as: "${link.displayText}")`;
			}
			result += '\n';
		});
		
		return result;
	}

	/**
	 * Rename a file (Obsidian handles backlink updates automatically)
	 */
	async renameFile(oldPath: string, newName: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(oldPath);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${oldPath}`);
		}
		
		// Sanitize new name
		const sanitizedName = this.sanitizeFileName(newName);
		
		// Ensure .md extension
		const finalName = sanitizedName.endsWith('.md') ? sanitizedName : `${sanitizedName}.md`;
		
		// Get directory path
		const directory = oldPath.substring(0, oldPath.lastIndexOf('/'));
		const newPath = directory ? `${directory}/${finalName}` : finalName;
		
		await this.app.fileManager.renameFile(file, newPath);
		
		return `Renamed file from "${file.basename}" to "${finalName}"\nNew path: ${newPath}\n\nNote: All backlinks have been automatically updated by Obsidian.`;
	}

	/**
	 * Get daily note (or create if doesn't exist)
	 */
	async getDailyNote(): Promise<string> {
		// Check if Daily Notes plugin is enabled
		const dailyNotesPlugin = (this.app as any).internalPlugins?.plugins?.['daily-notes'];
		
		if (!dailyNotesPlugin || !dailyNotesPlugin.enabled) {
			return 'Daily Notes plugin is not enabled. Please enable it in Settings → Core Plugins → Daily Notes.';
		}
		
		// Get daily notes settings
		const dailyNotesSettings = dailyNotesPlugin.instance?.options || {};
		const format = dailyNotesSettings.format || 'YYYY-MM-DD';
		const folder = dailyNotesSettings.folder || '';
		
		// Get today's note filename
		const today = new Date();
		const fileName = this.formatDate(today, format);
		const filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
		
		// Check if daily note exists
		let file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file) {
			// Create daily note
			const template = dailyNotesSettings.template || '';
			const content = template ? await this.getTemplateContent(template) : `# ${fileName}\n\n`;
			
			file = await this.app.vault.create(filePath, content);
			
			// Open the new daily note
			const leaf = this.app.workspace.getLeaf();
			if (file instanceof TFile) {
				await leaf.openFile(file);
			}
			
			return `Created and opened today's daily note: ${fileName}\nPath: ${filePath}`;
		}
		
		// Open existing daily note
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf();
			await leaf.openFile(file);
			return `Opened today's daily note: ${fileName}\nPath: ${filePath}`;
		}
		
		return `Daily note path exists but is not a file: ${filePath}`;
	}

	// ============================================================================
	// Phase 3: Nice to Have Tools
	// ============================================================================

	/**
	 * Get file metadata including frontmatter
	 */
	async getFileMetadata(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filePath}`);
		}
		
		const metadata = this.app.metadataCache.getFileCache(file);
		const stat = file.stat;
		
		let result = `# Metadata for [[${file.basename}]]\n\n`;
		result += `## File Information\n`;
		result += `- **Path**: ${file.path}\n`;
		result += `- **Extension**: ${file.extension}\n`;
		result += `- **Size**: ${stat.size} bytes\n`;
		result += `- **Created**: ${new Date(stat.ctime).toLocaleString()}\n`;
		result += `- **Modified**: ${new Date(stat.mtime).toLocaleString()}\n\n`;
		
		if (metadata?.frontmatter) {
			result += `## Frontmatter\n\`\`\`yaml\n`;
			for (const [key, value] of Object.entries(metadata.frontmatter)) {
				if (key !== 'position') { // Skip internal position field
					result += `${key}: ${JSON.stringify(value)}\n`;
				}
			}
			result += `\`\`\`\n\n`;
		}
		
		if (metadata?.tags && metadata.tags.length > 0) {
			result += `## Tags\n`;
			metadata.tags.forEach(t => result += `- ${t.tag}\n`);
			result += '\n';
		}
		
		if (metadata?.links && metadata.links.length > 0) {
			result += `## Outgoing Links (${metadata.links.length})\n`;
			metadata.links.slice(0, 10).forEach(l => result += `- [[${l.link}]]\n`);
			if (metadata.links.length > 10) {
				result += `- ... and ${metadata.links.length - 10} more\n`;
			}
			result += '\n';
		}
		
		const backlinks = (this.app.metadataCache as any).getBacklinksForFile?.(file);
		if (backlinks && backlinks.count() > 0) {
			result += `## Backlinks (${backlinks.count()})\n`;
			let count = 0;
			for (const [linkPath] of backlinks.data) {
				if (count >= 10) break;
				const linkFile = this.app.vault.getAbstractFileByPath(linkPath);
				if (linkFile instanceof TFile) {
					result += `- [[${linkFile.basename}]]\n`;
					count++;
				}
			}
			if (backlinks.count() > 10) {
				result += `- ... and ${backlinks.count() - 10} more\n`;
			}
		}
		
		return result;
	}

	/**
	 * Update frontmatter of a file
	 */
	async updateFrontmatter(filePath: string, updates: Record<string, any>): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filePath}`);
		}
		
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			for (const [key, value] of Object.entries(updates)) {
				frontmatter[key] = value;
			}
		});
		
		const updatedKeys = Object.keys(updates).join(', ');
		return `Updated frontmatter in ${file.basename}:\n${updatedKeys}`;
	}

	/**
	 * Create a folder in the vault
	 */
	async createFolder(folderPath: string): Promise<string> {
		// Check if folder already exists
		const existing = this.app.vault.getAbstractFileByPath(folderPath);
		
		if (existing) {
			if (existing instanceof TFolder) {
				return `Folder already exists: ${folderPath}`;
			} else {
				throw new Error(`Path exists but is a file, not a folder: ${folderPath}`);
			}
		}
		
		// Create folder (recursive - creates parent folders if needed)
		await this.app.vault.createFolder(folderPath);
		
		return `Created folder: ${folderPath}`;
	}

	/**
	 * Move file to a different folder
	 */
	async moveFile(sourcePath: string, targetFolder: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${sourcePath}`);
		}
		
		// Ensure target folder exists
		const folderExists = this.app.vault.getAbstractFileByPath(targetFolder);
		if (targetFolder && !folderExists) {
			await this.app.vault.createFolder(targetFolder);
		}
		
		const newPath = targetFolder ? `${targetFolder}/${file.name}` : file.name;
		await this.app.fileManager.renameFile(file, newPath);
		
		return `Moved ${file.name} to ${targetFolder || 'vault root'}\nNew path: ${newPath}`;
	}

	/**
	 * Get all tags in vault or specific file
	 */
	async getTags(filePath?: string): Promise<string> {
		if (filePath) {
			// Get tags from specific file
			const file = this.app.vault.getAbstractFileByPath(filePath);
			
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}
			
			const metadata = this.app.metadataCache.getFileCache(file);
			const tags = metadata?.tags || [];
			
			if (tags.length === 0) {
				return `No tags found in: ${file.basename}`;
			}
			
			let result = `# Tags in [[${file.basename}]]\n\n`;
			tags.forEach(t => result += `- ${t.tag}\n`);
			return result;
		} else {
			// Get all tags in vault
			const allTags = new Set<string>();
			
			for (const file of this.app.vault.getMarkdownFiles()) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.tags) {
					cache.tags.forEach(t => allTags.add(t.tag));
				}
			}
			
			if (allTags.size === 0) {
				return 'No tags found in vault.';
			}
			
			let result = `# All Tags in Vault\n\n`;
			result += `Found ${allTags.size} unique ${allTags.size === 1 ? 'tag' : 'tags'}:\n\n`;
			
			const sortedTags = Array.from(allTags).sort();
			sortedTags.forEach(tag => result += `- ${tag}\n`);
			
			return result;
		}
	}

	// ============================================================================
	// Phase 4: Advanced Tools
	// ============================================================================

	/**
	 * Delete a file
	 */
	async deleteFile(filePath: string, permanent: boolean = false): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filePath}`);
		}
		
		const fileName = file.basename;
		
		if (permanent) {
			await this.app.vault.delete(file);
			return `Permanently deleted: ${fileName}`;
		} else {
			await this.app.vault.trash(file, true); // true = use system trash
			return `Moved to trash: ${fileName}`;
		}
	}

	/**
	 * Create file from template
	 */
	async createFromTemplate(templatePath: string, newFilePath: string, variables?: Record<string, string>): Promise<string> {
		const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
		
		if (!templateFile || !(templateFile instanceof TFile)) {
			throw new Error(`Template not found: ${templatePath}`);
		}
		
		let content = await this.app.vault.read(templateFile);
		
		// Replace variables if provided
		if (variables) {
			for (const [key, value] of Object.entries(variables)) {
				const regex = new RegExp(`{{${key}}}`, 'g');
				content = content.replace(regex, value);
			}
		}
		
		// Replace date variables
		const today = new Date();
		content = content.replace(/{{date}}/g, this.formatDate(today, 'YYYY-MM-DD'));
		content = content.replace(/{{time}}/g, today.toLocaleTimeString());
		content = content.replace(/{{datetime}}/g, today.toLocaleString());
		
		// Sanitize target path
		const sanitizedPath = this.sanitizeFilePath(newFilePath);
		
		// Create the file
		const newFile = await this.app.vault.create(sanitizedPath, content);
		
		// Open the new file
		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(newFile);
		
		return `Created new file from template: ${sanitizedPath}\nTemplate: ${templatePath}${variables ? `\nVariables applied: ${Object.keys(variables).join(', ')}` : ''}`;
	}

	/**
	 * Get graph neighbors (directly connected notes)
	 */
	async getGraphNeighbors(filePath: string, depth: number = 1): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filePath}`);
		}
		
		const neighbors = new Set<string>();
		
		// Get outgoing links
		const metadata = this.app.metadataCache.getFileCache(file);
		if (metadata?.links) {
			metadata.links.forEach(link => {
				const linkedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
				if (linkedFile) {
					neighbors.add(linkedFile.path);
				}
			});
		}
		
		// Get backlinks
		const backlinks = (this.app.metadataCache as any).getBacklinksForFile?.(file);
		if (backlinks) {
			for (const [linkPath] of backlinks.data) {
				neighbors.add(linkPath);
			}
		}
		
		if (neighbors.size === 0) {
			return `No connected notes found for: ${file.basename}`;
		}
		
		let result = `# Graph Neighbors for [[${file.basename}]]\n\n`;
		result += `Found ${neighbors.size} directly connected ${neighbors.size === 1 ? 'note' : 'notes'}:\n\n`;
		
		for (const neighborPath of neighbors) {
			const neighborFile = this.app.vault.getAbstractFileByPath(neighborPath);
			if (neighborFile instanceof TFile) {
				result += `- [[${neighborFile.basename}]] (${neighborPath})\n`;
			}
		}
		
		return result;
	}

	/**
	 * Get workspace layout information
	 */
	async getWorkspaceLayout(): Promise<string> {
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		
		if (leaves.length === 0) {
			return 'No markdown files are currently open in the workspace.';
		}
		
		let result = `# Workspace Layout\n\n`;
		result += `Open panes: ${leaves.length}\n\n`;
		
		leaves.forEach((leaf, idx) => {
			const file = (leaf.view as any).file;
			if (file instanceof TFile) {
				const isActive = leaf === this.app.workspace.activeLeaf;
				result += `${idx + 1}. ${isActive ? '**' : ''}[[${file.basename}]]${isActive ? '** (active)' : ''}\n`;
				result += `   ${file.path}\n`;
			}
		});
		
		return result;
	}

	/**
	 * Create new pane/split
	 */
	async createPane(filePath?: string, direction: 'vertical' | 'horizontal' = 'vertical'): Promise<string> {
		const splitType = direction === 'vertical' ? 'vertical' : 'horizontal';
		const leaf = this.app.workspace.getLeaf('split', splitType);
		
		if (filePath) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}
			
			await leaf.openFile(file);
			return `Created new ${direction} pane and opened: ${file.basename}`;
		} else {
			return `Created new ${direction} pane`;
		}
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	private sanitizeFileName(fileName: string): string {
		return fileName
			.replace(/[:/\\*?"<>|]/g, '-')  // Replace invalid chars
			.replace(/\s+/g, ' ')            // Normalize whitespace
			.replace(/^[.\s]+|[.\s]+$/g, '') // Trim dots and spaces
			.trim();
	}

	private sanitizeFilePath(filePath: string): string {
		const parts = filePath.split('/');
		const fileName = parts.pop() || '';
		const directory = parts.join('/');
		
		let sanitized = this.sanitizeFileName(fileName);
		
		if (!sanitized) {
			sanitized = 'Untitled';
		}
		
		if (!sanitized.endsWith('.md')) {
			sanitized += '.md';
		}
		
		return directory ? `${directory}/${sanitized}` : sanitized;
	}

	private formatTimeAgo(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		
		if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
		if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
		if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
		return `${seconds} second${seconds !== 1 ? 's' : ''}`;
	}

	private formatDate(date: Date, format: string): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		
		return format
			.replace('YYYY', String(year))
			.replace('MM', month)
			.replace('DD', day);
	}

	private async getTemplateContent(templatePath: string): Promise<string> {
		const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
		
		if (!templateFile || !(templateFile instanceof TFile)) {
			return '';
		}
		
		return await this.app.vault.read(templateFile);
	}
}

