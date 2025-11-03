import { App, Modal, Setting } from 'obsidian';
import * as React from 'react';
import { Logger } from './utils/logger';

export interface ToolConfirmationData {
	toolName: string;
	args: Record<string, any>;
	description: string;
}

export class ToolConfirmationModal extends Modal {
	private data: ToolConfirmationData;
	private onApprove: (rememberChoice?: 'always' | 'never') => Promise<void>;
	private onReject: () => void;
	private rememberChoice: 'once' | 'always' | 'never' = 'once';
	private toggles: { once: any; always: any; never: any } = { once: null, always: null, never: null };

	constructor(
		app: App,
		data: ToolConfirmationData,
		onApprove: (rememberChoice?: 'always' | 'never') => Promise<void>,
		onReject: () => void
	) {
		super(app);
		this.data = data;
		this.onApprove = onApprove;
		this.onReject = onReject;
	}

	private handleReject() {
		Logger.debug('Modal', 'User rejected:', this.data.toolName);
		Logger.debug('Modal', 'Remember choice:', this.rememberChoice);
		
		if (this.rememberChoice === 'never') {
			this.onApprove('never').then(() => {
				this.onReject();
				this.close();
			});
		} else {
			this.onReject();
			this.close();
		}
	}

	onOpen() {
		const { contentEl } = this;
		
		// Handle ESC key to reject
		this.scope.register([], 'Escape', () => {
			Logger.debug('Modal', 'ESC key pressed, rejecting tool');
			this.handleReject();
			return false;
		});
		
		Logger.debug('Modal', 'Opening tool confirmation modal for:', this.data.toolName);

		contentEl.empty();
		contentEl.addClass('tool-confirmation-modal');

		contentEl.createEl('h2', { text: '🔧 Tool Execution Request' });

		const warningEl = contentEl.createDiv({ cls: 'tool-confirmation-warning' });
		if (this.data.toolName === 'web_fetch') {
			warningEl.createEl('p', {
				text: '🌐 Gemini wants to fetch content from the internet.'
			});
		} else if (this.data.toolName === 'google_web_search') {
			warningEl.createEl('p', {
				text: '🔍 Gemini wants to search the web using Google Search.'
			});
		} else if (this.data.toolName === 'save_memory') {
			warningEl.createEl('p', {
				text: '🧠 Gemini wants to save information to long-term memory.'
			});
		} else if (this.data.toolName === 'read_many_files') {
			warningEl.createEl('p', {
				text: '📁 Gemini wants to read multiple files from your vault using glob patterns.'
			});
		} else if (this.data.toolName === 'write_file') {
			warningEl.createEl('p', {
				text: '⚠️ Gemini wants to execute a tool that will modify your vault.'
			});
		} else if (this.data.toolName === 'edit_file') {
			warningEl.createEl('p', {
				text: '✏️ Gemini wants to make semantic edits to a file (add to lists, insert at sections, replace patterns).'
			});
		} else {
			warningEl.createEl('p', {
				text: '🔧 Gemini wants to execute a tool operation.'
			});
		}

		const detailsEl = contentEl.createDiv({ cls: 'tool-confirmation-details' });
		
		new Setting(detailsEl)
			.setName('Tool')
			.setDesc(this.data.toolName)
			.setClass('tool-confirmation-setting');

		new Setting(detailsEl)
			.setName('Description')
			.setDesc(this.data.description)
			.setClass('tool-confirmation-setting');

		if (this.data.toolName === 'write_file') {
			if (this.data.args.file_path) {
				new Setting(detailsEl)
					.setName('📄 File Path')
					.setDesc(this.data.args.file_path as string)
					.setClass('tool-confirmation-setting');
			}
			if (this.data.args.content) {
				const contentPreview = (this.data.args.content as string).substring(0, 200);
				const suffix = (this.data.args.content as string).length > 200 ? '...' : '';
				new Setting(detailsEl)
					.setName('📝 Content Preview')
					.setDesc(contentPreview + suffix)
					.setClass('tool-confirmation-setting');
			}
		} else if (this.data.toolName === 'edit_file') {
			if (this.data.args.file_path) {
				new Setting(detailsEl)
					.setName('📄 File Path')
					.setDesc(this.data.args.file_path as string)
					.setClass('tool-confirmation-setting');
			}
			if (this.data.args.edit_mode) {
				new Setting(detailsEl)
					.setName('🔧 Edit Mode')
					.setDesc(this.data.args.edit_mode as string)
					.setClass('tool-confirmation-setting');
			}
			if (this.data.args.section_header) {
				new Setting(detailsEl)
					.setName('📍 Section')
					.setDesc(this.data.args.section_header as string)
					.setClass('tool-confirmation-setting');
			}
			if (this.data.args.list_item) {
				new Setting(detailsEl)
					.setName('📋 List Item')
					.setDesc(this.data.args.list_item as string)
					.setClass('tool-confirmation-setting');
			}
			if (this.data.args.content) {
				const contentPreview = (this.data.args.content as string).substring(0, 200);
				const suffix = (this.data.args.content as string).length > 200 ? '...' : '';
				new Setting(detailsEl)
					.setName('📝 Content')
					.setDesc(contentPreview + suffix)
					.setClass('tool-confirmation-setting');
			}
			if (this.data.args.search_pattern) {
				new Setting(detailsEl)
					.setName('🔍 Search Pattern')
					.setDesc(this.data.args.search_pattern as string)
					.setClass('tool-confirmation-setting');
			}
			if (this.data.args.replacement_text) {
				new Setting(detailsEl)
					.setName('🔄 Replacement')
					.setDesc(this.data.args.replacement_text as string)
					.setClass('tool-confirmation-setting');
			}
		} else if (this.data.toolName === 'web_fetch' && this.data.args.prompt) {
			const urls = (this.data.args.prompt as string).match(/(https?:\/\/[^\s]+)/g) || [];
			if (urls.length > 0) {
				new Setting(detailsEl)
					.setName('🌐 URLs to Fetch')
					.setDesc(urls.join(', '))
					.setClass('tool-confirmation-setting');
			}
		} else if (this.data.toolName === 'google_web_search' && this.data.args.query) {
			new Setting(detailsEl)
				.setName('🔍 Search Query')
				.setDesc(this.data.args.query as string)
				.setClass('tool-confirmation-setting');
		} else if (this.data.toolName === 'save_memory' && this.data.args.fact) {
			new Setting(detailsEl)
				.setName('🧠 Fact to Remember')
				.setDesc(this.data.args.fact as string)
				.setClass('tool-confirmation-setting');
			
			if (this.data.args.category) {
				new Setting(detailsEl)
					.setName('📂 Category')
					.setDesc(this.data.args.category as string)
					.setClass('tool-confirmation-setting');
			}
		} else if (this.data.toolName === 'read_many_files' && this.data.args.paths) {
			const paths = this.data.args.paths as string[];
			new Setting(detailsEl)
				.setName('📁 File Patterns')
				.setDesc(paths.join(', '))
				.setClass('tool-confirmation-setting');
			
			if (this.data.args.include && Array.isArray(this.data.args.include)) {
				const include = this.data.args.include as string[];
				if (include.length > 0) {
					new Setting(detailsEl)
						.setName('➕ Include Patterns')
						.setDesc(include.join(', '))
						.setClass('tool-confirmation-setting');
				}
			}
			
			if (this.data.args.exclude && Array.isArray(this.data.args.exclude)) {
				const exclude = this.data.args.exclude as string[];
				if (exclude.length > 0) {
					new Setting(detailsEl)
						.setName('➖ Exclude Patterns')
						.setDesc(exclude.join(', '))
						.setClass('tool-confirmation-setting');
				}
			}
		}

		const rememberContainer = contentEl.createDiv({ cls: 'tool-confirmation-remember' });
		rememberContainer.createEl('h4', { text: 'Remember my choice:' });
		
		const toolLabels = {
			web_fetch: 'web fetch',
			write_file: 'file writing',
			edit_file: 'file editing',
			read_file: 'file reading',
			list_files: 'file listing',
			read_many_files: 'multi-file reading',
			google_web_search: 'web search',
			save_memory: 'memory saving'
		};
		const toolLabel = toolLabels[this.data.toolName as keyof typeof toolLabels] || 'this tool';
		
		new Setting(rememberContainer)
			.setName('Allow this operation only')
			.addToggle(toggle => {
				this.toggles.once = toggle;
				toggle.setValue(this.rememberChoice === 'once')
					.onChange(value => {
						if (value) {
							this.rememberChoice = 'once';
							if (this.toggles.always) this.toggles.always.setValue(false);
							if (this.toggles.never) this.toggles.never.setValue(false);
						}
					});
			});
		
		new Setting(rememberContainer)
			.setName('Always allow ' + toolLabel)
			.setDesc('Automatically approve all future ' + toolLabel + ' requests')
			.addToggle(toggle => {
				this.toggles.always = toggle;
				toggle.setValue(this.rememberChoice === 'always')
					.onChange(value => {
						if (value) {
							this.rememberChoice = 'always';
							if (this.toggles.once) this.toggles.once.setValue(false);
							if (this.toggles.never) this.toggles.never.setValue(false);
						}
					});
			});
		
		new Setting(rememberContainer)
			.setName('Never allow ' + toolLabel)
			.setDesc('Automatically reject all future ' + toolLabel + ' requests')
			.addToggle(toggle => {
				this.toggles.never = toggle;
				toggle.setValue(this.rememberChoice === 'never')
					.onChange(value => {
						if (value) {
							this.rememberChoice = 'never';
							if (this.toggles.once) this.toggles.once.setValue(false);
							if (this.toggles.always) this.toggles.always.setValue(false);
						}
					});
			});

		const buttonContainer = contentEl.createDiv({ cls: 'tool-confirmation-buttons' });
		
		new Setting(buttonContainer)
			.addButton(button => button
				.setButtonText('✓ Approve & Execute')
				.setCta()
				.onClick(async () => {
					Logger.debug('Tool', 'User approved:', this.data.toolName);
					Logger.debug('Tool', 'Remember choice:', this.rememberChoice);
					
					if (this.rememberChoice !== 'once') {
						await this.onApprove(this.rememberChoice);
					} else {
						await this.onApprove();
					}
					this.close();
				}))
			.addButton(button => button
				.setButtonText('✗ Reject')
				.setWarning()
				.onClick(() => this.handleReject()));

		const safetyEl = contentEl.createDiv({ cls: 'tool-confirmation-safety' });
		safetyEl.createEl('p', {
			text: '💡 Tip: You can change tool permissions anytime in plugin settings.'
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
