class ChatSidebar {
    constructor() {
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.setupMessage = document.getElementById('setupMessage');
        this.errorMessage = document.getElementById('errorMessage');
        this.openOptionsLink = document.getElementById('openOptions');
        this.clearChatBtn = document.getElementById('clearChatBtn');
        
        this.isLoading = false;
        
        this.init();
    }

    async init() {
        // Check if API key is configured
        const hasApiKey = await this.checkApiKey();
        
        if (!hasApiKey) {
            this.showSetupMessage();
            return;
        }

        this.setupEventListeners();
        this.loadChatHistory();
        
        // Detect when sidebar is closed
        this.setupVisibilityListener();
        
        // Listen for tab changes to reload conversation history
        this.setupTabChangeListener();
    }

    async checkApiKey() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['openai_api_key'], (result) => {
                resolve(result.openai_api_key && result.openai_api_key.trim() !== '');
            });
        });
    }

    showSetupMessage() {
        this.setupMessage.style.display = 'block';
        this.chatContainer.style.display = 'none';
        
        this.openOptionsLink.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.openOptionsPage();
        });
    }

    setupEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.messageInput.addEventListener('input', () => {
            this.adjustTextareaHeight();
        });

        this.clearChatBtn.addEventListener('click', () => this.clearChat());

        // Listen for responses from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📥 Sidebar: Received message:', message);
            if (message.type === 'chat_response') {
                this.handleChatResponse(message);
            } else if (message.type === 'error') {
                this.handleError(message.error);
            } else if (message.type === 'prefill_text') {
                this.handlePrefillText(message.text);
            } else if (message.type === 'sidebar_close_hint') {
                this.showCloseHint();
            } else if (message.type === 'show_close_instructions') {
                this.showCloseInstructions();
            }
        });
    }

    adjustTextareaHeight() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isLoading) return;

        console.log('📤 Sidebar: Sending message:', message);
        this.isLoading = true;
        this.sendButton.disabled = true;
        this.messageInput.value = '';
        this.adjustTextareaHeight();

        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Show loading indicator
        const loadingElement = this.addLoadingMessage();

        try {
            // Get current tab info
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            console.log('📍 Sidebar: Current tab:', tab?.title, tab?.url);
            
            // Send message to background script
            chrome.runtime.sendMessage({
                type: 'chat_message',
                message: message,
                tabId: tab.id,
                url: tab.url,
                title: tab.title,
                source: 'sidebar'
            });

        } catch (error) {
            console.error('❌ Sidebar: Error sending message:', error);
            this.removeLoadingMessage(loadingElement);
            this.showError('Failed to send message: ' + error.message);
            this.isLoading = false;
            this.sendButton.disabled = false;
        }
    }

    handleChatResponse(response) {
        console.log('✅ Sidebar: Handling chat response');
        // Remove loading indicator
        const loadingElement = this.chatContainer.querySelector('.loading');
        if (loadingElement) {
            loadingElement.remove();
        }

        if (response.error) {
            this.showError(response.error);
        } else {
            this.addMessage(response.content, 'assistant');
        }

        this.isLoading = false;
        this.sendButton.disabled = false;
        this.messageInput.focus();
    }

    handleError(errorMessage) {
        console.log('📥 Sidebar: Received error:', errorMessage);
        
        // Remove loading indicator
        const loadingElement = this.chatContainer.querySelector('.loading');
        if (loadingElement) {
            loadingElement.remove();
            console.log('✅ Sidebar: Removed loading indicator');
        }

        // Show error message in the error banner
        this.showError(errorMessage);
        
        // Also add error as a message in the chat for better visibility
        this.addMessage(errorMessage, 'assistant error');
        console.log('✅ Sidebar: Added error message to chat');

        // Reset loading state
        this.isLoading = false;
        this.sendButton.disabled = false;
        this.messageInput.focus();
        console.log('✅ Sidebar: Reset loading state');
    }

    handlePrefillText(selectedText) {
        console.log('🎯 Sidebar: Prefilling with selected text:', selectedText);
        
        // Limit text length for better UX
        const truncatedText = selectedText.length > 200 ? selectedText.substring(0, 200) + '...' : selectedText;
        
        // Create a helpful prompt with the selected text
        const prefillText = `"${truncatedText} "`;
        
        // Set the input value
        this.messageInput.value = prefillText;
        
        // Adjust textarea height to fit the content
        this.adjustTextareaHeight();
        
        // Focus on the input and position cursor at the beginning of "Explain this:"
        // This allows users to easily change the prompt while keeping the selected text
        this.messageInput.focus();
        this.messageInput.setSelectionRange(0, 12); // Select "Explain this:"
        
        console.log('✅ Sidebar: Text prefilled successfully');
        
        // Scroll to input area
        this.messageInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add a helpful message to the chat
        this.addMessage(`💡 I've prefilled your message with the selected text. You can modify the prompt and then send it!`, 'assistant');
    }

    showCloseHint() {
        console.log('💡 Sidebar: Showing close hint');
        this.addMessage(`💡 Click the rainbow button again or use the X button to close the sidebar!`, 'assistant');
    }
    
    showCloseInstructions() {
        console.log('❌ Sidebar: Showing close instructions');
        
        // Create a special close instruction message
        const instructionElement = document.createElement('div');
        instructionElement.className = 'message assistant';
        instructionElement.style.cssText = `
            background: linear-gradient(135deg, #ff6b6b, #4ecdc4) !important;
            color: white !important;
            border: none !important;
            animation: pulse 2s ease-in-out 3;
        `;
        
        instructionElement.innerHTML = `
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">
                🚪 How to Close Sidebar
            </div>
            <div style="font-size: 14px; line-height: 1.4;">
                Click the <strong>✕</strong> button at the top-right of this sidebar panel to close it.
                <br><br>
                <small>💡 The rainbow button will change back to 🌈 when you close this sidebar.</small>
            </div>
        `;
        
        // Add pulse animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
            }
        `;
        if (!document.querySelector('style[data-pulse]')) {
            style.setAttribute('data-pulse', 'true');
            document.head.appendChild(style);
        }
        
        this.chatContainer.appendChild(instructionElement);
        this.scrollToBottom();
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (instructionElement.parentNode) {
                instructionElement.remove();
            }
        }, 10000);
    }

    addMessage(content, role) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        
        // Check if content is long and is from assistant
        const isLongContent = content.length > 1000;
        const isAssistant = role === 'assistant';
        
        if (isLongContent && isAssistant) {
            // For long assistant messages, show truncated version with expand button
            const truncatedContent = content.substring(0, 1000) + '...';
            
            messageElement.innerHTML = `
                <div class="message-content">${this.formatContent(truncatedContent)}</div>
                <button class="expand-btn">
                    📖 Expand full response
                </button>
            `;
            
            // Add event listener to expand button
            const expandBtn = messageElement.querySelector('.expand-btn');
            expandBtn.addEventListener('click', () => {
                this.showFullResponse(content);
            });
        } else {
            // For short messages or user messages, show normally
            messageElement.innerHTML = `<div class="message-content">${this.formatContent(content)}</div>`;
        }
        
        this.chatContainer.appendChild(messageElement);
        this.scrollToBottom();
        
        return messageElement;
    }
    
    formatContent(content) {
        // Basic markdown-like formatting
        let formatted = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
            .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
            .replace(/\n/g, '<br>'); // Line breaks
        
        // Handle code blocks
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        return formatted;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/'/g, '&apos;');
    }
    
    showFullResponse(content) {
        console.log('📖 Sidebar: Showing full response popup');
        
        // Create popup overlay
        const overlay = document.createElement('div');
        overlay.className = 'response-overlay';
        overlay.innerHTML = `
            <div class="response-popup">
                <div class="response-header">
                    <h3>📖 Full Response</h3>
                    <button class="close-popup">
                        ✕
                    </button>
                </div>
                <div class="response-body">
                    ${this.formatContent(content)}
                </div>
                <div class="response-footer">
                    <button class="copy-btn">
                        📋 Copy Text
                    </button>
                    <button class="close-btn">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners
        const closePopupBtn = overlay.querySelector('.close-popup');
        const closeBtnFooter = overlay.querySelector('.close-btn');
        const copyBtn = overlay.querySelector('.copy-btn');
        
        const closeHandler = () => {
            overlay.remove();
        };
        
        closePopupBtn.addEventListener('click', closeHandler);
        closeBtnFooter.addEventListener('click', closeHandler);
        
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(content);
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Text';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text:', err);
                copyBtn.textContent = '❌ Copy failed';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Text';
                }, 2000);
            }
        });
        
        // Add click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        
        document.body.appendChild(overlay);
        console.log('✅ Sidebar: Popup added to DOM');
    }

    addLoadingMessage() {
        const loadingElement = document.createElement('div');
        loadingElement.className = 'message assistant loading';
        loadingElement.innerHTML = `
            <span>Thinking...</span>
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        this.chatContainer.appendChild(loadingElement);
        this.scrollToBottom();
        
        return loadingElement;
    }

    removeLoadingMessage(loadingElement) {
        if (loadingElement && loadingElement.parentNode) {
            loadingElement.parentNode.removeChild(loadingElement);
        }
    }

    showError(errorMessage) {
        this.errorMessage.textContent = errorMessage;
        this.errorMessage.style.display = 'block';
        
        // Hide error after 8 seconds (longer for sidebar since it's persistent)
        setTimeout(() => {
            this.errorMessage.style.display = 'none';
        }, 8000);
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    // Note: Chat history is now managed by the background script per tab
    // This ensures conversation context is preserved across sidebar open/close

    async loadChatHistory() {
        try {
            // Get current tab to load conversation history for this specific tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            // Request conversation history from background script
            chrome.runtime.sendMessage({
                type: 'get_conversation_history',
                tabId: tab.id
            }, (response) => {
                if (response && response.history && response.history.length > 0) {
                    console.log('📚 Sidebar: Loading conversation history:', response.history.length, 'messages');
                    
                    // Clear default message
                    this.chatContainer.innerHTML = '';
                    
                    // Load conversation history
                    response.history.forEach(msg => {
                        this.addMessage(msg.content, msg.role);
                    });
                } else {
                    console.log('📚 Sidebar: No conversation history found for this tab');
                }
            });
        } catch (error) {
            console.error('❌ Sidebar: Error loading chat history:', error);
        }
    }

    clearChat() {
        console.log('🗑️ Sidebar: Clearing chat history');
        
        // Clear the chat container
        this.chatContainer.innerHTML = '';
        
        // Add the welcome message back
        this.addWelcomeMessage();
        
        // Clear stored chat history
        chrome.storage.local.remove('sidebar_chat_history');
        
        // Clear conversation history in background script
        chrome.runtime.sendMessage({
            type: 'clear_conversation'
        });
        
        console.log('🗑️ Sidebar: Chat and conversation history cleared');
        
        console.log('✅ Sidebar: Chat history cleared successfully');
        
    }
    
    setupVisibilityListener() {
        // Listen for when the sidebar becomes hidden (user closed it)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('👁️ Sidebar: Document became hidden, sidebar likely closed');
                // Notify background that sidebar was closed
                chrome.runtime.sendMessage({
                    type: 'sidebar_closed_by_user'
                }).catch(() => {
                    // Ignore errors - background might not be available
                });
            }
        });
        
        // Also listen for beforeunload in case sidebar is closed
        window.addEventListener('beforeunload', () => {
            console.log('👋 Sidebar: Sidebar being unloaded, notifying background');
            chrome.runtime.sendMessage({
                type: 'sidebar_closed_by_user'
            }).catch(() => {
                // Ignore errors
            });
        });
    }

    setupTabChangeListener() {
        // Listen for tab changes to reload conversation history for the new tab
        chrome.tabs.onActivated.addListener((activeInfo) => {
            console.log('🔄 Sidebar: Tab changed, reloading conversation history');
            this.loadChatHistory();
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete') {
                console.log('🔄 Sidebar: Tab updated, reloading conversation history');
                this.loadChatHistory();
            }
        });
    }

    addWelcomeMessage() {
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'message assistant';
        welcomeMessage.innerHTML = `
            🌈 Hey there! I'm ChromeGPT, your intelligent AI assistant! ✨ I can see and understand whatever page you're currently viewing, so feel free to ask me anything about it!
            <br><br>
            💬 <strong>Just chat naturally!</strong> Ask me questions like:
            <br>
            • "What is this page about?"
            <br>
            • "Summarize the main points"
            <br>
            • "Find contact information"
            🎯 <strong>Pro tip:</strong> Highlight any text on a page and right-click to see "Ask ChromeGPT" - I'll help you understand it!
            <br><br>`;
        
        this.chatContainer.appendChild(welcomeMessage);
        this.scrollToBottom();
    }
}

// Initialize the sidebar when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Sidebar: Initializing ChromeGPT sidebar...');
    window.chatSidebar = new ChatSidebar();
    console.log('✅ Sidebar: ChromeGPT sidebar initialized!');
});
