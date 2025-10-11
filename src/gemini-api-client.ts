/**
 * Direct Gemini API client for OAuth authentication
 * Makes raw HTTPS requests to avoid SDK limitations
 */

import * as https from 'https';
import type { Content } from '@google/genai';

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
			console.log('[DirectAPI] ✅ User ID fetched for quota delegation:', this.quotaUser);
		} catch (error) {
			console.error('[DirectAPI] Failed to fetch user info:', error);
			// Continue without quota delegation
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
		console.log('[DirectAPI] Making direct call to generativelanguage.googleapis.com');
		console.log('[DirectAPI] Model:', model);
		console.log('[DirectAPI] Using OAuth Bearer token with standard Gemini API');
		console.log('[DirectAPI] Mode: generateContent (non-streaming)');

		await this.fetchUserInfo();

		const url = `${this.baseUrl}/${this.apiVersion}/models/${model}:generateContent`;
		
		// CRITICAL: Manually serialize contents to ensure functionResponse is included
		const serializedContents = contents.map((content, cidx) => {
			console.log(`[DirectAPI] 🔍 Serializing content ${cidx}: role=${content.role}, parts=${content.parts?.length || 0}`);
			
			return {
				role: content.role,
				parts: content.parts?.map((part, pidx) => {
					const allKeys = Object.keys(part);
					const ownProps = Object.getOwnPropertyNames(part);
					console.log(`[DirectAPI] 🔍 Part ${pidx}: keys=${allKeys.join(',')}, ownProps=${ownProps.join(',')}`);
					console.log(`[DirectAPI] 🔍 Part ${pidx}: has text=${part.text !== undefined}, has functionCall=${!!part.functionCall}, has functionResponse=${!!part.functionResponse}`);
					
					if (part.text !== undefined) {
						console.log(`[DirectAPI] ✅ Serializing text part`);
						return { text: part.text };
					} else if (part.functionCall) {
						console.log(`[DirectAPI] ✅ Serializing functionCall part`);
						return { 
							functionCall: {
								name: part.functionCall.name,
								args: part.functionCall.args
							}
						};
					} else if (part.functionResponse) {
						console.log(`[DirectAPI] ✅ Serializing functionResponse part`);
						return {
							functionResponse: {
								name: part.functionResponse.name,
								response: part.functionResponse.response
							}
						};
					} else {
						console.log(`[DirectAPI] ⚠️  Unknown part type, using spread operator`);
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
			console.log('[DirectAPI] 💳 Using X-Goog-Quota-User for billing delegation:', this.quotaUser);
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

		console.log('[DirectAPI] ✅ Using correct REST API systemInstruction format (object)');
		console.log('[DirectAPI] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('[DirectAPI] 📤 API REQUEST:');
		console.log('[DirectAPI] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('[DirectAPI] URL:', url);
		console.log('[DirectAPI] Format: JSON array (formatted/pretty-printed)');
		console.log('[DirectAPI] System instruction included:', !!systemInstruction);
		console.log('[DirectAPI] Tools included:', !!tools && tools.length > 0);
		console.log('[DirectAPI] Contents count:', serializedContents.length);
		console.log('[DirectAPI] 🔍 Contents inspection:');
		serializedContents.forEach((c, i) => {
			console.log(`[DirectAPI]   Content ${i}: role=${c.role}, parts.length=${c.parts?.length || 0}`);
			c.parts?.forEach((p: any, j: number) => {
				if (p.text) console.log(`[DirectAPI]     Part ${j}: text (${p.text.substring(0, 50)}...)`);
				if (p.functionCall) console.log(`[DirectAPI]     Part ${j}: functionCall (name=${p.functionCall.name})`);
				if (p.functionResponse) console.log(`[DirectAPI]     Part ${j}: functionResponse (name=${p.functionResponse.name}, responseKeys=${Object.keys(p.functionResponse.response).join(',')})`);
			});
		});
		console.log('[DirectAPI] Request body:', JSON.stringify(body, null, 2));
		console.log('[DirectAPI] 🔍 DEBUGGING: Comparing with SDK format...');
		console.log('[DirectAPI] 🔍 SDK would send systemInstruction as string, we send as object');
		console.log('[DirectAPI] 🔍 SDK uses streaming, we collect full response');
		console.log('[DirectAPI] Request prepared, sending...');

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
					console.log('[DirectAPI] Response status:', res.statusCode);
					
					if (res.statusCode && res.statusCode >= 400) {
						let errorData = '';
						res.on('data', (chunk) => {
							errorData += chunk;
						});
						res.on('end', () => {
							console.error('[DirectAPI] API error:', errorData);
							reject(new Error(`API error: ${res.statusCode} - ${errorData}`));
						});
						return;
					}
					
					resolve(res);
				});

				req.on('error', (error) => {
					console.error('[DirectAPI] Request error:', error);
					reject(error);
				});

				req.write(requestBody);
				req.end();
			});

			console.log('[DirectAPI] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('[DirectAPI] 📥 RECEIVING RESPONSE:');
			console.log('[DirectAPI] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

			let buffer = '';
			let totalBytes = 0;

			for await (const chunk of httpResponse) {
				const chunkStr = chunk.toString();
				totalBytes += chunkStr.length;
				console.log('[DirectAPI] Received bytes:', chunkStr.length);
				buffer += chunkStr;
			}

			// Parse final buffer
			console.log('[DirectAPI] ✅ Response complete!');
			console.log('[DirectAPI] Total response size:', totalBytes, 'bytes');
			console.log('[DirectAPI] Raw response (first 500 chars):', buffer.substring(0, 500));
			console.log('[DirectAPI] Raw response (last 500 chars):', buffer.substring(Math.max(0, buffer.length - 500)));
			console.log('[DirectAPI] Parsing JSON...');

			// Parse the complete response
			const response = JSON.parse(buffer.trim());

			console.log('[DirectAPI] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('[DirectAPI] ✅ RESPONSE PARSED:');
			console.log('[DirectAPI] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('[DirectAPI] Candidates:', response.candidates?.length || 0);
			console.log('[DirectAPI] Parts:', response.candidates?.[0]?.content?.parts?.length || 0);
			response.candidates?.[0]?.content?.parts?.forEach((p: any, i: number) => {
				if (p.text) console.log(`[DirectAPI] Part ${i}: Text (${p.text.length} chars):`, p.text.substring(0, 100));
				if (p.functionCall) console.log(`[DirectAPI] Part ${i}: Function call:`, p.functionCall.name);
				if (p.functionResponse) console.log(`[DirectAPI] Part ${i}: Function response:`, p.functionResponse.name);
			});
			console.log('[DirectAPI] Usage:', response.usageMetadata);
			console.log('[DirectAPI] Full response:', JSON.stringify(response, null, 2));

			console.log('[DirectAPI] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log('[DirectAPI] ✅ RESPONSE COMPLETE');
			console.log('[DirectAPI] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			
			return response;

		} catch (error: any) {
			console.error('[DirectAPI] Stream error:', error);
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
		console.log('[DirectAPI] Making grounded search request');
		console.log('[DirectAPI] Query:', query);

		await this.fetchUserInfo();

		const url = `${this.baseUrl}/${this.apiVersion}/models/${model}:generateContent`;
		
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.accessToken}`,
		};

		if (this.quotaUser) {
			headers['X-Goog-Quota-User'] = this.quotaUser;
			console.log('[DirectAPI] 💳 Using quota delegation for search');
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

		console.log('[DirectAPI] Request body:', JSON.stringify(body, null, 2));

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
					console.log('[DirectAPI] Search response status:', res.statusCode);
					
					if (res.statusCode && res.statusCode >= 400) {
						let errorData = '';
						res.on('data', (chunk) => {
							errorData += chunk;
						});
						res.on('end', () => {
							console.error('[DirectAPI] Search API error:', errorData);
							reject(new Error(`API error: ${res.statusCode} - ${errorData}`));
						});
						return;
					}
					
					resolve(res);
				});

				req.on('error', (error) => {
					console.error('[DirectAPI] Search request error:', error);
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
			console.log('[DirectAPI] ✅ Search complete');
			
			return parsedResponse;

		} catch (error: any) {
			console.error('[DirectAPI] Search failed:', error);
			throw error;
		}
	}
}

