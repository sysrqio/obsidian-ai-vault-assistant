/**
 * Simple integration test for the unified API client architecture
 * Tests the basic "how can you help me?" message with both API Key and OAuth
 */

import { GeminiClient } from '../../src/gemini-client';
import { MockVault, MockVaultAdapter, mockSettings } from '../setup';
import * as fs from 'fs/promises';

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

describeOrSkip('Simple Message Tests - Unified API Architecture', () => {
	let testDir: string;
	let vault: MockVault;
	let vaultAdapter: MockVaultAdapter;

	beforeAll(async () => {
		// Create temp directory for memory storage
		testDir = `/tmp/simple-message-test-${Date.now()}`;
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
		// Create minimal mock vault
		vault = new MockVault({
			'test.md': '# Test\nSimple test file.'
		});
		
		vaultAdapter = new MockVaultAdapter(vault);
	});

	describe('API Key Authentication', () => {
		test('should handle "how can you help me?" with API Key', async () => {
			console.log('\n🧪 Testing: API Key - "how can you help me?"\n');
			
			// Create client with minimal settings to avoid system prompt issues
			const settings = {
				...mockSettings,
				apiKey: API_KEY,
				useOAuth: false,
				model: 'gemini-2.5-flash',
				enableFileTools: false, // Disable tools to avoid system prompt complexity
				fallbackMode: false,
				renderMarkdown: true,
				contextSettings: {
					includeVaultStructure: false,
					includeOpenFiles: false,
					includeRecentFiles: false,
					includePluginConfig: false,
					includeOSInfo: false,
					includeVaultStats: false,
					includeTags: false,
					maxVaultStructureItems: 0,
					recentFilesCount: 0,
					recentFilesHours: 0
				}
			};

			const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			await client.initialize();
			
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
				
				// Verify unified architecture is being used
				const clientAny = client as any;
				expect(clientAny.conversationHandler).toBeDefined();
				expect(clientAny.apiClient).toBeDefined();
				expect(clientAny.apiClient.constructor.name).toBe('SDKGeminiClient');
				
				console.log('✅ API Key test successful - using unified architecture');
				
			} catch (error) {
				hasError = true;
				console.error('❌ API Key test failed:', error);
				throw error;
			}
			
			expect(hasError).toBe(false);
			
		}, 30000);
	});

	describe('OAuth Authentication', () => {
		test('should handle "how can you help me?" with OAuth', async () => {
			console.log('\n🧪 Testing: OAuth - "how can you help me?"\n');
			
			// Create client with minimal settings to avoid system prompt issues
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
				enableFileTools: false, // Disable tools to avoid system prompt complexity
				fallbackMode: false,
				renderMarkdown: true,
				contextSettings: {
					includeVaultStructure: false,
					includeOpenFiles: false,
					includeRecentFiles: false,
					includePluginConfig: false,
					includeOSInfo: false,
					includeVaultStats: false,
					includeTags: false,
					maxVaultStructureItems: 0,
					recentFilesCount: 0,
					recentFilesHours: 0
				}
			};

			const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
			await client.initialize();
			
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
				
				// Verify unified architecture is being used
				const clientAny = client as any;
				expect(clientAny.conversationHandler).toBeDefined();
				expect(clientAny.apiClient).toBeDefined();
				expect(clientAny.apiClient.constructor.name).toBe('OAuthGeminiClient');
				
				console.log('✅ OAuth test successful - using unified architecture');
				
			} catch (error) {
				hasError = true;
				console.error('❌ OAuth test failed:', error);
				throw error;
			}
			
			expect(hasError).toBe(false);
			
		}, 30000);
	});

	describe('Architecture Verification', () => {
		test('should use identical conversation flow for both authentication methods', async () => {
			console.log('\n🧪 Testing: Architecture verification\n');
			
			// Create both clients with minimal settings
			const apiKeySettings = {
				...mockSettings,
				apiKey: API_KEY,
				useOAuth: false,
				model: 'gemini-2.5-flash',
				enableFileTools: false,
				fallbackMode: false,
				renderMarkdown: true,
				contextSettings: {
					includeVaultStructure: false,
					includeOpenFiles: false,
					includeRecentFiles: false,
					includePluginConfig: false,
					includeOSInfo: false,
					includeVaultStats: false,
					includeTags: false,
					maxVaultStructureItems: 0,
					recentFilesCount: 0,
					recentFilesHours: 0
				}
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
				renderMarkdown: true,
				contextSettings: {
					includeVaultStructure: false,
					includeOpenFiles: false,
					includeRecentFiles: false,
					includePluginConfig: false,
					includeOSInfo: false,
					includeVaultStats: false,
					includeTags: false,
					maxVaultStructureItems: 0,
					recentFilesCount: 0,
					recentFilesHours: 0
				}
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
	});
});


