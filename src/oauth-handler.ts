import { Notice, request } from 'obsidian';

/**
 * OAuth handler for Gemini API authentication
 * Uses proxy server to hide client secret
 */
export class OAuthHandler {
	private static readonly CLIENT_ID = ''; // OAuth disabled for public release
	private static readonly SCOPES = [
		'https://www.googleapis.com/auth/generative-language.retriever',
		'https://www.googleapis.com/auth/userinfo.email'
	];
	
	/**
	 * Start OAuth flow using proxy server
	 */
	static async startOAuthFlow(proxyUrl: string): Promise<{
		access_token: string;
		refresh_token: string;
		expires_in: number;
	}> {
		const state = this.generateState();
		const scopes = this.SCOPES.join(' ');
		
		// Build OAuth URL
		const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		authUrl.searchParams.set('client_id', this.CLIENT_ID);
		authUrl.searchParams.set('redirect_uri', `${proxyUrl}/callback`);
		authUrl.searchParams.set('response_type', 'code');
		authUrl.searchParams.set('scope', scopes);
		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('access_type', 'offline');
		authUrl.searchParams.set('prompt', 'consent');
		
		// Open OAuth URL
		window.open(authUrl.toString(), '_blank');
		
		new Notice('OAuth window opened. Please authenticate...');
		
		// Wait for callback
		return await this.waitForCallback(proxyUrl, state);
	}
	
	/**
	 * Wait for OAuth callback from proxy
	 */
	private static async waitForCallback(proxyUrl: string, state: string): Promise<{
		access_token: string;
		refresh_token: string;
		expires_in: number;
	}> {
		const maxAttempts = 60; // 1 minute timeout
		const pollInterval = 1000; // 1 second
		
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				const response = await request({
					url: `${proxyUrl}/token/${state}`,
					method: 'GET',
				});
				
				const data = JSON.parse(response);
				
				if (data.access_token) {
					return {
						access_token: data.access_token,
						refresh_token: data.refresh_token,
						expires_in: data.expires_in || 3600
					};
				}
			} catch (error) {
				// Token not ready yet, continue polling
			}
			
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}
		
		throw new Error('OAuth timeout - authentication not completed');
	}
	
	/**
	 * Refresh OAuth token
	 */
	static async refreshToken(refreshToken: string, proxyUrl: string): Promise<{
		access_token: string;
		refresh_token?: string;
		expires_in: number;
	}> {
		const response = await request({
			url: `${proxyUrl}/refresh`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ refresh_token: refreshToken }),
		});
		
		return JSON.parse(response);
	}
	
	/**
	 * Check if token is expired
	 */
	static isTokenExpired(expiresAt: number): boolean {
		const now = Date.now() / 1000;
		const buffer = 60; // 60 second buffer
		return now >= (expiresAt - buffer);
	}
	
	/**
	 * Generate random state for OAuth
	 */
	private static generateState(): string {
		return Math.random().toString(36).substring(2, 15) + 
		       Math.random().toString(36).substring(2, 15);
	}
}

