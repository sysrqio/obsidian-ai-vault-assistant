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
	const isToolCallOnly = !message.content && message.toolCalls && message.toolCalls.length > 0;
	
	const className = isUser 
		? 'gemini-message user' 
		: isSystem 
			? isError ? 'gemini-message system error' : 'gemini-message system'
			: isToolCallOnly 
				? 'gemini-message assistant tool-calls'
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

			// Ensure internal links are clickable even inside React components
			try {
				const app = (component as any)?.app;
				if (app && contentRef.current) {
					const anchors = contentRef.current.querySelectorAll('a.internal-link, a[href^="obsidian://"]');
					anchors.forEach((a: Element) => {
						(a as HTMLAnchorElement).addEventListener('click', (evt) => {
							evt.preventDefault();
							const href = (a as HTMLAnchorElement).getAttribute('href') || (a as any).getAttribute('data-href');
							if (href) {
								app.workspace.openLinkText(href, '/', false);
							}
						});
					});
				}
			} catch (err) {
				// best-effort: do nothing if link wiring fails
			}
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
			{isToolCallOnly ? (
				// Tool calls only - display in separate bubble
				<div className="gemini-message-header">
					<div className="gemini-message-content">
						<div className="gemini-tool-calls-header">
							<span style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
								🤔 Thinking...
							</span>
						</div>
						<div className="gemini-tool-calls">
							{message.toolCalls && message.toolCalls.map((tool, idx) => (
								<div key={idx} className="gemini-tool-call">
									<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
										<span className="gemini-tool-name" style={{ fontWeight: 'bold' }}>
											🔧 {tool.name}
										</span>
										<span className="gemini-tool-status" style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>
											({tool.status})
										</span>
									</div>
									{tool.args && Object.keys(tool.args).length > 0 && (
										<div className="gemini-tool-args" style={{ 
											marginLeft: '24px', 
											marginTop: '4px', 
											fontSize: '0.9em',
											color: 'var(--text-muted)',
											fontFamily: 'monospace'
										}}>
											{JSON.stringify(tool.args, null, 2)}
										</div>
									)}
									{tool.result && (
										<div className="gemini-tool-result" style={{ 
											marginLeft: '24px', 
											marginTop: '4px',
											padding: '4px 8px',
											background: 'var(--background-modifier-hover)',
											borderRadius: '4px',
											fontSize: '0.9em'
										}}>
											✓ Result: {tool.result.length > 200 ? tool.result.substring(0, 200) + '...' : tool.result}
										</div>
									)}
									{tool.error && (
										<div className="gemini-tool-error" style={{ 
											marginLeft: '24px', 
											marginTop: '4px',
											padding: '4px 8px',
											background: 'var(--background-modifier-error)',
											borderRadius: '4px',
											fontSize: '0.9em',
											color: 'var(--text-error)'
										}}>
											✗ Error: {tool.error}
										</div>
									)}
								</div>
							))}
						</div>
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
			) : (
				// Regular message with optional tool calls
				<>
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
					
					{message.toolCalls && message.toolCalls.length > 0 && (
						<div className="gemini-tool-calls" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--background-modifier-border)' }}>
							<div style={{ fontSize: '0.9em', color: 'var(--text-muted)', marginBottom: '4px' }}>
								🔧 Tools used:
							</div>
							{message.toolCalls.map((tool, idx) => (
								<div key={idx} className="gemini-tool-call" style={{ fontSize: '0.9em', marginLeft: '16px' }}>
									<span className="gemini-tool-name">{tool.name}</span>
									<span className="gemini-tool-status"> ({tool.status})</span>
								</div>
							))}
						</div>
					)}
				</>
			)}
			
			{showMenu && (
			<div
				ref={menuRef}
				className="gemini-message-menu"
				style={{
					top: menuPosition.top + 'px',
					left: menuPosition.left + 'px'
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
		</div>
	);
};
