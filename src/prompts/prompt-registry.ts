import { EventEmitter } from 'events';

export interface Prompt {
  name: string;
  description: string;
  arguments?: any;
}

export interface PromptRegistryEntry {
  name: string;
  prompt: Prompt;
}

export class PromptRegistry extends EventEmitter {
  private prompts: Map<string, PromptRegistryEntry> = new Map();

  /**
   * Register a prompt with the registry
   */
  public registerPrompt(name: string, prompt: PromptRegistryEntry): void;
  public registerPrompt(prompt: any): void;
  public registerPrompt(nameOrPrompt: string | any, prompt?: PromptRegistryEntry): void {
    if (typeof nameOrPrompt === 'string' && prompt) {
      // Two-parameter version: registerPrompt(name, prompt)
      this.prompts.set(nameOrPrompt, prompt);
      this.emit('prompt-registered', nameOrPrompt, prompt);
    } else {
      // Single-parameter version: registerPrompt(prompt) - interface compatibility
      const promptObj = nameOrPrompt;
      if (promptObj.name) {
        this.prompts.set(promptObj.name, promptObj);
        this.emit('prompt-registered', promptObj.name, promptObj);
      }
    }
  }

  /**
   * Get a prompt by name
   */
  public getPrompt(name: string): Prompt | undefined {
    const entry = this.prompts.get(name);
    return entry ? entry.prompt : undefined;
  }

  /**
   * Get all prompts
   */
  public getAllPrompts(): Map<string, Prompt> {
    const result = new Map<string, Prompt>();
    for (const [name, entry] of this.prompts) {
      result.set(name, entry.prompt);
    }
    return result;
  }

  /**
   * Check if a prompt is registered
   */
  public hasPrompt(name: string): boolean {
    return this.prompts.has(name);
  }

  /**
   * Unregister a prompt
   */
  public unregisterPrompt(name: string): void {
    if (this.prompts.has(name)) {
      const entry = this.prompts.get(name);
      this.prompts.delete(name);
      this.emit('prompt-unregistered', name, entry?.prompt);
    }
  }

  /**
   * Get prompt count
   */
  public getPromptCount(): number {
    return this.prompts.size;
  }

  /**
   * Clear all prompts
   */
  public clearPrompts(): void {
    this.prompts.clear();
    this.emit('prompts-cleared');
  }

  /**
   * Get prompt names
   */
  public getPromptNames(): string[] {
    return Array.from(this.prompts.keys());
  }
}