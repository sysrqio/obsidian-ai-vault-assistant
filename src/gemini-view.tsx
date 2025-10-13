import { ItemView, WorkspaceLeaf } from 'obsidian';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { ChatInterface } from './ui/chat-interface';
import type { GeminiClient, Message } from './gemini-client';
import { Logger } from './utils/logger';
import type GeminiPlugin from './main';
import { ToolConfirmationModal, ToolConfirmationData } from './tool-confirmation-modal';

export const VIEW_TYPE_GEMINI = 'gemini-assistant-view';

export class GeminiView extends ItemView {
	private geminiClient: GeminiClient;
	private plugin: GeminiPlugin;
	private root: ReactDOM.Root | null = null;
	private messages: Message[] = [];
	private isLoading = false;

	constructor(leaf: WorkspaceLeaf, geminiClient: GeminiClient, plugin: GeminiPlugin) {
		super(leaf);
		this.geminiClient = geminiClient;
		this.plugin = plugin;

		this.geminiClient.setToolApprovalHandler(this.handleToolApproval.bind(this));
	}

	getViewType(): string {
		return VIEW_TYPE_GEMINI;
	}

	getDisplayText(): string {
		return 'AI Vault Assistant';
	}

	getIcon(): string {
		return 'message-circle';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		try {
			await this.geminiClient.initialize();
		} catch (error) {
			Logger.error('Error', 'Failed to initialize Gemini client:', error);
		}

		this.root = ReactDOM.createRoot(container);
		this.render();
	}

	async onClose() {
		if (this.root) {
			this.root.unmount();
		}
	}

	setGeminiClient(client: GeminiClient): void {
		this.geminiClient = client;
		this.geminiClient.setToolApprovalHandler(this.handleToolApproval.bind(this));
		this.render();
	}

	private render(): void {
		if (!this.root) return;

		this.root.render(
			React.createElement(ChatInterface, {
				messages: this.messages,
				isLoading: this.isLoading,
				onSendMessage: this.handleSendMessage.bind(this),
				onClearChat: this.handleClearChat.bind(this),
				isReady: this.geminiClient?.isReady() || false,
				onShowTools: this.handleShowTools.bind(this),
				renderMarkdown: this.plugin.settings.renderMarkdown,
				component: this
			})
		);
	}

	private async handleSendMessage(message: string): Promise<void> {
		Logger.debug('View', 'Sending message:', message);

		// Check for special commands
		if (message.trim() === '/memories') {
			this.handleShowMemories();
			return;
		}

		const userMessage: Message = {
			id: 'user-' + Date.now(),
			role: 'user',
			content: message,
			timestamp: Date.now()
		};

		this.messages.push(userMessage);
		this.isLoading = true;
		this.render();

		let currentMessage: Message | null = null;

		try {
			for await (const chunk of this.geminiClient.sendMessage(message)) {
				if (chunk.text) {
					// If we have text and no current message, or if current message already has tool calls, create new message
					if (!currentMessage || currentMessage.toolCalls) {
						currentMessage = {
							id: 'assistant-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
							role: 'assistant',
							content: '',
							timestamp: Date.now()
						};
						this.messages.push(currentMessage);
					}
					currentMessage.content += chunk.text;
					this.render();
				}

				if (chunk.toolCalls && chunk.toolCalls.length > 0) {
					// If we have tool calls and no current message, or if current message already has text, create new message
					if (!currentMessage || currentMessage.content) {
						currentMessage = {
							id: 'assistant-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
							role: 'assistant',
							content: '',
							timestamp: Date.now()
						};
						this.messages.push(currentMessage);
					}
					currentMessage.toolCalls = chunk.toolCalls;
					this.render();
				}
			}

			this.isLoading = false;
			this.render();

		} catch (error: any) {
			Logger.error('View', 'Error sending message:', error);
			
			const errorMessage: Message = {
				id: 'error-' + Date.now(),
				role: 'system',
				content: '❌ Error: ' + error.message,
				timestamp: Date.now()
			};

			this.messages.push(errorMessage);
			this.isLoading = false;
			this.render();
		}
	}

