/**
 * Mock Obsidian API for testing
 */

export class App {}

export class Plugin {
	app!: App;
	manifest: any;

	loadData(): Promise<any> {
		return Promise.resolve({});
	}

	saveData(data: any): Promise<void> {
		return Promise.resolve();
	}
}

export class PluginSettingTab {
	constructor(public app: App, public plugin: any) {}
	
	display(): void {}
	hide(): void {}
}

export class Setting {
	constructor(public containerEl: HTMLElement) {}
	
	setName(name: string): this {
		return this;
	}

	setDesc(desc: string): this {
		return this;
	}

	addText(cb: (text: any) => any): this {
		cb({
			setPlaceholder: () => ({}),
			setValue: () => ({}),
			onChange: () => ({})
		});
		return this;
	}

	addDropdown(cb: (dropdown: any) => any): this {
		cb({
			addOption: () => ({}),
			setValue: () => ({}),
			onChange: () => ({})
		});
		return this;
	}

	addToggle(cb: (toggle: any) => any): this {
		cb({
			setValue: () => ({}),
			onChange: () => ({})
		});
		return this;
	}

	addSlider(cb: (slider: any) => any): this {
		cb({
			setLimits: () => ({}),
			setValue: () => ({}),
			setDynamicTooltip: () => ({}),
			onChange: () => ({})
		});
		return this;
	}

	addButton(cb: (button: any) => any): this {
		cb({
			setButtonText: () => ({}),
			setCta: () => ({}),
			onClick: () => ({})
		});
		return this;
	}

	setClass(cls: string): this {
		return this;
	}
}

export class Notice {
	constructor(public message: string, public duration?: number) {}
}

export class Modal {
	constructor(public app: App) {}
	
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class ItemView {
	constructor(public leaf: any) {}
	
	getViewType(): string {
		return 'view';
	}

	getDisplayText(): string {
		return 'View';
	}

	getIcon(): string {
		return 'document';
	}

	onOpen(): Promise<void> {
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		return Promise.resolve();
	}
}

export class Vault {
	getAbstractFileByPath(path: string): any {
		return null;
	}

	read(file: any): Promise<string> {
		return Promise.resolve('');
	}

	modify(file: any, content: string): Promise<void> {
		return Promise.resolve();
	}

	create(path: string, content: string): Promise<any> {
		return Promise.resolve({ path });
	}

	getFiles(): any[] {
		return [];
	}
}

export class TFile {
	path!: string;
	name!: string;
	extension!: string;
}

export class TFolder {
	path!: string;
	name!: string;
	children!: any[];
}

export class WorkspaceLeaf {}
