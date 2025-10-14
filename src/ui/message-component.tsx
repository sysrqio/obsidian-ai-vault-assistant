import * as React from 'react';
import { MarkdownRenderer, Component, Notice } from 'obsidian';
import type { Message } from '../gemini-client';

interface MessageProps {
	message: Message;
	renderMarkdown?: boolean;
	component?: Component;
}

export const MessageComponent: React.FC<MessageProps> = ({ message, renderMarkdown = true, component }) => {
	const contentRef = React.useRef<HTMLDivElement>(null);
	const [showMenu, setShowMenu] = React.useState(false);
	const [menuPosition, setMenuPosition] = React.useState({ top: 0, left: 0 });
	const menuRef = React.useRef<HTMLDivElement>(null);
	const buttonRef = React.useRef<HTMLButtonElement>(null);
	
	const isUser = message.role === 'user';
	const isSystem = message.role === 'system';
	const isError = message.content.includes('Error:') || message.content.includes('Failed:');
	
	const className = isUser 
		? 'gemini-message user' 
		: isSystem 
			? isError ? 'gemini-message system error' : 'gemini-message system'
			: 'gemini-message assistant';

	// Render markdown using Obsidian's renderer
	React.useEffect(() => {
		if (renderMarkdown && !isUser && contentRef.current && component) {
			// Clear content using DOM API instead of innerHTML
			while (contentRef.current.firstChild) {
				contentRef.current.removeChild(contentRef.current.firstChild);
			}
			// Use vault root as sourcePath to enable wikilink resolution
			MarkdownRenderer.renderMarkdown(
				message.content,
				contentRef.current,
				'/', // Vault root path for wikilink resolution
				component
			);
		}
	}, [message.content, renderMarkdown, isUser, component]);

	// Handle menu toggle
	const handleMenuToggle = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		
		if (buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect();
			setMenuPosition({
				top: rect.bottom + 5,
				left: rect.left - 100 // Position menu to the left of button
			});
		}
		setShowMenu(!showMenu);
	};

	// Handle copy content
	const handleCopyContent = () => {
		const textContent = renderMarkdown && !isUser && contentRef.current
			? contentRef.current.textContent || contentRef.current.innerText
			: message.content;

		navigator.clipboard.writeText(textContent).then(() => {
			new Notice('Content copied to clipboard');
		}).catch(() => {
			// Fallback for older browsers
			const textArea = document.createElement('textarea');
			textArea.value = textContent;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
			new Notice('Content copied to clipboard');
		});
		setShowMenu(false);
	};

	// Handle copy as markdown
	const handleCopyAsMarkdown = () => {
		const markdownContent = message.content;
		navigator.clipboard.writeText(markdownContent).then(() => {
			new Notice('Markdown copied to clipboard');
		}).catch(() => {
			// Fallback for older browsers
			const textArea = document.createElement('textarea');
			textArea.value = markdownContent;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
			new Notice('Markdown copied to clipboard');
		});
		setShowMenu(false);
	};

	// Close menu when clicking outside
	React.useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node) &&
				buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
				setShowMenu(false);
			}
		};

		if (showMenu) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [showMenu]);

	const renderContent = (content: string) => {
		const lines = content.split('\n');
		return lines.map((line, i) => (
			<React.Fragment key={i}>
				{line}
				{i < lines.length - 1 && <br />}
			</React.Fragment>
		));
	};

	return (
		<div className={className}>
			<div className="gemini-message-header">
				<div className="gemini-message-content">
					{renderMarkdown && !isUser ? (
						<div ref={contentRef} className="markdown-rendered" />
					) : (
						renderContent(message.content)
					)}
				</div>
				<button
					ref={buttonRef}
					className="gemini-message-menu-button"
					onClick={handleMenuToggle}
					title="Message options"
				>
					⋯
				</button>
			</div>
			
			{showMenu && (
				<div
					ref={menuRef}
					className="gemini-message-menu"
					style={{
						position: 'fixed',
						top: menuPosition.top,
						left: menuPosition.left,
						zIndex: 1000
					}}
				>
					<div className="gemini-menu-item" onClick={handleCopyContent}>
						📋 Copy as text
					</div>
					{renderMarkdown && !isUser && (
						<div className="gemini-menu-item" onClick={handleCopyAsMarkdown}>
							📝 Copy as markdown
						</div>
					)}
				</div>
			)}

			{message.toolCalls && message.toolCalls.length > 0 && (
				<div className="gemini-tool-calls">
					{message.toolCalls.map((tool, idx) => (
						<div key={idx} className="gemini-tool-call">
							<span className="gemini-tool-name">🔧 {tool.name}</span>
							<span className="gemini-tool-status"> - {tool.status}</span>
							{tool.result && (
								<div className="gemini-tool-result">
									✓ {tool.result.substring(0, 100)}
									{tool.result.length > 100 && '...'}
								</div>
							)}
							{tool.error && (
								<div className="gemini-tool-error">✗ {tool.error}</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
};
