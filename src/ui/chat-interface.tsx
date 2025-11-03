import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Component } from 'obsidian';
import type { Message } from '../gemini-client';
import { MessageComponent } from './message-component';

interface ChatInterfaceProps {
	messages: Message[];
	isLoading: boolean;
	onSendMessage: (message: string) => void;
	isReady: boolean;
	onShowTools: () => void;
	renderMarkdown?: boolean;
	component?: Component;
	currentHistoryId?: string | null;
	currentHistoryName?: string | null;
	histories?: Array<{id: string; name: string; modifiedAt: number}>;
	onCreateNewChat?: () => void;
	onLoadHistory?: (id: string) => void;
	onRenameHistory?: (id: string, newName: string) => void;
	onDeleteHistory?: (id: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
	messages,
	isLoading,
	onSendMessage,
	isReady,
	onShowTools,
	renderMarkdown = true,
	component,
	currentHistoryId = null,
	currentHistoryName = null,
	histories = [],
	onCreateNewChat,
	onLoadHistory,
	onRenameHistory,
	onDeleteHistory
}) => {
	const [input, setInput] = useState('');
	const [isSending, setIsSending] = useState(false);
	const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
	const [showRenameModal, setShowRenameModal] = useState(false);
	const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState('');
	const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		requestAnimationFrame(() => {
			messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
		});
	}, [messages, isLoading]);

	useEffect(() => {
		if (isLoading && messagesContainerRef.current) {
			messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
		}
	}, [messages.length, isLoading]);

	// Additional effect to ensure scrolling when messages change (including /tools)
	useEffect(() => {
		requestAnimationFrame(() => {
			if (messagesContainerRef.current && messages.length > 0) {
				messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
			}
		});
	}, [messages.length]);

	useEffect(() => {
		if (textareaRef.current && !isLoading) {
			textareaRef.current.focus();
		}
	}, [isLoading]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		
		if (!input.trim() || isSending || isLoading) {
			return;
		}

		if (input.trim() === '/tools') {
			onShowTools();
			setInput('');
			return;
		}

		setIsSending(true);
		try {
			await onSendMessage(input.trim());
			setInput('');
		} finally {
			setIsSending(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	};

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setShowHistoryDropdown(false);
			}
		};

		if (showHistoryDropdown) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showHistoryDropdown]);

	const handleCreateNewChat = () => {
		if (onCreateNewChat) {
			onCreateNewChat();
		}
		setShowHistoryDropdown(false);
	};

	const handleLoadHistory = (id: string) => {
		if (onLoadHistory) {
			onLoadHistory(id);
		}
		setShowHistoryDropdown(false);
	};

	const handleRenameClick = (id: string, currentName: string) => {
		setRenameTargetId(id);
		setRenameValue(currentName);
		setShowRenameModal(true);
		setShowHistoryDropdown(false);
	};

	const handleRenameSubmit = () => {
		if (renameTargetId && renameValue.trim() && onRenameHistory) {
			onRenameHistory(renameTargetId, renameValue.trim());
		}
		setShowRenameModal(false);
		setRenameTargetId(null);
		setRenameValue('');
	};

	const handleDeleteClick = (id: string) => {
		setDeleteTargetId(id);
		setShowHistoryDropdown(false);
	};

	const handleDeleteConfirm = () => {
		if (deleteTargetId && onDeleteHistory) {
			onDeleteHistory(deleteTargetId);
		}
		setDeleteTargetId(null);
	};

	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp);
		return date.toLocaleString();
	};

	return (
		<div className="gemini-chat-container">
			<div className="gemini-header">
				<h3>AI vault assistant</h3>
				<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
					<div style={{ position: 'relative' }} ref={dropdownRef}>
						<button
							className="gemini-history-button"
							onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
							style={{
								padding: '6px 12px',
								background: 'var(--interactive-normal)',
								border: '1px solid var(--background-modifier-border)',
								borderRadius: '4px',
								cursor: 'pointer',
								fontSize: '14px',
								color: 'var(--text-normal)'
							}}
						>
							{currentHistoryName || 'New Chat'} ▼
						</button>
						{showHistoryDropdown && (
							<div
								style={{
									position: 'absolute',
									top: '100%',
									right: 0,
									marginTop: '4px',
									background: 'var(--background-primary)',
									border: '1px solid var(--background-modifier-border)',
									borderRadius: '4px',
									boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
									minWidth: '250px',
									maxHeight: '400px',
									overflowY: 'auto',
									zIndex: 1000
								}}
							>
								<div
									onClick={handleCreateNewChat}
									style={{
										padding: '8px 12px',
										cursor: 'pointer',
										borderBottom: '1px solid var(--background-modifier-border)',
										background: 'var(--interactive-hover)',
										fontWeight: 'bold'
									}}
									onMouseEnter={(e) => e.currentTarget.style.background = 'var(--interactive-hover)'}
									onMouseLeave={(e) => e.currentTarget.style.background = 'var(--interactive-hover)'}
								>
									➕ New Chat
								</div>
								<div style={{ padding: '4px', borderBottom: '1px solid var(--background-modifier-border)' }} />
								{histories.length === 0 ? (
									<div style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
										No saved histories
									</div>
								) : (
									histories.map((history) => (
										<div
											key={history.id}
											style={{
												padding: '8px 12px',
												borderBottom: '1px solid var(--background-modifier-border)',
												cursor: history.id === currentHistoryId ? 'default' : 'pointer',
												background: history.id === currentHistoryId ? 'var(--background-modifier-hover)' : 'transparent'
											}}
											onMouseEnter={(e) => {
												if (history.id !== currentHistoryId) {
													e.currentTarget.style.background = 'var(--background-modifier-hover)';
												}
											}}
											onMouseLeave={(e) => {
												if (history.id !== currentHistoryId) {
													e.currentTarget.style.background = 'transparent';
												}
											}}
										>
											<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
												<div
													onClick={() => history.id !== currentHistoryId && handleLoadHistory(history.id)}
													style={{ flex: 1 }}
												>
													<div style={{ fontWeight: history.id === currentHistoryId ? 'bold' : 'normal' }}>
														{history.name}
													</div>
													<div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
														{formatDate(history.modifiedAt)}
													</div>
												</div>
												<div style={{ display: 'flex', gap: '4px' }}>
													<button
														onClick={() => handleRenameClick(history.id, history.name)}
														style={{
															padding: '4px 8px',
															background: 'transparent',
															border: 'none',
															cursor: 'pointer',
															fontSize: '12px',
															color: 'var(--text-muted)'
														}}
														title="Rename"
													>
														✏️
													</button>
													<button
														onClick={() => handleDeleteClick(history.id)}
														style={{
															padding: '4px 8px',
															background: 'transparent',
															border: 'none',
															cursor: 'pointer',
															fontSize: '12px',
															color: 'var(--text-error)'
														}}
														title="Delete"
													>
														🗑️
													</button>
												</div>
											</div>
										</div>
									))
								)}
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="gemini-messages" ref={messagesContainerRef}>
				{messages.length === 0 ? (
					<div className="gemini-empty-state">
						<h4>👋 Welcome to AI vault assistant!</h4>
						<p>Ask me anything about your notes, or try:</p>
						<ul>
							<li>"List all markdown files"</li>
							<li>"Summarize my README file"</li>
							<li>"Search for latest AI developments"</li>
							<li>"Remember that my preferred language is Python"</li>
						</ul>
						<p className="gemini-tools-hint">Type <code>/tools</code> to see all available tools</p>
					</div>
				) : (
					messages.map(message => (
						<MessageComponent 
							key={message.id} 
							message={message} 
							renderMarkdown={renderMarkdown} 
							component={component}
						/>
					))
				)}
				{isLoading && (
					<div className="gemini-loading">
						<div className="gemini-loading-spinner"></div>
						<span>Gemini is thinking...</span>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			<form className="gemini-input-container" onSubmit={handleSubmit}>
				<textarea
					ref={textareaRef}
					className="gemini-input"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={isReady ? "Ask Gemini anything... (Shift+Enter for new line)" : "Configure API key or OAuth in settings"}
					disabled={!isReady || isLoading}
					rows={3}
				/>
				<button 
					type="submit" 
					className="gemini-send-button"
					disabled={!isReady || isLoading || !input.trim()}
				>
					Send
				</button>
			</form>

			{/* Rename Modal */}
			{showRenameModal && (
				<div
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: 'rgba(0, 0, 0, 0.5)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 10000
					}}
					onClick={() => setShowRenameModal(false)}
				>
					<div
						style={{
							background: 'var(--background-primary)',
							border: '1px solid var(--background-modifier-border)',
							borderRadius: '8px',
							padding: '20px',
							minWidth: '300px',
							maxWidth: '500px'
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<h3 style={{ marginTop: 0 }}>Rename Chat History</h3>
						<input
							type="text"
							value={renameValue}
							onChange={(e) => setRenameValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									handleRenameSubmit();
								} else if (e.key === 'Escape') {
									setShowRenameModal(false);
									setRenameTargetId(null);
									setRenameValue('');
								}
							}}
							autoFocus
							style={{
								width: '100%',
								padding: '8px',
								marginBottom: '12px',
								border: '1px solid var(--background-modifier-border)',
								borderRadius: '4px',
								background: 'var(--background-primary-alt)',
								color: 'var(--text-normal)'
							}}
						/>
						<div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
							<button
								onClick={() => {
									setShowRenameModal(false);
									setRenameTargetId(null);
									setRenameValue('');
								}}
								style={{
									padding: '6px 12px',
									background: 'var(--background-secondary)',
									border: '1px solid var(--background-modifier-border)',
									borderRadius: '4px',
									cursor: 'pointer'
								}}
							>
								Cancel
							</button>
							<button
								onClick={handleRenameSubmit}
								disabled={!renameValue.trim()}
								style={{
									padding: '6px 12px',
									background: 'var(--interactive-accent)',
									border: 'none',
									borderRadius: '4px',
									cursor: renameValue.trim() ? 'pointer' : 'not-allowed',
									color: 'white'
								}}
							>
								Save
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Delete Confirmation Modal */}
			{deleteTargetId && (
				<div
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: 'rgba(0, 0, 0, 0.5)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 10000
					}}
					onClick={() => setDeleteTargetId(null)}
				>
					<div
						style={{
							background: 'var(--background-primary)',
							border: '1px solid var(--background-modifier-border)',
							borderRadius: '8px',
							padding: '20px',
							minWidth: '300px',
							maxWidth: '500px'
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<h3 style={{ marginTop: 0 }}>Delete Chat History?</h3>
						<p style={{ color: 'var(--text-normal)' }}>
							Are you sure you want to delete this chat history? This action cannot be undone.
						</p>
						<div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
							<button
								onClick={() => setDeleteTargetId(null)}
								style={{
									padding: '6px 12px',
									background: 'var(--background-secondary)',
									border: '1px solid var(--background-modifier-border)',
									borderRadius: '4px',
									cursor: 'pointer'
								}}
							>
								Cancel
							</button>
							<button
								onClick={handleDeleteConfirm}
								style={{
									padding: '6px 12px',
									background: 'var(--text-error)',
									border: 'none',
									borderRadius: '4px',
									cursor: 'pointer',
									color: 'white'
								}}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
