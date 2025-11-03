/**
 * OAuth-based Gemini client for direct API authentication
 * Makes raw HTTPS requests to avoid SDK limitations
 */

import * as https from 'https';
import * as zlib from 'zlib';
import type { Content } from '@google/genai';
import { Logger } from '../utils/logger';
import { IGeminiAPIClient, NormalizedChunk, GenerationConfig } from './gemini-api-interface';
import { SSEParser } from './sse-parser';
import { ResponseNormalizer } from './response-normalizer';
import { ContentSerializer } from './content-serializer';

export class OAuthGeminiClient implements IGeminiAPIClient {
	private accessToken: string;
	private userId: string | null = null;
	private projectId: string | null = null;
	private baseUrl = 'https://cloudcode-pa.googleapis.com';
	private apiVersion = 'v1internal';

	constructor(accessToken: string) {
		this.accessToken = accessToken;
	}

	/**
	 * Update the access token (used when token is refreshed)
	 */
	updateAccessToken(newAccessToken: string): void {
		this.accessToken = newAccessToken;
		Logger.debug('OAuthClient', 'Access token updated');
	}

	/**
	 * Generate UUID for session and prompt tracking
	 */
	private generateUUID(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = Math.random() * 16 | 0;
			const v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	/**
	 * Fetch user info
	 */
	async fetchUserInfo(): Promise<void> {
		if (this.userId) return; // Already fetched

		try {
			// Use v2 endpoint to match gemini-cli
			const url = 'https://www.googleapis.com/oauth2/v2/userinfo';
			const response = await new Promise<any>((resolve, reject) => {
				const req = https.request(url, {
					method: 'GET',
					headers: {
						'Authorization': `Bearer ${this.accessToken}`,
					}
				}, (res) => {
					let data = '';
					res.on('data', (chunk) => data += chunk);
					res.on('end', () => {
						if (res.statusCode === 200) {
							resolve(JSON.parse(data));
						} else {
							reject(new Error(`Failed to fetch user info: ${res.statusCode}`));
						}
					});
				});
				req.on('error', reject);
				req.end();
			});

			this.userId = response.id;
			Logger.debug('OAuthClient', '✅ User info fetched:');
			Logger.debug('OAuthClient', '  ID:', this.userId);
			Logger.debug('OAuthClient', '  Email:', response.email);
			Logger.debug('OAuthClient', '  Name:', response.name);
			Logger.debug('OAuthClient', '  Verified:', response.verified_email);
		} catch (error) {
			Logger.error('OAuthClient', 'Failed to fetch user info:', error);
			throw error; // This is required for the API call
		}
	}

	/**
	 * Load Code Assist configuration (matches gemini-cli)
	 * Gets project ID and tier information
	 */
	async loadCodeAssist(): Promise<void> {
		if (this.projectId) return; // Already loaded

		try {
			const url = `${this.baseUrl}/v1internal:loadCodeAssist`;
			const requestBody = JSON.stringify({
				metadata: {
					ideType: 'IDE_UNSPECIFIED',
					platform: 'PLATFORM_UNSPECIFIED',
					pluginType: 'GEMINI'
				}
			});

			const response = await new Promise<any>((resolve, reject) => {
				const urlObj = new URL(url);
				const req = https.request({
					hostname: urlObj.hostname,
					port: 443,
					path: urlObj.pathname,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this.accessToken}`,
						'User-Agent': 'google-api-nodejs-client/9.15.1',
						'x-goog-api-client': 'gl-node/24.9.0',
						'Content-Length': Buffer.byteLength(requestBody)
					}
				}, (res) => {
					let data = '';
					res.on('data', (chunk) => data += chunk);
					res.on('end', () => {
						if (res.statusCode === 200) {
							resolve(JSON.parse(data));
						} else {
							reject(new Error(`Failed to load Code Assist: ${res.statusCode} - ${data}`));
						}
					});
				});
				req.on('error', reject);
				req.write(requestBody);
				req.end();
			});

			this.projectId = response.cloudaicompanionProject;
			
			Logger.debug('OAuthClient', '✅ Code Assist loaded:');
			Logger.debug('OAuthClient', '  Project ID:', this.projectId);
			Logger.debug('OAuthClient', '  Current Tier:', response.currentTier?.name);
			Logger.debug('OAuthClient', '  Tier Description:', response.currentTier?.description);
			Logger.debug('OAuthClient', '  GCP Managed:', response.gcpManaged);
		} catch (error) {
			Logger.error('OAuthClient', 'Failed to load Code Assist:', error);
			throw error;
		}
	}

	/**
	 * Initialize the client (fetch user info and load Code Assist)
	 */
	async initialize(): Promise<void> {
		await this.fetchUserInfo();
		await this.loadCodeAssist();
	}

	/**
	 * Token refresh (no-op for now, handled by OAuthHandler)
	 */
	async refreshTokenIfNeeded(): Promise<void> {
		// Token refresh is handled by OAuthHandler in gemini-client.ts
		// This method is here to satisfy the interface
	}

	/**
	 * Streaming content generation with OAuth
	 */
	async *streamGenerateContent(
		model: string,
		contents: Content[],
		config: GenerationConfig
	): AsyncGenerator<NormalizedChunk> {
		Logger.debug('OAuthClient', 'Making streaming call to cloudcode-pa.googleapis.com');
		Logger.debug('OAuthClient', 'Model:', model);

		if (!this.projectId) {
			throw new Error('Failed to load Code Assist project ID');
		}

		const url = `${this.baseUrl}/${this.apiVersion}:streamGenerateContent?alt=sse`;
		
		// Serialize contents using helper
		const serializedContents = ContentSerializer.serializeForOAuth(contents);

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
			'Accept': '*/*',
			'Accept-Encoding': 'gzip,deflate',
			'User-Agent': 'AI-Vault-Assistant/0.1.0 (Obsidian; darwin; arm64)',
			'x-goog-api-client': 'ai-vault-assistant/0.1.0',
			'Connection': 'close'
		};

		// Generate unique IDs for session and prompt
		const sessionId = this.generateUUID();
		const userPromptId = `${sessionId}########0`;

		// Build request body
		const requestBody = {
			model,
			project: this.projectId,
			user_prompt_id: userPromptId,
			request: {
				contents: serializedContents,
				generationConfig: {
					temperature: config.temperature,
					maxOutputTokens: config.maxOutputTokens,
					topP: 1
				},
				// OAuth API expects: [{ function_declarations: [...] }] (snake_case!)
				// config.tools is in format: [{ functionDeclarations: [...] }] (camelCase)
				// Need to convert camelCase to snake_case for OAuth API
				tools: config.tools && config.tools.length > 0 && config.tools[0]?.functionDeclarations
					? [{
						function_declarations: config.tools[0].functionDeclarations
					}]
					: [],
				systemInstruction: config.systemInstruction ? {
					role: 'user',
					parts: [{ text: config.systemInstruction }]
				} : undefined,
				session_id: sessionId
			}
		};

		Logger.debug('OAuthClient', 'Request body:', JSON.stringify(requestBody, null, 2));

		const urlObj = new URL(url);
		const requestBodyStr = JSON.stringify(requestBody);

		const options: https.RequestOptions = {
			hostname: urlObj.hostname,
			port: 443,
			path: `${urlObj.pathname}${urlObj.search}`,
			method: 'POST',
			headers: {
				...headers,
				'Content-Length': Buffer.byteLength(requestBodyStr),
			}
		};

		try {
			const httpResponse = await new Promise<any>((resolve, reject) => {
				const req = https.request(options, (res) => {
					Logger.debug('OAuthClient', 'Response status:', res.statusCode);
					
					if (res.statusCode && res.statusCode >= 400) {
						let errorData = '';
						res.on('data', (chunk) => {
							errorData += chunk;
						});
						res.on('end', () => {
							Logger.error('OAuthClient', 'API error:', errorData);
							reject(new Error(`API error: ${res.statusCode} - ${errorData}`));
						});
						return;
					}
					
					// Handle decompression based on Content-Encoding
					let stream: any = res;
					const encoding = res.headers['content-encoding'];
					if (encoding === 'gzip') {
						stream = res.pipe(zlib.createGunzip());
					} else if (encoding === 'deflate') {
						stream = res.pipe(zlib.createInflate());
					}
					
					resolve(stream);
				});

				req.on('error', (error) => {
					Logger.error('OAuthClient', 'Request error:', error);
					reject(error);
				});

				req.write(requestBodyStr);
				req.end();
			});

			// Parse SSE stream using helper
			for await (const rawChunk of SSEParser.parseSSEStream(httpResponse)) {
				// Normalize using helper
				const normalized = ResponseNormalizer.normalizeOAuthChunk(rawChunk);
				if (normalized) {
					yield normalized;
				}
			}

			yield { done: true };

		} catch (error: any) {
			Logger.error('OAuthClient', 'Stream error:', error);
			throw error;
		}
	}

	/**
	 * Generate content with Google Search (second call - actual search)
	 */
	async generateContentWithGoogleSearch(
		model: string,
		contents: Content[],
		query: string
	): Promise<any> {
		Logger.debug('OAuthClient', 'Making Google Search request');
		Logger.debug('OAuthClient', 'Query:', query);

		if (!this.projectId) {
			throw new Error('Failed to load Code Assist project ID');
		}

		const url = `${this.baseUrl}/${this.apiVersion}:generateContent`;
		Logger.debug('OAuthClient', 'URL:', url);
		
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
		};

		const body = {
			model: model,
			project: this.projectId,
			user_prompt_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}########0`,
			request: {
				contents: contents.map(c => ({
					role: c.role,
					parts: c.parts?.map(p => ({ text: p.text })) || []
				})),
				systemInstruction: {
					role: "user",
					parts: [{ text: "You are an interactive assistant specializing in knowledge management and note-taking within Obsidian." }]
				},
				tools: [{ googleSearch: {} }],
				generationConfig: {
					temperature: 0,
					topP: 1
				},
				session_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
			}
		};

		Logger.debug('OAuthClient', 'Request body:', JSON.stringify(body, null, 2));

		const requestBody = JSON.stringify(body);
		const urlObj = new URL(url);

		const options: https.RequestOptions = {
			hostname: urlObj.hostname,
			port: 443,
			path: urlObj.pathname,
			method: 'POST',
			headers: {
				...headers,
				'Content-Length': Buffer.byteLength(requestBody),
			}
		};

		try {
			const httpResponse = await new Promise<any>((resolve, reject) => {
				const req = https.request(options, (res) => {
					Logger.debug('OAuthClient', 'Search response status:', res.statusCode);
					
					if (res.statusCode && res.statusCode >= 400) {
						let errorData = '';
						res.on('data', (chunk) => {
							errorData += chunk;
						});
						res.on('end', () => {
							Logger.error('OAuthClient', 'Search API error:', errorData);
							reject(new Error(`API error: ${res.statusCode} - ${errorData}`));
						});
						return;
					}
					
					// Handle decompression based on Content-Encoding
					let stream: any = res;
					const encoding = res.headers['content-encoding'];
					if (encoding === 'gzip') {
						stream = res.pipe(zlib.createGunzip());
					} else if (encoding === 'deflate') {
						stream = res.pipe(zlib.createInflate());
					}
					
					resolve(stream);
				});

				req.on('error', (error) => {
					Logger.error('OAuthClient', 'Search request error:', error);
					reject(error);
				});

				req.write(requestBody);
				req.end();
			});

			let responseData = '';
			await new Promise<void>((resolve, reject) => {
				httpResponse.on('data', (chunk: Buffer) => {
					responseData += chunk.toString();
				});
				httpResponse.on('end', () => resolve());
				httpResponse.on('error', reject);
			});

			// Parse JSON response (not SSE for generateContent)
			Logger.debug('OAuthClient', 'Raw response data:', responseData);
			
			const parsedResponse = JSON.parse(responseData);
			
			if (!parsedResponse.response) {
				throw new Error('No valid response found in JSON response');
			}
			
			Logger.debug('OAuthClient', 'Parsed response:', JSON.stringify(parsedResponse, null, 2));
			Logger.debug('OAuthClient', '✅ Search complete');
			
			return parsedResponse;

		} catch (error: any) {
			Logger.error('OAuthClient', 'Search failed:', error);
			throw error;
		}
	}

	/**
	 * Generate content with Google Search grounding (first call - tool selection)
	 */
	async generateContentWithGrounding(
		model: string,
		contents: Content[],
		query: string,
		functionDeclarations: any[] = []
	): Promise<any> {
		Logger.debug('OAuthClient', 'Making grounded search request');
		Logger.debug('OAuthClient', 'Query:', query);

		if (!this.projectId) {
			throw new Error('Failed to load Code Assist project ID');
		}

		const url = `${this.baseUrl}/${this.apiVersion}:streamGenerateContent?alt=sse`;
		
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
		};

		const body = {
			model: model,
			project: this.projectId,
			user_prompt_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}########0`,
			request: {
				contents: contents.map(c => ({
					role: c.role,
					parts: c.parts?.map(p => ({ text: p.text })) || []
				})),
				generationConfig: {
					temperature: 0.7,
					maxOutputTokens: 8192,
				},
				tools: [{ functionDeclarations: functionDeclarations }]
			}
		};

		Logger.debug('OAuthClient', 'Request body:', JSON.stringify(body, null, 2));

		const urlObj = new URL(url);
		const requestBody = JSON.stringify(body);

		const options: https.RequestOptions = {
			hostname: urlObj.hostname,
			port: 443,
			path: urlObj.pathname,
			method: 'POST',
			headers: {
				...headers,
				'Content-Length': Buffer.byteLength(requestBody),
			}
		};

		try {
			const httpResponse = await new Promise<any>((resolve, reject) => {
				const req = https.request(options, (res) => {
					Logger.debug('OAuthClient', 'Search response status:', res.statusCode);
					
					if (res.statusCode && res.statusCode >= 400) {
						let errorData = '';
						res.on('data', (chunk) => {
							errorData += chunk;
						});
						res.on('end', () => {
							Logger.error('OAuthClient', 'Search API error:', errorData);
							reject(new Error(`API error: ${res.statusCode} - ${errorData}`));
						});
						return;
					}
					
					resolve(res);
				});

				req.on('error', (error) => {
					Logger.error('OAuthClient', 'Search request error:', error);
					reject(error);
				});

				req.write(requestBody);
				req.end();
			});

			let responseData = '';
			await new Promise<void>((resolve, reject) => {
				httpResponse.on('data', (chunk: Buffer) => {
					responseData += chunk.toString();
				});
				httpResponse.on('end', () => resolve());
				httpResponse.on('error', reject);
			});

			// Debug: Log raw response data
			Logger.debug('OAuthClient', 'Raw response data:', responseData);
			Logger.debug('OAuthClient', 'Response data length:', responseData.length);
			
			// Try to parse as JSON first (in case it's not SSE)
			let parsedResponse = null;
			try {
				const jsonResponse = JSON.parse(responseData);
				
				// Handle array response format
				if (Array.isArray(jsonResponse) && jsonResponse.length > 0 && jsonResponse[0].response) {
					parsedResponse = jsonResponse[0].response;
					Logger.debug('OAuthClient', '✅ Parsed as array JSON response');
				}
				// Handle direct response format
				else if (jsonResponse.response) {
					parsedResponse = jsonResponse.response;
					Logger.debug('OAuthClient', '✅ Parsed as JSON response');
				} 
				// Handle direct candidates format
				else if (jsonResponse.candidates) {
					parsedResponse = jsonResponse;
					Logger.debug('OAuthClient', '✅ Parsed as direct JSON response with candidates');
				}
			} catch (e) {
				Logger.debug('OAuthClient', 'Not JSON, trying SSE parsing...');
			}
			
			// If not JSON, try SSE parsing
			if (!parsedResponse) {
				const lines = responseData.split('\n');
				Logger.debug('OAuthClient', 'SSE lines count:', lines.length);
				
				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.substring(6);
						if (data.trim() === '') continue;
						
						try {
							const parsed = JSON.parse(data);
							if (parsed.response) {
								parsedResponse = parsed.response;
								Logger.debug('OAuthClient', '✅ Parsed SSE response');
								break;
							}
						} catch (e) {
							// Skip invalid JSON lines
							continue;
						}
					}
				}
			}
			
			if (!parsedResponse) {
				Logger.error('OAuthClient', 'Failed to parse response. Raw data:', responseData);
				throw new Error('No valid response found in SSE stream');
			}
			
			Logger.debug('OAuthClient', '✅ Search complete');
			
			return parsedResponse;

		} catch (error: any) {
			Logger.error('OAuthClient', 'Search failed:', error);
			throw error;
		}
	}
}
