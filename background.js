class BackgroundService {
    constructor() {
        this.debugLogs = [];
        this.debugEnabled = false;
        this.setupMessageListeners();
        this.setupActionListener();
        this.setupContextMenu();
        this.setupStartupListeners();
        this.loadDebugSettings();
        // Track sidebar state per tab
        this.sidebarStates = new Map();
        // Track conversation history per tab
        this.conversationHistory = new Map();
        // Track context menu handler to avoid duplicates
        this.contextMenuHandlerSet = false;
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'chat_message') {
                this.handleChatMessage(message, sender, sendResponse);
            } else if (message.type === 'get_tab_id') {
                sendResponse({ tabId: sender.tab?.id });
                return true; // Synchronous response
            } else if (message.type === 'get_debug_logs') {
                sendResponse({ logs: this.debugLogs });
                return true; // Synchronous response
            } else if (message.type === 'sidebar_manually_closed') {
                this.handleSidebarManuallyClosed(sender);
                return false; // No response needed
            } else if (message.type === 'show_close_instructions') {
                this.handleShowCloseInstructions(sender);
                return false; // No response needed
            } else if (message.type === 'toggle_sidebar') {
                this.handleToggleSidebar(sender);
                return false; // No response needed
            } else if (message.type === 'clear_conversation') {
                this.handleClearConversation(message, sender);
                return false; // No response needed
            } else if (message.type === 'sidebar_closed_by_user') {
                this.handleSidebarClosedByUser(sender);
                return false; // No response needed
            } else if (message.type === 'get_sidebar_state') {
                this.handleGetSidebarState(message, sender, sendResponse);
                return true; // Asynchronous response
            } else if (message.type === 'get_conversation_history') {
                this.handleGetConversationHistory(message, sender, sendResponse);
                return true; // Synchronous response
            }
            
            // Return true to indicate we'll respond asynchronously (for chat_message)
            return true;
        });
    }

    setupActionListener() {
        // Handle extension icon click to open/close sidebar
        chrome.action.onClicked.addListener(async (tab) => {
            this.debugLog('🖱️ Background: Extension icon clicked, opening sidebar');
            try {
                await chrome.sidePanel.open({ tabId: tab.id });
                this.sidebarStates.set(tab.id, true);
                console.log('✅ Background: Sidebar opened successfully');
                
                // Notify content script that sidebar is open
                chrome.tabs.sendMessage(tab.id, {
                    type: 'sidebar_opened'
                }).catch(error => {
                    console.log('⚠️ Background: Could not notify content script of sidebar opening (this is normal)');
                });
            } catch (error) {
                console.error('❌ Background: Error opening sidebar:', error);
            }
        });
    }

    setupContextMenu() {
        console.log('📋 Background: Setting up context menu...');
        
        // Remove existing context menus first to avoid duplicates
        chrome.contextMenus.removeAll(() => {
            if (chrome.runtime.lastError) {
                console.log('⚠️ Background: Error removing existing menus (this is normal):', chrome.runtime.lastError);
            }
            
            // Create context menu for selected text
            try {
                chrome.contextMenus.create({
                    id: 'ask-chromegpt',
                    title: 'Ask ChromeGPT about "%s"',
                    contexts: ['selection']
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ Background: Error creating context menu:', chrome.runtime.lastError.message);
                    } else {
                        console.log('✅ Background: Context menu "Ask ChromeGPT" created successfully');
                    }
                });
            } catch (error) {
                console.error('❌ Background: Exception creating context menu:', error);
            }
        });

        // Set up context menu click handler (only once)
        if (!this.contextMenuHandlerSet) {
            chrome.contextMenus.onClicked.addListener(async (info, tab) => {
                console.log('🎯 Background: Context menu clicked:', info);
                if (info.menuItemId === 'ask-chromegpt' && info.selectionText) {
                    console.log('🎯 Background: Context menu clicked with text:', info.selectionText);
                    await this.handleSelectedText(info.selectionText, tab);
                }
            });
            this.contextMenuHandlerSet = true;
            console.log('✅ Background: Context menu click handler registered');
        }
    }

    setupStartupListeners() {
        // Ensure context menu is created on extension startup
        chrome.runtime.onStartup.addListener(() => {
            console.log('🚀 Background: Extension startup, recreating context menu');
            this.setupContextMenu();
        });

        // Ensure context menu is created when extension is installed or updated
        chrome.runtime.onInstalled.addListener((details) => {
            console.log('📦 Background: Extension installed/updated, creating context menu');
            console.log('📦 Background: Install details:', details);
            
            // Add a small delay to ensure Chrome is ready
            setTimeout(() => {
                this.setupContextMenu();
            }, 1000);
        });

        // Listen for tab updates to check sidebar state
        chrome.tabs.onActivated.addListener((activeInfo) => {
            this.checkSidebarState(activeInfo.tabId);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete') {
                this.checkSidebarState(tabId);
            }
        });
    }

    async handleSelectedText(selectedText, tab) {
        console.log('🎯 Background: Handling selected text:', selectedText);
        try {
            // Open the sidebar and track state
            await chrome.sidePanel.open({ tabId: tab.id });
            this.sidebarStates.set(tab.id, true);
            console.log('✅ Background: Sidebar opened for selected text');
            
            // Notify content script that sidebar is open
            chrome.tabs.sendMessage(tab.id, {
                type: 'sidebar_opened'
            }).catch(error => {
                console.log('⚠️ Background: Could not notify content script of sidebar opening (this is normal)');
            });
            
            // Wait a moment for sidebar to load
            setTimeout(() => {
                // Send the selected text to the sidebar
                chrome.runtime.sendMessage({
                    type: 'prefill_text',
                    text: selectedText,
                    tabId: tab.id
                }).catch(error => {
                    console.error('❌ Background: Error sending prefill text:', error);
                });
            }, 500);
            
        } catch (error) {
            console.error('❌ Background: Error handling selected text:', error);
        }
    }

    async handleToggleSidebar(sender) {
        console.log('🌈 Background: Rainbow button clicked, toggling sidebar');
        try {
            const tabId = sender.tab?.id;
            if (!tabId) {
                console.error('❌ Background: No tab ID available for sidebar toggling');
                return;
            }

            // Check current sidebar state for this tab
            const isOpen = this.sidebarStates.get(tabId) || false;
            
            if (isOpen) {
                // Close sidebar - Chrome doesn't have a direct close API from background
                // But we can update our state and notify the content script
                console.log('📴 Background: User wants to close sidebar');
                this.sidebarStates.set(tabId, false);
                
                // Notify content script that sidebar should be considered closed
                chrome.tabs.sendMessage(tabId, {
                    type: 'sidebar_close_hint'
                }).catch(() => {
                    // Content script may not be ready, that's okay
                });
                
            } else {
                // Open sidebar
                await chrome.sidePanel.open({ tabId: tabId });
                this.sidebarStates.set(tabId, true);
                console.log('✅ Background: Sidebar opened from rainbow button');
                
                // Notify content script that sidebar is open
                chrome.tabs.sendMessage(tabId, {
                    type: 'sidebar_opened'
                }).catch(error => {
                    console.log('⚠️ Background: Could not notify content script of sidebar opening (this is normal)');
                });
            }
            
        } catch (error) {
            console.error('❌ Background: Error toggling sidebar from rainbow button:', error);
        }
    }

    async handleChatMessage(message, sender, sendResponse) {
        console.log('🔍 Background: Received message:', message);
        console.log('🔍 Background: Sender info:', sender);
        
        // Detect if this is from sidebar/popup (no tab info) or content script (has tab info)
        const isFromSidebar = !sender.tab;
        console.log('🔍 Background: Message from sidebar/popup:', isFromSidebar);
        console.log('🔍 Background: Message source:', message.source || 'unknown');
        
        try {
            // Get API key from storage
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                console.log('❌ Background: No API key found');
                const errorResponse = { 
                    type: 'error', 
                    error: 'OpenAI API key not configured. Please set it in the options page.' 
                };
                
                if (isFromSidebar) {
                    // For sidebar/popup, we need to send message to all extension contexts
                    chrome.runtime.sendMessage(errorResponse);
                } else {
                    // For content script, send to tab
                    const tabId = await this.getTabId(message, sender);
                    if (tabId) {
                        this.sendResponse(tabId, errorResponse);
                    }
                }
                return;
            }

            console.log('✅ Background: API key found');

            // Always get page content and send with user message
            console.log('🤖 Background: Processing message with page context');
            await this.handleContextualChat(message, sender, apiKey, isFromSidebar);

        } catch (error) {
            console.error('❌ Background: Error handling chat message:', error);
            
            const errorResponse = { 
                type: 'error', 
                error: 'An error occurred: ' + error.message 
            };
            
            if (isFromSidebar) {
                chrome.runtime.sendMessage(errorResponse);
            } else {
                const tabId = await this.getTabId(message, sender);
                if (tabId) {
                    this.sendResponse(tabId, errorResponse);
                }
            }
        }
    }

    async getApiKey() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['openai_api_key'], (result) => {
                resolve(result.openai_api_key);
            });
        });
    }

    async getTabId(message, sender) {
        // Get tab ID safely from different message sources
        if (sender && sender.tab && sender.tab.id) {
            // Message from popup extension
            return sender.tab.id;
        } else if (message.tabId) {
            // Message from content script with tabId included
            return message.tabId;
        } else if (sender && sender.tab) {
            // Fallback: sender.tab exists but might not have id
            return sender.tab.id;
        } else {
            // Last resort: try to get current active tab
            try {
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                return activeTab?.id || null;
            } catch (error) {
                console.error('Failed to get active tab:', error);
                return null;
            }
        }
    }

    parseAgentCommand(message) {
        const lowerMessage = message.toLowerCase();
        
        // Define agent command patterns
        const patterns = [
            { pattern: /summarize (this )?page/, command: 'summarize_page' },
            { pattern: /find.*email/, command: 'find_email' },
            { pattern: /find.*phone/, command: 'find_phone' },
            { pattern: /click.*button|press.*button/, command: 'click_button', text: message },
            { pattern: /fill.*form|enter.*text/, command: 'fill_form', text: message },
            { pattern: /scroll (down|up)/, command: 'scroll', direction: lowerMessage.includes('down') ? 'down' : 'up' },
            { pattern: /get.*text|extract.*text/, command: 'extract_text', text: message },
            { pattern: /take.*screenshot/, command: 'screenshot' }
        ];

        for (const { pattern, command, ...params } of patterns) {
            if (pattern.test(lowerMessage)) {
                return { command, ...params };
            }
        }

        return null;
    }

    async executeAgentCommand(agentCommand, message, sender, isFromSidebar = false) {
        console.log('🚀 Background: Executing agent command:', agentCommand.command);
        try {
            // Get the correct tab ID - handle different message sources
            const tabId = await this.getTabId(message, sender);
            console.log('🔍 Background: Using tab ID:', tabId);
            
            if (!tabId) {
                throw new Error('No tab ID available');
            }

            // Inject content script if needed
            console.log('📝 Background: Ensuring content script...');
            await this.ensureContentScript(tabId);
            console.log('✅ Background: Content script ready');

            // Send command to content script
            console.log('📤 Background: Sending command to content script');
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'agent_command',
                command: agentCommand.command,
                params: agentCommand,
                originalMessage: message.message
            });

            console.log('📥 Background: Got response from content script:', response);

            if (response && response.success) {
                // If we got data from the page, process it with AI
                if (response.data) {
                    console.log('🧠 Background: Processing with AI...');
                    await this.processAgentResponse(response, message, sender, tabId, isFromSidebar);
                } else {
                    // Simple confirmation message
                    console.log('✅ Background: Sending simple confirmation');
                    const confirmationResponse = {
                        type: 'chat_response',
                        content: response.message || 'Command executed successfully.'
                    };
                    
                    if (isFromSidebar) {
                        chrome.runtime.sendMessage(confirmationResponse);
                    } else {
                        this.sendResponse(tabId, confirmationResponse);
                    }
                }
            } else {
                console.log('❌ Background: Command failed:', response?.error);
                const errorResponse = {
                    type: 'error',
                    error: response?.error || 'Failed to execute command'
                };
                
                if (isFromSidebar) {
                    chrome.runtime.sendMessage(errorResponse);
                } else {
                    this.sendResponse(tabId, errorResponse);
                }
            }

        } catch (error) {
            console.error('❌ Background: Error executing agent command:', error);
            
            const errorResponse = {
                type: 'error',
                error: 'Failed to execute command: ' + error.message
            };
            
            if (isFromSidebar) {
                chrome.runtime.sendMessage(errorResponse);
            } else {
                const tabId = await this.getTabId(message, sender);
                if (tabId) {
                    this.sendResponse(tabId, errorResponse);
                }
            }
        }
    }

    async processAgentResponse(response, message, sender, tabId, isFromSidebar = false) {
        const apiKey = await this.getApiKey();
        
        // Create a context-aware prompt
        let prompt = '';
        switch (response.command) {
            case 'summarize_page':
                console.log('📄 Background: Processing page summary');
                console.log('📄 Background: Page title:', response.data.title);
                console.log('📄 Background: Page URL:', response.data.url);
                console.log('📄 Background: Content length:', response.data.content?.length || 0);
                console.log('📄 Background: Content preview:', response.data.content?.substring(0, 200) || 'No content');
                
                prompt = `You are analyzing a specific web page. Please provide a concise and accurate summary based ONLY on the actual content provided below. Do not make assumptions or add information not present in the content.

Page Title: ${response.data.title}
URL: ${response.data.url}

Page Content:
${response.data.content}

Please summarize what this specific page is about based on the actual content above. Be factual and specific.`;
                break;
            case 'find_email':
                prompt = `I found the following email addresses on the page: ${response.data.join(', ')}`;
                break;
            case 'find_phone':
                prompt = `I found the following phone numbers on the page: ${response.data.join(', ')}`;
                break;
            case 'extract_text':
                prompt = `Here is the extracted text from the page based on your request "${message.message}":\n\n${response.data}`;
                break;
            default:
                prompt = `Command executed. Result: ${response.data}`;
        }

        // Send to ChatGPT for processing (legacy agent commands)
        await this.callOpenAI(prompt, sender, apiKey, tabId, isFromSidebar, null);
    }

    async handleContextualChat(message, sender, apiKey, isFromSidebar = false) {
        console.log('🌐 Background: Starting contextual chat with page content');
        
        try {
            // Get tab ID
            const tabId = await this.getTabId(message, sender);
            
            if (!tabId) {
                console.log('⚠️ Background: No tab ID, sending without page context');
                await this.callOpenAI(message.message, sender, apiKey, null, isFromSidebar, null);
                return;
            }

            // Get page content from the current tab
            console.log('📄 Background: Extracting page content from tab:', tabId);
            
            try {
                // Ensure content script is injected
                await this.ensureContentScript(tabId);
                
                // Get page content
                const pageResponse = await chrome.tabs.sendMessage(tabId, {
                    type: 'agent_command',
                    command: 'get_page_content',
                    params: {},
                    originalMessage: message.message
                });

                console.log('📥 Background: Got page content response:', pageResponse?.success);
                
                if (pageResponse && pageResponse.success && pageResponse.data) {
                    // Send user message + page content to ChatGPT
                    await this.callOpenAI(
                        message.message, 
                        sender, 
                        apiKey, 
                        tabId, 
                        isFromSidebar, 
                        pageResponse.data
                    );
                } else {
                    console.log('⚠️ Background: Could not get page content, sending without context');
                    await this.callOpenAI(message.message, sender, apiKey, tabId, isFromSidebar, null);
                }
                
            } catch (contentError) {
                console.error('❌ Background: Error getting page content:', contentError);
                // Fallback: send without page context
                await this.callOpenAI(message.message, sender, apiKey, tabId, isFromSidebar, null);
            }
            
        } catch (error) {
            console.error('❌ Background: Error in contextual chat:', error);
            throw error;
        }
    }

    async handleRegularChat(message, sender, apiKey, isFromSidebar = false) {
        // Get tab ID using the helper method
        const tabId = await this.getTabId(message, sender);
        await this.callOpenAI(message.message, sender, apiKey, tabId, isFromSidebar, null);
    }

    async callOpenAI(userMessage, sender, apiKey, tabId = null, isFromSidebar = false, pageContent = null) {
        console.log('🤖 Background: Calling OpenAI API...');
        console.log('📝 Background: User message:', userMessage);
        console.log('📄 Background: Has page content:', !!pageContent);
        console.log('📍 Background: Is from sidebar:', isFromSidebar);
        
        // Get or create conversation history for this tab
        const conversationKey = tabId ? `tab_${tabId}` : 'no_tab';
        if (!this.conversationHistory.has(conversationKey)) {
            this.conversationHistory.set(conversationKey, []);
            console.log('💬 Background: Created new conversation for:', conversationKey);
        }
        
        const history = this.conversationHistory.get(conversationKey) || [];
        console.log('💬 Background: Current conversation length:', history.length);
        
        // Log page content info if available
        if (pageContent) {
            console.log('📄 Background: Page title:', pageContent.title);
            console.log('📄 Background: Page URL:', pageContent.url);
            console.log('📄 Background: Content length:', pageContent.content?.length || 0);
        }
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: this.buildMessagesArray(history, userMessage, pageContent),
                    max_tokens: 1000,
                    temperature: 0.5
                })
            });

            console.log('📡 Background: API response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.log('❌ Background: API error data:', errorData);
                throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ Background: API response received');
            const content = data.choices[0]?.message?.content || 'No response generated.';

            // Save conversation history
            if (history) {
                history.push({ role: 'user', content: userMessage });
                history.push({ role: 'assistant', content: content });
                console.log('💬 Background: Saved conversation exchange, total messages:', history.length);
            }

            console.log('📤 Background: Sending response to chat');
            const successResponse = {
                type: 'chat_response',
                content: content
            };
            
            if (isFromSidebar) {
                // For sidebar, send message to all extension contexts
                chrome.runtime.sendMessage(successResponse);
                console.log('✅ Background: Response sent to sidebar');
            } else {
                // For content script, send to specific tab
                const responseTabId = tabId || (sender && sender.tab ? sender.tab.id : null);
                if (responseTabId) {
                    this.sendResponse(responseTabId, successResponse);
                    console.log('✅ Background: Response sent to content script');
                }
            }

        } catch (error) {
            console.error('❌ Background: OpenAI API error:', error);
            let errorMessage = 'Failed to get AI response.';
            
            const errorText = error.message.toLowerCase();
            
            if (errorText.includes('401') || errorText.includes('unauthorized')) {
                errorMessage = 'Invalid API key. Please check your OpenAI API key in the options.';
            } else if (errorText.includes('429') || errorText.includes('rate limit')) {
                errorMessage = 'Rate limit exceeded. Please try again later.';
            } else if (errorText.includes('quota') || errorText.includes('exceeded your current quota') || errorText.includes('billing')) {
                errorMessage = '💳 Quota exceeded! You\'ve reached your OpenAI API usage limit. Please check your billing details and upgrade your plan if needed.';
            } else if (errorText.includes('insufficient_quota')) {
                errorMessage = '💳 Insufficient quota! Please check your OpenAI account billing and add credits.';
            } else {
                errorMessage = `❌ API Error: ${error.message}`;
            }

            console.log('📤 Background: Sending error to chat:', errorMessage);
            console.log('📍 Background: Is from sidebar:', isFromSidebar);
            
            const errorResponse = {
                type: 'error',
                error: errorMessage
            };
            
            if (isFromSidebar) {
                // For sidebar, send message to all extension contexts
                chrome.runtime.sendMessage(errorResponse);
                console.log('✅ Background: Error response sent to sidebar');
            } else {
                // For content script, send to specific tab
                const responseTabId = tabId || (sender && sender.tab ? sender.tab.id : null);
                if (responseTabId) {
                    this.sendResponse(responseTabId, errorResponse);
                    console.log('✅ Background: Error response sent to content script');
                } else {
                    console.error('❌ Background: No tab ID available for error response');
                }
            }
        }
    }

    async handleClearConversation(message, sender) {
        console.log('🗑️ Background: Clearing conversation history');
        
        try {
            // Get tab ID
            const tabId = await this.getTabId(message, sender);
            const conversationKey = tabId ? `tab_${tabId}` : 'no_tab';
            
            // Clear the conversation history for this tab
            this.conversationHistory.set(conversationKey, []);
            console.log('✅ Background: Conversation history cleared for:', conversationKey);
            
        } catch (error) {
            console.error('❌ Background: Error clearing conversation:', error);
        }
    }

    async handleSidebarClosedByUser(sender) {
        console.log('📁 Background: User closed sidebar via X button');
        
        try {
            const tabId = await this.getTabId({}, sender);
            if (tabId) {
                // Update our internal state
                this.sidebarStates.set(tabId, false);
                
                // Notify other content scripts on the same tab
                chrome.tabs.sendMessage(tabId, {
                    type: 'sidebar_closed'
                }).catch(error => {
                    console.log('⚠️ Background: Could not notify content script of sidebar closure (this is normal)');
                });
                
                console.log('✅ Background: Sidebar state updated to closed for tab:', tabId);
            }
        } catch (error) {
            console.error('❌ Background: Error handling sidebar closure:', error);
        }
    }

    async handleGetSidebarState(message, sender, sendResponse) {
        console.log('📊 Background: Getting sidebar state request');
        
        try {
            const tabId = await this.getTabId(message, sender);
            const isOpen = this.sidebarStates.get(tabId) || false;
            
            console.log('📊 Background: Sidebar state for tab', tabId, ':', isOpen);
            sendResponse({ isOpen: isOpen });
            
        } catch (error) {
            console.error('❌ Background: Error getting sidebar state:', error);
            sendResponse({ isOpen: false });
        }
    }

    buildMessagesArray(history, userMessage, pageContent) {
        const messages = [];
        
        // System message with page context if available
        if (pageContent) {
            messages.push({
                role: 'system',
                content: `You are ChromeGPT, an intelligent browser assistant. You help users by answering questions about web pages they are viewing. You maintain conversation context and can refer to previous messages in the chat.

Current Page Information:
Title: ${pageContent.title}
URL: ${pageContent.url}

Page Content:
${pageContent.content}

Be conversational, helpful, and remember what we've discussed. You can reference previous parts of our conversation.`
            });
        } else {
            messages.push({
                role: 'system',
                content: 'You are ChromeGPT, an intelligent browser assistant. You maintain conversation context and can refer to previous messages in the chat. Be conversational, helpful, and remember what we\'ve discussed.'
            });
        }
        
        // Add conversation history (keep last 10 exchanges to manage token limits)
        const recentHistory = history.slice(-20); // Last 20 messages (10 exchanges)
        messages.push(...recentHistory);
        
        // Add current user message
        messages.push({
            role: 'user',
            content: userMessage
        });
        
        console.log('💬 Background: Built messages array with', messages.length, 'messages');
        return messages;
    }

    async ensureContentScript(tabId) {
        try {
            // Try to ping the content script
            await chrome.tabs.sendMessage(tabId, { type: 'ping' });
        } catch (error) {
            // Content script not ready, inject it
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            
            // Wait a bit for the script to initialize
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    sendResponse(tabId, response) {
        chrome.tabs.sendMessage(tabId, response).catch(error => {
            console.error('Error sending response to tab:', error);
        });
    }

    async loadDebugSettings() {
        chrome.storage.sync.get(['debug_logging'], (result) => {
            this.debugEnabled = result.debug_logging || false;
            if (this.debugEnabled) {
                this.debugLog('🌈 Debug logging enabled');
            }
        });
    }

    debugLog(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        
        // Always log to console for development
        console.log(logEntry);
        
        // Store in memory if debug enabled
        if (this.debugEnabled) {
            this.debugLogs.push(logEntry);
            
            // Keep only last 200 logs to prevent memory issues
            if (this.debugLogs.length > 200) {
                this.debugLogs.shift();
            }

            // Send to options page if it's open
            chrome.runtime.sendMessage({
                type: 'debug_log',
                log: logEntry
            }).catch(() => {
                // Options page not open, ignore
            });
        }
    }

    handleSidebarManuallyClosed(sender) {
        const tabId = sender.tab?.id;
        if (tabId) {
            this.debugLog(`🔄 Background: Sidebar manually closed for tab ${tabId}`);
            this.sidebarStates.set(tabId, false);
        }
    }

    handleShowCloseInstructions(sender) {
        const tabId = sender.tab?.id;
        if (tabId) {
            this.debugLog(`💡 Background: Forwarding close instructions to sidebar for tab ${tabId}`);
            // Forward the message to the sidebar
            chrome.runtime.sendMessage({
                type: 'show_close_instructions',
                tabId: tabId
            }).catch(() => {
                // Sidebar might not be open, that's okay
                this.debugLog(`⚠️ Background: Could not send close instructions to sidebar (not open)`);
            });
        }
    }

    handleGetConversationHistory(message, sender, sendResponse) {
        const tabId = message.tabId;
        if (!tabId) {
            sendResponse({ history: [] });
            return;
        }

        const conversationKey = `tab_${tabId}`;
        const history = this.conversationHistory.get(conversationKey) || [];
        
        this.debugLog(`📚 Background: Returning conversation history for tab ${tabId}: ${history.length} messages`);
        
        sendResponse({ 
            history: history,
            tabId: tabId 
        });
    }

    async checkSidebarState(tabId) {
        try {
            // Unfortunately, Chrome doesn't provide a direct way to check if sidebar is open
            // So we'll use a combination of tracking and periodic checks
            const storedState = this.sidebarStates.get(tabId) || false;
            
            // Send current state to content script
            chrome.tabs.sendMessage(tabId, {
                type: 'sidebar_state_update',
                isOpen: storedState
            }).catch(() => {
                // Content script may not be ready, that's okay
            });
            
            this.debugLog(`🔍 Background: Checked sidebar state for tab ${tabId}: ${storedState}`);
        } catch (error) {
            this.debugLog(`❌ Background: Error checking sidebar state: ${error.message}`);
        }
    }
}

// Initialize the background service
const backgroundService = new BackgroundService();
