import { DataAdapter } from 'obsidian';
import { Logger } from '../utils/logger';
import { Content } from '@google/genai';

export interface ChatHistory {
	id: string;
	name: string;
	createdAt: number;
	modifiedAt: number;
	contents: Content[];
}

export interface ChatHistoryManifest {
	histories: Array<{
		id: string;
		name: string;
		createdAt: number;
		modifiedAt: number;
	}>;
	version: string;
}

const MANIFEST_FILE_NAME = 'chat-histories.json';
const HISTORY_DIR_NAME = 'chat-histories';
const CURRENT_VERSION = '1.0';

export class ChatHistoryManager {
	private manifestFilePath: string;
	private historyDirPath: string;
	private adapter: DataAdapter;
	private manifest: ChatHistoryManifest;

	constructor(adapter: DataAdapter, pluginDataPath: string) {
		this.adapter = adapter;
		this.manifestFilePath = `${pluginDataPath}/${MANIFEST_FILE_NAME}`;
		this.historyDirPath = `${pluginDataPath}/${HISTORY_DIR_NAME}`;
		this.manifest = { histories: [], version: CURRENT_VERSION };
	}

	/**
	 * Load manifest file (list of all histories)
	 */
	async loadManifest(): Promise<void> {
		try {
			const exists = await this.adapter.exists(this.manifestFilePath);
			if (!exists) {
				Logger.debug('ChatHistory', 'No manifest file found, starting fresh');
				this.manifest = { histories: [], version: CURRENT_VERSION };
				return;
			}

			const data = await this.adapter.read(this.manifestFilePath);
			const manifestData: ChatHistoryManifest = JSON.parse(data);

			if (manifestData.version !== CURRENT_VERSION) {
				Logger.warn('ChatHistory', 'Version mismatch, attempting migration...');
			}

			this.manifest = manifestData;
			Logger.debug('ChatHistory', 'Loaded manifest with ' + this.manifest.histories.length + ' histories');
		} catch (error: any) {
			Logger.error('ChatHistory', 'Error loading manifest:', error);
			this.manifest = { histories: [], version: CURRENT_VERSION };
		}
	}

	/**
	 * Save manifest file
	 */
	async saveManifest(): Promise<void> {
		try {
			const jsonData = JSON.stringify(this.manifest, null, 2);
			await this.adapter.write(this.manifestFilePath, jsonData);
			Logger.debug('ChatHistory', 'Saved manifest with ' + this.manifest.histories.length + ' histories');
		} catch (error) {
			Logger.error('ChatHistory', 'Error saving manifest:', error);
			throw error;
		}
	}

	/**
	 * Ensure history directory exists
	 */
	private async ensureHistoryDir(): Promise<void> {
		try {
			const exists = await this.adapter.exists(this.historyDirPath);
			if (!exists) {
				// Try to create directory using mkdir if available (for DataAdapter)
				// Otherwise, write() should create parent directories automatically
				if (typeof (this.adapter as any).mkdir === 'function') {
					try {
						await (this.adapter as any).mkdir(this.historyDirPath);
						Logger.debug('ChatHistory', 'Created history directory using mkdir');
						return;
					} catch (mkdirError: any) {
						Logger.debug('ChatHistory', 'mkdir failed, will try write approach');
					}
				}
				
				// Fallback: Create directory by writing a dummy file
				// Obsidian's adapter.write() should create parent directories automatically
				const dummyFile = `${this.historyDirPath}/.gitkeep`;
				try {
					await this.adapter.write(dummyFile, '');
					Logger.debug('ChatHistory', 'Created history directory via dummy file');
				} catch (writeError: any) {
					Logger.debug('ChatHistory', 'Directory creation failed, will try on first history save');
					// Don't throw - write() might still work and create the directory
				}
			}
		} catch (error) {
			Logger.debug('ChatHistory', 'Directory check failed, will try to create on first write');
			// Don't throw - we'll try to create the directory when writing the first file
		}
	}

	/**
	 * Load specific history file
	 */
	async loadHistory(id: string): Promise<ChatHistory | null> {
		try {
			// ID already includes 'chat-' prefix, so don't add it again
			const historyFilePath = `${this.historyDirPath}/${id}.json`;
			const exists = await this.adapter.exists(historyFilePath);
			if (!exists) {
				Logger.debug('ChatHistory', 'History file not found: ' + id);
				return null;
			}

			const data = await this.adapter.read(historyFilePath);
			const history: ChatHistory = JSON.parse(data);
			Logger.debug('ChatHistory', 'Loaded history: ' + id);
			return history;
		} catch (error: any) {
			Logger.error('ChatHistory', 'Error loading history ' + id + ':', error);
			return null;
		}
	}

	/**
	 * Save history to individual file
	 */
	async saveHistory(id: string, history: ChatHistory): Promise<void> {
		try {
			// ID already includes 'chat-' prefix, so don't add it again
			const historyFilePath = `${this.historyDirPath}/${id}.json`;
			
			// Try to ensure directory exists first
			try {
				await this.ensureHistoryDir();
			} catch (dirError) {
				// Directory creation might fail, but write() should create parent directories
				Logger.debug('ChatHistory', 'Directory check failed, proceeding with write');
			}
			
			const jsonData = JSON.stringify(history, null, 2);
			await this.adapter.write(historyFilePath, jsonData);
			Logger.debug('ChatHistory', 'Saved history: ' + id);
		} catch (error) {
			Logger.error('ChatHistory', 'Error saving history ' + id + ':', error);
			throw error;
		}
	}

