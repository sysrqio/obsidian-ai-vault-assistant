/**
 * Direct Gemini API client for OAuth authentication
 * Makes raw HTTPS requests to avoid SDK limitations
 */

import * as https from 'https';
import * as zlib from 'zlib';
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
	 * Update the access token (used when token is refreshed)
	 */
	updateAccessToken(newAccessToken: string): void {
		this.accessToken = newAccessToken;
		Logger.debug('DirectAPI', 'Access token updated');
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
		'Accept-Encoding': 'gzip,deflate',
		// Identify as AI Vault Assistant Obsidian plugin
		'User-Agent': 'AI-Vault-Assistant/0.1.0 (Obsidian; darwin; arm64)',
		'x-goog-api-client': 'ai-vault-assistant/0.1.0',
		'Connection': 'close'
	};

	// Generate unique IDs for session and prompt (matching gemini-cli)
	const sessionId = this.generateUUID();
	const userPromptId = `${sessionId}########0`;

		// Wrap the request in gemini-cli format
		const innerRequest: any = {
			contents: serializedContents,
			generationConfig: {
				temperature: config.temperature,
				topP: 1
			},
			session_id: sessionId  // session_id goes INSIDE request object
		};

		if (tools && tools.length > 0) {
			innerRequest.tools = tools;
		}
		
		if (systemInstruction) {
			innerRequest.systemInstruction = {
				role: 'user',
				parts: [{ text: systemInstruction }]
			};
		}

	const body: any = {
		model: model,
		project: this.projectId,
		user_prompt_id: userPromptId,
		request: innerRequest
	};

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
					Logger.debug('DirectAPI', 'Response encoding:', res.headers['content-encoding'] || 'none');
					
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
		
		Logger.debug('DirectAPI', `Found ${dataLines.length} SSE data lines`);
		
		// Combine all chunks (each chunk has partial text and potentially function calls)
		let combinedText = '';
		let finalResponse: any = null;
		const functionCalls: any[] = [];
		
		for (const dataLine of dataLines) {
			const jsonStr = dataLine.substring(5).trim(); // Remove "data:" prefix
			const parsed = JSON.parse(jsonStr);
			const chunk = parsed.response || parsed;
			
			// Process each chunk's parts
			if (chunk.candidates?.[0]?.content?.parts) {
				for (const part of chunk.candidates[0].content.parts) {
					// Accumulate text from each chunk
					if (part.text) {
						combinedText += part.text;
					}
					// Collect function calls from all chunks
					if (part.functionCall) {
						functionCalls.push(part.functionCall);
					}
				}
			}
			
			// Keep the last chunk for metadata (usage, finishReason, etc.)
			finalResponse = chunk;
		}
		
		// Replace the parts in the final response with combined text (if any) and function calls
		if (finalResponse && finalResponse.candidates?.[0]?.content) {
			if (!finalResponse.candidates[0].content.parts) {
				finalResponse.candidates[0].content.parts = [];
			}
			
			// Build parts array with combined text (if any) and function calls
			const combinedParts: any[] = [];
			if (combinedText) {
				combinedParts.push({ text: combinedText });
			}
			// Add function calls (remove duplicates by name)
			const seenFunctionNames = new Set<string>();
			for (const funcCall of functionCalls) {
				if (!seenFunctionNames.has(funcCall.name)) {
					combinedParts.push({ functionCall: funcCall });
					seenFunctionNames.add(funcCall.name);
				}
			}
			
			finalResponse.candidates[0].content.parts = combinedParts;
		}
		
		const response = finalResponse;

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
	 * Generate content with Google Search (second call - actual search)
	 */
	async generateContentWithGoogleSearch(
		model: string,
		contents: Content[],
		query: string
	): Promise<any> {
		Logger.debug('DirectAPI', 'Making Google Search request');
		Logger.debug('DirectAPI', 'Query:', query);

		// Fetch user info and Code Assist config
		await this.fetchUserInfo();
		await this.loadCodeAssist();

		if (!this.projectId) {
			throw new Error('Failed to load Code Assist project ID');
		}

		const url = `${this.baseUrl}/${this.apiVersion}:generateContent`;
		Logger.debug('DirectAPI', 'URL:', url);
		
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
		};

		// No quota header needed for Code Assist API

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

		Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		Logger.debug('DirectAPI', '📤 GOOGLE SEARCH REQUEST:');
		Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		Logger.debug('DirectAPI', 'URL:', url);
		Logger.debug('DirectAPI', 'Method: POST');
		Logger.debug('DirectAPI', 'Headers:', JSON.stringify(headers, null, 2));
		Logger.debug('DirectAPI', 'Request body:', JSON.stringify(body, null, 2));

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

			// Parse JSON response (not SSE for generateContent)
			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('DirectAPI', '📥 GOOGLE SEARCH RESPONSE:');
			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('DirectAPI', 'Raw response data:', responseData);
			
			const parsedResponse = JSON.parse(responseData);
			
			if (!parsedResponse.response) {
				throw new Error('No valid response found in JSON response');
			}
			
			Logger.debug('DirectAPI', 'Parsed response:', JSON.stringify(parsedResponse, null, 2));
			Logger.debug('DirectAPI', '✅ Search complete');
			
			return parsedResponse;

		} catch (error: any) {
			Logger.error('DirectAPI', 'Search failed:', error);
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
		functionDeclarations: any[] = [],
		systemInstruction?: string
	): Promise<any> {
		Logger.debug('DirectAPI', 'Making grounded search request');
		Logger.debug('DirectAPI', 'Query:', query);
		Logger.debug('DirectAPI', 'System instruction provided:', !!systemInstruction);
		if (systemInstruction) {
			Logger.debug('DirectAPI', 'System instruction length:', systemInstruction.length, 'chars');
		}

		// Fetch user info and Code Assist config
		await this.fetchUserInfo();
		await this.loadCodeAssist();

		if (!this.projectId) {
			throw new Error('Failed to load Code Assist project ID');
		}

		const url = `${this.baseUrl}/${this.apiVersion}:streamGenerateContent?alt=sse`;
		
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
		};

		// No quota header needed for Code Assist API

		const requestBody: any = {
			contents: contents.map(c => ({
				role: c.role,
				parts: c.parts?.map(p => ({ text: p.text })) || []
			})),
			generationConfig: {
				temperature: 0.7,
				maxOutputTokens: 8192,
			},
			tools: [{ functionDeclarations: functionDeclarations }]
		};

		// Add system instruction if provided
		if (systemInstruction) {
			requestBody.systemInstruction = {
				role: 'user',
				parts: [{ text: systemInstruction }]
			};
			Logger.debug('DirectAPI', '✅ System instruction added to request (length:', systemInstruction.length, 'chars)');
		} else {
			Logger.debug('DirectAPI', '⚠️  No system instruction provided');
		}

		const body = {
			model: model,
			project: this.projectId,
			user_prompt_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}########0`,
			request: requestBody
		};

		Logger.debug('DirectAPI', 'Request body:', JSON.stringify(body, null, 2));
		Logger.debug('DirectAPI', 'System instruction in request:', !!body.request.systemInstruction);

		const urlObj = new URL(url);
		const requestBodyString = JSON.stringify(body);

		const options: https.RequestOptions = {
			hostname: urlObj.hostname,
			port: 443,
			path: urlObj.pathname,
			method: 'POST',
			headers: {
				...headers,
				'Content-Length': Buffer.byteLength(requestBodyString),
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

				req.write(requestBodyString);
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
			Logger.debug('DirectAPI', 'Raw response data:', responseData);
			Logger.debug('DirectAPI', 'Response data length:', responseData.length);
			
			// Try to parse as JSON first (in case it's not SSE)
			let parsedResponse = null;
			try {
				const jsonResponse = JSON.parse(responseData);
				
				// Handle array response format (SSE streaming - multiple responses)
				if (Array.isArray(jsonResponse) && jsonResponse.length > 0 && jsonResponse[0].response) {
					// Accumulate text from all responses in the array (SSE format)
					let combinedText = '';
					let finalResponse: any = null;
					const functionCalls: any[] = [];
					
					for (const item of jsonResponse) {
						if (item.response && item.response.candidates && item.response.candidates.length > 0) {
							const candidate = item.response.candidates[0];
							if (candidate.content && candidate.content.parts) {
								for (const part of candidate.content.parts) {
									if (part.text) {
										combinedText += part.text;
									}
									if (part.functionCall) {
										// Collect function calls from all chunks (typically only in final response)
										functionCalls.push(part.functionCall);
									}
								}
							}
							// Keep the last response for metadata (usage, finishReason, etc.)
							finalResponse = item.response;
						}
					}
					
					// Replace the text in the final response with the combined text, preserving function calls
					if (finalResponse && finalResponse.candidates && finalResponse.candidates.length > 0) {
						if (!finalResponse.candidates[0].content) {
							finalResponse.candidates[0].content = { role: 'model', parts: [] };
						}
						if (!finalResponse.candidates[0].content.parts) {
							finalResponse.candidates[0].content.parts = [];
						}
						// Build parts array with combined text (if any) and function calls
						const combinedParts: any[] = [];
						if (combinedText) {
							combinedParts.push({ text: combinedText });
						}
						// Add function calls (remove duplicates by name)
						const seenFunctionNames = new Set<string>();
						for (const funcCall of functionCalls) {
							if (!seenFunctionNames.has(funcCall.name)) {
								combinedParts.push({ functionCall: funcCall });
								seenFunctionNames.add(funcCall.name);
							}
						}
						finalResponse.candidates[0].content.parts = combinedParts;
					}
					
					parsedResponse = finalResponse;
					Logger.debug('DirectAPI', `✅ Parsed as array JSON response (${jsonResponse.length} chunks, ${combinedText.length} chars, ${functionCalls.length} function calls)`);
				}
				// Handle direct response format
				else if (jsonResponse.response) {
					parsedResponse = jsonResponse.response;
					Logger.debug('DirectAPI', '✅ Parsed as JSON response');
				} 
				// Handle direct candidates format
				else if (jsonResponse.candidates) {
					parsedResponse = jsonResponse;
					Logger.debug('DirectAPI', '✅ Parsed as direct JSON response with candidates');
				}
			} catch (e) {
				Logger.debug('DirectAPI', 'Not JSON, trying SSE parsing...');
			}
			
			// If not JSON, try SSE parsing
			if (!parsedResponse) {
				const lines = responseData.split('\n');
				Logger.debug('DirectAPI', 'SSE lines count:', lines.length);
				
				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.substring(6);
						if (data.trim() === '') continue;
						
						try {
							const parsed = JSON.parse(data);
							if (parsed.response) {
								parsedResponse = parsed.response;
								Logger.debug('DirectAPI', '✅ Parsed SSE response');
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
				Logger.error('DirectAPI', 'Failed to parse response. Raw data:', responseData);
				throw new Error('No valid response found in SSE stream');
			}
			
			Logger.debug('DirectAPI', '✅ Search complete');
			
			return parsedResponse;

		} catch (error: any) {
			Logger.error('DirectAPI', 'Search failed:', error);
			throw error;
		}
	}
}

