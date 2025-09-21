class ChatPopup {
    constructor() {
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.setupMessage = document.getElementById('setupMessage');
        this.errorMessage = document.getElementById('errorMessage');
        this.openOptionsLink = document.getElementById('openOptions');
        
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

        // Listen for responses from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'chat_response') {
                this.handleChatResponse(message);
            } else if (message.type === 'error') {
                this.handleError(message.error);
            }
        });
    }

    adjustTextareaHeight() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 100) + 'px';
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isLoading) return;

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
            
            // Send message to background script
            chrome.runtime.sendMessage({
                type: 'chat_message',
                message: message,
                tabId: tab.id,
                url: tab.url,
                title: tab.title
            });

        } catch (error) {
            this.removeLoadingMessage(loadingElement);
            this.showError('Failed to send message: ' + error.message);
            this.isLoading = false;
            this.sendButton.disabled = false;
        }
    }

    handleChatResponse(response) {
        // Remove loading indicator
        const loadingElement = this.chatContainer.querySelector('.loading');
        if (loadingElement) {
            loadingElement.remove();
        }

        if (response.error) {
            this.showError(response.error);
        } else {
            this.addMessage(response.content, 'assistant');
            this.saveChatHistory();
        }

        this.isLoading = false;
        this.sendButton.disabled = false;
        this.messageInput.focus();
    }

    handleError(errorMessage) {
        console.log('📥 Popup: Received error:', errorMessage);
        
        // Remove loading indicator
        const loadingElement = this.chatContainer.querySelector('.loading');
        if (loadingElement) {
            loadingElement.remove();
            console.log('✅ Popup: Removed loading indicator');
        }

        // Show error message in the error banner
        this.showError(errorMessage);
        
        // Also add error as a message in the chat for better visibility
        this.addMessage(errorMessage, 'assistant error');
        console.log('✅ Popup: Added error message to chat');

        // Reset loading state
        this.isLoading = false;
        this.sendButton.disabled = false;
        this.messageInput.focus();
        console.log('✅ Popup: Reset loading state');
    }

    addMessage(content, role) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        messageElement.textContent = content;
        
        this.chatContainer.appendChild(messageElement);
        this.scrollToBottom();
        
        return messageElement;
    }

    addLoadingMessage() {
        const loadingElement = document.createElement('div');
        loadingElement.className = 'message assistant loading';
        loadingElement.innerHTML = `
            <span>Thinking</span>
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
        
        // Hide error after 5 seconds
        setTimeout(() => {
            this.errorMessage.style.display = 'none';
        }, 5000);
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    saveChatHistory() {
        const messages = Array.from(this.chatContainer.querySelectorAll('.message:not(.loading)'))
            .map(msg => ({
                content: msg.textContent,
                role: msg.classList.contains('user') ? 'user' : 'assistant'
            }));
        
        chrome.storage.local.set({ chat_history: messages });
    }

    loadChatHistory() {
        chrome.storage.local.get(['chat_history'], (result) => {
            if (result.chat_history && result.chat_history.length > 1) {
                // Clear default message
                this.chatContainer.innerHTML = '';
                
                // Load previous messages
                result.chat_history.forEach(msg => {
                    this.addMessage(msg.content, msg.role);
                });
            }
        });
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatPopup();
});
