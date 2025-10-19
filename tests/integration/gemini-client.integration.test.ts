/**
 * Integration tests for GeminiClient with real API calls
 * These tests require a valid API key and make actual network requests
 */

import { GeminiClient } from '../../src/gemini-client';
import { MockVault, MockVaultAdapter, mockSettings } from '../setup';
import * as fs from 'fs/promises';
import * as path from 'path';

// Skip these tests if no API key is available
const API_KEY = process.env.GEMINI_API_KEY || '';
const SKIP_INTEGRATION_TESTS = !API_KEY || process.env.SKIP_INTEGRATION_TESTS === 'true';

const describeOrSkip = SKIP_INTEGRATION_TESTS ? describe.skip : describe;

describeOrSkip('GeminiClient Integration Tests', () => {
	let client: GeminiClient;
	let vault: MockVault;
	let vaultAdapter: MockVaultAdapter;
	let testDir: string;

	beforeAll(async () => {
		// Create temp directory for memory storage
		testDir = `/tmp/gemini-integration-test-${Date.now()}`;
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
			'Welcome.md': '# Welcome\nThis is a welcome file.',
			'notes/test.md': '# Test Note\nSome content here.',
			'projects/README.md': '# Project\nProject documentation.'
		});
		
		vaultAdapter = new MockVaultAdapter(vault);
		
		// Create client with test settings
		const settings = {
			...mockSettings,
			apiKey: API_KEY,
			model: 'gemini-2.5-flash',
			enableFileTools: true,
			fallbackMode: false,
			renderMarkdown: true,
			contextSettings: {
				maxVaultStructureItems: 50,
				recentFilesCount: 10,
				recentFilesHours: 24
			},
			toolPermissions: {
				...mockSettings.toolPermissions,
				list_files: 'always' as const,  // Auto-approve for testing
				read_file: 'always' as const,
				read_many_files: 'always' as const,
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

	test('should list all files using list_files tool', async () => {
		console.log('\n🧪 Testing: list all files\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		// Send message and collect responses
		const generator = client.sendMessage('list all files');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify tool was called
		expect(toolCalls.length).toBeGreaterThan(0);
		expect(toolCalls[0].name).toBe('list_files');
		expect(toolCalls[0].status).toBe('executed');
		
		// Verify result contains file list
		const fullResponse = responses.join('');
		console.log('📝 Full AI response:', fullResponse);
		
		// Should mention the files we have
		expect(fullResponse).toMatch(/Welcome\.md|test\.md|README\.md/);
		
	}, 30000); // 30 second timeout for API call

	test('should read a specific file using read_file tool', async () => {
		console.log('\n🧪 Testing: read specific file\n');
		
		const responses: string[] = [];
		let toolCalls: any[] = [];
		
		const generator = client.sendMessage('read the Welcome.md file');
		
		for await (const response of generator) {
			if (response.text) {
				responses.push(response.text);
			}
			if (response.toolCalls) {
				toolCalls = toolCalls.concat(response.toolCalls);
			}
		}
		
		// Verify read_file was called
		expect(toolCalls.some(tc => tc.name === 'read_file')).toBe(true);
		const readCall = toolCalls.find(tc => tc.name === 'read_file');
		expect(readCall.args.file_path).toContain('Welcome.md');
		
		// Verify response mentions the file content
		const fullResponse = responses.join('');
		console.log('📝 Full AI response:', fullResponse);
		
		// Should reference content from the file
		expect(fullResponse.toLowerCase()).toMatch(/welcome|file/);
		
	}, 30000);

	test('should handle tool execution with follow-up response', async () => {
		console.log('\n🧪 Testing: tool execution with follow-up\n');
		
		let receivedToolCall = false;
		let receivedFollowUpText = false;
		
		const generator = client.sendMessage('list all files in the vault');
		
		for await (const response of generator) {
			if (response.toolCalls && response.toolCalls.length > 0) {
				receivedToolCall = true;
				console.log('✅ Tool call received:', response.toolCalls[0].name);
			}
			if (response.text && response.text.length > 0) {
				receivedFollowUpText = true;
				console.log('✅ Follow-up text received:', response.text.substring(0, 100));
			}
		}
		
		// Should receive both tool call and follow-up response
		expect(receivedToolCall).toBe(true);
		expect(receivedFollowUpText).toBe(true);
		
	}, 30000);

	test('should respect never permission', async () => {
		console.log('\n🧪 Testing: never permission\n');
		
		// Update client with 'never' permission for list_files
		const settings = {
			...mockSettings,
			apiKey: API_KEY,
			model: 'gemini-2.5-flash',
			enableFileTools: true,
			renderMarkdown: true,
			contextSettings: {
				maxVaultStructureItems: 50,
				recentFilesCount: 10,
				recentFilesHours: 24
			},
			toolPermissions: {
				...mockSettings.toolPermissions,
				list_files: 'never' as const,  // Block this tool
				read_file: 'always' as const
			}
		};

		const blockedClient = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		await blockedClient.initialize();
		
		const toolCalls: any[] = [];
		const generator = blockedClient.sendMessage('list all files');
		
		for await (const response of generator) {
			if (response.toolCalls) {
				toolCalls.push(...response.toolCalls);
			}
		}
		
		// Tool should be called by Gemini but rejected by our permission system
		const listFilesCall = toolCalls.find(tc => tc.name === 'list_files');
		if (listFilesCall) {
			expect(listFilesCall.status).toBe('rejected');
		}
		
	}, 30000);
});

describeOrSkip('GeminiClient - Function Calling Verification', () => {
	test('should properly format tool declarations', async () => {
		const vault = new MockVault({
			'test.md': '# Test'
		});
		const vaultAdapter = new MockVaultAdapter(vault);
		
		const testDir = `/tmp/gemini-test-${Date.now()}`;
		await fs.mkdir(testDir, { recursive: true });
		
		const settings = {
			...mockSettings,
			apiKey: API_KEY,
			model: 'gemini-2.5-flash',
			enableFileTools: true,
			renderMarkdown: true,
			contextSettings: {
				includeVaultStructure: true,
				includeOpenFiles: true,
				includeRecentFiles: true,
				includePluginConfig: true,
				includeOSInfo: true,
				includeVaultStats: true,
				includeTags: true,
				maxVaultStructureItems: 50,
				recentFilesCount: 10,
				recentFilesHours: 24
			}
		};

		const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		await client.initialize();
		
		// Access private tools property for verification
		const tools = (client as any).tools;
		
		expect(tools).toBeDefined();
		expect(Array.isArray(tools)).toBe(true);
		expect(tools.length).toBeGreaterThan(0);
		
		const functionDeclarations = tools[0].functionDeclarations;
		expect(functionDeclarations).toBeDefined();
		expect(Array.isArray(functionDeclarations)).toBe(true);
		
		// Verify structure of first tool
		const firstTool = functionDeclarations[0];
		expect(firstTool.name).toBeDefined();
		expect(firstTool.description).toBeDefined();
		expect(firstTool.parameters).toBeDefined();
		expect(firstTool.parameters.type).toBe('OBJECT');
		
		// Cleanup
		await fs.rm(testDir, { recursive: true, force: true });
	});
});

describeOrSkip('GeminiClient OAuth Integration Tests', () => {
	let client: GeminiClient;
	let vault: MockVault;
	let vaultAdapter: MockVaultAdapter;
	let testDir: string;

	// Skip OAuth tests if no OAuth credentials are available
	const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
	const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
	const OAUTH_ACCESS_TOKEN = process.env.OAUTH_ACCESS_TOKEN || '';
	const OAUTH_REFRESH_TOKEN = process.env.OAUTH_REFRESH_TOKEN || '';
	const SKIP_OAUTH_TESTS = !OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_ACCESS_TOKEN || !OAUTH_REFRESH_TOKEN || process.env.SKIP_OAUTH_TESTS === 'true';

	const describeOAuthOrSkip = SKIP_OAUTH_TESTS ? describe.skip : describe;

	describeOAuthOrSkip('OAuth Token Refresh Integration', () => {
		beforeAll(async () => {
			// Create temp directory for memory storage
			testDir = `/tmp/oauth-integration-test-${Date.now()}`;
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
			// Create mock vault
			vault = new MockVault({
				'test.md': '# Test OAuth'
			});
			vaultAdapter = new MockVaultAdapter(vault);
			
			// Create client with OAuth settings
			const settings = {
				...mockSettings,
				useOAuth: true,
				oauthClientId: OAUTH_CLIENT_ID,
				oauthClientSecret: OAUTH_CLIENT_SECRET,
				oauthAccessToken: OAUTH_ACCESS_TOKEN,
				oauthRefreshToken: OAUTH_REFRESH_TOKEN,
				oauthExpiresAt: Date.now() + 3600000, // 1 hour from now
				apiKey: '', // No API key when using OAuth
				model: 'gemini-2.5-flash',
				enableFileTools: false, // Disable tools for OAuth tests
				fallbackMode: false,
				renderMarkdown: true
			};

			client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			await client.initialize();
		});

		test('should handle OAuth authentication successfully', async () => {
			console.log('\n🧪 Testing: OAuth authentication\n');
			
			const responses: string[] = [];
			let hasError = false;
			
			try {
				const generator = client.sendMessage('Hello, this is a test message');
				
				for await (const response of generator) {
					if (response.text) {
						responses.push(response.text);
					}
				}
				
				// Should receive a response without authentication errors
				expect(responses.length).toBeGreaterThan(0);
				const fullResponse = responses.join('');
				expect(fullResponse.length).toBeGreaterThan(0);
				
				console.log('✅ OAuth authentication successful');
				console.log('📝 AI response:', fullResponse.substring(0, 200) + '...');
				
			} catch (error) {
				hasError = true;
				console.error('❌ OAuth authentication failed:', error);
				throw error;
			}
			
			expect(hasError).toBe(false);
			
		}, 30000);

		test('should refresh token when expired', async () => {
			console.log('\n🧪 Testing: OAuth token refresh\n');
			
			// Create client with expired token
			const expiredSettings = {
				...mockSettings,
				useOAuth: true,
				oauthClientId: OAUTH_CLIENT_ID,
				oauthClientSecret: OAUTH_CLIENT_SECRET,
				oauthAccessToken: OAUTH_ACCESS_TOKEN,
				oauthRefreshToken: OAUTH_REFRESH_TOKEN,
				oauthExpiresAt: Date.now() - 3600000, // 1 hour ago (expired)
				apiKey: '',
				model: 'gemini-2.5-flash',
				enableFileTools: false,
				fallbackMode: false,
				renderMarkdown: true
			};

			const expiredClient = new GeminiClient(expiredSettings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			await expiredClient.initialize();
			
			const responses: string[] = [];
			let hasError = false;
			
			try {
				const generator = expiredClient.sendMessage('Test message with expired token');
				
				for await (const response of generator) {
					if (response.text) {
						responses.push(response.text);
					}
				}
				
				// Should receive a response after token refresh
				expect(responses.length).toBeGreaterThan(0);
				const fullResponse = responses.join('');
				expect(fullResponse.length).toBeGreaterThan(0);
				
				console.log('✅ Token refresh successful');
				console.log('📝 AI response:', fullResponse.substring(0, 200) + '...');
				
			} catch (error) {
				hasError = true;
				console.error('❌ Token refresh failed:', error);
				throw error;
			}
			
			expect(hasError).toBe(false);
			
		}, 30000);
	});
});