	/**
	 * Generate default name based on current date/time
	 */
	private generateDefaultName(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		return `Chat - ${year}-${month}-${day} ${hours}:${minutes}`;
	}

	/**
	 * Create new history (creates file + updates manifest)
	 */
	async createHistory(name: string | undefined, contents: Content[]): Promise<ChatHistory> {
		const id = 'chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
		const historyName = name || this.generateDefaultName();
		const now = Date.now();

		const history: ChatHistory = {
			id,
			name: historyName,
			createdAt: now,
			modifiedAt: now,
			contents: contents
		};

		await this.saveHistory(id, history);

		// Update manifest
		this.manifest.histories.push({
			id,
			name: historyName,
			createdAt: now,
			modifiedAt: now
		});
		await this.saveManifest();

		Logger.debug('ChatHistory', 'Created new history: ' + id + ' (' + historyName + ')');
		return history;
	}

	/**
	 * Update existing history (updates file + manifest modifiedAt)
	 */
	async updateHistory(id: string, contents: Content[]): Promise<boolean> {
		try {
			const history = await this.loadHistory(id);
			if (!history) {
				Logger.warn('ChatHistory', 'History not found for update: ' + id);
				return false;
			}

			history.contents = contents;
			history.modifiedAt = Date.now();

			await this.saveHistory(id, history);

			// Update manifest
			const manifestEntry = this.manifest.histories.find(h => h.id === id);
			if (manifestEntry) {
				manifestEntry.modifiedAt = history.modifiedAt;
				await this.saveManifest();
			}

			Logger.debug('ChatHistory', 'Updated history: ' + id);
			return true;
		} catch (error: any) {
			Logger.error('ChatHistory', 'Error updating history ' + id + ':', error);
			return false;
		}
	}

	/**
	 * Rename history (updates file + manifest)
	 */
	async renameHistory(id: string, newName: string): Promise<boolean> {
		try {
			const history = await this.loadHistory(id);
			if (!history) {
				Logger.warn('ChatHistory', 'History not found for rename: ' + id);
				return false;
			}

			history.name = newName.trim();
			history.modifiedAt = Date.now();

			await this.saveHistory(id, history);

			// Update manifest
			const manifestEntry = this.manifest.histories.find(h => h.id === id);
			if (manifestEntry) {
				manifestEntry.name = newName.trim();
				manifestEntry.modifiedAt = history.modifiedAt;
				await this.saveManifest();
			}

			Logger.debug('ChatHistory', 'Renamed history: ' + id + ' to "' + newName + '"');
			return true;
		} catch (error: any) {
			Logger.error('ChatHistory', 'Error renaming history ' + id + ':', error);
			return false;
		}
	}

	/**
	 * Delete history (deletes file + removes from manifest)
	 */
	async deleteHistory(id: string): Promise<boolean> {
		try {
			// ID already includes 'chat-' prefix, so don't add it again
			const historyFilePath = `${this.historyDirPath}/${id}.json`;
			const exists = await this.adapter.exists(historyFilePath);
			
			if (exists) {
				// Use adapter.remove() to delete the file
				await this.adapter.remove(historyFilePath);
				Logger.debug('ChatHistory', 'Deleted history file: ' + id);
			}

			// Remove from manifest
			const initialLength = this.manifest.histories.length;
			this.manifest.histories = this.manifest.histories.filter(h => h.id !== id);
			
			if (this.manifest.histories.length < initialLength) {
				await this.saveManifest();
				Logger.debug('ChatHistory', 'Deleted history from manifest: ' + id);
				return true;
			}

			return false;
		} catch (error: any) {
			Logger.error('ChatHistory', 'Error deleting history ' + id + ':', error);
			return false;
		}
	}

	/**
	 * Get specific history (loads from file)
	 */
	async getHistory(id: string): Promise<ChatHistory | null> {
		return await this.loadHistory(id);
	}

	/**
	 * Get all histories metadata from manifest (sorted by modifiedAt desc)
	 */
	getAllHistories(): Array<{id: string; name: string; createdAt: number; modifiedAt: number}> {
		return [...this.manifest.histories].sort((a, b) => b.modifiedAt - a.modifiedAt);
	}

	/**
	 * Cleanup old histories if count exceeds maxCount
	 */
	async cleanupOldHistories(maxCount: number): Promise<number> {
		if (this.manifest.histories.length <= maxCount) {
			return 0;
		}

		// Sort by modifiedAt ascending (oldest first)
		const sortedHistories = [...this.manifest.histories].sort((a, b) => a.modifiedAt - b.modifiedAt);
		
		// Delete oldest histories
		const toDelete = sortedHistories.slice(0, sortedHistories.length - maxCount);
		let deletedCount = 0;

		for (const history of toDelete) {
			const deleted = await this.deleteHistory(history.id);
			if (deleted) {
				deletedCount++;
			}
		}

		Logger.debug('ChatHistory', `Cleaned up ${deletedCount} old histories (max: ${maxCount})`);
		return deletedCount;
	}

	/**
	 * Get count of histories
	 */
	getHistoryCount(): number {
		return this.manifest.histories.length;
	}
}
