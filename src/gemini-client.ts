import { Notice } from 'obsidian';
import type { GeminiSettings } from './settings';
import type { VaultAdapter } from './utils/vault-adapter';
import { 
	GoogleGenAI, 
	Content, 
	Part, 
	GenerateContentParameters,
	GenerateContentResponse,
	Tool,
	FunctionDeclaration,
	Type
} from '@google/genai';
import { getEffectiveModel, getFallbackModel } from './utils/model-selection';
import { OAuthHandler } from './oauth-handler';
import { DirectGeminiAPIClient } from './gemini-api-client';
import { MemoryManager } from './memory-manager';
import { VaultTools } from './vault-tools';
import { Logger } from './utils/logger';
import type { App } from 'obsidian';

export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	toolCalls?: ToolCall[];
}

export interface ToolCall {
	name: string;
	args: Record<string, any>;
	status: 'pending' | 'approved' | 'rejected' | 'executed';
	result?: string;
	error?: string;
}

export interface StreamChunk {
	text: string;
	done: boolean;
	toolCalls?: ToolCall[];
}

export type ToolApprovalHandler = (toolName: string, args: Record<string, any>) => Promise<boolean>;

export class GeminiClient {
	private googleGenAI: GoogleGenAI | null = null;
	private directAPIClient: DirectGeminiAPIClient | null = null;
	private history: Content[] = [];
	private settings: GeminiSettings;
	private vaultAdapter: VaultAdapter;
	private vaultPath: string;
	private tools: Tool[] = [];
	private toolApprovalHandler: ToolApprovalHandler | null = null;
	private memoryManager: MemoryManager;
	private vaultTools: VaultTools;
	private app: App;
	private plugin: any = null; // Reference to the plugin instance

	constructor(settings: GeminiSettings, vaultAdapter: VaultAdapter, vaultPath: string, pluginDataPath: string, app: App, plugin?: any) {
		this.settings = settings;
		this.vaultAdapter = vaultAdapter;
		this.vaultPath = vaultPath;
		this.app = app;
		this.plugin = plugin; // Store plugin reference
		this.memoryManager = new MemoryManager(vaultAdapter.vault.adapter, pluginDataPath);
		this.vaultTools = new VaultTools(app, vaultAdapter);
	}

	setToolApprovalHandler(handler: ToolApprovalHandler): void {
		this.toolApprovalHandler = handler;
	}

	/**
	 * Check if the client is properly initialized and ready to use
	 */
	isInitialized(): boolean {
		return this.googleGenAI !== null || this.directAPIClient !== null;
	}

	async initialize(): Promise<void> {
		const originalGcpProject = process.env.GOOGLE_CLOUD_PROJECT;
		const originalGcpLocation = process.env.GOOGLE_CLOUD_LOCATION;
		const originalUseVertexAI = process.env.GOOGLE_GENAI_USE_VERTEXAI;
		const originalGcpCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
		
		try {
			delete process.env.GOOGLE_CLOUD_PROJECT;
			delete process.env.GOOGLE_CLOUD_LOCATION;
			delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
			delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
			
			Logger.debug('Gemini', 'Cleared GCP environment variables to prevent metadata service calls');
			Logger.debug('Gemini', 'GOOGLE_CLOUD_PROJECT: undefined (cleared)');
			Logger.debug('Gemini', 'GOOGLE_CLOUD_LOCATION: undefined (cleared)');
			Logger.debug('Gemini', 'GOOGLE_GENAI_USE_VERTEXAI: undefined (cleared)');
			
			if (this.settings.useOAuth) {
				Logger.debug('Gemini', 'Initializing with OAuth authentication');
				Logger.debug('Gemini', 'Using Standard Gemini API (like ai-note-organizer)');
				Logger.debug('Gemini', '✅ No GCP project required');
				
				if (!this.settings.oauthAccessToken) {
					throw new Error('OAuth not authenticated. Please authenticate in settings.');
				}

				Logger.debug('Gemini', 'OAuth token present, checking expiry...');
				
				if (this.settings.oauthExpiresAt && 
					OAuthHandler.isTokenExpired(this.settings.oauthExpiresAt)) {
					
					if (!this.settings.oauthRefreshToken) {
						throw new Error('OAuth token expired and no refresh token available');
					}

				Logger.debug('Gemini', 'Token expired, refreshing...');
				
				// Check if OAuth credentials are configured
				if (!this.settings.oauthClientId || !this.settings.oauthClientSecret) {
					throw new Error('OAuth Client ID and Client Secret not configured. Please configure them in settings.');
				}
				
				// Initialize OAuth handler and refresh token
				const oauthHandler = new OAuthHandler();
				await oauthHandler.initialize(this.settings.oauthClientId, this.settings.oauthClientSecret);
				
				const newTokens = await oauthHandler.refreshToken(this.settings.oauthRefreshToken);

					this.settings.oauthAccessToken = newTokens.access_token;
					if (newTokens.refresh_token) {
						this.settings.oauthRefreshToken = newTokens.refresh_token;
					}
					this.settings.oauthExpiresAt = Date.now() / 1000 + newTokens.expires_in;
					
					Logger.debug('Gemini', 'Token refreshed successfully');
					new Notice('OAuth token refreshed');
				} else {
					Logger.debug('Gemini', 'Token still valid');
				}

				this.directAPIClient = new DirectGeminiAPIClient(this.settings.oauthAccessToken);
				this.googleGenAI = null;

				Logger.debug('Gemini', 'Standard Gemini API client initialized with OAuth');
				Logger.debug('Gemini', 'Using generativelanguage.googleapis.com with direct fetch()');
				Logger.debug('Gemini', '✅ Quota delegation enabled (billing to user account)');

			} else {
				Logger.debug('Gemini', 'Initializing with API key authentication');
				
				if (!this.settings.apiKey) {
					throw new Error('API key must be configured');
				}

				const userAgent = `ObsidianGeminiPlugin/0.1.0 (Obsidian)`;
				const headers: Record<string, string> = {
					'User-Agent': userAgent,
				};

				Logger.debug('Gemini', 'Creating GoogleGenAI client with API key');
				Logger.debug('Gemini', 'Using generativelanguage.googleapis.com endpoint (vertexai: false)');

				this.googleGenAI = new GoogleGenAI({
					apiKey: this.settings.apiKey,
					vertexai: false,
					httpOptions: { headers },
				});

				Logger.debug('Gemini', 'API key client initialized successfully');
			}

			try {
				await this.memoryManager.loadMemories();
				Logger.debug('Gemini', `Loaded ${this.memoryManager.getMemoryCount()} memories`);
			} catch (error) {
				Logger.error('Gemini', 'Failed to load memories:', error);
			}

			if (this.settings.enableFileTools) {
				this.initializeTools();
			}

			Logger.debug('Gemini', 'Client initialized successfully');
			
			if (originalGcpProject !== undefined) process.env.GOOGLE_CLOUD_PROJECT = originalGcpProject;
			if (originalGcpLocation !== undefined) process.env.GOOGLE_CLOUD_LOCATION = originalGcpLocation;
			if (originalUseVertexAI !== undefined) process.env.GOOGLE_GENAI_USE_VERTEXAI = originalUseVertexAI;
			if (originalGcpCredentials !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGcpCredentials;

		} catch (error) {
			Logger.error('Gemini', 'Failed to initialize:', error);
			if (originalGcpProject !== undefined) process.env.GOOGLE_CLOUD_PROJECT = originalGcpProject;
			if (originalGcpLocation !== undefined) process.env.GOOGLE_CLOUD_LOCATION = originalGcpLocation;
			if (originalUseVertexAI !== undefined) process.env.GOOGLE_GENAI_USE_VERTEXAI = originalUseVertexAI;
			if (originalGcpCredentials !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGcpCredentials;
			throw error;
		}
	}

	private initializeTools(): void {
		Logger.debug('Gemini', 'initializeTools() called');
		const functionDeclarations: FunctionDeclaration[] = [];

		// Load MCP tools if available
		Logger.debug('Gemini', 'Loading MCP tools...');
		this.loadMcpTools(functionDeclarations);
		Logger.debug('Gemini', `MCP tools loaded, total functionDeclarations so far: ${functionDeclarations.length}`);

		functionDeclarations.push({
			name: 'read_file',
			description: 'Reads and returns the content of a specified file from the vault. Handles text files and returns their content.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'The path to the file relative to the vault root (e.g., "folder/note.md")'
					},
					offset: {
						type: Type.NUMBER,
						description: 'Optional: Line number to start reading from'
					},
					limit: {
						type: Type.NUMBER,
						description: 'Optional: Number of lines to read'
					}
				},
				required: ['file_path']
			}
		});

