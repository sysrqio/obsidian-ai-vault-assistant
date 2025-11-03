/**
 * Integration tests for the unified API client architecture
 * Tests both API Key and OAuth authentication paths with the new DRY implementation
 */

import { GeminiClient } from '../../src/gemini-client';
import { MockVault, MockVaultAdapter, mockSettings } from '../setup';
import * as fs from 'fs/promises';
import * as path from 'path';

// Test credentials from environment variables or data.json
// For local testing, use data.json (gitignored) or set environment variables
const API_KEY = process.env.GEMINI_API_KEY || '';
const OAUTH_CLIENT_ID = process.env.GEMINI_OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.GEMINI_OAUTH_CLIENT_SECRET || '';
const OAUTH_ACCESS_TOKEN = process.env.GEMINI_OAUTH_ACCESS_TOKEN || '';
const OAUTH_REFRESH_TOKEN = process.env.GEMINI_OAUTH_REFRESH_TOKEN || '';
const OAUTH_EXPIRES_AT = process.env.GEMINI_OAUTH_EXPIRES_AT ? parseFloat(process.env.GEMINI_OAUTH_EXPIRES_AT) : 0;

// Skip tests if credentials are not available
const SKIP_TESTS = process.env.SKIP_INTEGRATION_TESTS === 'true';
const describeOrSkip = SKIP_TESTS ? describe.skip : describe;

