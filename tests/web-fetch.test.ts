/**
 * Unit tests for web_fetch tool
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

// Import the mocked modules
const http = require('http');
const https = require('https');

describe('Web Fetch Tool', () => {
	let client: GeminiClient;
	let mockVaultAdapter: MockVaultAdapter;

	beforeEach(() => {
		mockVaultAdapter = new MockVaultAdapter({} as any);
		client = new GeminiClient(mockSettings, mockVaultAdapter as any, '/test', '/test', {} as any);
		
		// Clear all mocks
		jest.clearAllMocks();
		http.request.mockClear();
		https.request.mockClear();
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

	describe('fetchWithRedirects', () => {
		test('should follow single redirect (301)', async () => {
			const originalUrl = 'http://example.com';
			const redirectUrl = 'https://example.com';
			const finalContent = '<html><body>Final content</body></html>';

			// Mock first request (redirect response)
			const mockRedirectRequest = {
				on: jest.fn(),
				end: jest.fn()
			};

			const mockRedirectResponse = {
				statusCode: 301,
				headers: { location: redirectUrl },
				on: jest.fn((event: any, callback: any) => {
					if (event === 'data') {
						callback('');
					} else if (event === 'end') {
						callback();
					}
				})
			};

			// Mock second request (final response)
			const mockFinalRequest = {
				on: jest.fn(),
				end: jest.fn()
			};

			const mockFinalResponse = {
				statusCode: 200,
				headers: { 'content-type': 'text/html' },
				on: jest.fn((event: any, callback: any) => {
					if (event === 'data') {
						callback(finalContent);
					} else if (event === 'end') {
						callback();
					}
				})
			};

			// Setup request mocks
			http.request
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(mockRedirectResponse);
					return mockRedirectRequest;
				})
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(mockFinalResponse);
					return mockFinalRequest;
				});

			// Execute
			const result = await client['fetchWithRedirects'](originalUrl, 5);

			// Verify
			expect(result.statusCode).toBe(200);
			expect(result.data).toBe(finalContent);
			expect(result.finalUrl).toBe(redirectUrl);
			expect(http.request).toHaveBeenCalledTimes(2);
		});

		test('should follow multiple redirects', async () => {
			const urls = [
				'http://example.com',
				'https://example.com',
				'https://www.example.com'
			];
			const finalContent = '<html><body>Final content after multiple redirects</body></html>';

			// Mock requests for each redirect
			const requests: any[] = [];
			const responses: any[] = [];

			for (let i = 0; i < urls.length - 1; i++) {
				const request = { on: jest.fn(), end: jest.fn() };
				const response = {
					statusCode: 302,
					headers: { location: urls[i + 1] },
					on: jest.fn((event, callback) => {
						if (event === 'data') callback('');
						if (event === 'end') callback();
					})
				};
				requests.push(request);
				responses.push(response);
			}

			// Final successful response
			const finalRequest = { on: jest.fn(), end: jest.fn() };
			const finalResponse = {
				statusCode: 200,
				headers: { 'content-type': 'text/html' },
				on: jest.fn((event, callback) => {
					if (event === 'data') callback(finalContent);
					if (event === 'end') callback();
				})
			};

			// Setup all mocks
			http.request
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(responses[0]);
					return requests[0];
				})
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(responses[1]);
					return requests[1];
				})
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(finalResponse);
					return finalRequest;
				});

			// Execute
			const result = await client['fetchWithRedirects'](urls[0], 5);

			// Verify
			expect(result.statusCode).toBe(200);
			expect(result.data).toBe(finalContent);
			expect(result.finalUrl).toBe(urls[2]);
			expect(http.request).toHaveBeenCalledTimes(3);
		});

		test('should handle relative redirects', async () => {
			const baseUrl = 'https://example.com/page1';
			const relativeRedirect = '/page2';
			const absoluteUrl = 'https://example.com/page2';
			const finalContent = '<html><body>Content from relative redirect</body></html>';

			// Mock redirect request
			const mockRedirectRequest = { on: jest.fn(), end: jest.fn() };
			const mockRedirectResponse = {
				statusCode: 301,
				headers: { location: relativeRedirect },
				on: jest.fn((event, callback) => {
					if (event === 'data') callback('');
					if (event === 'end') callback();
				})
			};

			// Mock final request
			const mockFinalRequest = { on: jest.fn(), end: jest.fn() };
			const mockFinalResponse = {
				statusCode: 200,
				headers: { 'content-type': 'text/html' },
				on: jest.fn((event, callback) => {
					if (event === 'data') callback(finalContent);
					if (event === 'end') callback();
				})
			};

			https.request
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(mockRedirectResponse);
					return mockRedirectRequest;
				})
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(mockFinalResponse);
					return mockFinalRequest;
				});

			// Execute
			const result = await client['fetchWithRedirects'](baseUrl, 5);

			// Verify the second request was made with the absolute URL
			expect(https.request).toHaveBeenCalledWith(
				absoluteUrl,
				expect.any(Object),
				expect.any(Function)
			);
			expect(result.finalUrl).toBe(absoluteUrl);
		});

		test('should throw error for too many redirects', async () => {
			const url = 'http://example.com';

			// Mock infinite redirect loop
			const mockRequest = { on: jest.fn(), end: jest.fn() };
			const mockResponse = {
				statusCode: 301,
				headers: { location: url }, // Redirect to itself
				on: jest.fn((event, callback) => {
					if (event === 'data') callback('');
					if (event === 'end') callback();
				})
			};

			http.request.mockImplementation((url: any, options: any, callback: any) => {
				callback(mockResponse);
				return mockRequest;
			});

			// Execute with max redirects = 2
			await expect(client['fetchWithRedirects'](url, 2))
				.rejects.toThrow('Too many redirects (max 2)');
		});

		test('should throw error for redirect without Location header', async () => {
			const url = 'http://example.com';

			const mockRequest = { on: jest.fn(), end: jest.fn() };
			const mockResponse = {
				statusCode: 301,
				headers: {}, // No location header
				on: jest.fn((event, callback) => {
					if (event === 'data') callback('');
					if (event === 'end') callback();
				})
			};

			http.request.mockImplementation((url: any, options: any, callback: any) => {
				callback(mockResponse);
				return mockRequest;
			});

			await expect(client['fetchWithRedirects'](url, 5))
				.rejects.toThrow('Redirect response (301) without Location header');
		});

		test('should throw error for non-redirect error status codes', async () => {
			const url = 'http://example.com';

			const mockRequest = { on: jest.fn(), end: jest.fn() };
			const mockResponse = {
				statusCode: 404,
				headers: {},
				on: jest.fn((event, callback) => {
					if (event === 'data') callback('');
					if (event === 'end') callback();
				})
			};

			http.request.mockImplementation((url: any, options: any, callback: any) => {
				callback(mockResponse);
				return mockRequest;
			});

			await expect(client['fetchWithRedirects'](url, 5))
				.rejects.toThrow('Request failed with status code 404');
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

	describe('Integration with executeWebFetch', () => {
		test('should handle complete web fetch with redirect', async () => {
			const originalUrl = 'http://heise.de';
			const finalUrl = 'https://www.heise.de';
			const finalContent = '<html><body>Heise News Content</body></html>';

			// Mock redirect request
			const mockRedirectRequest = { on: jest.fn(), end: jest.fn() };
			const mockRedirectResponse = {
				statusCode: 301,
				headers: { location: finalUrl },
				on: jest.fn((event, callback) => {
					if (event === 'data') callback('');
					if (event === 'end') callback();
				})
			};

			// Mock final request
			const mockFinalRequest = { on: jest.fn(), end: jest.fn() };
			const mockFinalResponse = {
				statusCode: 200,
				headers: { 'content-type': 'text/html' },
				on: jest.fn((event, callback) => {
					if (event === 'data') callback(finalContent);
					if (event === 'end') callback();
				})
			};

			http.request
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(mockRedirectResponse);
					return mockRedirectRequest;
				})
				.mockImplementationOnce((url: any, options: any, callback: any) => {
					callback(mockFinalResponse);
					return mockFinalRequest;
				});

			// Execute
			const result = await client['executeWebFetch']({
				prompt: `fetch ${originalUrl} and get the most important news`
			});

			// Verify
			expect(result).toContain('followed redirects from http://heise.de to https://www.heise.de');
			expect(result).toContain('Heise News Content');
			expect(http.request).toHaveBeenCalledTimes(2);
		});
	});
});
