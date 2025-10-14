/**
 * Direct Gemini API client for OAuth authentication
 * Makes raw HTTPS requests to avoid SDK limitations
 */

import * as https from 'https';
import type { Content } from '@google/genai';
import { Logger } from './utils/logger';

export class DirectGeminiAPIClient {
	private accessToken: string;
	private userId: string | null = null;
	private projectId: string | null = null;
	private baseUrl = 'https://cloudcode-pa.googleapis.com';
	private apiVersion = 'v1internal';

	constructor(accessToken: string) {
		this.accessToken = accessToken;
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
			Logger.debug('DirectAPI', '✅ User info fetched:');
			Logger.debug('DirectAPI', '  ID:', this.userId);
			Logger.debug('DirectAPI', '  Email:', response.email);
			Logger.debug('DirectAPI', '  Name:', response.name);
			Logger.debug('DirectAPI', '  Verified:', response.verified_email);
		} catch (error) {
			Logger.error('DirectAPI', 'Failed to fetch user info:', error);
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
			
			Logger.debug('DirectAPI', '✅ Code Assist loaded:');
			Logger.debug('DirectAPI', '  Project ID:', this.projectId);
			Logger.debug('DirectAPI', '  Current Tier:', response.currentTier?.name);
			Logger.debug('DirectAPI', '  Tier Description:', response.currentTier?.description);
			Logger.debug('DirectAPI', '  GCP Managed:', response.gcpManaged);
		} catch (error) {
			Logger.error('DirectAPI', 'Failed to load Code Assist:', error);
			throw error;
		}
	}

	/**
	 * Generate content with OAuth (non-streaming for simpler implementation)
	 */
	async generateContent(
		model: string,
		contents: Content[],
		systemInstruction: string,
		tools: any[],
		config: { temperature: number; maxOutputTokens: number }
	): Promise<any> {
		Logger.debug('DirectAPI', 'Making direct call to cloudcode-pa.googleapis.com');
		Logger.debug('DirectAPI', 'Model:', model);
		Logger.debug('DirectAPI', 'Using OAuth Bearer token with Gemini Code Assist API');
		Logger.debug('DirectAPI', 'Mode: streamGenerateContent with SSE');

		// Fetch user info and Code Assist config (matches gemini-cli flow)
		await this.fetchUserInfo();
		await this.loadCodeAssist();

		if (!this.projectId) {
			throw new Error('Failed to load Code Assist project ID');
		}

		const url = `${this.baseUrl}/${this.apiVersion}:streamGenerateContent?alt=sse`;
		
		// CRITICAL: Manually serialize contents to ensure functionResponse is included
		const serializedContents = contents.map((content, cidx) => {
			Logger.debug('DirectAPI', `🔍 Serializing content ${cidx}: role=${content.role}, parts=${content.parts?.length || 0}`);
			
			return {
				role: content.role,
				parts: content.parts?.map((part, pidx) => {
					const allKeys = Object.keys(part);
					const ownProps = Object.getOwnPropertyNames(part);
					Logger.debug('DirectAPI', `🔍 Part ${pidx}: keys=${allKeys.join(',')}, ownProps=${ownProps.join(',')}`);
					Logger.debug('DirectAPI', `🔍 Part ${pidx}: has text=${part.text !== undefined}, has functionCall=${!!part.functionCall}, has functionResponse=${!!part.functionResponse}`);
					
					if (part.text !== undefined) {
						Logger.debug('DirectAPI', `✅ Serializing text part`);
						return { text: part.text };
					} else if (part.functionCall) {
						Logger.debug('DirectAPI', `✅ Serializing functionCall part`);
						return { 
							functionCall: {
								name: part.functionCall.name,
								args: part.functionCall.args
							}
						};
					} else if (part.functionResponse) {
						Logger.debug('DirectAPI', `✅ Serializing functionResponse part`);
						return {
							functionResponse: {
								name: part.functionResponse.name,
								response: part.functionResponse.response
							}
						};
					} else {
						Logger.debug('DirectAPI', `⚠️  Unknown part type, using spread operator`);
						return { ...part };
					}
				}) || []
			};
		});

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
			'Accept': '*/*',
			// Align with gemini-cli headers
			'User-Agent': 'GeminiCLI/v24.9.0 (darwin; arm64) google-api-nodejs-client/9.15.1',
			'x-goog-api-client': 'gl-node/24.9.0'
		};

	// Generate unique ID for prompt
	const userPromptId = `${this.generateUUID()}########1`;

		// Wrap the request in gemini-cli format
		const innerRequest: any = {
			contents: serializedContents,
			generationConfig: {
				temperature: config.temperature,
				topP: 1,
				candidateCount: 1
			}
		};

		if (tools && tools.length > 0) {
			innerRequest.tools = tools;
		}

	const body: any = {
		model: model,
		project: this.projectId,
		user_prompt_id: userPromptId,
		request: innerRequest
	};
	
	// Add systemInstruction only if provided
	if (systemInstruction) {
		body.systemInstruction = {
			role: 'user',
			parts: [{ text: systemInstruction }]
		};
	}
	
	// Note: session_id causes 400 error - API doesn't accept it at top level

		Logger.debug('DirectAPI', '✅ Using correct REST API systemInstruction format (object)');
		Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		Logger.debug('DirectAPI', '📤 API REQUEST:');
		Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		Logger.debug('DirectAPI', 'URL:', url);
		Logger.debug('DirectAPI', 'Format: JSON array (formatted/pretty-printed)');
		Logger.debug('DirectAPI', 'System instruction included:', !!systemInstruction);
		Logger.debug('DirectAPI', 'Tools included:', !!tools && tools.length > 0);
		Logger.debug('DirectAPI', 'Contents count:', serializedContents.length);
		Logger.debug('DirectAPI', '🔍 Contents inspection:');
		serializedContents.forEach((c, i) => {
			Logger.debug('DirectAPI', `Content ${i}: role=${c.role}, parts.length=${c.parts?.length || 0}`);
			c.parts?.forEach((p: any, j: number) => {
				if (p.text) Logger.debug('DirectAPI', `Part ${j}: text (${p.text.substring(0, 50)}...)`);
				if (p.functionCall) Logger.debug('DirectAPI', `Part ${j}: functionCall (name=${p.functionCall.name})`);
				if (p.functionResponse) Logger.debug('DirectAPI', `Part ${j}: functionResponse (name=${p.functionResponse.name}, responseKeys=${Object.keys(p.functionResponse.response).join(',')})`);
			});
		});
		Logger.debug('DirectAPI', 'Request body:', JSON.stringify(body, null, 2));
		Logger.debug('DirectAPI', '🔍 DEBUGGING: Comparing with SDK format...');
		Logger.debug('DirectAPI', '🔍 SDK would send systemInstruction as string, we send as object');
		Logger.debug('DirectAPI', '🔍 SDK uses streaming, we collect full response');
		Logger.debug('DirectAPI', 'Request prepared, sending...');

		const urlObj = new URL(url);
		const requestBody = JSON.stringify(body);

		const options: https.RequestOptions = {
			hostname: urlObj.hostname,
			port: 443,
			// Ensure query string (?alt=sse) is included; otherwise endpoint schema differs
			path: `${urlObj.pathname}${urlObj.search}`,
			method: 'POST',
			headers: {
				...headers,
				'Content-Length': Buffer.byteLength(requestBody),
			}
		};

		try {
			const httpResponse = await new Promise<any>((resolve, reject) => {
				const req = https.request(options, (res) => {
					Logger.debug('DirectAPI', 'Response status:', res.statusCode);
					
					if (res.statusCode && res.statusCode >= 400) {
						let errorData = '';
						res.on('data', (chunk) => {
							errorData += chunk;
						});
						res.on('end', () => {
							Logger.error('DirectAPI', 'API error:', errorData);
							reject(new Error(`API error: ${res.statusCode} - ${errorData}`));
						});
						return;
					}
					
					resolve(res);
				});

				req.on('error', (error) => {
					Logger.error('DirectAPI', 'Request error:', error);
					reject(error);
				});

				req.write(requestBody);
				req.end();
			});

			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('DirectAPI', '📥 RECEIVING RESPONSE:');
			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

			let buffer = '';
			let totalBytes = 0;

			for await (const chunk of httpResponse) {
				const chunkStr = chunk.toString();
				totalBytes += chunkStr.length;
				Logger.debug('DirectAPI', 'Received bytes:', chunkStr.length);
				buffer += chunkStr;
			}

			// Parse final buffer (SSE format)
			Logger.debug('DirectAPI', '✅ Response complete!');
			Logger.debug('DirectAPI', 'Total response size:', totalBytes, 'bytes');
			Logger.debug('DirectAPI', 'Raw response (first 500 chars):', buffer.substring(0, 500));
			Logger.debug('DirectAPI', 'Raw response (last 500 chars):', buffer.substring(Math.max(0, buffer.length - 500)));
			Logger.debug('DirectAPI', 'Parsing SSE response...');

			// Parse SSE format: multiple "data: {...}" lines
			const lines = buffer.split('\n');
			const dataLines = lines.filter(line => line.trim().startsWith('data:'));
			
			if (dataLines.length === 0) {
				throw new Error('No data lines found in SSE response');
			}
			
			// Parse the last data line (final response)
			const lastDataLine = dataLines[dataLines.length - 1];
			const jsonStr = lastDataLine.substring(5).trim(); // Remove "data:" prefix
			const response = JSON.parse(jsonStr);

			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('DirectAPI', '✅ RESPONSE PARSED:');
			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('DirectAPI', 'Candidates:', response.candidates?.length || 0);
			Logger.debug('DirectAPI', 'Parts:', response.candidates?.[0]?.content?.parts?.length || 0);
			response.candidates?.[0]?.content?.parts?.forEach((p: any, i: number) => {
				if (p.text) Logger.debug('DirectAPI', `Part ${i}: Text (${p.text.length} chars):`, p.text.substring(0, 100));
				if (p.functionCall) Logger.debug('DirectAPI', `Part ${i}: Function call:`, p.functionCall.name);
				if (p.functionResponse) Logger.debug('DirectAPI', `Part ${i}: Function response:`, p.functionResponse.name);
			});
			Logger.debug('DirectAPI', 'Usage:', response.usageMetadata);
			Logger.debug('DirectAPI', 'Full response:', JSON.stringify(response, null, 2));

			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('DirectAPI', '✅ RESPONSE COMPLETE');
			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			
			return response;

		} catch (error: any) {
			Logger.error('DirectAPI', 'Stream error:', error);
			throw error;
		}
	}

	/**
	 * Generate content with Google Search grounding
	 */
	async generateContentWithGrounding(
		model: string,
		contents: Content[],
		query: string
	): Promise<any> {
		Logger.debug('DirectAPI', 'Making grounded search request');
		Logger.debug('DirectAPI', 'Query:', query);

		// Fetch user info and Code Assist config
		await this.fetchUserInfo();
		await this.loadCodeAssist();

		if (!this.projectId) {
			throw new Error('Failed to load Code Assist project ID');
		}

		const url = `${this.baseUrl}/${this.apiVersion}/models/${model}:generateContent`;
		
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
		};

		// No quota header needed for Code Assist API

		const body = {
			contents: contents.map(c => ({
				role: c.role,
				parts: c.parts?.map(p => ({ text: p.text })) || []
			})),
			generationConfig: {
				temperature: 0.7,
				maxOutputTokens: 8192,
			},
			tools: [{ googleSearch: {} }]
		};

		Logger.debug('DirectAPI', 'Request body:', JSON.stringify(body, null, 2));

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
					Logger.debug('DirectAPI', 'Search response status:', res.statusCode);
					
					if (res.statusCode && res.statusCode >= 400) {
						let errorData = '';
						res.on('data', (chunk) => {
							errorData += chunk;
						});
						res.on('end', () => {
							Logger.error('DirectAPI', 'Search API error:', errorData);
							reject(new Error(`API error: ${res.statusCode} - ${errorData}`));
						});
						return;
					}
					
					resolve(res);
				});

				req.on('error', (error) => {
					Logger.error('DirectAPI', 'Search request error:', error);
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

			const parsedResponse = JSON.parse(responseData);
			Logger.debug('DirectAPI', '✅ Search complete');
			
			return parsedResponse;

		} catch (error: any) {
			Logger.error('DirectAPI', 'Search failed:', error);
			throw error;
		}
	}
}