	private async handleToolApproval(
		toolName: string,
		args: Record<string, any>
	): Promise<boolean> {
		const settings = this.plugin.settings;
		const permission = settings.toolPermissions[toolName as keyof typeof settings.toolPermissions];
		
		if (permission) {
			switch (permission) {
				case 'always':
					Logger.debug('View', '' + toolName + ' always allowed');
					return true;
				case 'never':
					Logger.debug('View', '' + toolName + ' never allowed');
					return false;
				case 'ask':
				default:
					break;
			}
		}

		return new Promise((resolve) => {
			const data: ToolConfirmationData = {
				toolName,
				args,
				description: this.getToolDescription(toolName)
			};

			Logger.debug('View', 'Creating tool confirmation modal for:', toolName, 'with args:', args);

			const modal = new ToolConfirmationModal(
				this.app,
				data,
				async (rememberChoice?: 'always' | 'never') => {
					Logger.debug('View', 'Tool approved:', toolName);
					
					if (rememberChoice && settings.toolPermissions[toolName as keyof typeof settings.toolPermissions] !== undefined) {
						Logger.debug('View', 'Saving ' + toolName + ' preference:', rememberChoice);
						settings.toolPermissions[toolName as keyof typeof settings.toolPermissions] = rememberChoice;
						await this.plugin.saveSettings();
					}
					
					if (rememberChoice !== 'never') {
						resolve(true);
					}
				},
				() => {
					Logger.debug('View', 'Tool rejected:', toolName);
					resolve(false);
				}
			);

			Logger.debug('View', 'Opening modal...');
			modal.open();
		});
	}

	private getToolDescription(toolName: string): string {
		const descriptions: Record<string, string> = {
			'read_file': 'Read the contents of a file from your vault',
			'list_files': 'List files in your vault or a specific directory',
			'read_many_files': 'Read content from multiple files using glob patterns',
			'write_file': 'Create or overwrite a file in your vault',
			'edit_file': 'Make targeted edits to a file in your vault',
			'search_files': 'Search for files matching a pattern',
			'web_fetch': 'Fetch content from URLs on the internet',
			'google_web_search': 'Search the web using Google Search with grounded citations',
			'save_memory': 'Save important information to long-term memory for future sessions'
		};
		return descriptions[toolName] || 'Execute a tool operation';
	}

	private handleShowTools(): void {
		Logger.debug('View', 'Showing tools list');
		
		const toolsList = '# 🔧 Available Tools (26 Total)\n\n' +
		'## 📁 **File Operations** (5)\n' +
		'- **read_file** - Read file contents\n' +
		'- **list_files** - List files in vault/directory\n' +
		'- **read_many_files** - Read multiple files with glob patterns\n' +
		'- **write_file** - Create/overwrite files (auto-sanitizes filenames)\n' +
		'- **web_fetch** - Fetch content from URLs\n\n' +
		
		'## 🌐 **Web & Search** (1)\n' +
		'- **google_web_search** - Search with grounded citations (superscript format)\n\n' +
		
		'## 🧠 **Memory** (2)\n' +
		'- **save_memory** - Save facts to long-term memory\n' +
		'- **delete_memory** - Remove incorrect/outdated memories\n\n' +
		
		'## 🧭 **Vault Navigation** (4)\n' +
		'- **get_active_file** - Info about currently open file\n' +
		'- **open_file** - Open a file (current pane or new pane)\n' +
		'- **search_vault** - Full-text search (uses Omnisearch if available)\n' +
		'- **get_recent_files** - Recently modified files\n\n' +
		
		'## 🔗 **Links & Graph** (3)\n' +
		'- **get_backlinks** - Files that link TO this file\n' +
		'- **get_outgoing_links** - Files this file links TO\n' +
		'- **get_graph_neighbors** - All connected notes (both directions)\n\n' +
		
		'## 🗂 **File Management** (4)\n' +
		'- **rename_file** - Rename with auto-backlink updates\n' +
		'- **create_folder** - Create new folder (recursive)\n' +
		'- **move_file** - Move to different folder\n' +
		'- **delete_file** - Delete (trash or permanent)\n\n' +
		
		'## 📊 **Metadata** (3)\n' +
		'- **get_file_metadata** - Comprehensive file metadata\n' +
		'- **update_frontmatter** - Add/update YAML frontmatter\n' +
		'- **get_tags** - List all tags (vault or file)\n\n' +
		
		'## 📝 **Workflows** (2)\n' +
		'- **get_daily_note** - Open/create today\'s daily note\n' +
		'- **create_from_template** - Create from template with variables\n\n' +
		
		'## 🪟 **Workspace** (2)\n' +
		'- **get_workspace_layout** - View open panes\n' +
		'- **create_pane** - Create new split (vertical/horizontal)\n\n' +
		
		'## 💡 **Usage Tips**\n' +
		'- **Natural language**: Just ask naturally - "What am I working on?" or "Find notes about X"\n' +
		'- **Context aware**: I know what file you\'re viewing and your recent activity\n' +
		'- **Smart permissions**: Read-only tools auto-execute, write operations ask first\n' +
		'- **Safe filenames**: I automatically sanitize filenames (remove `:`, `/`, `\\`, etc.)\n\n' +
		
		'**Commands**: Type `/tools` to see this • Type `/memories` to view saved memories';

		const toolsMessage: Message = {
			id: 'tools-' + Date.now(),
			role: 'system',
			content: toolsList,
			timestamp: Date.now()
		};

		this.messages.push(toolsMessage);
		this.render();
		
		// Ensure scroll to bottom after tools message is added
		setTimeout(() => {
			const messagesContainer = this.containerEl.querySelector('.gemini-messages') as HTMLElement;
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		}, 100);
	}

