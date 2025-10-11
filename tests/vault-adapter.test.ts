/**
 * Tests for VaultAdapter
 */

import { MockVault, MockVaultAdapter } from './setup';

describe('VaultAdapter', () => {
	let vault: MockVault;
	let adapter: MockVaultAdapter;

	beforeEach(() => {
		vault = new MockVault({
			'note1.md': '# Note 1\nContent here',
			'folder/note2.md': '# Note 2\nMore content',
			'folder/subfolder/note3.md': '# Note 3\nEven more',
			'README.md': '# Readme\nProject info'
		});
		adapter = new MockVaultAdapter(vault);
	});

	describe('readFile', () => {
		test('should read existing file', async () => {
			const content = await adapter.readFile('note1.md');
			expect(content).toBe('# Note 1\nContent here');
		});

		test('should throw error for non-existent file', async () => {
			await expect(adapter.readFile('nonexistent.md')).rejects.toThrow('File not found');
		});

		test('should read file in subdirectory', async () => {
			const content = await adapter.readFile('folder/note2.md');
			expect(content).toBe('# Note 2\nMore content');
		});

		test('should read file in nested subdirectory', async () => {
			const content = await adapter.readFile('folder/subfolder/note3.md');
			expect(content).toBe('# Note 3\nEven more');
		});
	});

	describe('listFiles', () => {
		test('should list all files when no directory specified', async () => {
			const files = await adapter.listFiles();
			
			expect(files).toHaveLength(4);
			expect(files).toContain('note1.md');
			expect(files).toContain('folder/note2.md');
			expect(files).toContain('folder/subfolder/note3.md');
			expect(files).toContain('README.md');
		});

		test('should list files in specific directory', async () => {
			const files = await adapter.listFiles('folder');
			
			expect(files).toHaveLength(2);
			expect(files).toContain('folder/note2.md');
			expect(files).toContain('folder/subfolder/note3.md');
		});

		test('should return empty array for empty directory', async () => {
			const files = await adapter.listFiles('empty');
			expect(files).toHaveLength(0);
		});

		test('should handle root directory', async () => {
			const files = await adapter.listFiles('');
			expect(files.length).toBeGreaterThan(0);
		});
	});

	describe('writeFile', () => {
		test('should create new file', async () => {
			await adapter.writeFile('new-note.md', '# New Note\nContent');
			
			const content = await adapter.readFile('new-note.md');
			expect(content).toBe('# New Note\nContent');
		});

		test('should overwrite existing file', async () => {
			await adapter.writeFile('note1.md', '# Updated Note\nNew content');
			
			const content = await adapter.readFile('note1.md');
			expect(content).toBe('# Updated Note\nNew content');
		});

		test('should create file in subdirectory', async () => {
			await adapter.writeFile('folder/new.md', 'Content');
			
			const content = await adapter.readFile('folder/new.md');
			expect(content).toBe('Content');
		});

		test('should handle empty content', async () => {
			await adapter.writeFile('empty.md', '');
			
			const content = await adapter.readFile('empty.md');
			expect(content).toBe('');
		});
	});
});

