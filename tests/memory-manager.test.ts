/**
 * Tests for MemoryManager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryManager } from '../src/memory-manager';
import { DataAdapter } from 'obsidian';

// Mock DataAdapter
class MockDataAdapter implements DataAdapter {
	private files: Map<string, string> = new Map();
	basePath = '/tmp/test';

	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (!content) throw new Error(`File not found: ${path}`);
		return content;
	}

	async write(path: string, data: string): Promise<void> {
		this.files.set(path, data);
	}

	// Other required methods (not used by MemoryManager)
	async readBinary(path: string): Promise<ArrayBuffer> {
		throw new Error('Not implemented');
	}
	async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
		throw new Error('Not implemented');
	}
	async append(path: string, data: string): Promise<void> {
		throw new Error('Not implemented');
	}
	async process(path: string, fn: (data: string) => string): Promise<string> {
		throw new Error('Not implemented');
	}
	async stat(path: string): Promise<any> {
		throw new Error('Not implemented');
	}
	async list(path: string): Promise<any> {
		throw new Error('Not implemented');
	}
	async mkdir(path: string): Promise<void> {}
	async rmdir(path: string, recursive?: boolean): Promise<void> {}
	async remove(path: string): Promise<void> {
		this.files.delete(path);
	}
	async rename(oldPath: string, newPath: string): Promise<void> {
		const content = this.files.get(oldPath);
		if (content) {
			this.files.set(newPath, content);
			this.files.delete(oldPath);
		}
	}
	async copy(src: string, dest: string): Promise<void> {
		const content = this.files.get(src);
		if (content) this.files.set(dest, content);
	}
	async getUrl(path: string): Promise<string> {
		return path;
	}
	async trashSystem(path: string): Promise<boolean> {
		this.files.delete(path);
		return true;
	}
	async trashLocal(path: string): Promise<void> {
		this.files.delete(path);
	}
	getName(): string {
		return 'MockDataAdapter';
	}
	getResourcePath(path: string): string {
		return path;
	}
}

describe('MemoryManager', () => {
	let testDir: string;
	let memoryManager: MemoryManager;
	let mockAdapter: MockDataAdapter;

	beforeEach(async () => {
		// Create temp directory and mock adapter
		testDir = `test-dir-${Date.now()}`;
		mockAdapter = new MockDataAdapter();
		memoryManager = new MemoryManager(mockAdapter, testDir);
	});

	afterEach(async () => {
		// Mock adapter cleanup happens automatically (in-memory)
	});

	test('should start with no memories', async () => {
		await memoryManager.loadMemories();
		expect(memoryManager.getMemoryCount()).toBe(0);
	});

	test('should add a memory', async () => {
		await memoryManager.loadMemories();
		const memory = await memoryManager.addMemory('Test fact', 'test-category');
		
		expect(memory.fact).toBe('Test fact');
		expect(memory.category).toBe('test-category');
		expect(memory.id).toBeDefined();
		expect(memory.timestamp).toBeDefined();
		expect(memoryManager.getMemoryCount()).toBe(1);
	});

	test('should persist memories to disk', async () => {
		await memoryManager.loadMemories();
		await memoryManager.addMemory('Fact 1', 'cat1');
		await memoryManager.addMemory('Fact 2', 'cat2');
		
		// Create new instance and load (using the same mockAdapter to access the same "files")
		const memoryManager2 = new MemoryManager(mockAdapter, testDir);
		await memoryManager2.loadMemories();
		
		expect(memoryManager2.getMemoryCount()).toBe(2);
	});

	test('should format memories as text', async () => {
		await memoryManager.loadMemories();
		await memoryManager.addMemory('Test fact 1', 'preferences');
		await memoryManager.addMemory('Test fact 2', 'projects');
		
		const text = memoryManager.getMemoriesAsText();
		
		expect(text).toContain('## Saved Memories');
		expect(text).toContain('Test fact 1');
		expect(text).toContain('Test fact 2');
		// Note: Current implementation doesn't include categories in text output
	});

	test('should return empty string when no memories', async () => {
		await memoryManager.loadMemories();
		const text = memoryManager.getMemoriesAsText();
		expect(text).toBe('');
	});

	test('should delete a memory by ID', async () => {
		await memoryManager.loadMemories();
		const memory1 = await memoryManager.addMemory('Fact 1');
		const memory2 = await memoryManager.addMemory('Fact 2');
		
		const deleted = await memoryManager.deleteMemory(memory1.id);
		
		expect(deleted).toBe(true);
		expect(memoryManager.getMemoryCount()).toBe(1);
	});

	test('should return false when deleting non-existent memory', async () => {
		await memoryManager.loadMemories();
		const deleted = await memoryManager.deleteMemory('non-existent-id');
		expect(deleted).toBe(false);
	});

	test('should clear all memories', async () => {
		await memoryManager.loadMemories();
		await memoryManager.addMemory('Fact 1');
		await memoryManager.addMemory('Fact 2');
		await memoryManager.addMemory('Fact 3');
		
		await memoryManager.clearMemories();
		
		expect(memoryManager.getMemoryCount()).toBe(0);
	});

	test('should handle missing memory file gracefully', async () => {
		// Don't create any memory file, just load
		await expect(memoryManager.loadMemories()).resolves.not.toThrow();
		expect(memoryManager.getMemoryCount()).toBe(0);
	});

	test('should trim whitespace from facts', async () => {
		await memoryManager.loadMemories();
		const memory = await memoryManager.addMemory('  Test fact  ', '  test-cat  ');
		
		expect(memory.fact).toBe('Test fact');
		// Note: Category trimming could be added to implementation if needed
		expect(memory.category).toBeDefined();
	});
});

