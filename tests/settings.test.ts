/**
 * Tests for settings validation and defaults
 */

import { DEFAULT_SETTINGS, type GeminiSettings, type ToolPermission } from '../src/settings';

describe('Settings', () => {
	describe('DEFAULT_SETTINGS', () => {
		test('should have all required fields', () => {
			expect(DEFAULT_SETTINGS.apiKey).toBeDefined();
			expect(DEFAULT_SETTINGS.model).toBeDefined();
			expect(DEFAULT_SETTINGS.temperature).toBeDefined();
			expect(DEFAULT_SETTINGS.maxTokens).toBeDefined();
			expect(DEFAULT_SETTINGS.useOAuth).toBeDefined();
			expect(DEFAULT_SETTINGS.toolPermissions).toBeDefined();
		});

		test('should have sensible defaults', () => {
			expect(DEFAULT_SETTINGS.apiKey).toBe('');
			expect(DEFAULT_SETTINGS.model).toBe('gemini-2.5-pro');
			expect(DEFAULT_SETTINGS.temperature).toBe(0.7);
			expect(DEFAULT_SETTINGS.maxTokens).toBe(8192);
			expect(DEFAULT_SETTINGS.useOAuth).toBe(false);
			expect(DEFAULT_SETTINGS.fallbackMode).toBe(false);
		});

		test('should NOT have autoAcceptReadOnly (removed)', () => {
			expect((DEFAULT_SETTINGS as any).autoAcceptReadOnly).toBeUndefined();
		});

		test('should have all tool permissions set to ask', () => {
			const permissions = DEFAULT_SETTINGS.toolPermissions;
			
			expect(permissions.web_fetch).toBe('ask');
			expect(permissions.write_file).toBe('ask');
			expect(permissions.read_file).toBe('ask');
			expect(permissions.list_files).toBe('ask');
			expect(permissions.read_many_files).toBe('ask');
			expect(permissions.google_web_search).toBe('ask');
			expect(permissions.save_memory).toBe('ask');
		});

	test('should have exactly 26 tool permissions', () => {
		const permissions = Object.keys(DEFAULT_SETTINGS.toolPermissions);
		expect(permissions).toHaveLength(26);
		expect(permissions).toContain('delete_memory');
		expect(permissions).toContain('get_active_file');
		expect(permissions).toContain('search_vault');
		expect(permissions).toContain('create_folder');
		expect(permissions).toContain('get_daily_note');
	});
	});

	describe('ToolPermission validation', () => {
		const validPermissions: ToolPermission[] = ['ask', 'always', 'never'];

		test('should accept valid permission values', () => {
			validPermissions.forEach(permission => {
				const settings: GeminiSettings = {
					...DEFAULT_SETTINGS,
					toolPermissions: {
						...DEFAULT_SETTINGS.toolPermissions,
						web_fetch: permission
					}
				};
				expect(settings.toolPermissions.web_fetch).toBe(permission);
			});
		});

		test('should have consistent permission types across all tools', () => {
			const permissions = DEFAULT_SETTINGS.toolPermissions;
			Object.values(permissions).forEach(permission => {
				expect(validPermissions).toContain(permission);
			});
		});
	});

	describe('Temperature validation', () => {
		test('should use temperature between 0 and 2', () => {
			expect(DEFAULT_SETTINGS.temperature).toBeGreaterThanOrEqual(0);
			expect(DEFAULT_SETTINGS.temperature).toBeLessThanOrEqual(2);
		});

		test('should default to 0.7', () => {
			expect(DEFAULT_SETTINGS.temperature).toBe(0.7);
		});
	});

	describe('Model validation', () => {
		test('should default to a valid model', () => {
			const validModels = [
				'gemini-2.5-pro',
				'gemini-2.5-flash',
				'gemini-2.5-flash-lite',
				'gemini-1.5-pro',
				'gemini-1.5-flash'
			];
			expect(validModels).toContain(DEFAULT_SETTINGS.model);
		});

		test('should default to pro model', () => {
			expect(DEFAULT_SETTINGS.model).toBe('gemini-2.5-pro');
		});
	});

	describe('OAuth settings', () => {
		test('should default OAuth to disabled', () => {
			expect(DEFAULT_SETTINGS.useOAuth).toBe(false);
		});

		test('should have OAuth token fields as optional', () => {
			expect(DEFAULT_SETTINGS.oauthAccessToken).toBeUndefined();
			expect(DEFAULT_SETTINGS.oauthRefreshToken).toBeUndefined();
			expect(DEFAULT_SETTINGS.oauthExpiresAt).toBeUndefined();
		});
	});

	describe('Feature flags', () => {
		test('should enable file tools by default', () => {
			expect(DEFAULT_SETTINGS.enableFileTools).toBe(true);
		});

		test('should disable shell tools by default', () => {
			expect(DEFAULT_SETTINGS.enableShellTools).toBe(false);
		});

		test('should disable fallback mode by default', () => {
			expect(DEFAULT_SETTINGS.fallbackMode).toBe(false);
		});
	});
});

