/**
 * Integration tests for both OAuth and API Key authentication paths
 * Uses live credentials from data.json
 */

import { GeminiClient } from '../../src/gemini-client';
import { MockVault, MockVaultAdapter, createMockApp } from '../setup';
import * as fs from 'fs/promises';
import * as path from 'path';

// Load credentials from data.json
let testCredentials: any = null;

beforeAll(async () => {
	const dataJsonPath = path.join(__dirname, '../../data.json');
	try {
		const dataJson = await fs.readFile(dataJsonPath, 'utf-8');
		testCredentials = JSON.parse(dataJson);
		console.log('✅ Loaded credentials from data.json');
	} catch (error) {
		console.warn('⚠️  Could not load data.json, skipping live credential tests');
	}
});

// Use describe.skip if credentials are not loaded
const describeOrSkip = testCredentials ? describe : describe.skip;

// Run tests only if credentials are available
describe('Authentication Paths - Live Credentials', () => {
	const testMessage = 'how can you help me?';
	
	let vault: MockVault;
	let vaultAdapter: MockVaultAdapter;
	let app: any;
	let testDir: string;

	beforeEach(async () => {
		vault = new MockVault({
			'test.md': '# Test File\n\nThis is a test file.'
		});
		vaultAdapter = new MockVaultAdapter(vault);
		app = createMockApp(vault);
		testDir = `/tmp/gemini-test-${Date.now()}`;
		await fs.mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		if (testDir) {
			await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	test('API Key path - should send message successfully', async () => {
		if (!testCredentials?.apiKey) {
			console.log('⏭️  Skipping API Key test - no API key in data.json');
			return;
		}

		const settings = {
			...testCredentials,
			useOAuth: false,  // Force API key path
			apiKey: testCredentials.apiKey,
			model: 'gemini-2.5-flash',
			enableFileTools: true,
			toolPermissions: {
				...testCredentials.toolPermissions,
				read_file: 'always' as const,
				list_files: 'always' as const,
			}
		};

		const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, app);
		await client.initialize();

		const responses: string[] = [];
		let hasError = false;

		try {
			const generator = client.sendMessage(testMessage);

			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
				}
				if (response.done) {
					break;
				}
			}
		} catch (error) {
			hasError = true;
			console.error('API Key test error:', error);
		}

		expect(hasError).toBe(false);
		expect(responses.length).toBeGreaterThan(0);
		const responseText = responses.join('');
		expect(responseText.length).toBeGreaterThan(0);
		expect(typeof responseText).toBe('string');

		// Verify history was updated after completion
		const historyManager = (client as any).historyManager;
		const history = historyManager.getHistory();
		
		// After completion, the user message should be in history
		expect(history.length).toBeGreaterThan(0);
		const lastUserMessage = history.find((h: any) => h.role === 'user');
		expect(lastUserMessage).toBeDefined();
		expect(lastUserMessage.parts[0].text).toBe(testMessage);
	}, 60000);

	test('OAuth path - should send message successfully and save config', async () => {
		if (!testCredentials?.useOAuth || !testCredentials?.oauthAccessToken) {
			console.log('⏭️  Skipping OAuth test - no OAuth credentials in data.json');
			return;
		}

		const settings = {
			...testCredentials,
			useOAuth: true,  // Force OAuth path
			oauthClientId: testCredentials.oauthClientId,
			oauthClientSecret: testCredentials.oauthClientSecret,
			oauthAccessToken: testCredentials.oauthAccessToken,
			oauthRefreshToken: testCredentials.oauthRefreshToken,
			oauthExpiresAt: testCredentials.oauthExpiresAt || Date.now() + 3600000,
			apiKey: '',  // No API key when using OAuth
			model: 'gemini-2.5-pro',
			enableFileTools: true,
			toolPermissions: {
				...testCredentials.toolPermissions,
				read_file: 'always' as const,
				list_files: 'always' as const,
			}
		};

		const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, app);
		await client.initialize();

		const responses: string[] = [];
		let hasError = false;
		let errorMessage = '';

		try {
			const generator = client.sendMessage(testMessage);

			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
				}
				if (response.done) {
					break;
				}
			}
		} catch (error: any) {
			hasError = true;
			errorMessage = error.message || String(error);
			console.error('OAuth test error:', error);
		}

		// Check for specific OAuth tools format errors
		if (errorMessage.includes('functionDeclarations') || errorMessage.includes('function_declarations')) {
			throw new Error(`OAuth tools format error: ${errorMessage}`);
		}

		expect(hasError).toBe(false);
		expect(responses.length).toBeGreaterThan(0);
		const responseText = responses.join('');
		expect(responseText.length).toBeGreaterThan(0);
		expect(typeof responseText).toBe('string');

		// Verify history was updated after completion
		const historyManager = (client as any).historyManager;
		const history = historyManager.getHistory();
		
		// After completion, the user message should be in history
		expect(history.length).toBeGreaterThan(0);
		const lastUserMessage = history.find((h: any) => h.role === 'user');
		expect(lastUserMessage).toBeDefined();
		expect(lastUserMessage.parts[0].text).toBe(testMessage);

		// Verify OAuth was successfully performed and config was saved
		// Check that OAuth settings are properly configured in the client
		const clientSettings = (client as any).settings;
		expect(clientSettings.useOAuth).toBe(true);
		expect(clientSettings.oauthAccessToken).toBeDefined();
		expect(clientSettings.oauthAccessToken).not.toBe('');
		expect(clientSettings.oauthRefreshToken).toBeDefined();
		expect(clientSettings.oauthRefreshToken).not.toBe('');
		expect(clientSettings.oauthClientId).toBeDefined();
		expect(clientSettings.oauthClientId).not.toBe('');
		
		// Verify OAuth API client is being used
		const apiClient = (client as any).apiClient;
		expect(apiClient).toBeDefined();
		
		// For OAuth, the API client should have accessToken
		if (apiClient && apiClient.accessToken) {
			expect(apiClient.accessToken).toBeDefined();
			expect(apiClient.accessToken).not.toBe('');
		}
	}, 60000);

	test('API Key path - should not have duplicate user messages', async () => {
		if (!testCredentials?.apiKey) {
			return;
		}

		const settings = {
			...testCredentials,
			useOAuth: false,
			apiKey: testCredentials.apiKey,
			model: 'gemini-2.5-flash',
			enableFileTools: true,
			toolPermissions: {
				...testCredentials.toolPermissions,
				read_file: 'always' as const,
			}
		};

		const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, app);
		await client.initialize();

		// Access conversation handler to verify contents
		const conversationHandler = (client as any).conversationHandler;
		const historyManager = (client as any).historyManager;

		// Before sending message, history should be empty or contain only previous messages
		const initialHistory = historyManager.getHistory();
		const initialUserMessages = initialHistory.filter((h: any) => 
			h.role === 'user' && h.parts?.[0]?.text === testMessage
		);
		expect(initialUserMessages.length).toBe(0);

		const responses: string[] = [];
		let hasError = false;

		try {
			const generator = client.sendMessage(testMessage);

			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
				}
				if (response.done) {
					break;
				}
			}
		} catch (error) {
			hasError = true;
			console.error('Error:', error);
		}

		expect(hasError).toBe(false);

		// After completion, check for duplicate user messages in history
		const finalHistory = historyManager.getHistory();
		const userMessages = finalHistory.filter((h: any) => 
			h.role === 'user' && h.parts?.[0]?.text === testMessage
		);
		
		// Should have exactly one user message (added after completion)
		expect(userMessages.length).toBe(1);
	}, 60000);

	test('OAuth path - should not have duplicate user messages', async () => {
		if (!testCredentials?.useOAuth || !testCredentials?.oauthAccessToken) {
			return;
		}

		const settings = {
			...testCredentials,
			useOAuth: true,
			oauthAccessToken: testCredentials.oauthAccessToken,
			oauthRefreshToken: testCredentials.oauthRefreshToken,
			oauthExpiresAt: testCredentials.oauthExpiresAt || Date.now() + 3600000,
			apiKey: '',
			model: 'gemini-2.5-pro',
			enableFileTools: true,
			toolPermissions: {
				...testCredentials.toolPermissions,
				read_file: 'always' as const,
			}
		};

		const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, app);
		await client.initialize();

		const historyManager = (client as any).historyManager;

		// Before sending message
		const initialHistory = historyManager.getHistory();
		const initialUserMessages = initialHistory.filter((h: any) => 
			h.role === 'user' && h.parts?.[0]?.text === testMessage
		);
		expect(initialUserMessages.length).toBe(0);

		const responses: string[] = [];
		let hasError = false;

		try {
			const generator = client.sendMessage(testMessage);

			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
				}
				if (response.done) {
					break;
				}
			}
		} catch (error) {
			hasError = true;
			console.error('Error:', error);
		}

		expect(hasError).toBe(false);

		// After completion, check for duplicates
		const finalHistory = historyManager.getHistory();
		const userMessages = finalHistory.filter((h: any) => 
			h.role === 'user' && h.parts?.[0]?.text === testMessage
		);
		
		// Should have exactly one user message
		expect(userMessages.length).toBe(1);
	}, 60000);

	test('API Key path - should handle tool execution with follow-up structure', async () => {
		if (!testCredentials?.apiKey) {
			console.log('⏭️  Skipping API Key follow-up test - no API key in data.json');
			return;
		}

		const settings = {
			...testCredentials,
			useOAuth: false,
			apiKey: testCredentials.apiKey,
			model: 'gemini-2.5-flash',
			enableFileTools: true,
			toolPermissions: {
				...testCredentials.toolPermissions,
				get_active_file: 'always' as const,
				read_file: 'always' as const,
			}
		};

		const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, app);
		await client.initialize();

		// Use a message that will trigger tool calls
		const testMessageWithTool = 'review the open file and generate tags for the file. add these tags to the frontmatter';
		
		const responses: string[] = [];
		let hasError = false;
		let errorMessage = '';
		let receivedToolCalls = false;
		let receivedFollowUpText = false;

		try {
			const generator = client.sendMessage(testMessageWithTool);

			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
					receivedFollowUpText = true;
				}
				if (response.toolCalls && response.toolCalls.length > 0) {
					receivedToolCalls = true;
					console.log('✅ Tool calls received:', response.toolCalls.map((tc: any) => tc.name));
				}
				if (response.done) {
					break;
				}
			}
		} catch (error: any) {
			hasError = true;
			errorMessage = error.message || String(error);
			console.error('API Key follow-up test error:', error);
		}

		// Check for specific error about function response structure
		if (errorMessage.includes('function response turn comes immediately after a function call turn')) {
			throw new Error(`Function response structure error: ${errorMessage}`);
		}

		expect(hasError).toBe(false);
		
		// Should have received tool calls
		expect(receivedToolCalls).toBe(true);
		
		// Should have received follow-up text after tool execution
		expect(receivedFollowUpText).toBe(true);
		
		// Should have some response text
		const responseText = responses.join('');
		expect(responseText.length).toBeGreaterThan(0);

		// Verify history structure is correct
		const historyManager = (client as any).historyManager;
		const history = historyManager.getHistory();
		
		// Should have user message, model response with function calls, and tool responses
		expect(history.length).toBeGreaterThan(0);
		
		// Find model response with function calls
		const modelResponseWithFunctionCalls = history.find((h: any) => 
			h.role === 'model' && 
			h.parts?.some((p: any) => p.functionCall)
		);
		expect(modelResponseWithFunctionCalls).toBeDefined();
		
		// Find tool responses (should be user message with functionResponse)
		const toolResponses = history.find((h: any) => 
			h.role === 'user' && 
			h.parts?.some((p: any) => p.functionResponse)
		);
		expect(toolResponses).toBeDefined();
	}, 60000);

	test('OAuth path - should handle tool execution with follow-up structure', async () => {
		if (!testCredentials?.useOAuth || !testCredentials?.oauthAccessToken) {
			console.log('⏭️  Skipping OAuth follow-up test - no OAuth credentials in data.json');
			return;
		}

		const settings = {
			...testCredentials,
			useOAuth: true,
			oauthClientId: testCredentials.oauthClientId,
			oauthClientSecret: testCredentials.oauthClientSecret,
			oauthAccessToken: testCredentials.oauthAccessToken,
			oauthRefreshToken: testCredentials.oauthRefreshToken,
			oauthExpiresAt: testCredentials.oauthExpiresAt || Date.now() + 3600000,
			apiKey: '',
			model: 'gemini-2.5-pro',
			enableFileTools: true,
			toolPermissions: {
				...testCredentials.toolPermissions,
				get_active_file: 'always' as const,
				read_file: 'always' as const,
			}
		};

		const client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, app);
		await client.initialize();

		// Use a message that will trigger tool calls
		const testMessageWithTool = 'review the open file and generate tags for the file. add these tags to the frontmatter';
		
		const responses: string[] = [];
		let hasError = false;
		let errorMessage = '';
		let receivedToolCalls = false;
		let receivedFollowUpText = false;

		try {
			const generator = client.sendMessage(testMessageWithTool);

			for await (const response of generator) {
				if (response.text) {
					responses.push(response.text);
					receivedFollowUpText = true;
				}
				if (response.toolCalls && response.toolCalls.length > 0) {
					receivedToolCalls = true;
					console.log('✅ Tool calls received:', response.toolCalls.map((tc: any) => tc.name));
				}
				if (response.done) {
					break;
				}
			}
		} catch (error: any) {
			hasError = true;
			errorMessage = error.message || String(error);
			console.error('OAuth follow-up test error:', error);
		}

		// Check for specific OAuth tools format errors
		if (errorMessage.includes('functionDeclarations') || errorMessage.includes('function_declarations')) {
			throw new Error(`OAuth tools format error: ${errorMessage}`);
		}

		// Check for specific error about function response structure
		if (errorMessage.includes('function response turn comes immediately after a function call turn')) {
			throw new Error(`Function response structure error: ${errorMessage}`);
		}

		expect(hasError).toBe(false);
		
		// Should have received tool calls
		expect(receivedToolCalls).toBe(true);
		
		// Should have received follow-up text after tool execution
		expect(receivedFollowUpText).toBe(true);
		
		// Should have some response text
		const responseText = responses.join('');
		expect(responseText.length).toBeGreaterThan(0);

		// Verify history structure is correct
		const historyManager = (client as any).historyManager;
		const history = historyManager.getHistory();
		
		// Should have user message, model response with function calls, and tool responses
		expect(history.length).toBeGreaterThan(0);
		
		// Find model response with function calls
		const modelResponseWithFunctionCalls = history.find((h: any) => 
			h.role === 'model' && 
			h.parts?.some((p: any) => p.functionCall)
		);
		expect(modelResponseWithFunctionCalls).toBeDefined();
		
		// Find tool responses (should be user message with functionResponse)
		const toolResponses = history.find((h: any) => 
			h.role === 'user' && 
			h.parts?.some((p: any) => p.functionResponse)
		);
		expect(toolResponses).toBeDefined();
	}, 60000);
});

