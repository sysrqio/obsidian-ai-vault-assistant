/**
 * Direct Gemini API client for OAuth authentication
 * Makes raw HTTPS requests to avoid SDK limitations
 */

import * as https from 'https';
import type { Content } from '@google/genai';
import { Logger } from './utils/logger';

export class DirectGeminiAPIClient {
	private accessToken: string;
	private quotaUser: string | null = null;
	private baseUrl = 'https://generativelanguage.googleapis.com';
	private apiVersion = 'v1beta';

	constructor(accessToken: string) {
		this.accessToken = accessToken;
	}

	/**
	 * Fetch user info for quota delegation
	 */
	async fetchUserInfo(): Promise<void> {
		if (this.quotaUser) return; // Already fetched

		try {
			const url = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
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

			this.quotaUser = response.id;
			Logger.debug('DirectAPI', '✅ User ID fetched for quota delegation:', this.quotaUser);
		} catch (error) {
			Logger.error('DirectAPI', 'Failed to fetch user info:', error);
			// Continue without quota delegation
		}
	}

	/**
	 * Generate content stream with OAuth
	 */
	async *generateContentStream(
		model: string,
		contents: Content[],
		systemInstruction: string,
		tools: any[],
		config: { temperature: number; maxOutputTokens: number }
	): AsyncGenerator<any> {
		Logger.debug('DirectAPI', 'Making direct call to generativelanguage.googleapis.com');
		Logger.debug('DirectAPI', 'Model:', model);
		Logger.debug('DirectAPI', 'Using OAuth Bearer token with standard Gemini API');
		Logger.debug('DirectAPI', 'Mode: streamGenerateContent (returns JSON array)');

		await this.fetchUserInfo();

		const url = `${this.baseUrl}/${this.apiVersion}/models/${model}:streamGenerateContent`;
		
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
		};

		if (this.quotaUser) {
			headers['X-Goog-Quota-User'] = this.quotaUser;
			Logger.debug('DirectAPI', '💳 Using X-Goog-Quota-User for billing delegation:', this.quotaUser);
		}

		const body: any = {
			contents: serializedContents,
			generationConfig: {
				temperature: config.temperature,
				maxOutputTokens: config.maxOutputTokens,
			},
			system_instruction: {
				parts: [{ text: systemInstruction }]
			}
		};

		if (tools && tools.length > 0) {
			body.tools = tools;
		}

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

				// Try to parse complete JSON objects from buffer
				const lines = buffer.split('\n');
				buffer = lines.pop() || ''; // Keep incomplete line in buffer

				for (const line of lines) {
					if (line.trim().startsWith('[')) {
						// Start of JSON array
						buffer = line + '\n' + buffer;
					} else if (line.trim() === '' || line.trim() === ',') {
						continue;
					} else if (line.trim()) {
						buffer = line + '\n' + buffer;
					}
				}
			}

			// Parse final buffer
			if (buffer.trim()) {
				Logger.debug('DirectAPI', '✅ Stream ended - response complete!');
				Logger.debug('DirectAPI', 'Total response size:', totalBytes, 'bytes');
				Logger.debug('DirectAPI', 'Raw response preview:', buffer.substring(0, 500));
				Logger.debug('DirectAPI', 'Parsing JSON array ...');

				// Remove array brackets and parse
				let jsonArray = buffer.trim();
				if (jsonArray.startsWith('[') && jsonArray.endsWith(']')) {
					jsonArray = jsonArray.slice(1, -1);
				}

				// Parse as single object (streaming returns array with one object)
				const response = JSON.parse(jsonArray);

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

				yield response;
			}

			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('DirectAPI', '✅ RESPONSE COMPLETE');
			Logger.debug('DirectAPI', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

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

		await this.fetchUserInfo();

		const url = `${this.baseUrl}/${this.apiVersion}/models/${model}:generateContent`;
		
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
		};

		if (this.quotaUser) {
			headers['X-Goog-Quota-User'] = this.quotaUser;
			Logger.debug('DirectAPI', '💳 Using quota delegation for search');
		}

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

