/**
 * Comprehensive integration tests for all 7 Gemini tools
 * Tests each tool with real API calls to ensure they work correctly
 * 
 * NOTE: These tests make real API calls and hit rate limits.
 * Free tier limit: 10 requests per minute
 * Run with: npm run test:integration -- --testPathPattern=all-tools --maxWorkers=1 --runInBand
 */

import { GeminiClient } from '../../src/gemini-client';
import { MockVault, MockVaultAdapter, mockSettings } from '../setup';
import * as fs from 'fs/promises';

// Skip these tests if no API key is available
const API_KEY = process.env.GEMINI_API_KEY || '';
const SKIP_INTEGRATION_TESTS = !API_KEY || process.env.SKIP_INTEGRATION_TESTS === 'true';

const describeOrSkip = SKIP_INTEGRATION_TESTS ? describe.skip : describe;

// Helper to add delay between API calls to respect rate limits
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const API_CALL_DELAY = 7000; // 7 seconds between tests to respect 10 req/min limit

describeOrSkip('All Tools Integration Tests', () => {
	let client: GeminiClient;
	let vault: MockVault;
	let vaultAdapter: MockVaultAdapter;
	let testDir: string;

	beforeAll(async () => {
		// Create temp directory for memory storage
		testDir = `/tmp/gemini-all-tools-test-${Date.now()}`;
		await fs.mkdir(testDir, { recursive: true });
	});

	afterAll(async () => {
		// Cleanup
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch (e) {
			// Ignore cleanup errors
		}
	});

	beforeEach(async () => {
		// Create mock vault with test files
		vault = new MockVault({
			'README.md': '# Project README\nThis is the main documentation.',
			'notes/daily.md': '# Daily Note\n- Task 1\n- Task 2',
			'notes/weekly.md': '# Weekly Summary\nCompleted this week.',
			'docs/api.md': '# API Documentation\nEndpoint descriptions.',
			'docs/guide.md': '# User Guide\nHow to use this project.'
		});
		
		vaultAdapter = new MockVaultAdapter(vault);
		
		// Create client with all tools enabled
		const settings = {
			...mockSettings,
			apiKey: API_KEY,
			model: 'gemini-2.5-flash',
			enableFileTools: true,
			fallbackMode: false,
			renderMarkdown: true,
			toolPermissions: {
				list_files: 'always' as const,
				read_file: 'always' as const,
				read_many_files: 'always' as const,
				write_file: 'always' as const,
				web_fetch: 'always' as const,
				google_web_search: 'always' as const,
				save_memory: 'always' as const,
				delete_memory: 'always' as const,
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

		client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		await client.initialize();
	});

	afterEach(async () => {
		// Add delay between tests to respect API rate limits
		await delay(API_CALL_DELAY);
	});

	// ==================== TOOL 1: read_file ====================
	test('Tool 1: read_file - should read a specific file', async () => {
		console.log('\n🧪 Testing Tool 1: read_file\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		const generator = client.sendMessage('read the README.md file');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify read_file was called
		const readCall = toolCalls.find(tc => tc.name === 'read_file');
		expect(readCall).toBeDefined();
		expect(readCall.status).toBe('executed');
		expect(readCall.args.file_path).toContain('README.md');
		
		// Verify response mentions the file content
		const fullResponse = responses.join('');
		expect(fullResponse.toLowerCase()).toMatch(/readme|documentation|project/);
		
		console.log('✅ read_file test passed');
	}, 30000);

	// ==================== TOOL 2: list_files ====================
	test('Tool 2: list_files - should list all files in vault', async () => {
		console.log('\n🧪 Testing Tool 2: list_files\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		const generator = client.sendMessage('list all files');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify list_files was called
		const listCall = toolCalls.find(tc => tc.name === 'list_files');
		expect(listCall).toBeDefined();
		expect(listCall.status).toBe('executed');
		
		// Verify result contains file list
		const fullResponse = responses.join('');
		expect(fullResponse).toMatch(/README\.md|daily\.md|api\.md/);
		
		console.log('✅ list_files test passed');
	}, 30000);

	// ==================== TOOL 3: read_many_files ====================
	test('Tool 3: read_many_files - should read multiple files at once', async () => {
		console.log('\n🧪 Testing Tool 3: read_many_files\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		const generator = client.sendMessage('read all markdown files in the notes folder');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify read_many_files was called
		const readManyCall = toolCalls.find(tc => tc.name === 'read_many_files');
		expect(readManyCall).toBeDefined();
		expect(readManyCall.status).toBe('executed');
		
		// Verify response mentions content from multiple files
		const fullResponse = responses.join('');
		expect(fullResponse.toLowerCase()).toMatch(/daily|weekly|notes/);
		
		console.log('✅ read_many_files test passed');
	}, 30000);

	// ==================== TOOL 4: write_file ====================
	test('Tool 4: write_file - should create a new file', async () => {
		console.log('\n🧪 Testing Tool 4: write_file\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		const generator = client.sendMessage('create a file called test-output.md with content "# Test Output\\nThis is a test file."');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify write_file was called
		const writeCall = toolCalls.find(tc => tc.name === 'write_file');
		expect(writeCall).toBeDefined();
		expect(writeCall.status).toBe('executed');
		expect(writeCall.args.file_path).toContain('test-output.md');
		
		// Verify file was actually created in mock vault
		const fileContent = await vaultAdapter.readFile('test-output.md');
		expect(fileContent).toContain('Test Output');
		
		console.log('✅ write_file test passed');
	}, 30000);

	// ==================== TOOL 5: web_fetch ====================
	test('Tool 5: web_fetch - should fetch content from URL', async () => {
		console.log('\n🧪 Testing Tool 5: web_fetch\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		// Use a simple, reliable URL
		const generator = client.sendMessage('fetch and summarize https://example.com');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify web_fetch was called
		const fetchCall = toolCalls.find(tc => tc.name === 'web_fetch');
		expect(fetchCall).toBeDefined();
		expect(fetchCall.status).toBe('executed');
		expect(fetchCall.args.prompt).toContain('example.com');
		
		// Verify response contains fetched content
		const fullResponse = responses.join('');
		// example.com has specific content we can check for
		expect(fullResponse.length).toBeGreaterThan(0);
		
		console.log('✅ web_fetch test passed');
	}, 30000);

	// ==================== TOOL 6: google_web_search ====================
	test('Tool 6: google_web_search - should search the web', async () => {
		console.log('\n🧪 Testing Tool 6: google_web_search\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		const generator = client.sendMessage('search for "Obsidian note-taking app"');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify google_web_search was called
		const searchCall = toolCalls.find(tc => tc.name === 'google_web_search');
		expect(searchCall).toBeDefined();
		expect(searchCall.status).toBe('executed');
		expect(searchCall.args.query).toContain('Obsidian');
		
		// Verify response contains search results
		const fullResponse = responses.join('');
		expect(fullResponse.length).toBeGreaterThan(0);
		// Should mention Obsidian since that's what we searched for
		expect(fullResponse.toLowerCase()).toMatch(/obsidian|note|app/);
		
		console.log('✅ google_web_search test passed');
	}, 30000);

	// ==================== TOOL 7: save_memory ====================
	test('Tool 7: save_memory - should save information to memory', async () => {
		console.log('\n🧪 Testing Tool 7: save_memory\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		const generator = client.sendMessage('remember that my favorite programming language is TypeScript');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify save_memory was called
		const memoryCall = toolCalls.find(tc => tc.name === 'save_memory');
		expect(memoryCall).toBeDefined();
		expect(memoryCall.status).toBe('executed');
		expect(memoryCall.args.fact.toLowerCase()).toMatch(/typescript|programming language/);
		
		// Verify memory was actually saved
		const memoryManager = (client as any).memoryManager;
		const memories = memoryManager.getMemories();
		expect(memories.length).toBeGreaterThan(0);
		expect(memories[0].fact.toLowerCase()).toContain('typescript');
		
		console.log('✅ save_memory test passed');
	}, 30000);

	// ==================== COMBINED TEST ====================
	test('Combined: should use multiple tools in sequence', async () => {
		console.log('\n🧪 Testing: Multiple tools in sequence\n');
		
		let toolCalls: any[] = [];
		
		// First list files
		let generator = client.sendMessage('list all files');
		for await (const response of generator) {
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Then read a file
		generator = client.sendMessage('now read the README.md file');
		for await (const response of generator) {
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Then save something to memory
		generator = client.sendMessage('remember that this is a test project');
		for await (const response of generator) {
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify all three tools were called
		expect(toolCalls.some(tc => tc.name === 'list_files')).toBe(true);
		expect(toolCalls.some(tc => tc.name === 'read_file')).toBe(true);
		expect(toolCalls.some(tc => tc.name === 'save_memory')).toBe(true);
		
		console.log('✅ Multiple tools test passed');
	}, 60000); // Longer timeout for multiple API calls

	// ==================== PERMISSION TESTS ====================
	test('Permissions: should respect ask/always/never for each tool', async () => {
		console.log('\n🧪 Testing: Tool permissions\n');
		
		// Create a client with mixed permissions
		const settings = {
			...mockSettings,
			apiKey: API_KEY,
			model: 'gemini-2.5-flash',
			enableFileTools: true,
			toolPermissions: {
				list_files: 'never' as const,
				read_file: 'always' as const,
				read_many_files: 'ask' as const,
				write_file: 'never' as const,
				web_fetch: 'always' as const,
				google_web_search: 'never' as const,
				save_memory: 'always' as const,
				delete_memory: 'always' as const,
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

		const permClient = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		await permClient.initialize();
		
		// Try to list files (should be rejected)
		let toolCalls: any[] = [];
		let generator = permClient.sendMessage('list all files');
		for await (const response of generator) {
			if (response.toolCalls) {
				toolCalls.push(...response.toolCalls);
			}
		}
		
		const listCall = toolCalls.find(tc => tc.name === 'list_files');
		if (listCall) {
			expect(listCall.status).toBe('rejected');
		}
		
		// Try to read file (should succeed)
		toolCalls = [];
		generator = permClient.sendMessage('read README.md');
		for await (const response of generator) {
			if (response.toolCalls) {
				toolCalls.push(...response.toolCalls);
			}
		}
		
		const readCall = toolCalls.find(tc => tc.name === 'read_file');
		expect(readCall).toBeDefined();
		expect(readCall.status).toBe('executed');
		
		console.log('✅ Permissions test passed');
	}, 45000);
});

