/**
 * Logger utility with configurable log levels
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export class Logger {
	private static currentLevel: LogLevel = 'info';
	private static originalConsole = {
		log: console.log.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console)
	};
	
	private static levels: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
		none: 999
	};

	/**
	 * Set the global log level
	 */
	static setLevel(level: LogLevel): void {
		this.currentLevel = level;
		this.originalConsole.log(`[Logger] Log level set to: ${level}`);
	}

	/**
	 * Get current log level
	 */
	static getLevel(): LogLevel {
		return this.currentLevel;
	}

	/**
	 * Check if a log level should be output
	 */
	private static shouldLog(level: LogLevel): boolean {
		return this.levels[level] >= this.levels[this.currentLevel];
	}
	
	/**
	 * Determine log level from message content
	 */
	private static inferLogLevel(message: string): LogLevel {
		const lower = message.toLowerCase();
		
		// Error indicators
		if (lower.includes('error') || lower.includes('❌') || lower.includes('failed') || lower.includes('exception')) {
			return 'error';
		}
		
		// Warning indicators
		if (lower.includes('warn') || lower.includes('⚠️') || lower.includes('deprecated')) {
			return 'warn';
		}
		
		// Debug indicators (verbose/detailed information)
		if (lower.includes('debug') || 
		    lower.includes('🔍') || lower.includes('📤') || lower.includes('📥') || 
		    lower.includes('🚀') || lower.includes('═══') ||  // Separators and emojis
		    lower.includes('chunk') || lower.includes('part') ||
		    lower.includes('system prompt') || lower.includes('full response') ||
		    lower.includes('candidate content') || lower.includes('response preview') ||
		    lower.includes('history before') || lower.includes('history length') ||
		    lower.includes('history has') || lower.includes('conversation history') ||
		    lower.includes('tools in config') || lower.includes('tool count') ||
		    lower.includes('request details') || lower.includes('request params') ||
		    lower.includes('request prepared') || lower.includes('stream started') ||
		    lower.includes('response complete') || lower.includes('processing response') ||
		    lower.includes('sdk request') ||
		    lower.includes('temperature') || lower.includes('max tokens') ||
		    lower.includes('requested model') || lower.includes('effective model') ||
		    lower.includes('endpoint:') || lower.includes('endpoint ') ||
		    lower.includes('auth method:') || lower.includes('vertexai:') ||
		    lower.includes('tools enabled') || lower.includes('contents count') ||
		    lower.includes('total contents') || lower.includes('total text length') ||
		    lower.includes('gcp') || lower.includes('google_cloud') ||
		    lower.includes('cleared') || lower.includes('environment variable') ||
		    lower.includes('metadata service') ||
		    (lower.includes('loaded') && lower.includes('memor')) ||
		    lower.includes('using generativelanguage') || lower.includes('googleapis.com') ||
		    lower.includes('sendmessage called') || lower.includes('user message:') ||
		    lower.includes('using:') || lower.includes('building request')) {
			return 'debug';
		}
		
		// Default to info
		return 'info';
	}
	
	/**
	 * Wrap console to respect log levels
	 */
	static wrapConsole(): void {
		const self = this;
		
		console.log = function(...args: any[]) {
			const message = args[0]?.toString() || '';
			const level = self.inferLogLevel(message);
			
			if (self.shouldLog(level)) {
				self.originalConsole.log(...args);
			}
		};
		
		console.warn = function(...args: any[]) {
			if (self.shouldLog('warn')) {
				self.originalConsole.warn(...args);
			}
		};
		
		console.error = function(...args: any[]) {
			if (self.shouldLog('error')) {
				self.originalConsole.error(...args);
			}
		};
	}

	/**
	 * Debug - Detailed information for debugging
	 */
	static debug(context: string, message: string, ...args: any[]): void {
		if (this.shouldLog('debug')) {
			this.originalConsole.log(`[${context}] 🐛 ${message}`, ...args);
		}
	}

	/**
	 * Info - General informational messages
	 */
	static info(context: string, message: string, ...args: any[]): void {
		if (this.shouldLog('info')) {
			this.originalConsole.log(`[${context}] ℹ️  ${message}`, ...args);
		}
	}

	/**
	 * Warn - Warning messages
	 */
	static warn(context: string, message: string, ...args: any[]): void {
		if (this.shouldLog('warn')) {
			console.warn(`[${context}] ⚠️  ${message}`, ...args);
		}
	}

	/**
	 * Error - Error messages
	 */
	static error(context: string, message: string, ...args: any[]): void {
		if (this.shouldLog('error')) {
			console.error(`[${context}] ❌ ${message}`, ...args);
		}
	}

	/**
	 * Special logging methods that always output (for critical information)
	 */
	static always(context: string, message: string, ...args: any[]): void {
		console.log(`[${context}] ${message}`, ...args);
	}

	/**
	 * Group start (for organizing related logs)
	 */
	static groupStart(context: string, title: string): void {
		if (this.shouldLog('debug')) {
			console.group(`[${context}] ${title}`);
		}
	}

	/**
	 * Group end
	 */
	static groupEnd(): void {
		if (this.shouldLog('debug')) {
			console.groupEnd();
		}
	}

	/**
	 * Separator for visual organization
	 */
	static separator(context: string): void {
		if (this.shouldLog('debug')) {
			this.originalConsole.log(`[${context}] ${'═'.repeat(63)}`);
		}
	}
}