describeOrSkip('Unified API Client Architecture Tests', () => {
	let testDir: string;
	let vault: MockVault;
	let vaultAdapter: MockVaultAdapter;

	beforeAll(async () => {
		// Create temp directory for memory storage
		testDir = `/tmp/unified-api-test-${Date.now()}`;
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
			'Welcome.md': '# Welcome\nThis is a welcome file for testing.',
			'notes/test.md': '# Test Note\nSome content here for testing.',
			'projects/README.md': '# Project\nProject documentation for testing.'
		});
		
		vaultAdapter = new MockVaultAdapter(vault);
	});

	describe('API Key Authentication Path', () => {
		let client: GeminiClient;

		beforeEach(async () => {
			// Create client with API Key settings
			const settings = {
				...mockSettings,
				apiKey: API_KEY,
				useOAuth: false,
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
					list_files: 'always' as const,
					read_file: 'always' as const,
					search_vault: 'always' as const,
					save_memory: 'always' as const,
					delete_memory: 'always' as const
				}
			};

			client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			await client.initialize();
		});

		test('should handle simple message "how can you help me?" with API Key', async () => {
			console.log('\n🧪 Testing: API Key - Simple message\n');
			
			const responses: string[] = [];
			let hasError = false;
			let responseReceived = false;
			
			try {
				const generator = client.sendMessage('how can you help me?');
				
				for await (const response of generator) {
					if (response.text && response.text.trim().length > 0) {
						responses.push(response.text);
						responseReceived = true;
						console.log('✅ Response received:', response.text.substring(0, 100) + '...');
					}
					if (response.done) {
						break;
					}
				}
				
				// Verify we received a meaningful response
				expect(responseReceived).toBe(true);
				expect(responses.length).toBeGreaterThan(0);
				
				const fullResponse = responses.join('');
				expect(fullResponse.length).toBeGreaterThan(10);
				
				// Should be a helpful response about capabilities
				expect(fullResponse.toLowerCase()).toMatch(/help|assist|support|can|able/);
				
				console.log('📝 Full AI response:', fullResponse);
				
			} catch (error) {
				hasError = true;
				console.error('❌ API Key test failed:', error);
				throw error;
			}
			
			expect(hasError).toBe(false);
			
		}, 30000);

		test('should use ConversationHandler for API Key path', async () => {
			console.log('\n🧪 Testing: API Key - ConversationHandler usage\n');
			
			// Verify that the client is using the new unified architecture
			const clientAny = client as any;
			expect(clientAny.conversationHandler).toBeDefined();
			expect(clientAny.apiClient).toBeDefined();
			
			// Should be using SDKGeminiClient for API Key
			expect(clientAny.apiClient.constructor.name).toBe('SDKGeminiClient');
			
			const responses: string[] = [];
			const generator = client.sendMessage('Hello, test message');
			
			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
				}
			}
			
			expect(responses.length).toBeGreaterThan(0);
			console.log('✅ ConversationHandler working correctly for API Key');
			
		}, 30000);

		test('should handle tool execution with API Key', async () => {
			console.log('\n🧪 Testing: API Key - Tool execution\n');
			
			const responses: string[] = [];
			let toolCalls: any[] = [];
			
			const generator = client.sendMessage('list all files in the vault');
			
			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
				}
				if (response.toolCalls) {
					toolCalls = toolCalls.concat(response.toolCalls);
				}
			}
			
			// Verify tool was called and executed
			expect(toolCalls.length).toBeGreaterThan(0);
			expect(toolCalls[0].name).toBe('list_files');
			expect(toolCalls[0].status).toBe('executed');
			
			// Verify AI response mentions the files
			const fullResponse = responses.join('');
			expect(fullResponse).toMatch(/Welcome\.md|test\.md|README\.md/);
			
			console.log('✅ Tool execution working with API Key');
			
		}, 30000);
	});

	describe('OAuth Authentication Path', () => {
		let client: GeminiClient;

		beforeEach(async () => {
			// Create client with OAuth settings
			const settings = {
				...mockSettings,
				useOAuth: true,
				oauthClientId: OAUTH_CLIENT_ID,
				oauthClientSecret: OAUTH_CLIENT_SECRET,
				oauthAccessToken: OAUTH_ACCESS_TOKEN,
				oauthRefreshToken: OAUTH_REFRESH_TOKEN,
				oauthExpiresAt: OAUTH_EXPIRES_AT,
				apiKey: '', // No API key when using OAuth
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
					list_files: 'always' as const,
					read_file: 'always' as const,
					search_vault: 'always' as const,
					save_memory: 'always' as const,
					delete_memory: 'always' as const
				}
			};

			client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			await client.initialize();
		});

		test('should handle simple message "how can you help me?" with OAuth', async () => {
			console.log('\n🧪 Testing: OAuth - Simple message\n');
			
			const responses: string[] = [];
			let hasError = false;
			let responseReceived = false;
			
			try {
				const generator = client.sendMessage('how can you help me?');
				
				for await (const response of generator) {
					if (response.text && response.text.trim().length > 0) {
						responses.push(response.text);
						responseReceived = true;
						console.log('✅ Response received:', response.text.substring(0, 100) + '...');
					}
					if (response.done) {
						break;
					}
				}
				
				// Verify we received a meaningful response
				expect(responseReceived).toBe(true);
				expect(responses.length).toBeGreaterThan(0);
				
				const fullResponse = responses.join('');
				expect(fullResponse.length).toBeGreaterThan(10);
				
				// Should be a helpful response about capabilities
				expect(fullResponse.toLowerCase()).toMatch(/help|assist|support|can|able/);
				
				console.log('📝 Full AI response:', fullResponse);
				
			} catch (error) {
				hasError = true;
				console.error('❌ OAuth test failed:', error);
				throw error;
			}
			
			expect(hasError).toBe(false);
			
		}, 30000);

		test('should use ConversationHandler for OAuth path', async () => {
			console.log('\n🧪 Testing: OAuth - ConversationHandler usage\n');
			
			// Verify that the client is using the new unified architecture
			const clientAny = client as any;
			expect(clientAny.conversationHandler).toBeDefined();
			expect(clientAny.apiClient).toBeDefined();
			
			// Should be using OAuthGeminiClient for OAuth
			expect(clientAny.apiClient.constructor.name).toBe('OAuthGeminiClient');
			
			const responses: string[] = [];
			const generator = client.sendMessage('Hello, test message');
			
			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
				}
			}
			
			expect(responses.length).toBeGreaterThan(0);
			console.log('✅ ConversationHandler working correctly for OAuth');
			
		}, 30000);

		test('should handle tool execution with OAuth', async () => {
			console.log('\n🧪 Testing: OAuth - Tool execution\n');
			
			const responses: string[] = [];
			let toolCalls: any[] = [];
			
			const generator = client.sendMessage('list all files in the vault');
			
			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
				}
				if (response.toolCalls) {
					toolCalls = toolCalls.concat(response.toolCalls);
				}
			}
			
			// Verify tool was called and executed
			expect(toolCalls.length).toBeGreaterThan(0);
			expect(toolCalls[0].name).toBe('list_files');
			expect(toolCalls[0].status).toBe('executed');
			
			// Verify AI response mentions the files
			const fullResponse = responses.join('');
			expect(fullResponse).toMatch(/Welcome\.md|test\.md|README\.md/);
			
			console.log('✅ Tool execution working with OAuth');
			
		}, 30000);

		test('should handle OAuth token refresh when needed', async () => {
			console.log('\n🧪 Testing: OAuth - Token refresh\n');
			
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

	describe('Unified Architecture Verification', () => {
		test('should use identical conversation flow for both authentication methods', async () => {
			console.log('\n🧪 Testing: Unified architecture verification\n');
			
			// Create both clients
			const apiKeySettings = {
				...mockSettings,
				apiKey: API_KEY,
				useOAuth: false,
				model: 'gemini-2.5-flash',
				enableFileTools: false,
				fallbackMode: false,
				renderMarkdown: true
			};

			const oauthSettings = {
				...mockSettings,
				useOAuth: true,
				oauthClientId: OAUTH_CLIENT_ID,
				oauthClientSecret: OAUTH_CLIENT_SECRET,
				oauthAccessToken: OAUTH_ACCESS_TOKEN,
				oauthRefreshToken: OAUTH_REFRESH_TOKEN,
				oauthExpiresAt: OAUTH_EXPIRES_AT,
				apiKey: '',
				model: 'gemini-2.5-flash',
				enableFileTools: false,
				fallbackMode: false,
				renderMarkdown: true
			};

			const apiKeyClient = new GeminiClient(apiKeySettings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			const oauthClient = new GeminiClient(oauthSettings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			
			await apiKeyClient.initialize();
			await oauthClient.initialize();
			
			// Both should use ConversationHandler
			const apiKeyClientAny = apiKeyClient as any;
			const oauthClientAny = oauthClient as any;
			
			expect(apiKeyClientAny.conversationHandler).toBeDefined();
			expect(oauthClientAny.conversationHandler).toBeDefined();
			
			// Both should have different API clients but same interface
			expect(apiKeyClientAny.apiClient.constructor.name).toBe('SDKGeminiClient');
			expect(oauthClientAny.apiClient.constructor.name).toBe('OAuthGeminiClient');
			
			// Both should implement the same interface
			expect(typeof apiKeyClientAny.apiClient.streamGenerateContent).toBe('function');
			expect(typeof oauthClientAny.apiClient.streamGenerateContent).toBe('function');
			expect(typeof apiKeyClientAny.apiClient.initialize).toBe('function');
			expect(typeof oauthClientAny.apiClient.initialize).toBe('function');
			expect(typeof apiKeyClientAny.apiClient.refreshTokenIfNeeded).toBe('function');
			expect(typeof oauthClientAny.apiClient.refreshTokenIfNeeded).toBe('function');
			
			console.log('✅ Unified architecture verified - both paths use same interface');
			
		}, 30000);

		test('should produce similar responses for identical inputs', async () => {
			console.log('\n🧪 Testing: Response similarity between auth methods\n');
			
			const testMessage = 'how can you help me?';
			
			// Create both clients
			const apiKeySettings = {
				...mockSettings,
				apiKey: API_KEY,
				useOAuth: false,
				model: 'gemini-2.5-flash',
				enableFileTools: false,
				fallbackMode: false,
				renderMarkdown: true
			};

			const oauthSettings = {
				...mockSettings,
				useOAuth: true,
				oauthClientId: OAUTH_CLIENT_ID,
				oauthClientSecret: OAUTH_CLIENT_SECRET,
				oauthAccessToken: OAUTH_ACCESS_TOKEN,
				oauthRefreshToken: OAUTH_REFRESH_TOKEN,
				oauthExpiresAt: OAUTH_EXPIRES_AT,
				apiKey: '',
				model: 'gemini-2.5-flash',
				enableFileTools: false,
				fallbackMode: false,
				renderMarkdown: true
			};

			const apiKeyClient = new GeminiClient(apiKeySettings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			const oauthClient = new GeminiClient(oauthSettings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			
			await apiKeyClient.initialize();
			await oauthClient.initialize();
			
			// Get responses from both clients
			const apiKeyResponses: string[] = [];
			const oauthResponses: string[] = [];
			
			const apiKeyGenerator = apiKeyClient.sendMessage(testMessage);
			for await (const response of apiKeyGenerator) {
				if (response.text) {
					apiKeyResponses.push(response.text);
				}
			}
			
			const oauthGenerator = oauthClient.sendMessage(testMessage);
			for await (const response of oauthGenerator) {
				if (response.text) {
					oauthResponses.push(response.text);
				}
			}
			
			// Both should produce meaningful responses
			expect(apiKeyResponses.length).toBeGreaterThan(0);
			expect(oauthResponses.length).toBeGreaterThan(0);
			
			const apiKeyResponse = apiKeyResponses.join('');
			const oauthResponse = oauthResponses.join('');
			
			// Both should be helpful responses
			expect(apiKeyResponse.toLowerCase()).toMatch(/help|assist|support|can|able/);
			expect(oauthResponse.toLowerCase()).toMatch(/help|assist|support|can|able/);
			
			console.log('📝 API Key response:', apiKeyResponse.substring(0, 100) + '...');
			console.log('📝 OAuth response:', oauthResponse.substring(0, 100) + '...');
			console.log('✅ Both authentication methods produce helpful responses');
			
		}, 60000); // Longer timeout for two API calls
	});
});


