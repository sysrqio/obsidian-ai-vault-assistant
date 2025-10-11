/**
 * Simple unit tests for web_fetch tool redirect functionality
 */

import { GeminiClient } from '../src/gemini-client';
import { MockVaultAdapter, mockSettings } from './setup';

// Mock Node.js modules
jest.mock('http', () => ({
	request: jest.fn()
}));

jest.mock('https', () => ({
	request: jest.fn()
}));

describe('Web Fetch Tool - Redirect Tests', () => {
	let client: GeminiClient;
	let mockVaultAdapter: MockVaultAdapter;

	beforeEach(() => {
		mockVaultAdapter = new MockVaultAdapter({} as any);
		client = new GeminiClient(mockSettings, mockVaultAdapter as any, '/test', '/test', {} as any);
		
		// Clear all mocks
		jest.clearAllMocks();
	});

	describe('executeWebFetch validation', () => {
		test('should throw error for empty prompt', async () => {
			await expect(client['executeWebFetch']({ prompt: '' }))
				.rejects.toThrow("The 'prompt' parameter cannot be empty");
		});

		test('should throw error for prompt without URL', async () => {
			await expect(client['executeWebFetch']({ prompt: 'Just some text' }))
				.rejects.toThrow("The 'prompt' must contain at least one valid URL");
		});

		test('should throw error for invalid URL format', async () => {
			await expect(client['executeWebFetch']({ prompt: 'Check out ftp://invalid.com' }))
				.rejects.toThrow("The 'prompt' must contain at least one valid URL");
		});
	});

	describe('processWebFetchResponse', () => {
		test('should process HTML content correctly', () => {
			const response = {
				statusCode: 200,
				headers: { 'content-type': 'text/html' },
				data: '<html><body><h1>Test</h1><p>Content</p></body></html>',
				finalUrl: 'https://example.com'
			};

			const result = client['processWebFetchResponse'](
				response,
				'https://example.com',
				'fetch https://example.com'
			);

			expect(result).toContain('Web fetch successful from https://example.com');
			expect(result).toContain('<html><body><h1>Test</h1><p>Content</p></body></html>');
		});

		test('should process JSON content correctly', () => {
			const jsonData = { name: 'Test', value: 123 };
			const response = {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				data: JSON.stringify(jsonData),
				finalUrl: 'https://api.example.com'
			};

			const result = client['processWebFetchResponse'](
				response,
				'https://api.example.com',
				'fetch https://api.example.com'
			);

			expect(result).toContain('Web fetch successful from https://api.example.com');
			expect(result).toContain('"name": "Test"');
			expect(result).toContain('"value": 123');
		});

		test('should indicate redirects in response', () => {
			const response = {
				statusCode: 200,
				headers: { 'content-type': 'text/html' },
				data: '<html><body>Final content</body></html>',
				finalUrl: 'https://www.example.com'
			};

			const result = client['processWebFetchResponse'](
				response,
				'http://example.com', // Original URL
				'fetch http://example.com'
			);

			expect(result).toContain('followed redirects from http://example.com to https://www.example.com');
			expect(result).toContain('<html><body>Final content</body></html>');
		});

		test('should truncate large content', () => {
			const largeContent = 'x'.repeat(150000); // Larger than MAX_CONTENT_LENGTH
			const response = {
				statusCode: 200,
				headers: { 'content-type': 'text/plain' },
				data: largeContent,
				finalUrl: 'https://example.com'
			};

			const result = client['processWebFetchResponse'](
				response,
				'https://example.com',
				'fetch https://example.com'
			);

			expect(result).toContain('... (content truncated due to size)');
			expect(result.length).toBeLessThan(200000); // Should be truncated
		});
	});

	describe('extractUrls', () => {
		test('should extract URLs from prompt', () => {
			const prompt = 'fetch https://example.com and https://test.com for data';
			const urls = client['extractUrls'](prompt);
			
			expect(urls).toEqual(['https://example.com', 'https://test.com']);
		});

		test('should handle single URL', () => {
			const prompt = 'fetch http://heise.de and get the most important news';
			const urls = client['extractUrls'](prompt);
			
			expect(urls).toEqual(['http://heise.de']);
		});

		test('should return empty array for no URLs', () => {
			const prompt = 'just some text without URLs';
			const urls = client['extractUrls'](prompt);
			
			expect(urls).toEqual([]);
		});
	});

	describe('GitHub URL conversion', () => {
		test('should convert GitHub blob URLs to raw URLs', async () => {
			const githubUrl = 'https://github.com/user/repo/blob/main/file.txt';
			const expectedRawUrl = 'https://raw.githubusercontent.com/user/repo/main/file.txt';
			
			// Mock the fetchWithRedirects to return a successful response
			const mockResponse = {
				statusCode: 200,
				headers: { 'content-type': 'text/plain' },
				data: 'File content',
				finalUrl: expectedRawUrl
			};

			// Mock the private method
			jest.spyOn(client as any, 'fetchWithRedirects').mockResolvedValue(mockResponse);
			jest.spyOn(client as any, 'processWebFetchResponse').mockReturnValue('Mocked response');

			const result = await client['executeWebFetch']({
				prompt: `fetch ${githubUrl}`
			});

			// Verify that fetchWithRedirects was called with the converted URL
			expect(client['fetchWithRedirects']).toHaveBeenCalledWith(expectedRawUrl, 5);
			expect(result).toBe('Mocked response');
		});
	});
});
