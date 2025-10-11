import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Component } from 'obsidian';
import type { Message } from '../gemini-client';
import { MessageComponent } from './message-component';

interface ChatInterfaceProps {
	messages: Message[];
	isLoading: boolean;
	onSendMessage: (message: string) => void;
	onClearChat: () => void;
	isReady: boolean;
	onShowTools: () => void;
	renderMarkdown?: boolean;
	component?: Component;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
	messages,
	isLoading,
	onSendMessage,
	onClearChat,
	isReady,
	onShowTools,
	renderMarkdown = true,
	component
}) => {
	const [input, setInput] = useState('');
	const [isSending, setIsSending] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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

	return (
		<div className="gemini-chat-container">
			<div className="gemini-header">
				<h3>Gemini Assistant</h3>
				<button 
					className="gemini-clear-button"
					onClick={onClearChat}
					disabled={messages.length === 0}
				>
					Clear Chat
				</button>
			</div>

			<div className="gemini-messages" ref={messagesContainerRef}>
				{messages.length === 0 ? (
					<div className="gemini-empty-state">
						<h4>👋 Welcome to Gemini Assistant!</h4>
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
		</div>
	);
};
