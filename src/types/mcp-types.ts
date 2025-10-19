/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from '@google/genai';

export const MCP_DEFAULT_TIMEOUT_MSEC = 10 * 60 * 1000; // default to 10 minutes

/**
 * Enum representing the connection status of an MCP server
 */
export enum MCPServerStatus {
  /** Server is disconnected or experiencing errors */
  DISCONNECTED = 'disconnected',
  /** Server is actively disconnecting */
  DISCONNECTING = 'disconnecting',
  /** Server is in the process of connecting */
  CONNECTING = 'connecting',
  /** Server is connected and ready to use */
  CONNECTED = 'connected',
}

/**
 * Enum representing the overall MCP discovery state
 */
export enum MCPDiscoveryState {
  /** Discovery has not started yet */
  NOT_STARTED = 'not_started',
  /** Discovery is currently in progress */
  IN_PROGRESS = 'in_progress',
  /** Discovery has completed (with or without errors) */
  COMPLETED = 'completed',
}

/**
 * OAuth configuration for MCP servers
 */
export interface MCPOAuthConfig {
  serverUrl: string;
  redirectUri: string;
  scope: string;
  dynamicClientRegistration: boolean;
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  tokenParamName?: string;
  audiences?: string[];
}

/**
 * Authentication provider types for MCP servers
 */
export enum AuthProviderType {
  DYNAMIC_DISCOVERY = 'dynamic_discovery',
  GOOGLE_CREDENTIALS = 'google_credentials',
  SERVICE_ACCOUNT_IMPERSONATION = 'service_account_impersonation',
}

/**
 * Configuration for an MCP server
 */
export class MCPServerConfig {
  constructor(
    // For stdio transport
    readonly command?: string,
    readonly args?: string[],
    readonly env?: Record<string, string>,
    readonly cwd?: string,
    // For sse transport
    readonly url?: string,
    // For streamable http transport
    readonly httpUrl?: string,
    readonly headers?: Record<string, string>,
    // For websocket transport
    readonly tcp?: string,
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
    readonly includeTools?: string[],
    readonly excludeTools?: string[],
    readonly extensionName?: string,
    // OAuth configuration
    readonly oauth?: MCPOAuthConfig,
    readonly authProviderType?: AuthProviderType,
    // Service Account Configuration
    /* targetAudience format: CLIENT_ID.apps.googleusercontent.com */
    readonly targetAudience?: string,
    /* targetServiceAccount format: <service-account-name>@<project-num>.iam.gserviceaccount.com */
    readonly targetServiceAccount?: string,
  ) {}
}

/**
 * MCP tool confirmation details
 */
export interface ToolMcpConfirmationDetails {
  type: 'mcp';
  title: string;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

/**
 * Tool confirmation outcomes
 */
export enum ToolConfirmationOutcome {
  Proceed = 'proceed',
  ProceedAlwaysTool = 'proceed_always_tool',
  ProceedAlwaysServer = 'proceed_always_server',
  Cancel = 'cancel',
}

/**
 * MCP content block types
 */
export type McpTextBlock = {
  type: 'text';
  text: string;
};

export type McpMediaBlock = {
  type: 'image' | 'audio';
  mimeType: string;
  data: string;
};

export type McpResourceBlock = {
  type: 'resource';
  resource: {
    text?: string;
    blob?: string;
    mimeType?: string;
  };
};

export type McpResourceLinkBlock = {
  type: 'resource_link';
  uri: string;
  title?: string;
  name?: string;
};

export type McpContentBlock =
  | McpTextBlock
  | McpMediaBlock
  | McpResourceBlock
  | McpResourceLinkBlock;

/**
 * Tool registry interface for MCP integration
 */
export interface ToolRegistry {
  registerTool(tool: any): void;
  getTool(name: string): any;
  getAllTools(): any[];
}

/**
 * Prompt registry interface for MCP integration
 */
export interface PromptRegistry {
  registerPrompt(prompt: any): void;
  getPrompt(name: string): any;
  getAllPrompts(): any[];
}

/**
 * Workspace context interface for MCP integration
 */
export interface WorkspaceContext {
  getDirectories(): string[];
  onDirectoriesChanged(callback: () => Promise<void>): () => void;
}

/**
 * Event listener for MCP server status changes
 */
export type StatusChangeListener = (
  serverName: string,
  status: MCPServerStatus,
) => void;
