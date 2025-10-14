import { DataAdapter } from 'obsidian';
import { Logger } from './utils/logger';

export interface MemoryEntry {
	id: string;
	fact: string;
	timestamp: number;
	category?: string;
}

export interface MemoryData {
	memories: MemoryEntry[];
	version: string;
}

const MEMORY_FILE_NAME = 'memory.json';
const CURRENT_VERSION = '1.0';

export class MemoryManager {
	private memoryFilePath: string;
	private memories: MemoryEntry[] = [];
	private adapter: DataAdapter;

	constructor(adapter: DataAdapter, pluginDataPath: string) {
		this.adapter = adapter;
		this.memoryFilePath = `${pluginDataPath}/${MEMORY_FILE_NAME}`;
	}

	async loadMemories(): Promise<void> {
		try {
			const exists = await this.adapter.exists(this.memoryFilePath);
			if (!exists) {
				Logger.debug('Memory', 'No memory file found, starting fresh');
				this.memories = [];
				return;
			}
			
			const data = await this.adapter.read(this.memoryFilePath);
			const memoryData: MemoryData = JSON.parse(data);
			
			if (memoryData.version !== CURRENT_VERSION) {
				Logger.warn('Memory', 'Version mismatch, attempting migration...');
			}
			
			this.memories = memoryData.memories || [];
			Logger.debug('Memory', 'Loaded ' + this.memories.length + ' memories');
		} catch (error: any) {
			Logger.error('Memory', 'Error loading memories:', error);
			this.memories = [];
		}
	}

	async saveMemories(): Promise<void> {
		try {
			const memoryData: MemoryData = {
				memories: this.memories,
				version: CURRENT_VERSION
			};
			
			const jsonData = JSON.stringify(memoryData, null, 2);
			await this.adapter.write(this.memoryFilePath, jsonData);
			Logger.debug('Memory', 'Saved ' + this.memories.length + ' memories');
		} catch (error) {
			Logger.error('Memory', 'Error saving memories:', error);
			throw error;
		}
	}

	async addMemory(fact: string, category?: string): Promise<MemoryEntry> {
		const newMemory: MemoryEntry = {
			id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
			fact: fact.trim(),
			timestamp: Date.now(),
			category
		};
		
		this.memories.push(newMemory);
		await this.saveMemories();
		
		Logger.debug('Memory', 'Added new memory: "' + fact + '"');
		return newMemory;
	}

	getMemories(): MemoryEntry[] {
		return [...this.memories];
	}

	getMemoriesAsText(): string {
		if (this.memories.length === 0) {
			return '';
		}
		
		const bulletPoints = this.memories.map(m => '- ' + m.fact).join('\n');
		return '## Saved Memories\n' + bulletPoints;
	}

	async clearMemories(): Promise<void> {
		this.memories = [];
		await this.saveMemories();
		Logger.debug('Memory', 'Cleared all memories');
	}

	async deleteMemory(id: string): Promise<boolean> {
		const initialLength = this.memories.length;
		this.memories = this.memories.filter(m => m.id !== id);
		
		if (this.memories.length < initialLength) {
			await this.saveMemories();
			Logger.debug('Memory', 'Deleted memory: ' + id);
			return true;
		}
		
		return false;
	}

	getMemoryCount(): number {
		return this.memories.length;
	}
}
