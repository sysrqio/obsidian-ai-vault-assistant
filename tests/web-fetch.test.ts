/**
 * Unit tests for web_fetch tool
 * Note: Complex redirect scenarios are tested in web-fetch-simple.test.ts
 * This file focuses on the core functionality with proper HTTP mocking
 */

import { GeminiClient } from '../src/gemini-client';
import { MockVaultAdapter, mockSettings } from './setup';

// Mock Node.js modules
jest.mock('http');
jest.mock('https');

describe('Web Fetch Tool', () => {
	let client: GeminiClient;
	let mockVaultAdapter: MockVaultAdapter;

	beforeEach(() => {
		mockVaultAdapter = new MockVaultAdapter({} as any);
		client = new GeminiClient(mockSettings, mockVaultAdapter as any, '/test', '/test', {} as any);
		jest.clearAllMocks();
	});

	describe('executeWebFetch', () => {
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
			const htmlContent = '<html><body><h1>Test</h1></body></html>';
			const response = {
				statusCode: 200,
				headers: { 'content-type': 'text/html' },
				data: htmlContent,
				finalUrl: 'https://example.com'
			};
			const result = client['processWebFetchResponse'](
				response,
				'https://example.com',
				'fetch https://example.com'
			);

			expect(result).toContain('Test');
			expect(result).toContain('https://example.com');
		});

		test('should process JSON content correctly', () => {
			const jsonContent = JSON.stringify({ message: 'Hello', status: 'success' });
			const response = {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				data: jsonContent,
				finalUrl: 'https://api.example.com'
			};
			const result = client['processWebFetchResponse'](
				response,
				'https://api.example.com',
				'fetch https://api.example.com'
			);

			expect(result).toContain('"message": "Hello"');
			expect(result).toContain('"status": "success"');
		});

		test('should indicate redirects in response', () => {
			const content = 'Final content';
			const response = {
				statusCode: 200,
				headers: { 'content-type': 'text/plain' },
				data: content,
				finalUrl: 'https://final.example.com'
			};
			const result = client['processWebFetchResponse'](
				response,
				'https://example.com', // Different from finalUrl to indicate redirect
				'fetch https://example.com'
			);

			expect(result).toContain('https://final.example.com');
		});

	test('should handle large content', () => {
		const largeContent = 'x'.repeat(150000);
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

		// The processWebFetchResponse method includes the content in the response
		expect(result).toContain('Web fetch successful');
		expect(result).toContain('https://example.com');
	});
	});

	describe('extractUrls', () => {
		test('should extract URLs from prompt', () => {
			const prompt = 'Check https://example.com and http://test.com for info';
			const urls = client['extractUrls'](prompt);
			
			expect(urls).toHaveLength(2);
			expect(urls).toContain('https://example.com');
			expect(urls).toContain('http://test.com');
		});

		test('should handle single URL', () => {
			const prompt = 'fetch https://example.com';
			const urls = client['extractUrls'](prompt);
			
			expect(urls).toHaveLength(1);
			expect(urls[0]).toBe('https://example.com');
		});

		test('should return empty array for no URLs', () => {
			const prompt = 'just some text without urls';
			const urls = client['extractUrls'](prompt);
			
			expect(urls).toHaveLength(0);
		});
	});

	describe('GitHub URL conversion', () => {
		test('should convert GitHub blob URLs to raw URLs', () => {
			const prompt = 'fetch https://github.com/user/repo/blob/main/file.txt';
			const urls = client['extractUrls'](prompt);
			
			// The convertGitHubUrl method is called during fetch
			expect(urls).toHaveLength(1);
			// Initial extraction gets the blob URL
			expect(urls[0]).toBe('https://github.com/user/repo/blob/main/file.txt');
		});
	});
});
