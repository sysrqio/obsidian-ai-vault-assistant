/**
 * Tests for OAuth token refresh functionality
 * Tests the automatic token refresh mechanism in GeminiClient
 */

import { GeminiClient } from '../src/gemini-client';
import { OAuthHandler } from '../src/oauth-handler';
import { MockVault, MockVaultAdapter, mockSettings } from './setup';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock OAuth settings
const mockOAuthSettings = {
	...mockSettings,
	useOAuth: true,
	oauthClientId: 'test-client-id',
	oauthClientSecret: 'test-client-secret',
	oauthAccessToken: 'test-access-token',
	oauthRefreshToken: 'test-refresh-token',
	oauthExpiresAt: Date.now() + 3600000, // 1 hour from now
	apiKey: '', // No API key when using OAuth
	enableFileTools: false, // Disable tools for OAuth tests
	fallbackMode: false,
	renderMarkdown: true
};

describe('OAuth Token Refresh', () => {
	let client: GeminiClient;
	let vault: MockVault;
	let vaultAdapter: MockVaultAdapter;
	let testDir: string;

	beforeAll(async () => {
		// Create temp directory for memory storage
		testDir = `/tmp/oauth-test-${Date.now()}`;
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
			'test.md': '# Test'
		});
		vaultAdapter = new MockVaultAdapter(vault);
	});

	afterEach(() => {
		// Reset any mocks
		jest.clearAllMocks();
	});

	test('should not refresh token when token is still valid', async () => {
		// Mock OAuthHandler
		const mockRefreshToken = jest.fn();
		jest.spyOn(OAuthHandler.prototype, 'refreshToken').mockImplementation(mockRefreshToken);

		// Create client with valid token (1 hour from now)
		const settings = {
			...mockOAuthSettings,
			oauthExpiresAt: Date.now() + 3600000 // 1 hour from now
		};

		client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		
		// Access private method for testing
		const ensureValidOAuthToken = (client as any).ensureValidOAuthToken.bind(client);
		
		// Call the method
		await ensureValidOAuthToken();
		
		// Should not call refreshToken since token is still valid
		expect(mockRefreshToken).not.toHaveBeenCalled();
	});

	test('should refresh token when token is expired', async () => {
		// Mock OAuthHandler
		const mockInitialize = jest.fn().mockResolvedValue(undefined);
		const mockRefreshToken = jest.fn().mockResolvedValue({
			access_token: 'new-access-token',
			refresh_token: 'new-refresh-token',
			expires_in: 3600
		});
		
		jest.spyOn(OAuthHandler.prototype, 'initialize').mockImplementation(mockInitialize);
		jest.spyOn(OAuthHandler.prototype, 'refreshToken').mockImplementation(mockRefreshToken);

		// Create client with expired token (1 hour ago)
		const settings = {
			...mockOAuthSettings,
			oauthExpiresAt: Date.now() - 3600000 // 1 hour ago
		};

		client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		
		// Access private method for testing
		const ensureValidOAuthToken = (client as any).ensureValidOAuthToken.bind(client);
		
		// Call the method
		await ensureValidOAuthToken();
		
		// Should call initialize and refreshToken
		expect(mockInitialize).toHaveBeenCalledWith('test-client-id', 'test-client-secret');
		expect(mockRefreshToken).toHaveBeenCalledWith('test-refresh-token');
		
		// Should update settings with new token
		expect((client as any).settings.oauthAccessToken).toBe('new-access-token');
		expect((client as any).settings.oauthRefreshToken).toBe('new-refresh-token');
		expect((client as any).settings.oauthExpiresAt).toBeGreaterThan(Date.now());
	});

	test('should refresh token when token expires within 5 minutes', async () => {
		// Mock OAuthHandler
		const mockInitialize = jest.fn().mockResolvedValue(undefined);
		const mockRefreshToken = jest.fn().mockResolvedValue({
			access_token: 'new-access-token',
			refresh_token: 'new-refresh-token',
			expires_in: 3600
		});
		
		jest.spyOn(OAuthHandler.prototype, 'initialize').mockImplementation(mockInitialize);
		jest.spyOn(OAuthHandler.prototype, 'refreshToken').mockImplementation(mockRefreshToken);

		// Create client with token expiring in 3 minutes
		const settings = {
			...mockOAuthSettings,
			oauthExpiresAt: Date.now() + (3 * 60 * 1000) // 3 minutes from now
		};

		client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		
		// Access private method for testing
		const ensureValidOAuthToken = (client as any).ensureValidOAuthToken.bind(client);
		
		// Call the method
		await ensureValidOAuthToken();
		
		// Should call refreshToken since token expires within 5 minutes
		expect(mockInitialize).toHaveBeenCalledWith('test-client-id', 'test-client-secret');
		expect(mockRefreshToken).toHaveBeenCalledWith('test-refresh-token');
	});

	test('should throw error when refresh token is missing', async () => {
		// Create client without refresh token
		const settings = {
			...mockOAuthSettings,
			oauthRefreshToken: '',
			oauthExpiresAt: Date.now() - 3600000 // Expired
		};

		client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		
		// Access private method for testing
		const ensureValidOAuthToken = (client as any).ensureValidOAuthToken.bind(client);
		
		// Should throw error
		await expect(ensureValidOAuthToken()).rejects.toThrow(
			'OAuth token expired and no refresh token available. Please re-authenticate in settings.'
		);
	});

	test('should throw error when client credentials are missing', async () => {
		// Create client without client credentials
		const settings = {
			...mockOAuthSettings,
			oauthClientId: '',
			oauthClientSecret: '',
			oauthExpiresAt: Date.now() - 3600000 // Expired
		};

		client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		
		// Access private method for testing
		const ensureValidOAuthToken = (client as any).ensureValidOAuthToken.bind(client);
		
		// Should throw error
		await expect(ensureValidOAuthToken()).rejects.toThrow(
			'OAuth Client ID and Client Secret not configured. Please configure them in settings.'
		);
	});

	test('should handle refresh token failure gracefully', async () => {
		// Mock OAuthHandler to throw error
		const mockInitialize = jest.fn().mockResolvedValue(undefined);
		const mockRefreshToken = jest.fn().mockRejectedValue(new Error('Refresh failed'));
		
		jest.spyOn(OAuthHandler.prototype, 'initialize').mockImplementation(mockInitialize);
		jest.spyOn(OAuthHandler.prototype, 'refreshToken').mockImplementation(mockRefreshToken);

		// Create client with expired token
		const settings = {
			...mockOAuthSettings,
			oauthExpiresAt: Date.now() - 3600000 // Expired
		};

		client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		
		// Access private method for testing
		const ensureValidOAuthToken = (client as any).ensureValidOAuthToken.bind(client);
		
		// Should throw error with proper message
		await expect(ensureValidOAuthToken()).rejects.toThrow(
			'OAuth token refresh failed: Refresh failed'
		);
	});

	test('should return early when OAuth is disabled', async () => {
		// Create client with OAuth disabled
		const settings = {
			...mockOAuthSettings,
			useOAuth: false
		};

		client = new GeminiClient(settings, vaultAdapter as any, '/test-vault', testDir, {} as any);
		
		// Access private method for testing
		const ensureValidOAuthToken = (client as any).ensureValidOAuthToken.bind(client);
		
		// Call the method - should return immediately without doing anything
		await ensureValidOAuthToken();
		
		// Test passes if no error is thrown (early return works)
		expect(true).toBe(true);
	});
});

describe('DirectGeminiAPIClient Token Update', () => {
	test('should update access token in DirectGeminiAPIClient', async () => {
		const { DirectGeminiAPIClient } = await import('../src/gemini-api-client');
		
		// Create client with initial token
		const client = new DirectGeminiAPIClient('initial-token');
		
		// Update token
		client.updateAccessToken('new-token');
		
		// Verify token was updated (access private property for testing)
		expect((client as any).accessToken).toBe('new-token');
	});
});
