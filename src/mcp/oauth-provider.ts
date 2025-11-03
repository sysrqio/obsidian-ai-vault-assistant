import { MCPOAuthConfig } from '../types/mcp-types';
import { MCPOAuthTokenStorage } from './oauth-token-storage';
import { buildWellKnownUrl, fetchOAuthMetadata, parseWwwAuthenticateHeader } from './oauth-utils';

export class MCPOAuthProvider {
  private tokenStorage: MCPOAuthTokenStorage;
  private config: MCPOAuthConfig;
  private metadata: any = null;
  private clientId: string | null = null;
  private clientSecret: string | null = null;

  constructor(config: MCPOAuthConfig) {
    this.config = config;
    this.tokenStorage = new MCPOAuthTokenStorage();
  }

  async initialize(): Promise<void> {
    try {
      // Fetch OAuth metadata
      this.metadata = await fetchOAuthMetadata(this.config.serverUrl);
      
      // Perform dynamic client registration if needed
      if (this.config.dynamicClientRegistration) {
        await this.performDynamicClientRegistration();
      } else if (this.config.clientId && this.config.clientSecret) {
        this.clientId = this.config.clientId;
        this.clientSecret = this.config.clientSecret;
      } else {
        throw new Error('Either dynamic client registration or static client credentials must be configured');
      }
    } catch (error) {
      console.error('Failed to initialize OAuth provider:', error);
      throw error;
    }
  }

  private async performDynamicClientRegistration(): Promise<void> {
    if (!this.metadata) {
      throw new Error('OAuth metadata not available');
    }

    const registrationEndpoint = this.metadata.registration_endpoint;
    if (!registrationEndpoint) {
      throw new Error('Dynamic client registration not supported by this server');
    }

    const registrationRequest = {
      client_name: 'Obsidian AI Vault Assistant',
      redirect_uris: [this.config.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
    };

    try {
      const response = await fetch(registrationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationRequest),
      });

      if (!response.ok) {
        throw new Error(`Client registration failed: ${response.status} ${response.statusText}`);
      }

      const clientInfo = await response.json();
      this.clientId = clientInfo.client_id;
      this.clientSecret = clientInfo.client_secret;

      // Store client credentials
      if (this.clientId && this.clientSecret) {
        await this.tokenStorage.storeClientCredentials(this.config.serverUrl, {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
        });
      }
    } catch (error) {
      console.error('Dynamic client registration failed:', error);
      throw error;
    }
  }

  async getAccessToken(): Promise<string | null> {
    try {
      // Check if we have a valid access token
      const token = await this.tokenStorage.getAccessToken(this.config.serverUrl);
      if (token && !this.isTokenExpired(token)) {
        return token.accessToken;
      }

      // Try to refresh the token
      const refreshToken = await this.tokenStorage.getRefreshToken(this.config.serverUrl);
      if (refreshToken) {
        try {
          const newToken = await this.refreshAccessToken(refreshToken);
          return newToken.accessToken;
        } catch (error) {
          console.error('Token refresh failed:', error);
        }
      }

      // No valid token available
      return null;
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  private isTokenExpired(token: any): boolean {
    if (!token.expiresAt) {
      return true;
    }
    return Date.now() >= token.expiresAt;
  }

  private async refreshAccessToken(refreshToken: string): Promise<any> {
    if (!this.metadata || !this.clientId || !this.clientSecret) {
      throw new Error('OAuth provider not properly initialized');
    }

    const tokenEndpoint = this.metadata.token_endpoint;
    if (!tokenEndpoint) {
      throw new Error('Token endpoint not available');
    }

    const tokenRequest = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequest.toString(),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    const tokenData = await response.json();
    
    // Store the new token
    await this.tokenStorage.storeAccessToken(this.config.serverUrl, {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
    });

    // Store refresh token if provided
    if (tokenData.refresh_token) {
      await this.tokenStorage.storeRefreshToken(this.config.serverUrl, tokenData.refresh_token);
    }

    return {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
    };
  }

  async startAuthorizationFlow(): Promise<string> {
    if (!this.metadata || !this.clientId) {
      throw new Error('OAuth provider not properly initialized');
    }

    const authEndpoint = this.metadata.authorization_endpoint;
    if (!authEndpoint) {
      throw new Error('Authorization endpoint not available');
    }

    // Generate state parameter for security
    const state = this.generateState();
    
    const authUrl = new URL(authEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('scope', this.config.scope);
    authUrl.searchParams.set('state', state);

    // Store state for validation
    await this.tokenStorage.storeState(this.config.serverUrl, state);

    return authUrl.toString();
  }

  async handleAuthorizationCallback(code: string, state: string): Promise<void> {
    // Validate state parameter
    const storedState = await this.tokenStorage.getState(this.config.serverUrl);
    if (storedState !== state) {
      throw new Error('Invalid state parameter');
    }

    // Exchange authorization code for tokens
    const tokens = await this.exchangeCodeForTokens(code);
    
    // Store tokens
    await this.tokenStorage.storeAccessToken(this.config.serverUrl, {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    });

    if (tokens.refreshToken) {
      await this.tokenStorage.storeRefreshToken(this.config.serverUrl, tokens.refreshToken);
    }

    // Clear state
    await this.tokenStorage.clearState(this.config.serverUrl);
  }

  private async exchangeCodeForTokens(code: string): Promise<any> {
    if (!this.metadata || !this.clientId || !this.clientSecret) {
      throw new Error('OAuth provider not properly initialized');
    }

    const tokenEndpoint = this.metadata.token_endpoint;
    if (!tokenEndpoint) {
      throw new Error('Token endpoint not available');
    }

    const tokenRequest = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.config.redirectUri || '',
      client_id: this.clientId || '',
      client_secret: this.clientSecret || '',
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequest.toString(),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }

    const tokenData = await response.json();
    
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
    };
  }

  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async clearTokens(): Promise<void> {
    await this.tokenStorage.clearTokens(this.config.serverUrl);
  }
}