		functionDeclarations.push({
			name: 'list_files',
			description: 'Lists all files in the vault or in a specific directory.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					directory: {
						type: Type.STRING,
						description: 'Optional: Directory path to list files from. If not provided, lists all files in vault.'
					}
				}
			}
		});

		functionDeclarations.push({
			name: 'read_many_files',
			description: 'Reads content from multiple files specified by paths or glob patterns within the vault. Concatenates text file content with separators. Supports include/exclude patterns for filtering files.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					paths: {
						type: Type.ARRAY,
						items: {
							type: Type.STRING
						},
						description: 'Required: Array of glob patterns or paths relative to vault root (e.g., ["src/**/*.ts"], ["README.md", "docs/*"])'
					},
					include: {
						type: Type.ARRAY,
						items: {
							type: Type.STRING
						},
						description: 'Optional: Additional glob patterns to include. Merged with paths parameter.'
					},
					exclude: {
						type: Type.ARRAY,
						items: {
							type: Type.STRING
						},
						description: 'Optional: Glob patterns for files/directories to exclude (e.g., ["**/*.log", "temp/"])'
					},
					useDefaultExcludes: {
						type: Type.BOOLEAN,
						description: 'Optional: Whether to apply default exclusion patterns (node_modules, .git, etc.). Defaults to true.'
					}
				},
				required: ['paths']
			}
		});

		if (this.settings.enableFileTools) {
			functionDeclarations.push({
				name: 'write_file',
				description: 'Creates a new file or overwrites an existing file in the vault with the provided content.',
				parameters: {
					type: Type.OBJECT,
					properties: {
						file_path: {
							type: Type.STRING,
							description: 'The path where the file should be created/written'
						},
						content: {
							type: Type.STRING,
							description: 'The content to write to the file'
						}
					},
					required: ['file_path', 'content']
				}
			});
		}

		functionDeclarations.push({
			name: 'web_fetch',
			description: 'Processes content from URL(s), including local and private network addresses. Include up to 20 URLs and instructions (e.g., summarize, extract specific data) directly in the prompt parameter.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					prompt: {
						type: Type.STRING,
						description: 'A comprehensive prompt that includes the URL(s) (up to 20) to fetch and specific instructions on how to process their content (e.g., "Summarize https://example.com/article and extract key points from https://another.com/data"). Must contain at least one URL starting with http:// or https://.'
					}
				},
				required: ['prompt']
			}
		});

		functionDeclarations.push({
			name: 'google_web_search',
			description: 'Performs a web search using Google Search (via the Gemini API) and returns the results. This tool is useful for finding information on the internet based on a query.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					query: {
						type: Type.STRING,
						description: 'The search query to find information on the web.'
					}
				},
				required: ['query']
			}
		});

		functionDeclarations.push({
			name: 'save_memory',
			description: 'Saves a specific piece of information or fact to your long-term memory. Use this when the user explicitly asks you to remember something, or when they state a clear, concise fact that seems important to retain for future interactions.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					fact: {
						type: Type.STRING,
						description: 'The specific fact or piece of information to remember. Should be a clear, self-contained statement (e.g., "My preferred programming language is Python", "The project I\'m working on is called \'my-app\'").'
					},
					category: {
						type: Type.STRING,
						description: 'Optional: Category or tag for this memory (e.g., "preference", "project", "fact").'
					}
				},
				required: ['fact']
			}
		});

		functionDeclarations.push({
			name: 'delete_memory',
			description: 'Deletes a specific memory by searching for facts that match the given text. Use this to remove incorrect, outdated, or duplicate memories. When a user corrects a previously saved fact, delete the old one before saving the new one.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					fact_to_delete: {
						type: Type.STRING,
						description: 'The fact text to search for and delete. Will delete all memories that contain this text (case-insensitive partial match).'
					}
				},
				required: ['fact_to_delete']
			}
		});

		// ========================================================================
		// Vault Navigation & Discovery Tools
		// ========================================================================

		functionDeclarations.push({
			name: 'get_active_file',
			description: 'Gets information about the currently open/active file in Obsidian, including its path, metadata, tags, and a content preview.',
			parameters: {
				type: Type.OBJECT,
				properties: {}
			}
		});

		functionDeclarations.push({
			name: 'open_file',
			description: 'Opens a file in Obsidian. Can open in the current pane or create a new pane.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Path to the file to open (relative to vault root)'
					},
					new_pane: {
						type: Type.BOOLEAN,
						description: 'Optional: If true, opens the file in a new pane/split. Defaults to false (opens in current pane).'
					}
				},
				required: ['file_path']
			}
		});

		functionDeclarations.push({
			name: 'search_vault',
			description: 'Searches the entire vault for files containing specific text. Automatically uses Omnisearch plugin if available for better results (fuzzy matching, relevance scoring, PDF support), otherwise falls back to built-in search. Returns matching files with context snippets showing where the text appears.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					query: {
						type: Type.STRING,
						description: 'The text to search for across all vault files'
					},
					limit: {
						type: Type.NUMBER,
						description: 'Optional: Maximum number of files to return. Defaults to 20.'
					}
				},
				required: ['query']
			}
		});

		functionDeclarations.push({
			name: 'get_recent_files',
			description: 'Gets a list of recently modified files in the vault, sorted by modification time.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					count: {
						type: Type.NUMBER,
						description: 'Optional: Number of files to return. Defaults to 10.'
					},
					hours_back: {
						type: Type.NUMBER,
						description: 'Optional: How many hours back to look for modifications. Defaults to 24.'
					}
				}
			}
		});

		// ========================================================================
		// Link & Connection Tools
		// ========================================================================

		functionDeclarations.push({
			name: 'get_backlinks',
			description: 'Gets all backlinks TO a specific file (i.e., files that link to this file).',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Path to the file to get backlinks for'
					}
				},
				required: ['file_path']
			}
		});

		functionDeclarations.push({
			name: 'get_outgoing_links',
			description: 'Gets all outgoing links FROM a specific file (i.e., files that this file links to).',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Path to the file to get outgoing links from'
					}
				},
				required: ['file_path']
			}
		});

		functionDeclarations.push({
			name: 'get_graph_neighbors',
			description: 'Gets all directly connected notes (both incoming and outgoing links) for a file. Useful for understanding the local graph structure around a note.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Path to the file to get neighbors for'
					}
				},
				required: ['file_path']
			}
		});

		// ========================================================================
		// File Management Tools
		// ========================================================================

		functionDeclarations.push({
			name: 'rename_file',
			description: 'Renames a file. Obsidian automatically updates all backlinks to use the new name.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Current path of the file to rename'
					},
					new_name: {
						type: Type.STRING,
						description: 'New name for the file (just the filename, not the full path). Will be automatically sanitized.'
					}
				},
				required: ['file_path', 'new_name']
			}
		});

		functionDeclarations.push({
			name: 'create_folder',
			description: 'Creates a new folder in the vault. Automatically creates parent folders if needed (recursive).',
			parameters: {
				type: Type.OBJECT,
				properties: {
					folder_path: {
						type: Type.STRING,
						description: 'Path of the folder to create (e.g., "archive" or "projects/2024/Q1")'
					}
				},
				required: ['folder_path']
			}
		});

		functionDeclarations.push({
			name: 'move_file',
			description: 'Moves a file to a different folder in the vault.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					source_path: {
						type: Type.STRING,
						description: 'Current path of the file to move'
					},
					target_folder: {
						type: Type.STRING,
						description: 'Target folder path (e.g., "archive" or "projects/completed")'
					}
				},
				required: ['source_path', 'target_folder']
			}
		});

		functionDeclarations.push({
			name: 'delete_file',
			description: 'Deletes a file from the vault. By default, moves to system trash. Use with caution.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Path to the file to delete'
					},
					permanent: {
						type: Type.BOOLEAN,
						description: 'Optional: If true, permanently deletes the file. If false (default), moves to system trash.'
					}
				},
				required: ['file_path']
			}
		});

		// ========================================================================
		// Metadata & Organization Tools
		// ========================================================================

		functionDeclarations.push({
			name: 'get_file_metadata',
			description: 'Gets comprehensive metadata about a file including frontmatter, tags, links, backlinks, creation/modification dates, and file statistics.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Path to the file to get metadata for'
					}
				},
				required: ['file_path']
			}
		});

		functionDeclarations.push({
			name: 'update_frontmatter',
			description: 'Updates or adds fields to a file\'s YAML frontmatter. Useful for adding tags, aliases, or custom metadata.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Path to the file to update'
					},
					updates: {
						type: Type.OBJECT,
						description: 'Key-value pairs to add/update in frontmatter (e.g., {"tags": ["important", "project"], "status": "in-progress"})'
					}
				},
				required: ['file_path', 'updates']
			}
		});

		functionDeclarations.push({
			name: 'get_tags',
			description: 'Gets all tags in the vault or tags from a specific file.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Optional: Path to a specific file. If not provided, returns all tags in the entire vault.'
					}
				}
			}
		});

		// ========================================================================
		// Workflow & Template Tools
		// ========================================================================

		functionDeclarations.push({
			name: 'get_daily_note',
			description: 'Gets or creates today\'s daily note based on Obsidian\'s Daily Notes plugin settings. Automatically opens the note.',
			parameters: {
				type: Type.OBJECT,
				properties: {}
			}
		});

		functionDeclarations.push({
			name: 'create_from_template',
			description: 'Creates a new file from a template. Supports variable replacement ({{variable}}) and automatic date/time insertion.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					template_path: {
						type: Type.STRING,
						description: 'Path to the template file to use'
					},
					new_file_path: {
						type: Type.STRING,
						description: 'Path where the new file should be created'
					},
					variables: {
						type: Type.OBJECT,
						description: 'Optional: Variables to replace in the template (e.g., {"title": "My Note", "author": "John"}). Template uses {{variable}} syntax.'
					}
				},
				required: ['template_path', 'new_file_path']
			}
		});

		// ========================================================================
		// Workspace Management Tools
		// ========================================================================

		functionDeclarations.push({
			name: 'get_workspace_layout',
			description: 'Gets information about the current workspace layout, including all open files and which panes they\'re in.',
			parameters: {
				type: Type.OBJECT,
				properties: {}
			}
		});

		functionDeclarations.push({
			name: 'create_pane',
			description: 'Creates a new pane/split in the workspace. Can optionally open a specific file in the new pane.',
			parameters: {
				type: Type.OBJECT,
				properties: {
					file_path: {
						type: Type.STRING,
						description: 'Optional: Path to a file to open in the new pane'
					},
					direction: {
						type: Type.STRING,
						description: 'Optional: Split direction - "vertical" (default) or "horizontal"'
					}
				}
			}
		});

		Logger.debug('Gemini', `Final functionDeclarations count: ${functionDeclarations.length}`);
		this.tools = [{ functionDeclarations }];
		Logger.debug('Gemini', 'Tools initialized successfully');
	}

	private async executeTool(name: string, args: Record<string, any>): Promise<string> {
		try {
			Logger.info('Tools', `Executing tool: ${name}`, args);

		// Check if this is an MCP tool
		if (this.settings.enableMCP && this.plugin) {
			if (this.plugin.toolRegistry) {
				const mcpTools = this.plugin.toolRegistry.getAllTools();
				Logger.debug('Tools', `Looking for MCP tool: ${name}`);
				Logger.debug('Tools', `Available MCP tools:`, Array.from(mcpTools.keys()));
				
				if (mcpTools.has(name)) {
					const toolEntry = mcpTools.get(name);
					Logger.debug('Tools', `Found MCP tool entry:`, toolEntry);
					
					// Check if toolEntry itself is the MCP tool (has execute method)
					if (toolEntry && typeof toolEntry.execute === 'function') {
						Logger.debug('Tools', `Executing MCP tool: ${name}`);
						
						// Get the MCP client for this tool
						const mcpClient = this.plugin.mcpClientManager.getClient(toolEntry.serverName);
						if (!mcpClient) {
							throw new Error(`MCP client for server ${toolEntry.serverName} not found`);
						}
						
						const result = await toolEntry.execute(args, mcpClient);
						return result;
					}
					// Also check the old structure for compatibility
					else if (toolEntry && toolEntry.tool && typeof toolEntry.tool.execute === 'function') {
						Logger.debug('Tools', `Executing MCP tool: ${name}`);
						
						// Get the MCP client for this tool
						const mcpClient = this.plugin.mcpClientManager.getClient(toolEntry.tool.serverName);
						if (!mcpClient) {
							throw new Error(`MCP client for server ${toolEntry.tool.serverName} not found`);
						}
						
						const result = await toolEntry.tool.execute(args, mcpClient);
						return result;
					}
				} else {
					Logger.debug('Tools', `MCP tool not found: ${name}`);
				}
			}
		}

			switch (name) {
				case 'read_file':
					return await this.vaultAdapter.readFile(args.file_path as string);

				case 'list_files':
					const files = await this.vaultAdapter.listFiles((args.directory as string | undefined) || '');
					const displayFiles = files.slice(0, 20);
					const result = displayFiles.join('\n');
					const suffix = files.length > 20 ? `\n... and ${files.length - 20} more files` : '';
					return `Files in vault${args.directory ? ` (${args.directory})` : ''} (${files.length} total):\n${result}${suffix}`;

			case 'write_file': {
				const sanitizedPath = this.sanitizeFilePath(args.file_path as string);
				if (sanitizedPath !== args.file_path) {
					Logger.debug('WriteFile', `Sanitized path: "${args.file_path}" → "${sanitizedPath}"`);
				}
				await this.vaultAdapter.writeFile(sanitizedPath, args.content as string);
				return `File written successfully: ${sanitizedPath}${sanitizedPath !== args.file_path ? ` (sanitized from: ${args.file_path})` : ''}`;
			}

				case 'web_fetch':
					return await this.executeWebFetch(args);

				case 'google_web_search':
					return await this.executeGoogleWebSearch(args);

				case 'read_many_files':
					return await this.executeReadManyFiles(args);

			case 'save_memory':
				return await this.executeSaveMemory(args);

			case 'delete_memory':
				return await this.executeDeleteMemory(args);

			// Vault Navigation & Discovery
			case 'get_active_file':
				return await this.vaultTools.getActiveFile();

			case 'open_file':
				return await this.vaultTools.openFile(args.file_path, args.new_pane || false);

			case 'search_vault':
				return await this.vaultTools.searchVault(args.query, args.limit || 20);

			case 'get_recent_files':
				return await this.vaultTools.getRecentFiles(args.count || 10, args.hours_back || 24);

			// Link & Connection Tools
			case 'get_backlinks':
				return await this.vaultTools.getBacklinks(args.file_path);

			case 'get_outgoing_links':
				return await this.vaultTools.getOutgoingLinks(args.file_path);

			case 'get_graph_neighbors':
				return await this.vaultTools.getGraphNeighbors(args.file_path);

			// File Management
			case 'rename_file':
				return await this.vaultTools.renameFile(args.file_path, args.new_name);

			case 'create_folder':
				return await this.vaultTools.createFolder(args.folder_path);

			case 'move_file':
				return await this.vaultTools.moveFile(args.source_path, args.target_folder);

			case 'delete_file':
				return await this.vaultTools.deleteFile(args.file_path, args.permanent || false);

			// Metadata & Organization
			case 'get_file_metadata':
				return await this.vaultTools.getFileMetadata(args.file_path);

			case 'update_frontmatter':
				return await this.vaultTools.updateFrontmatter(args.file_path, args.updates);

			case 'get_tags':
				return await this.vaultTools.getTags(args.file_path);

			// Workflow & Templates
			case 'get_daily_note':
				return await this.vaultTools.getDailyNote();

			case 'create_from_template':
				return await this.vaultTools.createFromTemplate(
					args.template_path,
					args.new_file_path,
					args.variables
				);

			// Workspace Management
			case 'get_workspace_layout':
				return await this.vaultTools.getWorkspaceLayout();

			case 'create_pane':
				return await this.vaultTools.createPane(args.file_path, args.direction || 'vertical');

			default:
				throw new Error(`Unknown tool: ${name}`);
			}
		} catch (error) {
			const errorMsg = `Error executing ${name}: ${error.message}`;
			Logger.error('Error', errorMsg);
			return errorMsg;
		}
	}

	private async executeWebFetch(args: Record<string, any>): Promise<string> {
		const prompt = args.prompt as string;
		
		if (!prompt || prompt.trim() === '') {
			throw new Error("The 'prompt' parameter cannot be empty and must contain URL(s) and instructions.");
		}
		
		if (!prompt.includes('http://') && !prompt.includes('https://')) {
			throw new Error("The 'prompt' must contain at least one valid URL (starting with http:// or https://).");
		}

		const urls = this.extractUrls(prompt);
		if (urls.length === 0) {
			throw new Error('No valid URLs found in prompt');
		}

		const url = urls[0];
		Logger.debug('WebFetch', `Processing prompt: "${prompt.substring(0, 100)}..."`);
		Logger.debug('WebFetch', `Extracted URL: ${url}`);

		let fetchUrl = url;
		if (url.includes('github.com') && url.includes('/blob/')) {
			fetchUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
			Logger.debug('WebFetch', `Converted GitHub URL: ${fetchUrl}`);
		}

		// Follow redirects with a maximum limit to prevent infinite loops
		const response = await this.fetchWithRedirects(fetchUrl, 5);
		
		return this.processWebFetchResponse(response, url, prompt);
	}

	private async fetchWithRedirects(url: string, maxRedirects: number): Promise<{statusCode: number, headers: any, data: string, finalUrl: string}> {
		if (maxRedirects <= 0) {
			throw new Error('Too many redirects (max 5)');
		}

		Logger.debug('WebFetch', `Fetching: ${url} (${maxRedirects} redirects remaining)`);
		
		const https = require('https');
		const http = require('http');
		const urlObj = new URL(url);
		const isHttps = urlObj.protocol === 'https:';
		const client = isHttps ? https : http;

		const response = await new Promise<{statusCode: number, headers: any, data: string}>((resolve, reject) => {
			const request = client.request(url, {
				method: 'GET',
				headers: {
					'User-Agent': 'ObsidianGeminiPlugin/0.1.0',
				},
				timeout: 10000
			}, (response: any) => {
				let data = '';
				response.on('data', (chunk: string) => {
					data += chunk;
				});
				response.on('end', () => {
					resolve({
						statusCode: response.statusCode,
						headers: response.headers,
						data: data
					});
				});
			});

			request.on('error', (error: Error) => {
				reject(error);
			});

			request.on('timeout', () => {
				request.destroy();
				reject(new Error('Request timeout'));
			});

			request.end();
		});

		// Check for redirect status codes (301, 302, 303, 307, 308)
		if (response.statusCode >= 300 && response.statusCode < 400) {
			const location = response.headers.location;
			if (location) {
				Logger.debug('WebFetch', `Following redirect ${response.statusCode} to: ${location}`);
				
				// Handle relative redirects
				const redirectUrl = location.startsWith('http') ? location : new URL(location, url).toString();
				
				// Recursively follow redirects
				return await this.fetchWithRedirects(redirectUrl, maxRedirects - 1);
			} else {
				throw new Error(`Redirect response (${response.statusCode}) without Location header`);
			}
		}

		// Check for successful response
		if (response.statusCode < 200 || response.statusCode >= 300) {
			throw new Error(`Request failed with status code ${response.statusCode}`);
		}

		return {
			...response,
			finalUrl: url
		};
	}

	private processWebFetchResponse(response: {statusCode: number, headers: any, data: string, finalUrl: string}, originalUrl: string, prompt: string): string {
		try {
			const contentType = response.headers['content-type'] || '';
			let content: string;

			if (contentType.includes('application/json')) {
				try {
					const json = JSON.parse(response.data);
					content = JSON.stringify(json, null, 2);
				} catch (e) {
					content = response.data;
				}
			} else if (contentType.includes('text/')) {
				content = response.data;
			} else {
				content = response.data.length > 10000 
					? response.data.substring(0, 10000) + '\n... (content truncated due to size)'
					: response.data;
			}

			const MAX_CONTENT_LENGTH = 100000;
			if (content.length > MAX_CONTENT_LENGTH) {
				content = content.substring(0, MAX_CONTENT_LENGTH) + '\n... (content truncated due to size)';
			}

			Logger.debug('WebFetch', `Success: ${content.length} characters`);
			
			// Include redirect information if the final URL differs from the original
			const urlInfo = response.finalUrl !== originalUrl 
				? `Web fetch successful (followed redirects from ${originalUrl} to ${response.finalUrl}):\n\n`
				: `Web fetch successful from ${originalUrl}:\n\n`;
			
			return urlInfo + content;

		} catch (error: any) {
			const errorMessage = `Fetch failed: ${error.message}`;
			Logger.error('WebFetch', 'Error:', errorMessage, error);
			throw new Error(errorMessage);
		}
	}

	private async executeGoogleWebSearch(args: Record<string, any>): Promise<string> {
		const query = args.query as string;

		if (!query || !query.trim()) {
			throw new Error('Parameter "query" must be a non-empty string.');
		}

		try {
			Logger.debug('GoogleSearch', 'Executing search for:', query);

			const searchContent: Content = {
				role: 'user',
				parts: [{ text: query }]
			};

			const effectiveModel = getEffectiveModel(
				this.settings.fallbackMode,
				this.settings.model
			);
			
			let response: any;
			if (this.settings.useOAuth && this.directAPIClient) {
				response = await this.directAPIClient.generateContentWithGrounding(
					effectiveModel,
					[searchContent],
					query
				);
			} else if (this.googleGenAI) {
				const result = await this.googleGenAI.models.generateContent({
					model: effectiveModel,
					contents: [searchContent],
					config: {
						temperature: 0.7,
						maxOutputTokens: 8192,
						tools: [{ googleSearch: {} }]
					}
				});
				
				response = {
					candidates: result.candidates
				};
			} else {
				const authMethod = this.settings.useOAuth ? 'OAuth' : 'API key';
				throw new Error(`Gemini client not initialized. Please check your ${authMethod} configuration in settings and try reloading the plugin.`);
			}

			const responseText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
			const groundingMetadata = response?.candidates?.[0]?.groundingMetadata;
			const sources = groundingMetadata?.groundingChunks || [];

			if (!responseText || !responseText.trim()) {
				return `No search results or information found for query: "${query}"`;
			}

			let formattedResponse = `Web search results for "${query}":\n\n${responseText}`;

			if (sources.length > 0) {
				const sourcesList = sources.map((source: any, index: number) => {
					const title = source.web?.title || 'Untitled';
					const uri = source.web?.uri || 'No URI';
					return `[${index + 1}] ${title}\n    ${uri}`;
				});

				formattedResponse += '\n\nSources:\n' + sourcesList.join('\n');
			}

			Logger.debug('GoogleSearch', `Success: ${responseText.length} chars, ${sources.length} sources`);
			return formattedResponse;

		} catch (error: any) {
			const errorMessage = `Google search failed: ${error.message}`;
			Logger.error('GoogleSearch', 'Error:', errorMessage, error);
			throw new Error(errorMessage);
		}
	}

	private async executeReadManyFiles(args: Record<string, any>): Promise<string> {
		const paths = args.paths as string[];
		const include = args.include as string[] || [];
		const exclude = args.exclude as string[] || [];
		const useDefaultExcludes = args.useDefaultExcludes !== false;

		if (!paths || !Array.isArray(paths) || paths.length === 0) {
			throw new Error('paths parameter is required and must be a non-empty array');
		}

		Logger.debug('ReadManyFiles', 'Processing paths:', paths);
		Logger.debug('ReadManyFiles', 'Include patterns:', include);
		Logger.debug('ReadManyFiles', 'Exclude patterns:', exclude);
		Logger.debug('ReadManyFiles', 'Use default excludes:', useDefaultExcludes);

		try {
		const vaultFiles = this.vaultAdapter.vault.getFiles();
		Logger.debug('ReadManyFiles', 'Total vault files:', vaultFiles.length);

		const defaultExcludes = [
			'node_modules/**',
			'.git/**',
			`${this.app.vault.configDir}/**`, // Use vault's configDir instead of hardcoded .obsidian
			'*.log',
			'*.tmp',
			'*.cache',
			'*.lock',
			'*.pid',
			'*.seed',
			'*.pid.lock',
			'.DS_Store',
			'Thumbs.db'
		];

			const effectiveExcludes = useDefaultExcludes 
				? [...defaultExcludes, ...exclude]
				: exclude;

			const searchPatterns = [...paths, ...include];

			const matchingFiles = vaultFiles.filter((file: any) => {
				const relativePath = file.path;

				const matchesPattern = searchPatterns.some(pattern => {
					if (pattern.includes('*') || pattern.includes('**')) {
						let regexPattern = pattern
							.replace(/\*\*/g, '.*')
							.replace(/\*/g, '[^/]*')
							.replace(/\./g, '\\.')
							.replace(/\?/g, '.');
						
						if (pattern === '**/*.md') {
							regexPattern = '.*\\.md$';
						} else if (pattern.endsWith('/*')) {
							regexPattern = regexPattern.replace(/\\\*$/, '/[^/]*');
						}
						
						const regex = new RegExp(`^${regexPattern}$`);
						return regex.test(relativePath);
					} else {
						return relativePath === pattern || relativePath.startsWith(pattern + '/');
					}
				});

				if (!matchesPattern) return false;

				const isExcluded = effectiveExcludes.some(excludePattern => {
					if (excludePattern.includes('*') || excludePattern.includes('**')) {
						let regexPattern = excludePattern
							.replace(/\*\*/g, '.*')
							.replace(/\*/g, '[^/]*')
							.replace(/\./g, '\\.')
							.replace(/\?/g, '.');
						
						if (excludePattern === 'drafts/**/*.md') {
							regexPattern = '^drafts/.*\\.md$';
						}
						
						const regex = new RegExp(`^${regexPattern}$`);
						return regex.test(relativePath);
					} else {
						return relativePath === excludePattern || relativePath.startsWith(excludePattern + '/');
					}
				});

				return !isExcluded;
			});

			Logger.debug('ReadManyFiles', 'Matching files found:', matchingFiles.length);

			if (matchingFiles.length === 0) {
				return 'No files found matching the specified patterns.';
			}

			matchingFiles.sort((a: any, b: any) => a.path.localeCompare(b.path));

			const results: string[] = [];
			const processedFiles: string[] = [];
			const skippedFiles: Array<{ path: string; reason: string }> = [];

			for (const file of matchingFiles) {
				try {
					Logger.debug('ReadManyFiles', 'Reading file:', file.path);
					const content = await this.vaultAdapter.vault.read(file);
					
					results.push(`--- ${file.path} ---\n\n${content}\n\n`);
					processedFiles.push(file.path);
				} catch (error) {
					Logger.warn('ReadManyFiles', 'Failed to read file:', file.path, error);
					skippedFiles.push({
						path: file.path,
						reason: `Read error: ${error.message}`
					});
				}
			}

			let summary = `Successfully read ${processedFiles.length} file(s) using patterns: ${searchPatterns.join(', ')}`;
			
			if (processedFiles.length <= 10) {
				summary += `\n\n**Processed Files:**\n${processedFiles.map(p => `- ${p}`).join('\n')}`;
			} else {
				summary += `\n\n**Processed Files (first 10 shown):**\n${processedFiles.slice(0, 10).map(p => `- ${p}`).join('\n')}\n- ...and ${processedFiles.length - 10} more.`;
			}

			if (skippedFiles.length > 0) {
				summary += `\n\n**Skipped ${skippedFiles.length} file(s):**\n${skippedFiles.slice(0, 5).map(f => `- ${f.path} (${f.reason})`).join('\n')}`;
				if (skippedFiles.length > 5) {
					summary += `\n- ...and ${skippedFiles.length - 5} more.`;
				}
			}

			if (results.length > 0) {
				results.push('--- End of content ---');
				return `${summary}\n\n${results.join('')}`;
			} else {
				return summary;
			}

		} catch (error: any) {
			const errorMessage = `Error during read_many_files operation: ${error.message}`;
			Logger.error('Error', errorMessage, error);
			throw new Error(errorMessage);
		}
	}

	private async executeSaveMemory(args: Record<string, any>): Promise<string> {
		const fact = args.fact as string;
		const category = args.category as string | undefined;

		if (!fact || !fact.trim()) {
			throw new Error('Parameter "fact" must be a non-empty string.');
		}

		try {
			Logger.debug('SaveMemory', 'Saving memory:', fact);
			
			const memory = await this.memoryManager.addMemory(fact, category);
			
			const successMessage = `Okay, I've remembered that: "${fact}"`;
			Logger.debug('SaveMemory', 'Success:', memory.id);
			
			return successMessage;
		} catch (error: any) {
			const errorMessage = `Failed to save memory: ${error.message}`;
			Logger.error('SaveMemory', 'Error:', errorMessage, error);
			throw new Error(errorMessage);
		}
	}

	private async executeDeleteMemory(args: Record<string, any>): Promise<string> {
		const factToDelete = args.fact_to_delete as string;

		if (!factToDelete || !factToDelete.trim()) {
			throw new Error('Parameter "fact_to_delete" must be a non-empty string.');
		}

		try {
			Logger.debug('DeleteMemory', 'Searching for memories to delete:', factToDelete);
			
			const allMemories = this.memoryManager.getMemories();
			const searchTerm = factToDelete.toLowerCase().trim();
			const matchingMemories = allMemories.filter(m => 
				m.fact.toLowerCase().includes(searchTerm)
			);

			if (matchingMemories.length === 0) {
				return `No memories found matching "${factToDelete}"`;
			}

			let deletedCount = 0;
			for (const memory of matchingMemories) {
				const deleted = await this.memoryManager.deleteMemory(memory.id);
				if (deleted) {
					deletedCount++;
					Logger.debug('DeleteMemory', 'Deleted:', memory.fact);
				}
			}

			if (deletedCount === 1) {
				return `Deleted 1 memory: "${matchingMemories[0].fact}"`;
			} else {
				const deletedFacts = matchingMemories.map(m => `"${m.fact}"`).join(', ');
				return `Deleted ${deletedCount} memories: ${deletedFacts}`;
			}
		} catch (error: any) {
			const errorMessage = `Failed to delete memory: ${error.message}`;
			Logger.error('DeleteMemory', 'Error:', errorMessage, error);
			throw new Error(errorMessage);
		}
	}

	public getMemoryManager(): MemoryManager {
		return this.memoryManager;
	}

	/**
	 * Load MCP tools into function declarations
	 */
	private loadMcpTools(functionDeclarations: FunctionDeclaration[]): void {
		Logger.debug('Gemini', `MCP enabled: ${this.settings.enableMCP}`);
		
		if (!this.settings.enableMCP) {
			Logger.debug('Gemini', 'MCP not enabled, skipping MCP tools');
			return;
		}

		// Use the plugin reference passed to constructor
		Logger.debug('Gemini', `Plugin available: ${!!this.plugin}`);
		
		if (!this.plugin) {
			Logger.debug('Gemini', 'Plugin not available yet, MCP tools will be loaded later via reloadTools()');
			return;
		}

		Logger.debug('Gemini', `Tool registry available: ${!!this.plugin.toolRegistry}`);
		
		if (this.plugin.toolRegistry) {
			const mcpTools = this.plugin.toolRegistry.getAllTools();
			Logger.debug('Gemini', `Found ${mcpTools.size} tools in registry`);
			Logger.debug('Gemini', `Tool registry keys:`, Array.from(mcpTools.keys()));
			let mcpToolCount = 0;
			
			for (const [toolName, toolEntry] of mcpTools) {
				Logger.debug('Gemini', `Processing tool: ${toolName}`);
				Logger.debug('Gemini', `  - toolEntry:`, toolEntry);
				Logger.debug('Gemini', `  - toolEntry.tool:`, toolEntry.tool);
				Logger.debug('Gemini', `  - has tool: ${!!toolEntry.tool}`);
				Logger.debug('Gemini', `  - has toGeminiTool: ${!!(toolEntry.tool && typeof toolEntry.tool.toGeminiTool === 'function')}`);
				Logger.debug('Gemini', `  - toolEntry.tool type:`, typeof toolEntry.tool);
				Logger.debug('Gemini', `  - toolEntry itself has toGeminiTool: ${typeof toolEntry.toGeminiTool === 'function'}`);
				if (toolEntry.tool) {
					Logger.debug('Gemini', `  - toolEntry.tool keys:`, Object.keys(toolEntry.tool));
				}
				Logger.debug('Gemini', `  - toolEntry keys:`, Object.keys(toolEntry));
				
				// Check if toolEntry itself is the MCP tool (has toGeminiTool method)
				if (typeof toolEntry.toGeminiTool === 'function') {
					try {
						const geminiTool = toolEntry.toGeminiTool();
						Logger.debug('Gemini', `Converted tool ${toolName}:`, geminiTool);
						if (geminiTool.functionDeclarations) {
							functionDeclarations.push(...geminiTool.functionDeclarations);
							mcpToolCount++;
							Logger.debug('Gemini', `Added MCP tool: ${toolName}`);
						}
					} catch (error) {
						Logger.error('Gemini', `Failed to convert MCP tool ${toolName}:`, error);
					}
				}
				// Also check the old structure for compatibility
				else if (toolEntry.tool && typeof toolEntry.tool.toGeminiTool === 'function') {
					try {
						const geminiTool = toolEntry.tool.toGeminiTool();
						Logger.debug('Gemini', `Converted tool ${toolName}:`, geminiTool);
						if (geminiTool.functionDeclarations) {
							functionDeclarations.push(...geminiTool.functionDeclarations);
							mcpToolCount++;
							Logger.debug('Gemini', `Added MCP tool: ${toolName}`);
						}
					} catch (error) {
						Logger.error('Gemini', `Failed to convert MCP tool ${toolName}:`, error);
					}
				}
			}
			
			Logger.info('Gemini', `Loaded ${mcpToolCount} MCP tools from tool registry`);
		} else {
			Logger.warn('Gemini', 'MCP enabled but tool registry not available');
		}
	}

	/**
	 * Reload tools (useful when MCP servers connect/disconnect)
	 */
	public reloadTools(): void {
		Logger.debug('Gemini', 'reloadTools() called');
		Logger.debug('Gemini', `enableFileTools: ${this.settings.enableFileTools}`);
		
		if (this.settings.enableFileTools) {
			Logger.debug('Gemini', 'Initializing tools...');
			this.initializeTools();
			Logger.info('Gemini', 'Tools reloaded');
		} else {
			Logger.warn('Gemini', 'File tools not enabled, skipping tool reload');
		}
	}

	private extractUrls(text: string): string[] {
		const urlRegex = /(https?:\/\/[^\s]+)/g;
		return text.match(urlRegex) || [];
	}

	/**
	 * Ensure OAuth token is valid and refresh if necessary
	 */
	private async ensureValidOAuthToken(): Promise<void> {
		if (!this.settings.useOAuth) {
			return;
		}

		Logger.debug('Gemini', 'Checking OAuth token validity...');
		
		// Check if token is expired or will expire soon (within 5 minutes)
		const now = Date.now();
		const expiresAt = this.settings.oauthExpiresAt;
		const fiveMinutesFromNow = now + (5 * 60 * 1000);
		
		if (!expiresAt || expiresAt <= fiveMinutesFromNow) {
			Logger.debug('Gemini', 'OAuth token expired or expiring soon, refreshing...');
			
			if (!this.settings.oauthRefreshToken) {
				throw new Error('OAuth token expired and no refresh token available. Please re-authenticate in settings.');
			}

			if (!this.settings.oauthClientId || !this.settings.oauthClientSecret) {
				throw new Error('OAuth Client ID and Client Secret not configured. Please configure them in settings.');
			}

			try {
				const oauthHandler = new OAuthHandler();
				// Initialize OAuth handler with credentials
				await oauthHandler.initialize(
					this.settings.oauthClientId,
					this.settings.oauthClientSecret
				);
				const tokenData = await oauthHandler.refreshToken(this.settings.oauthRefreshToken);

				if (tokenData && tokenData.access_token) {
					// Update settings with new token data
					this.settings.oauthAccessToken = tokenData.access_token;
					if (tokenData.refresh_token) {
						this.settings.oauthRefreshToken = tokenData.refresh_token;
					}
					this.settings.oauthExpiresAt = Date.now() + (tokenData.expires_in * 1000);

					Logger.debug('Gemini', 'OAuth token refreshed successfully');
					// Update the direct API client with new token
					if (this.directAPIClient) {
						this.directAPIClient.updateAccessToken(this.settings.oauthAccessToken);
					}
				} else {
					Logger.debug('Gemini', 'OAuth token refresh failed');
					throw new Error('Failed to refresh OAuth token. Please re-authenticate in settings.');
				}
			} catch (error) {
				Logger.error('Gemini', 'OAuth token refresh error:', error);
				throw new Error('OAuth token refresh failed: ' + (error as Error).message);
			}
		} else {
			Logger.debug('Gemini', 'OAuth token is still valid');
		}
	}

	async *sendMessage(userMessage: string): AsyncGenerator<StreamChunk> {
		Logger.separator('Gemini');
		Logger.debug('Gemini', '🚀 sendMessage called');
		Logger.debug('Gemini', 'User message:', userMessage);
		Logger.separator('Gemini');

		// Auto-reinitialize if client is not available (fixes inactivity timeout)
		if (!this.isInitialized()) {
			Logger.debug('Gemini', 'Client not initialized, auto-reinitializing...');
			try {
				await this.initialize();
				Logger.debug('Gemini', 'Auto-reinitialization successful');
			} catch (error) {
				Logger.error('Gemini', 'Auto-reinitialization failed:', error);
				throw new Error('Failed to initialize Gemini client: ' + (error as Error).message);
			}
		}

		// Ensure OAuth token is fresh before making API calls
		if (this.settings.useOAuth) {
			await this.ensureValidOAuthToken();
		}

		const usingDirectAPI = this.settings.useOAuth && this.directAPIClient;
		Logger.debug('Gemini', 'Using:', usingDirectAPI ? 'Direct API (OAuth)' : 'Google SDK (API Key)');
		Logger.debug('Gemini', 'Building request...');

		const systemPrompt = await this.buildSystemPrompt();
		Logger.debug('Gemini', 'System prompt length:', systemPrompt.length);
		Logger.debug('Gemini', 'System prompt preview:', systemPrompt.substring(0, 200) + '...');

		Logger.debug('Gemini', 'Conversation history length:', this.history.length, 'messages');

		const contents: Content[] = [];
		
		if (this.history.length > 0) {
			contents.push(...this.history);
			contents.push({
				role: 'user',
				parts: [{ text: userMessage }]
			});
		} else {
			// For first message with SDK (non-OAuth), prepend system prompt to user message
			// For Direct API (OAuth), system prompt is sent separately as system_instruction
			if (usingDirectAPI) {
				contents.push({
					role: 'user',
					parts: [{ text: userMessage }]
				});
			} else {
				contents.push({
					role: 'user',
					parts: [{ text: systemPrompt + '\n\n' + userMessage }]
				});
			}
		}

		const effectiveModel = getEffectiveModel(this.settings.fallbackMode, this.settings.model);
		
		Logger.debug('Gemini', 'Requested model:', this.settings.model);
		Logger.debug('Gemini', 'Fallback mode:', this.settings.fallbackMode);
		Logger.debug('Gemini', 'Effective model:', effectiveModel);
		Logger.debug('Gemini', 'Tools enabled:', this.tools.length > 0);
		Logger.debug('Gemini', 'Total contents in request:', contents.length);

		Logger.debug('Gemini', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		Logger.debug('Gemini', '📤 REQUEST DETAILS:');
		Logger.debug('Gemini', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		Logger.debug('Gemini', 'Endpoint: generativelanguage.googleapis.com');
		Logger.debug('Gemini', 'Model:', effectiveModel);
		Logger.debug('Gemini', 'Temperature:', this.settings.temperature);
		Logger.debug('Gemini', 'Max tokens:', this.settings.maxTokens);
		Logger.debug('Gemini', 'Auth method:', usingDirectAPI ? 'OAuth Bearer token (Direct API)' : 'API Key (SDK)');
		Logger.debug('Gemini', 'Tools count:', this.tools[0]?.functionDeclarations?.length || 0);

		let accumulatedText = '';
		let currentToolCalls: ToolCall[] = [];

		try {
			Logger.debug('Gemini', 'Request prepared, sending...');

			let stream;
			if (usingDirectAPI) {
				// Direct API (OAuth) uses non-streaming generateContent
				const response = await this.directAPIClient!.generateContent(
					effectiveModel,
					contents,
					systemPrompt,
					this.tools,
					{
						temperature: this.settings.temperature,
						maxOutputTokens: this.settings.maxTokens
					}
				);
				
				// Process Direct API response directly (no streaming needed)
				Logger.debug('Gemini', 'Processing Direct API response directly...');
				
				if (response.candidates && response.candidates.length > 0) {
					const candidate = response.candidates[0];
					if (candidate.content && candidate.content.parts) {
						let accumulatedText = '';
						const toolCalls: ToolCall[] = [];
						
						for (const part of candidate.content.parts) {
							if (part.text) {
								accumulatedText += part.text;
							} else if (part.functionCall) {
								toolCalls.push({
									name: part.functionCall.name,
									args: part.functionCall.args,
									status: 'pending'
								});
							}
						}
						
						// Yield the complete response
						if (accumulatedText) {
							yield { text: accumulatedText, done: false, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
						}
						
						// Process tool calls if any
						if (toolCalls.length > 0) {
							for (const toolCall of toolCalls) {
								try {
									const result = await this.executeTool(toolCall.name, toolCall.args);
									toolCall.status = 'executed';
									toolCall.result = result;
									
									// Add tool response to history as USER message (following gemini-cli pattern)
									this.history.push({
										role: 'user',
										parts: [{ 
											functionResponse: {
												name: toolCall.name,
												response: { result: result }
											}
										}]
									});
									
									yield { text: '', done: false, toolCalls: [toolCall] };
								} catch (error) {
									toolCall.status = 'rejected';
									toolCall.error = (error as Error).message;
									yield { text: '', done: false, toolCalls: [toolCall] };
								}
							}
							
							// Generate follow-up response after tool execution
							const followUpResponse = await this.directAPIClient!.generateContent(
								effectiveModel,
								this.history,
								systemPrompt,
								this.tools,
								{
									temperature: this.settings.temperature,
									maxOutputTokens: this.settings.maxTokens
								}
							);
							
							if (followUpResponse.candidates && followUpResponse.candidates.length > 0) {
								const followUpCandidate = followUpResponse.candidates[0];
								if (followUpCandidate.content && followUpCandidate.content.parts) {
									let followUpText = '';
									for (const part of followUpCandidate.content.parts) {
										if (part.text) {
											followUpText += part.text;
										}
									}
									
									if (followUpText) {
										// Add follow-up response to history
										this.history.push({
											role: 'model',
											parts: [{ text: followUpText }]
										});
										
										yield { text: followUpText, done: true };
									}
								}
							}
						} else {
							// No tool calls, just add the response to history
							this.history.push({
								role: 'model',
								parts: [{ text: accumulatedText }]
							});
							
							yield { text: accumulatedText, done: true };
						}
					}
				}
				
				// Add user message to history
				this.history.push({
					role: 'user',
					parts: [{ text: userMessage }]
				});
				
				return; // Exit early for Direct API
			} else if (this.googleGenAI) {
				// ✅ CRITICAL FIX: tools and toolConfig go in config, not at root level!
				const config: any = {
					temperature: this.settings.temperature,
					maxOutputTokens: this.settings.maxTokens,
				};
				
				if (this.tools.length > 0) {
					config.tools = this.tools;
					config.toolConfig = {
						functionCallingConfig: {
							mode: 'AUTO'
						}
					};
					
					// 🔍 DEBUG: Log full tool structure
				Logger.debug('DEBUG', '🛠️  Tools in config:', JSON.stringify(this.tools, null, 2));
				Logger.debug('DEBUG', 'Tool count:', this.tools[0]?.functionDeclarations?.length);
					Logger.debug('DEBUG', 'First tool:', this.tools[0]?.functionDeclarations?.[0]?.name);
				}
				
				const params: any = {
					model: effectiveModel,
					contents: contents,
					config: config  // ← Tools are IN the config object!
				};
				
				// 🔍 DEBUG: Log full request params
				Logger.debug('DEBUG', '📤 Full SDK request params:');
				Logger.debug('DEBUG', 'Model:', params.model);
				Logger.debug('DEBUG', 'Config has tools:', !!params.config?.tools);
				Logger.debug('DEBUG', 'Config has toolConfig:', !!params.config?.toolConfig);
				Logger.debug('DEBUG', 'Contents count:', params.contents?.length);
				
				stream = await this.googleGenAI.models.generateContentStream(params);
			} else {
				throw new Error('No API client available');
			}

			Logger.debug('Gemini', '✅ Stream started successfully');
			Logger.debug('Gemini', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('Gemini', '📥 PROCESSING RESPONSE:');
			Logger.debug('Gemini', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

			for await (const chunk of stream) {
				Logger.debug('Gemini', 'Received chunk:', chunk);

				const candidateContent = chunk.candidates?.[0]?.content;
				if (!candidateContent) continue;

				Logger.debug('Gemini', 'Candidate content:', candidateContent);
				const parts = candidateContent.parts;
				Logger.debug('Gemini', 'Parts count:', parts?.length || 0);

				// 🔍 DEBUG: Inspect each part in detail
				for (let i = 0; i < (parts?.length || 0); i++) {
					const part = parts[i];
					Logger.debug('DEBUG', `🔍 Part ${i}:`, {
						hasText: !!part.text,
						hasFunctionCall: !!part.functionCall,
						hasFunctionResponse: !!part.functionResponse,
						hasExecutableCode: !!part.executableCode,
						keys: Object.keys(part)
					});
					if (part.text) {
						Logger.debug('DEBUG', `Text preview: "${part.text.substring(0, 100)}"`);
					}
					if (part.functionCall) {
						Logger.debug('DEBUG', `Function call name: ${part.functionCall.name}`);
					}
				}

				for (const part of parts || []) {
					if (part.text) {
						accumulatedText += part.text;
						yield {
							text: part.text,
							done: false
						};
					}

					if (part.functionCall) {
						Logger.debug('Gemini', '🔧 TOOL CALL:');
						Logger.debug('Gemini', 'Tool name:', part.functionCall.name);
						Logger.debug('Gemini', 'Tool args:', JSON.stringify(part.functionCall.args, null, 2));

						const toolCall: ToolCall = {
							name: part.functionCall.name,
							args: part.functionCall.args || {},
							status: 'pending'
						};

						currentToolCalls.push(toolCall);
					}
				}
			}

			Logger.debug('Gemini', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('Gemini', '✅ RESPONSE COMPLETE:');
			Logger.debug('Gemini', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			Logger.debug('Gemini', 'Total text length:', accumulatedText.length);
			Logger.debug('Gemini', 'Tool calls:', currentToolCalls.length);
			Logger.debug('Gemini', 'History length (before update):', this.history.length);
			Logger.debug('Gemini', 'Full response preview:', accumulatedText.substring(0, 200));

			// Add user message to history ONCE (following gemini-cli pattern - line 257 in geminiChat.ts)
			this.history.push({
				role: 'user',
				parts: [{ text: userMessage }]
			});

			// Collect all model response parts (text + tool calls)
			const modelResponseParts: Part[] = [];
			
			// Add text part if we have any
			if (accumulatedText) {
				modelResponseParts.push({ text: accumulatedText });
			}
			
			// Add function call parts if we have any
			for (const toolCall of currentToolCalls) {
				modelResponseParts.push({
					functionCall: {
						name: toolCall.name,
						args: toolCall.args
					}
				});
			}

			// Add model response with all parts to history (following gemini-cli pattern - line 583 in geminiChat.ts)
			if (modelResponseParts.length > 0) {
				this.history.push({
					role: 'model',
					parts: modelResponseParts
				});
			}

			Logger.debug('Gemini', 'Added user message and model response to history');
			Logger.debug('Gemini', 'History length (after update):', this.history.length);

			if (currentToolCalls.length > 0) {
				yield {
					text: accumulatedText,
					done: false,
					toolCalls: currentToolCalls
				};

				for (let turn = 1; turn <= 10; turn++) {
					Logger.debug('Gemini', `🔄 Turn ${turn}: Tool responses present, making follow-up call...`);

					const toolResponses: Array<{name: string; response: any}> = [];
					
					for (const toolCall of currentToolCalls) {
						Logger.debug('Gemini', '🔧 Follow-up tool call:', toolCall.name);

						// Check tool permission (works for both normal tools and MCP tools)
						const toolPermission = this.settings.toolPermissions[toolCall.name as keyof typeof this.settings.toolPermissions];
						
						Logger.debug('Gemini', 'Tool permission:', toolPermission);

						let approved: boolean;
						
						// Apply tool permission
						if (toolPermission === 'always') {
							Logger.debug('Gemini', '✅ Tool always allowed by permission');
							approved = true;
						} else if (toolPermission === 'never') {
							Logger.debug('Gemini', '❌ Tool never allowed by permission');
							approved = false;
						} else {
							// Permission is 'ask' - request user approval
							if (this.toolApprovalHandler) {
								Logger.debug('Gemini', 'Requesting user approval for tool:', toolCall.name);
								approved = await this.toolApprovalHandler(toolCall.name, toolCall.args);
							} else {
								Logger.debug('Gemini', '⚠️  No approval handler, rejecting tool');
								approved = false;
							}
						}

						if (approved) {
							Logger.debug('Gemini', '✅ Executing tool:', toolCall.name);

							toolCall.status = 'approved';
							const toolResult = await this.executeTool(toolCall.name, toolCall.args);
							toolCall.status = 'executed';
							toolCall.result = toolResult;

							Logger.debug('Gemini', 'Tool result:', toolResult.substring(0, 200) + (toolResult.length > 200 ? '...' : ''));

							toolResponses.push({
								name: toolCall.name,
								response: { result: toolResult }
							});
						} else {
							Logger.debug('Gemini', 'Tool rejected by user');
							toolCall.status = 'rejected';
							toolCall.error = 'User rejected tool execution';

							toolResponses.push({
								name: toolCall.name,
								response: { error: 'User rejected tool execution' }
							});
						}
					}

					// Add tool responses to history as USER message (following gemini-cli pattern)
					// In gemini-cli, function responses are sent via sendMessageStream as user messages
					// This is how the model receives the tool results
					this.history.push({
						role: 'user',
						parts: toolResponses.map(tr => ({
							functionResponse: tr
						}))
					});

					Logger.debug('Gemini', 'Added tool responses to history as user message');
					Logger.debug('Gemini', '🔍 History before follow-up (last 2 items):', JSON.stringify(this.history.slice(-2), null, 2));

					const clonedHistory = this.history.map(content => ({
						role: content.role,
						parts: content.parts?.map(part => {
							if (part.text !== undefined) return { text: part.text };
							if (part.functionCall) return { 
								functionCall: {
									name: part.functionCall.name,
									args: part.functionCall.args
								}
							};
							if (part.functionResponse) return {
								functionResponse: {
									name: part.functionResponse.name,
									response: part.functionResponse.response
								}
							};
							return { ...part };
						}) || []
					}));

					Logger.debug('Gemini', '📥 Processing follow-up response...');

					let followUpText = '';
					let followUpToolCalls: ToolCall[] = [];

					let followUpStream;
					if (usingDirectAPI) {
						// Direct API (OAuth) uses non-streaming generateContent
						const followUpResponse = await this.directAPIClient!.generateContent(
							effectiveModel,
							clonedHistory as Content[],
							systemPrompt,
							this.tools,
							{
								temperature: this.settings.temperature,
								maxOutputTokens: this.settings.maxTokens
							}
						);
						
						// Process Direct API follow-up response directly
						if (followUpResponse.candidates && followUpResponse.candidates.length > 0) {
							const candidate = followUpResponse.candidates[0];
							if (candidate.content && candidate.content.parts) {
								let followUpText = '';
								for (const part of candidate.content.parts) {
									if (part.text) {
										followUpText += part.text;
									}
								}
								
								if (followUpText) {
									// Add follow-up response to history
									this.history.push({
										role: 'model',
										parts: [{ text: followUpText }]
									});
									
									yield { text: followUpText, done: true };
								}
							}
						}
						return; // Exit early for Direct API
					} else if (this.googleGenAI) {
						// ✅ CRITICAL FIX: tools and toolConfig go in config, not at root level!
						const followUpConfig: any = {
							temperature: this.settings.temperature,
							maxOutputTokens: this.settings.maxTokens,
						};
						
						if (this.tools.length > 0) {
							followUpConfig.tools = this.tools;
							followUpConfig.toolConfig = {
								functionCallingConfig: {
									mode: 'AUTO'
								}
							};
						}
						
						const followUpParams: any = {
							model: effectiveModel,
							contents: clonedHistory as Content[],
							config: followUpConfig  // ← Tools are IN the config object!
						};
						
						followUpStream = await this.googleGenAI.models.generateContentStream(followUpParams);
					} else {
						throw new Error('No API client available');
					}

					for await (const followUpChunk of followUpStream) {
						const followUpContent = followUpChunk.candidates?.[0]?.content;
						if (!followUpContent) continue;

						for (const part of followUpContent.parts || []) {
							if (part.text) {
								followUpText += part.text;
								yield {
									text: part.text,
									done: false
								};
							}

							if (part.functionCall) {
								followUpToolCalls.push({
									name: part.functionCall.name,
									args: part.functionCall.args || {},
									status: 'pending'
								});
							}
						}
					}

					Logger.debug('Gemini', '✅ Follow-up turn complete');
					Logger.debug('Gemini', 'Follow-up text length:', followUpText.length);
					Logger.debug('Gemini', 'Follow-up parts:', followUpToolCalls.length);

					// Add follow-up model response to history (text + any new tool calls)
					const followUpParts: Part[] = [];
					if (followUpText) {
						followUpParts.push({ text: followUpText });
					}
					for (const toolCall of followUpToolCalls) {
						followUpParts.push({
							functionCall: {
								name: toolCall.name,
								args: toolCall.args
							}
						});
					}
					
					if (followUpParts.length > 0) {
						this.history.push({
							role: 'model',
							parts: followUpParts
						});
						Logger.debug('Gemini', 'Added follow-up model response to history');
					}

					if (followUpToolCalls.length === 0) {
						Logger.debug('Gemini', 'No more tool calls, ending loop');
						break;
					}

					currentToolCalls = followUpToolCalls;
				}
			}

			yield {
				text: accumulatedText,
				done: true
			};

		Logger.debug('Gemini', 'Final conversation history has', this.history.length, 'items');
		Logger.separator('Gemini');

		} catch (error: any) {
			Logger.error('Gemini', 'Error in sendMessage:', error);
			
			yield {
				text: '',
				done: true
			};

			throw error;
		}
	}

	/**
	 * Sanitize file path to ensure it's valid for all operating systems
	 * Removes or replaces invalid characters: / \ : * ? " < > |
	 */
	private sanitizeFilePath(filePath: string): string {
		// Split path into directory and filename
		const parts = filePath.split('/');
		const fileName = parts.pop() || '';
		const directory = parts.join('/');
		
		// Sanitize filename (the part that becomes the note title)
		// Replace invalid characters with safe alternatives
		let sanitized = fileName
			.replace(/[:\\]/g, '-')        // Replace : and \ with -
			.replace(/[*?"<>|]/g, '')      // Remove other invalid chars
			.replace(/\s+/g, ' ')          // Normalize whitespace
			.trim();
		
		// Ensure filename doesn't start or end with dots or spaces
		sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, '');
		
		// If filename is empty after sanitization, use a default
		if (!sanitized) {
			sanitized = 'Untitled';
		}
		
		// Ensure .md extension
		if (!sanitized.endsWith('.md')) {
			sanitized += '.md';
		}
		
		// Reconstruct full path
		return directory ? `${directory}/${sanitized}` : sanitized;
	}

	private async buildContext(): Promise<{
		osInfo: { platform: string; arch: string; nodeVersion: string };
		vaultStats: { totalFiles: number; totalFolders: number; vaultSize: string };
		openFiles: string[];
		recentFiles: string[];
		pluginConfig: { model: string; temperature: number; maxTokens: number; logLevel: string };
		vaultStructure: string;
		tags: string[];
	}> {
		const context = this.settings.contextSettings;
		
		// OS and Environment Info (always enabled)
		const osInfo = {
			platform: process.platform,
			arch: process.arch,
			nodeVersion: process.version
		};

		// Vault Statistics (always enabled)
		const vaultStats = {
			totalFiles: this.app.vault.getMarkdownFiles().length,
			totalFolders: this.app.vault.getAllFolders().length,
			vaultSize: await this.getVaultSize()
		};

		// Currently Open Files (always enabled)
		const openFiles = this.app.workspace.getLeavesOfType('markdown')
			.map(leaf => (leaf.view as any).file)
			.filter(file => file && file.path)
			.map(file => file.path);

		// Recent Files (always enabled)
		const recentFiles = (await this.vaultTools.getRecentFiles(context.recentFilesCount, context.recentFilesHours))
			.split('\n')
			.filter(line => line.includes('**[['))
			.map(line => {
				const match = line.match(/\*\*\[\[([^\]]+)\]\]\*\*/);
				return match ? match[1] : null;
			})
			.filter(Boolean) as string[];

		// Plugin Configuration (always enabled)
		const pluginConfig = {
			model: this.settings.model,
			temperature: this.settings.temperature,
			maxTokens: this.settings.maxTokens,
			logLevel: this.settings.logLevel
		};

		// Vault Structure (always enabled, limited to avoid token bloat)
		const vaultStructure = await this.getVaultStructure(context.maxVaultStructureItems);

		// Tags (always enabled)
		const tags = await this.getVaultTags();

		return {
			osInfo,
			vaultStats,
			openFiles,
			recentFiles,
			pluginConfig,
			vaultStructure,
			tags
		};
	}

	private async getVaultSize(): Promise<string> {
		try {
			// Get approximate vault size by summing file sizes
			let totalSize = 0;
			const files = this.app.vault.getFiles();
			
			for (const file of files) {
				const stat = await this.app.vault.adapter.stat(file.path);
				if (stat && stat.size) {
					totalSize += stat.size;
				}
			}
			
			// Convert to human readable format
			if (totalSize < 1024) return `${totalSize} B`;
			if (totalSize < 1024 * 1024) return `${(totalSize / 1024).toFixed(1)} KB`;
			if (totalSize < 1024 * 1024 * 1024) return `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
			return `${(totalSize / (1024 * 1024 * 1024)).toFixed(1)} GB`;
		} catch (error) {
			Logger.debug('Context', 'Failed to calculate vault size:', error);
			return 'Unknown';
		}
	}

	private async getVaultStructure(maxItems: number = 50): Promise<string> {
		try {
			const folders = this.app.vault.getAllFolders();
			const files = this.app.vault.getMarkdownFiles();
			
			// Build a tree structure (limited to avoid token bloat)
			let structure = '';
			let itemCount = 0;
			
			// Add folders first
			for (const folder of folders) {
				if (itemCount >= maxItems) break;
				if (folder.path === '') continue; // Skip root
				
				structure += `📁 ${folder.path}/\n`;
				itemCount++;
			}
			
			// Add some key files
			for (const file of files) {
				if (itemCount >= maxItems) break;
				
				// Prioritize important files
				const isImportant = file.basename.toLowerCase().includes('index') ||
								   file.basename.toLowerCase().includes('readme') ||
								   file.basename.toLowerCase().includes('home') ||
								   file.path.split('/').length <= 2; // Root level files
				
				if (isImportant || itemCount < 20) {
					structure += `📄 ${file.path}\n`;
					itemCount++;
				}
			}
			
			if (itemCount >= maxItems) {
				structure += `\n... and ${files.length + folders.length - itemCount} more items`;
			}
			
			return structure || 'Empty vault';
		} catch (error) {
			Logger.debug('Context', 'Failed to build vault structure:', error);
			return 'Unable to load vault structure';
		}
	}

	private async getVaultTags(): Promise<string[]> {
		try {
			const files = this.app.vault.getMarkdownFiles();
			const tagSet = new Set<string>();
			
			for (const file of files) {
				const content = await this.app.vault.read(file);
				// Extract tags from content (both #tag and [[tag]] formats)
				const tagMatches = content.match(/#[\w\-/]+/g) || [];
				const linkMatches = content.match(/\[\[([^\]]+)\]\]/g) || [];
				
				tagMatches.forEach(tag => tagSet.add(tag));
				linkMatches.forEach(link => {
					const tag = link.replace(/\[\[|\]\]/g, '');
					if (tag.includes('/')) {
						// This is a link to a file, not a tag
						return;
					}
					tagSet.add(`#${tag}`);
				});
			}
			
			// Convert to array and sort
			return Array.from(tagSet).sort();
		} catch (error) {
			Logger.debug('Context', 'Failed to get vault tags:', error);
			return [];
		}
	}

	private async buildSystemPrompt(): Promise<string> {
		const vaultName = this.vaultPath.split('/').pop() || 'vault';
		const currentDate = new Date().toISOString().split('T')[0];
		const currentTime = new Date().toLocaleTimeString();
		
		const memoriesText = this.memoryManager.getMemoriesAsText();
		
		// Build comprehensive context
		const context = await this.buildContext();

		let prompt = `You are an interactive assistant specializing in knowledge management and note-taking within Obsidian. Your primary goal is to help users efficiently access and organize their notes, adhering strictly to the following instructions and utilizing your available tools.

# Current Context
- Vault: ${vaultName}
- Vault path: ${this.vaultPath}
- Date: ${currentDate}
- Time: ${currentTime}`;

		// Add OS info (always enabled)
		prompt += `
- Operating System: ${context.osInfo.platform} (${context.osInfo.arch})
- Node.js Version: ${context.osInfo.nodeVersion}`;

		// Add vault stats (always enabled)
		prompt += `

# Vault Information
- Total Files: ${context.vaultStats.totalFiles}
- Total Folders: ${context.vaultStats.totalFolders}
- Vault Size: ${context.vaultStats.vaultSize}`;

		// Add open files (always enabled)
		if (context.openFiles.length > 0) {
			prompt += `

# Currently Open Files
${context.openFiles.map(file => `- ${file}`).join('\n')}`;
		}

		// Add recent files (always enabled)
		if (context.recentFiles.length > 0) {
			prompt += `

# Recent Files
${context.recentFiles.slice(0, 5).map(file => `- ${file}`).join('\n')}`;
		}

		// Add plugin config (always enabled)
		prompt += `

# Plugin Configuration
- Model: ${context.pluginConfig.model}
- Temperature: ${context.pluginConfig.temperature}
- Max Tokens: ${context.pluginConfig.maxTokens}
- Log Level: ${context.pluginConfig.logLevel}`;

		// Add vault structure (always enabled)
		if (context.vaultStructure) {
			prompt += `

# Vault Structure
${context.vaultStructure}`;
		}

		// Add tags (always enabled)
		if (context.tags.length > 0) {
			prompt += `

# Vault Tags
${context.tags.slice(0, 20).join(', ')}${context.tags.length > 20 ? ` (and ${context.tags.length - 20} more)` : ''}`;
		}

		if (memoriesText) {
			prompt += `\n\n# User Memories\n${memoriesText}`;
		}

		prompt += `

# Core Mandates

- **Tool Usage:** You cannot access files directly. You MUST use the provided tools to read file content.
- **Proactiveness:** Fulfill the user's request thoroughly using the available tools.
- **Explaining Actions:** After completing a task *do not* provide summaries unless asked.

# Primary Workflows

## When Asked About File Content
When requested to read, summarize, or analyze files, follow this sequence:
1. **Understand:** Think about the user's request and which files are relevant. Use 'list_files' to discover available files if needed.
2. **Read:** Use 'read_file' to get the actual content of the relevant file(s). Remember: 'list_files' only gives you filenames, NOT content.
3. **Answer:** Provide your response based on the file content you read.

# Operational Guidelines

## Tone and Style
- **Professional & Direct:** Adopt a professional, direct tone.
- **Comprehensive Responses:** Provide thorough, detailed responses when summarizing content or analyzing files. Don't hold back on important details.
- **No Chitchat:** Avoid conversational filler, preambles ("Okay, I will now..."), or postambles ("I have finished..."). Get straight to the answer.
- **Formatting:** Use Markdown. When referencing notes, use [[WikiLinks]] format. Use headings, lists, and formatting to organize longer summaries.

## Tool Usage
- **File Paths:** Use relative paths from the vault root (e.g., 'folder/note.md', not absolute paths).
- **File Names:** When creating files, use descriptive names without invalid characters. Avoid: / \\ : * ? " < > |
  - The filename becomes the note title in Obsidian
  - Good: "Meeting Notes 2024-03.md", "Project Ideas.md"
  - Bad: "Notes: Today.md" (contains :), "What/Why.md" (contains /)
- **Parallelism:** Execute multiple independent tool calls in parallel when feasible.
- **Respect User Confirmations:** Write operations require user confirmation. If a user cancels a tool call, respect their choice and do not try again unless explicitly requested.

## Web Search and Citations
- **google_web_search:** When using web search, the tool provides sources at the bottom of the response.
- **Inline Citations:** Always include inline citations using superscript numbers (¹, ², ³, etc.) in your response text to reference the sources.
- **Citation Format:** Use superscript numbers (¹²³⁴⁵⁶⁷⁸⁹) that correspond to the numbered sources listed at the bottom.
- **Example:** "According to recent research¹, AI development has accelerated significantly. The trend analysis² shows..."

# Examples

<example>
user: show me a summary of the first md file you find
assistant: [tool_call: list_files]
(After receiving the list)
[tool_call: read_file for first file from the list]
(After reading content)
# Summary of [[file-name]]

[Provides a comprehensive, well-structured summary with:
- Main topic and purpose
- Key points organized with headings and bullet points
- Important details and context
- Relevant sections broken down clearly]
</example>

<example>
user: summarize content from https://example.com
assistant: [tool_call: web_fetch]
(After fetching content)
# Summary of https://example.com

[Provides a detailed summary with:
- Main topics covered
- Key information organized with headings
- Important details and data points
- Well-formatted with Markdown for readability]
</example>

<example>
user: list files here
assistant: [tool_call: list_files]
</example>

<example>
user: what's in my notes about project X?
assistant: [tool_call: search_vault with query="project X"]
(After getting search results showing project-X-notes.md)
[tool_call: read_file for 'project-X-notes.md']
(After reading)
# Project X Notes

[Provides organized summary of the content with relevant structure and details]
</example>

<example>
user: find files about testing
assistant: [tool_call: search_vault with query="testing"]
(Shows matching files with context snippets)
</example>

<example>
user: search for latest AI developments
assistant: [tool_call: google_web_search]
(After receiving search results with sources)
# Latest AI Developments

According to recent research¹, AI development has accelerated significantly in 2024. The trend analysis² shows that generative AI models are becoming more sophisticated, with major advances in reasoning capabilities³.

Key developments include:
- **AI Agents and Autonomy:** Major shift towards autonomous AI agents¹
- **Enhanced Models:** Smarter AI with advanced reasoning in mathematics and coding²
- **Industry Integration:** Over 70% of organizations seeing ROI from generative AI¹

The regulatory landscape is also evolving, with the EU AI Act⁴ establishing comprehensive rules for AI use.

[Provides detailed summary with inline superscript citations ¹²³⁴ referencing the sources listed at the bottom]
</example>

# Critical Rules
- You CANNOT see file content without using 'read_file'
- **Finding Files**: Use 'search_vault' to find files/folders by name or content - it's faster and more powerful than 'list_files'
  - Use 'list_files' only for browsing a specific directory structure
  - For "find", "search", "show me files about X" → use 'search_vault'
- 'list_files' returns ONLY filenames - always follow up with 'read_file' when content is needed
- Use tools actively and in sequence to complete tasks
- Be direct and action-oriented
- **Remembering Facts:** Use the 'save_memory' tool to remember specific, *user-related* facts or preferences when the user explicitly asks, or when they state a clear, concise piece of information that would help personalize or streamline *your future interactions with them* (e.g., preferred coding style, project details, personal preferences). This tool is for user-specific information that should persist across sessions. Do *not* use it for general project context. If unsure whether to save something, you can ask the user, "Should I remember that for you?"`;
		
		return prompt;
	}

	clearHistory(): void {
		this.history = [];
	}

	getHistory(): Content[] {
		return [...this.history];
	}

	isReady(): boolean {
		if (this.settings.useOAuth) {
			return !!this.settings.oauthAccessToken;
		}
		return this.settings.apiKey !== '';
	}

	async getVaultContext(): Promise<string> {
		try {
			const files = await this.vaultAdapter.listFiles();
			return `Vault contains ${files.length} files:\n${files.slice(0, 20).join('\n')}${files.length > 20 ? '\n...' : ''}`;
		} catch (error) {
			return `Error getting vault context: ${error.message}`;
		}
	}
}
