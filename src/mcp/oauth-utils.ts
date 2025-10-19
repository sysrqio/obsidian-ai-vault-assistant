/**
 * Build the well-known OAuth configuration URL
 */
export function buildWellKnownUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  return `${url.protocol}//${url.host}/.well-known/oauth-authorization-server`;
}

/**
 * Fetch OAuth metadata from the well-known endpoint
 */
export async function fetchOAuthMetadata(serverUrl: string): Promise<any> {
  const wellKnownUrl = buildWellKnownUrl(serverUrl);
  
  try {
    const response = await fetch(wellKnownUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch OAuth metadata: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch OAuth metadata:', error);
    throw error;
  }
}

/**
 * Parse WWW-Authenticate header for OAuth error information
 */
export function parseWwwAuthenticateHeader(header: string): any {
  const result: any = {};
  
  // Remove "Bearer " prefix if present
  const cleanHeader = header.replace(/^Bearer\s+/, '');
  
  // Parse key-value pairs
  const pairs = cleanHeader.split(',');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      // Remove quotes from value
      const cleanValue = value.replace(/^"(.*)"$/, '$1');
      result[key.trim()] = cleanValue;
    }
  }
  
  return result;
}

/**
 * Check if a URL is a valid OAuth redirect URI
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    
    // Must be HTTP or HTTPS
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    
    // Must not have fragment
    if (url.hash) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a secure random string for OAuth state parameter
 */
export function generateSecureRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate OAuth state parameter
 */
export function validateState(providedState: string, expectedState: string): boolean {
  if (!providedState || !expectedState) {
    return false;
  }
  
  // Use constant-time comparison to prevent timing attacks
  if (providedState.length !== expectedState.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < providedState.length; i++) {
    result |= providedState.charCodeAt(i) ^ expectedState.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Extract OAuth error from response
 */
export function extractOAuthError(response: Response, responseBody?: any): string {
  // Check for OAuth error in response body
  if (responseBody && responseBody.error) {
    let error = responseBody.error;
    if (responseBody.error_description) {
      error += `: ${responseBody.error_description}`;
    }
    return error;
  }
  
  // Check for OAuth error in WWW-Authenticate header
  const wwwAuth = response.headers.get('WWW-Authenticate');
  if (wwwAuth) {
    const authInfo = parseWwwAuthenticateHeader(wwwAuth);
    if (authInfo.error) {
      let error = authInfo.error;
      if (authInfo.error_description) {
        error += `: ${authInfo.error_description}`;
      }
      return error;
    }
  }
  
  // Fallback to generic error
  return `OAuth error: ${response.status} ${response.statusText}`;
}