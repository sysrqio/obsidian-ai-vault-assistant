import { Vault } from 'obsidian';

export interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

export class MCPOAuthTokenStorage {
  private vault: Vault;

  constructor(vault?: Vault) {
    // We'll need to get the vault instance from the plugin
    // For now, we'll store this as a class property that can be set later
    this.vault = vault as any;
  }

  setVault(vault: Vault): void {
    this.vault = vault;
  }

  private getTokenPath(serverUrl: string, type: string): string {
    const serverHash = this.hashString(serverUrl);
    return `.obsidian/plugins/gemini-assistant/oauth-tokens/${serverHash}-${type}.json`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async storeAccessToken(serverUrl: string, token: StoredToken): Promise<void> {
    try {
      const path = this.getTokenPath(serverUrl, 'access');
      const content = JSON.stringify(token, null, 2);
      
      // Create directory if it doesn't exist
      const dirPath = '.obsidian/plugins/gemini-assistant/oauth-tokens';
      if (!(await this.vault.adapter.exists(dirPath))) {
        await this.vault.adapter.mkdir(dirPath);
      }
      
      await this.vault.adapter.write(path, content);
    } catch (error) {
      console.error('Failed to store access token:', error);
      throw error;
    }
  }

  async getAccessToken(serverUrl: string): Promise<StoredToken | null> {
    try {
      const path = this.getTokenPath(serverUrl, 'access');
      
      if (!(await this.vault.adapter.exists(path))) {
        return null;
      }
      
      const content = await this.vault.adapter.read(path);
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  async storeRefreshToken(serverUrl: string, refreshToken: string): Promise<void> {
    try {
      const path = this.getTokenPath(serverUrl, 'refresh');
      const content = JSON.stringify({ refreshToken }, null, 2);
      
      // Create directory if it doesn't exist
      const dirPath = '.obsidian/plugins/gemini-assistant/oauth-tokens';
      if (!(await this.vault.adapter.exists(dirPath))) {
        await this.vault.adapter.mkdir(dirPath);
      }
      
      await this.vault.adapter.write(path, content);
    } catch (error) {
      console.error('Failed to store refresh token:', error);
      throw error;
    }
  }

  async getRefreshToken(serverUrl: string): Promise<string | null> {
    try {
      const path = this.getTokenPath(serverUrl, 'refresh');
      
      if (!(await this.vault.adapter.exists(path))) {
        return null;
      }
      
      const content = await this.vault.adapter.read(path);
      const data = JSON.parse(content);
      return data.refreshToken;
    } catch (error) {
      console.error('Failed to get refresh token:', error);
      return null;
    }
  }

  async storeClientCredentials(serverUrl: string, credentials: ClientCredentials): Promise<void> {
    try {
      const path = this.getTokenPath(serverUrl, 'client');
      const content = JSON.stringify(credentials, null, 2);
      
      // Create directory if it doesn't exist
      const dirPath = '.obsidian/plugins/gemini-assistant/oauth-tokens';
      if (!(await this.vault.adapter.exists(dirPath))) {
        await this.vault.adapter.mkdir(dirPath);
      }
      
      await this.vault.adapter.write(path, content);
    } catch (error) {
      console.error('Failed to store client credentials:', error);
      throw error;
    }
  }

  async getClientCredentials(serverUrl: string): Promise<ClientCredentials | null> {
    try {
      const path = this.getTokenPath(serverUrl, 'client');
      
      if (!(await this.vault.adapter.exists(path))) {
        return null;
      }
      
      const content = await this.vault.adapter.read(path);
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to get client credentials:', error);
      return null;
    }
  }

  async storeState(serverUrl: string, state: string): Promise<void> {
    try {
      const path = this.getTokenPath(serverUrl, 'state');
      const content = JSON.stringify({ state }, null, 2);
      
      // Create directory if it doesn't exist
      const dirPath = '.obsidian/plugins/gemini-assistant/oauth-tokens';
      if (!(await this.vault.adapter.exists(dirPath))) {
        await this.vault.adapter.mkdir(dirPath);
      }
      
      await this.vault.adapter.write(path, content);
    } catch (error) {
      console.error('Failed to store state:', error);
      throw error;
    }
  }

  async getState(serverUrl: string): Promise<string | null> {
    try {
      const path = this.getTokenPath(serverUrl, 'state');
      
      if (!(await this.vault.adapter.exists(path))) {
        return null;
      }
      
      const content = await this.vault.adapter.read(path);
      const data = JSON.parse(content);
      return data.state;
    } catch (error) {
      console.error('Failed to get state:', error);
      return null;
    }
  }

  async clearState(serverUrl: string): Promise<void> {
    try {
      const path = this.getTokenPath(serverUrl, 'state');
      
      if (await this.vault.adapter.exists(path)) {
        await this.vault.adapter.remove(path);
      }
    } catch (error) {
      console.error('Failed to clear state:', error);
    }
  }

  async clearTokens(serverUrl: string): Promise<void> {
    try {
      const types = ['access', 'refresh', 'client', 'state'];
      
      for (const type of types) {
        const path = this.getTokenPath(serverUrl, type);
        
        if (await this.vault.adapter.exists(path)) {
          await this.vault.adapter.remove(path);
        }
      }
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }
}