import { Notice } from 'obsidian';
import { OAuth2Client } from 'google-auth-library';
import * as http from 'http';
import { URL } from 'url';

/**
 * OAuth handler for Gemini API authentication (Desktop App Flow)
 * Implements Authorization Code Flow with PKCE for consumer Gemini API access
 */
export class OAuthHandler {
	private static readonly SCOPES = [
		'https://www.googleapis.com/auth/cloud-platform',
		'https://www.googleapis.com/auth/userinfo.email'
	];
	private static readonly REDIRECT_PORTS = [53847, 53848, 53849, 53850, 53851];
	private actualPort: number = 53847;
	
	private oauth2Client: OAuth2Client | null = null;
	private clientId: string = '';
	private clientSecret: string = '';
	
	/**
	 * Initialize OAuth handler with credentials from client_secret.json
	 */
	async initialize(clientSecretPath: string): Promise<void> {
		try {
			const fs = require('fs');
			const clientSecretContent = fs.readFileSync(clientSecretPath, 'utf8');
			const clientSecret = JSON.parse(clientSecretContent);
			
			if (clientSecret.installed) {
				this.clientId = clientSecret.installed.client_id;
				this.clientSecret = clientSecret.installed.client_secret;
			} else {
				throw new Error('Invalid client_secret.json format. Expected "installed" application type.');
			}
			
			// OAuth2Client will be created with dynamic redirect URI when starting flow
			this.oauth2Client = null;
			
			console.log('[OAuth] Initialized with Client ID:', this.clientId.substring(0, 20) + '...');
		} catch (error) {
			console.error('[OAuth] Failed to initialize:', error);
			throw new Error('Failed to load OAuth credentials: ' + (error as Error).message);
		}
	}
	