	private handleShowMemories(): void {
		Logger.debug('View', 'Showing memories');
		
		const memoryManager = this.geminiClient.getMemoryManager();
		const memories = memoryManager.getMemories();
		
		let memoriesText = '# 🧠 Saved Memories\n\n';
		
		if (memories.length === 0) {
			memoriesText += '*No memories saved yet.*\n\n';
			memoriesText += 'Ask me to remember something by saying:\n';
			memoriesText += '- "Remember that my name is..."\n';
			memoriesText += '- "Save the fact that I prefer..."\n';
			memoriesText += '- "Keep in mind that my project..."\n\n';
		} else {
			memoriesText += `You have **${memories.length}** saved ${memories.length === 1 ? 'memory' : 'memories'}:\n\n`;
			
			// Group memories by category
			const categorized: Record<string, typeof memories> = {};
			const uncategorized: typeof memories = [];
			
			memories.forEach(memory => {
				if (memory.category) {
					if (!categorized[memory.category]) {
						categorized[memory.category] = [];
					}
					categorized[memory.category].push(memory);
				} else {
					uncategorized.push(memory);
				}
			});
			
			// Display categorized memories
			Object.keys(categorized).sort().forEach(category => {
				memoriesText += `## 📁 ${category}\n\n`;
				categorized[category].forEach(memory => {
					const date = new Date(memory.timestamp).toLocaleDateString();
					memoriesText += `- ${memory.fact} *(${date})*\n`;
				});
				memoriesText += '\n';
			});
			
			// Display uncategorized memories
			if (uncategorized.length > 0) {
				memoriesText += `## 📝 Other\n\n`;
				uncategorized.forEach(memory => {
					const date = new Date(memory.timestamp).toLocaleDateString();
					memoriesText += `- ${memory.fact} *(${date})*\n`;
				});
				memoriesText += '\n';
			}
		}
		
		memoriesText += '---\n\n';
		memoriesText += '*To manage memories, go to Settings → AI Vault Assistant → Memories*\n';
		memoriesText += '*Type `/tools` to see available tools*';
		
		const memoriesMessage: Message = {
			id: 'memories-' + Date.now(),
			role: 'system',
			content: memoriesText,
			timestamp: Date.now()
		};

		this.messages.push(memoriesMessage);
		this.render();

		// Ensure scroll to bottom
		setTimeout(() => {
			const messagesContainer = this.containerEl.querySelector('.gemini-messages') as HTMLElement;
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		}, 100);
	}

	private handleClearChat(): void {
		Logger.debug('View', 'Clearing chat');
		this.messages = [];
		this.geminiClient.clearHistory();
		this.render();
	}
}