	/**
	 * Start OAuth flow using local HTTP server
	 */
	async startOAuthFlow(): Promise<{
		access_token: string;
		refresh_token: string;
		expires_in: number;
	}> {
		if (!this.clientId || !this.clientSecret) {
			throw new Error('OAuth client not initialized. Call initialize() first.');
		}
		
		console.log('[OAuth] Starting OAuth flow...');
		
		// Start local server and get the actual port it's running on
		const { server, port } = await this.startLocalServer();
		this.actualPort = port;
		
		// Create OAuth2Client with the actual redirect URI
		const redirectUri = `http://127.0.0.1:${port}/callback`;
		this.oauth2Client = new OAuth2Client(
			this.clientId,
			this.clientSecret,
			redirectUri
		);
		
		// Generate authorization URL
		const authUrl = this.oauth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: OAuthHandler.SCOPES,
			prompt: 'consent' // Force consent to ensure refresh token
		});
		
		console.log('[OAuth] Authorization URL generated');
		console.log('[OAuth] Redirect URI:', redirectUri);
		
		// Open browser
		this.openBrowser(authUrl);
		
		// Wait for callback
		const code = await this.waitForAuthorizationCode();
		
		// Close server
		server.close();
		
		console.log('[OAuth] Authorization code received, exchanging for tokens...');
		
		// Exchange code for tokens
		const { tokens } = await this.oauth2Client.getToken(code);
		
		if (!tokens.access_token || !tokens.refresh_token) {
			throw new Error('Failed to obtain tokens from OAuth flow');
		}
		
		console.log('[OAuth] Tokens received successfully');
		
		return {
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token,
			expires_in: tokens.expiry_date 
				? Math.floor((tokens.expiry_date - Date.now()) / 1000)
				: 3600
		};
	}
	
	private authCode: string | null = null;
	
	/**
	 * Start local HTTP server to handle OAuth callback
	 */
	private async startLocalServer(): Promise<{ server: http.Server; port: number }> {
		return new Promise((resolve, reject) => {
			const server = http.createServer((req, res) => {
				if (!req.url) {
					return;
				}
				
				const url = new URL(req.url, `http://127.0.0.1:${this.actualPort}`);
				
				if (url.pathname === '/callback') {
					const code = url.searchParams.get('code');
					const error = url.searchParams.get('error');
					
					if (error) {
						res.writeHead(400, { 'Content-Type': 'text/html' });
						res.end(this.getErrorHtml(error));
						this.authCode = null;
						return;
					}
					
					if (!code) {
						res.writeHead(400, { 'Content-Type': 'text/html' });
						res.end(this.getErrorHtml('No authorization code received'));
						this.authCode = null;
						return;
					}
					
					// Success!
					this.authCode = code;
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.end(this.getSuccessHtml());
					console.log('[OAuth] Authorization code captured');
				}
			});
			
			// Try different ports if primary is busy
			let currentPortIndex = 0;
			
			const tryListen = () => {
				const port = OAuthHandler.REDIRECT_PORTS[currentPortIndex];
				this.actualPort = port;
				
				server.listen(port, '127.0.0.1', () => {
					console.log(`[OAuth] Local server listening on http://127.0.0.1:${port}`);
					resolve({ server, port });
				});
				
				server.on('error', (err: any) => {
					if (err.code === 'EADDRINUSE' && currentPortIndex < OAuthHandler.REDIRECT_PORTS.length - 1) {
						console.log(`[OAuth] Port ${port} is busy, trying next port...`);
						currentPortIndex++;
						server.close();
						setTimeout(tryListen, 100);
					} else {
						console.error('[OAuth] Server error:', err);
						reject(err);
					}
				});
			};
			
			tryListen();
		});
	}
	
	/**
	 * Wait for authorization code from callback
	 */
	private async waitForAuthorizationCode(): Promise<string> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				clearInterval(checkInterval);
				reject(new Error('OAuth timeout - no authorization code received within 5 minutes'));
			}, 5 * 60 * 1000);
			
			const checkInterval = setInterval(() => {
				if (this.authCode) {
					clearInterval(checkInterval);
					clearTimeout(timeout);
					resolve(this.authCode);
					this.authCode = null; // Reset for next use
				}
			}, 500);
		});
	}
	
	/**
	 * Open browser to authorization URL
	 */
	private openBrowser(authUrl: string): void {
		console.log('[OAuth] Opening browser for authentication...');
		new Notice('Opening browser for Google authentication...');
		
		// Use Electron's shell to open URL
		if (typeof window !== 'undefined' && (window as any).require) {
			const { shell } = (window as any).require('electron');
			shell.openExternal(authUrl);
		} else {
			// Fallback for non-Electron environments
			window.open(authUrl, '_blank');
		}
	}
	
	/**
	 * Get success HTML response
	 */
	private getSuccessHtml(): string {
		return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>OAuth Success - AI Vault Assistant</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}
		.container {
			background: white;
			border-radius: 20px;
			padding: 40px;
			box-shadow: 0 20px 40px rgba(0,0,0,0.1);
			text-align: center;
			max-width: 500px;
			width: 100%;
		}
		.success-icon {
			font-size: 80px;
			margin-bottom: 20px;
			animation: bounce 2s infinite;
		}
		@keyframes bounce {
			0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
			40% { transform: translateY(-10px); }
			60% { transform: translateY(-5px); }
		}
		h1 {
			color: #2c3e50;
			font-size: 28px;
			margin-bottom: 15px;
			font-weight: 600;
		}
		p {
			color: #7f8c8d;
			font-size: 16px;
			line-height: 1.6;
			margin-bottom: 10px;
		}
		.highlight { color: #27ae60; font-weight: 600; }
		.footer {
			margin-top: 30px;
			padding-top: 20px;
			border-top: 1px solid #ecf0f1;
			color: #95a5a6;
			font-size: 14px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="success-icon">🎉</div>
		<h1>Authentication Successful!</h1>
		<p>Your Google account has been <span class="highlight">successfully connected</span> to AI Vault Assistant.</p>
		<p>You can now close this window and return to Obsidian.</p>
		<p>The authorization code has been captured automatically.</p>
		<div class="footer">
			<p>AI Vault Assistant for Obsidian</p>
		</div>
	</div>
</body>
</html>
		`;
	}
	
	/**
	 * Get error HTML response
	 */
	private getErrorHtml(error: string): string {
		return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>OAuth Error - AI Vault Assistant</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}
		.container {
			background: white;
			border-radius: 20px;
			padding: 40px;
			box-shadow: 0 20px 40px rgba(0,0,0,0.1);
			text-align: center;
			max-width: 500px;
			width: 100%;
		}
		.error-icon { font-size: 80px; margin-bottom: 20px; }
		h1 {
			color: #2c3e50;
			font-size: 28px;
			margin-bottom: 15px;
			font-weight: 600;
		}
		p {
			color: #7f8c8d;
			font-size: 16px;
			line-height: 1.6;
			margin-bottom: 10px;
		}
		.highlight { color: #e74c3c; font-weight: 600; }
		.footer {
			margin-top: 30px;
			padding-top: 20px;
			border-top: 1px solid #ecf0f1;
			color: #95a5a6;
			font-size: 14px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="error-icon">❌</div>
		<h1>Authentication Error</h1>
		<p><span class="highlight">Error:</span> ${error}</p>
		<p>Please try the authentication process again.</p>
		<div class="footer">
			<p>AI Vault Assistant for Obsidian</p>
		</div>
	</div>
</body>
</html>
		`;
	}
	
	/**
	 * Refresh OAuth token
	 */
	async refreshToken(refreshToken: string): Promise<{
		access_token: string;
		refresh_token?: string;
		expires_in: number;
	}> {
		if (!this.clientId || !this.clientSecret) {
			throw new Error('OAuth client not initialized. Call initialize() first.');
		}
		
		console.log('[OAuth] Refreshing access token...');
		
		// Create temporary OAuth2Client for token refresh
		const redirectUri = `http://127.0.0.1:${OAuthHandler.REDIRECT_PORTS[0]}/callback`;
		const client = new OAuth2Client(
			this.clientId,
			this.clientSecret,
			redirectUri
		);
		
		client.setCredentials({
			refresh_token: refreshToken
		});
		
		const { credentials } = await client.refreshAccessToken();
		
		if (!credentials.access_token) {
			throw new Error('Failed to refresh access token');
		}
		
		console.log('[OAuth] Access token refreshed successfully');
		
		return {
			access_token: credentials.access_token,
			refresh_token: credentials.refresh_token || undefined,
			expires_in: credentials.expiry_date 
				? Math.floor((credentials.expiry_date - Date.now()) / 1000)
				: 3600
		};
	}
	
	/**
	 * Get OAuth2Client configured with refresh token for use with Gemini API
	 */
	getAuthenticatedClient(refreshToken: string): OAuth2Client {
		if (!this.clientId || !this.clientSecret) {
			throw new Error('OAuth client not initialized. Call initialize() first.');
		}
		
		// Use first port as default redirect URI (doesn't matter for token refresh)
		const redirectUri = `http://127.0.0.1:${OAuthHandler.REDIRECT_PORTS[0]}/callback`;
		
		const client = new OAuth2Client(
			this.clientId,
			this.clientSecret,
			redirectUri
		);
		
		client.setCredentials({
			refresh_token: refreshToken
		});
		
		return client;
	}
	
	/**
	 * Check if token is expired
	 */
	static isTokenExpired(expiresAt: number): boolean {
		const now = Date.now() / 1000;
		const buffer = 60; // 60 second buffer
		return now >= (expiresAt - buffer);
	}
}
