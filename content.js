class ContentAgent {
    constructor() {
        this.setupMessageListener();
        this.chatWidget = null;
        this.isWidgetVisible = false;
        this.isSidebarOpen = false;
        this.floatingButton = null;
        this.createFloatingWidget();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📥 Content: Received message:', message);
            
            if (message.type === 'ping') {
                console.log('🏓 Content: Responding to ping');
                sendResponse({ success: true });
                return;
            }

            if (message.type === 'agent_command') {
                console.log('🚀 Content: Executing command:', message.command);
                this.executeCommand(message.command, message.params, message.originalMessage)
                    .then(result => {
                        console.log('✅ Content: Command result:', result);
                        sendResponse(result);
                    })
                    .catch(error => {
                        console.error('❌ Content: Command error:', error);
                        sendResponse({ 
                            success: false, 
                            error: error.message 
                        });
                    });
                
                // Return true to indicate we'll respond asynchronously
                return true;
            }
            
            if (message.type === 'sidebar_opened') {
                console.log('📂 Content: Sidebar opened');
                this.setSidebarState(true);
                return;
            }
            
            if (message.type === 'sidebar_closed') {
                console.log('📁 Content: Sidebar closed');
                this.setSidebarState(false);
                return;
            }
        });
    }

    async executeCommand(command, params, originalMessage) {
        try {
            switch (command) {
                case 'get_page_content':
                    return await this.getPageContent();
                
                case 'summarize_page':
                    return await this.summarizePage();
                
                case 'find_email':
                    return await this.findEmails();
                
                case 'find_phone':
                    return await this.findPhones();
                
                case 'click_button':
                    return await this.clickButton(originalMessage);
                
                case 'fill_form':
                    return await this.fillForm(originalMessage);
                
                case 'scroll':
                    return await this.scroll(params.direction);
                
                case 'extract_text':
                    return await this.extractText(originalMessage);
                
                case 'screenshot':
                    return await this.takeScreenshot();
                
                default:
                    throw new Error(`Unknown command: ${command}`);
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getPageContent() {
        console.log('📄 Content: Getting page content for contextual chat');
        
        const title = document.title;
        const url = window.location.href;
        
        // Extract main content
        const content = this.extractMainContent();
        
        console.log('📄 Content: Page title:', title);
        console.log('🌐 Content: Page URL:', url);
        console.log('📝 Content: Content length:', content.length);
        
        return {
            success: true,
            command: 'get_page_content',
            data: {
                title: title,
                url: url,
                content: content.substring(0, 6000) // Increased limit for contextual chat
            }
        };
    }

    async summarizePage() {
        const title = document.title;
        const url = window.location.href;
        
        // Extract main content, avoiding navigation, ads, etc.
        const content = this.extractMainContent();
        
        console.log('📄 Content: Page title:', title);
        console.log('🌐 Content: Page URL:', url);
        console.log('📝 Content: Extracted content length:', content.length);
        console.log('📝 Content: First 500 chars:', content.substring(0, 500));
        
        return {
            success: true,
            command: 'summarize_page',
            data: {
                title: title,
                url: url,
                content: content.substring(0, 4000) // Limit content length
            }
        };
    }

    extractMainContent() {
        // Try to find main content areas in order of preference
        const selectors = [
            'main',
            'article',
            '[role="main"]',
            '.content',
            '.main-content',
            '#content',
            '#main',
            '.post-content',
            '.entry-content',
            '.page-content',
            '.article-content'
        ];

        let content = '';
        let bestContent = '';
        let bestLength = 0;
        
        // Try each selector and keep the one with the most content
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const extractedContent = this.getTextContent(element);
                console.log(`📝 Content: Trying selector "${selector}": ${extractedContent.length} chars`);
                
                if (extractedContent.length > bestLength && extractedContent.length > 50) {
                    bestContent = extractedContent;
                    bestLength = extractedContent.length;
                }
            }
        }

        // If we found good content, use it
        if (bestContent.length > 200) {
            content = bestContent;
            console.log('✅ Content: Using best selector content');
        } else {
            // Fallback: get body text but try to filter out navigation/footer
            console.log('📝 Content: Using body fallback');
            content = this.getTextContent(document.body);
            
            // If body content is too long, try to get just the visible text
            if (content.length > 8000) {
                const visibleElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div');
                let visibleContent = '';
                
                for (const el of visibleElements) {
                    if (this.isElementVisible(el) && el.textContent.trim().length > 20) {
                        visibleContent += el.textContent.trim() + ' ';
                        if (visibleContent.length > 4000) break;
                    }
                }
                
                if (visibleContent.length > 200) {
                    content = visibleContent;
                    console.log('✅ Content: Using visible elements content');
                }
            }
        }

        console.log(`📝 Content: Final content length: ${content.length}`);
        return content;
    }

    isElementVisible(element) {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               element.offsetWidth > 0 && 
               element.offsetHeight > 0;
    }

    getTextContent(element) {
        // Clone the element to avoid modifying the original
        const clone = element.cloneNode(true);
        
        // Remove script, style, and other non-content elements
        const elementsToRemove = clone.querySelectorAll(`
            script, style, nav, header, footer, aside, 
            .ad, .advertisement, .social-share, .comments,
            .sidebar, .menu, .navigation, .breadcrumb,
            .cookie-notice, .popup, .modal, .overlay,
            [role="banner"], [role="navigation"], [role="complementary"],
            .skip-link, .screen-reader-text, .visually-hidden,
            noscript, iframe, embed, object
        `);
        elementsToRemove.forEach(el => el.remove());
        
        // Get text content and clean it up
        let text = clone.textContent || clone.innerText || '';
        
        // Clean up whitespace and common unwanted text
        text = text.replace(/\s+/g, ' ').trim();
        
        // Remove common navigation text patterns
        text = text.replace(/^(Home|Menu|Navigation|Skip to content|Search|Login|Register)\s*/gi, '');
        text = text.replace(/\s*(Copyright|©|Privacy Policy|Terms of Service|Contact Us).*$/gi, '');
        
        return text;
    }

    async findEmails() {
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const text = document.body.textContent;
        const emails = [...new Set(text.match(emailRegex) || [])];
        
        return {
            success: true,
            command: 'find_email',
            data: emails,
            message: emails.length > 0 ? 
                `Found ${emails.length} email address(es): ${emails.join(', ')}` :
                'No email addresses found on this page.'
        };
    }

    async findPhones() {
        const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
        const text = document.body.textContent;
        const phones = [...new Set(text.match(phoneRegex) || [])];
        
        return {
            success: true,
            command: 'find_phone',
            data: phones,
            message: phones.length > 0 ? 
                `Found ${phones.length} phone number(s): ${phones.join(', ')}` :
                'No phone numbers found on this page.'
        };
    }

    async clickButton(originalMessage) {
        const buttonText = this.extractButtonText(originalMessage);
        const button = this.findButton(buttonText);
        
        if (button) {
            // Scroll into view and click
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Wait a moment for scrolling
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Highlight the button briefly
            this.highlightElement(button);
            
            // Click the button
            button.click();
            
            return {
                success: true,
                message: `Clicked button: "${button.textContent.trim()}"`
            };
        } else {
            return {
                success: false,
                error: `Button not found. Available buttons: ${this.getAvailableButtons().join(', ')}`
            };
        }
    }

    extractButtonText(message) {
        // Try to extract button text from the message
        const patterns = [
            /click.*["']([^"']+)["']/i,
            /click.*button.*["']([^"']+)["']/i,
            /click.*on.*["']([^"']+)["']/i,
            /press.*["']([^"']+)["']/i
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                return match[1];
            }
        }

        // If no quotes found, try to extract common button words
        const words = message.toLowerCase().split(' ');
        const buttonWords = ['sign', 'log', 'submit', 'send', 'buy', 'purchase', 'download', 'register', 'login'];
        
        for (const word of buttonWords) {
            if (words.includes(word)) {
                return word;
            }
        }

        return '';
    }

    findButton(searchText) {
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"], .btn, .button');
        
        if (!searchText) {
            return buttons[0]; // Return first button if no specific text
        }

        const searchLower = searchText.toLowerCase();
        
        // First try exact matches
        for (const button of buttons) {
            const text = (button.textContent || button.value || button.alt || '').toLowerCase();
            if (text.includes(searchLower)) {
                return button;
            }
        }

        // Then try partial matches
        for (const button of buttons) {
            const text = (button.textContent || button.value || button.alt || '').toLowerCase();
            if (searchLower.split(' ').some(word => text.includes(word))) {
                return button;
            }
        }

        return null;
    }

    getAvailableButtons() {
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"], .btn, .button');
        return Array.from(buttons)
            .map(btn => (btn.textContent || btn.value || 'Unnamed Button').trim())
            .filter(text => text.length > 0)
            .slice(0, 10); // Limit to first 10 buttons
    }

    async fillForm(originalMessage) {
        // This is a simplified form filling - in a real implementation,
        // you'd want more sophisticated parsing
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea');
        
        if (inputs.length === 0) {
            return {
                success: false,
                error: 'No form fields found on this page.'
            };
        }

        // For demo purposes, focus on the first visible input
        const firstInput = Array.from(inputs).find(input => 
            input.offsetParent !== null && !input.disabled
        );

        if (firstInput) {
            firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.highlightElement(firstInput);
            firstInput.focus();
            
            return {
                success: true,
                message: `Focused on form field: ${firstInput.placeholder || firstInput.name || 'text input'}`
            };
        }

        return {
            success: false,
            error: 'No accessible form fields found.'
        };
    }

    async scroll(direction) {
        const scrollAmount = window.innerHeight * 0.8;
        const currentScroll = window.pageYOffset;
        
        if (direction === 'down') {
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        } else {
            window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        }

        return {
            success: true,
            message: `Scrolled ${direction}`
        };
    }

    async extractText(originalMessage) {
        // Try to find specific text based on the request
        const searchTerms = this.extractSearchTerms(originalMessage);
        let extractedText = '';

        if (searchTerms.length > 0) {
            extractedText = this.findTextByTerms(searchTerms);
        } else {
            extractedText = this.extractMainContent().substring(0, 1000);
        }

        return {
            success: true,
            command: 'extract_text',
            data: extractedText
        };
    }

    extractSearchTerms(message) {
        // Extract potential search terms from the message
        const patterns = [
            /find.*["']([^"']+)["']/i,
            /get.*["']([^"']+)["']/i,
            /extract.*["']([^"']+)["']/i
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                return [match[1]];
            }
        }

        return [];
    }

    findTextByTerms(searchTerms) {
        const allText = document.body.textContent;
        let result = '';

        for (const term of searchTerms) {
            const regex = new RegExp(`.{0,100}${term}.{0,100}`, 'gi');
            const matches = allText.match(regex);
            if (matches) {
                result += matches.join('\n') + '\n';
            }
        }

        return result || 'No matching text found.';
    }

    async takeScreenshot() {
        // Note: Content scripts can't directly take screenshots
        // This would need to be handled by the background script
        return {
            success: false,
            error: 'Screenshot functionality would need to be implemented in the background script.'
        };
    }

    highlightElement(element) {
        const originalStyle = element.style.cssText;
        element.style.cssText += 'outline: 3px solid #10a37f !important; outline-offset: 2px !important;';
        
        setTimeout(() => {
            element.style.cssText = originalStyle;
        }, 2000);
    }

    createFloatingWidget() {
        console.log('🌈 Content: Creating floating widget...');
        
        // Don't create widget on certain pages
        if (window.location.href.startsWith('chrome://') || 
            window.location.href.startsWith('chrome-extension://')) {
            console.log('⚠️ Content: Skipping widget creation on restricted page');
            return;
        }

        console.log('✅ Content: Page allowed, creating chat button...');
        // Create floating chat button
        this.createChatButton();
        
        // Listen for messages from popup to show/hide widget
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'toggle_widget') {
                this.toggleWidget();
            } else if (message.type === 'show_widget') {
                this.showWidget();
            } else if (message.type === 'sidebar_state_update') {
                console.log('📡 Content: Received sidebar state update:', message.isOpen);
                this.setSidebarState(message.isOpen);
            } else if (message.type === 'sidebar_opened') {
                console.log('✅ Content: Sidebar opened notification');
                this.setSidebarState(true);
            } else if (message.type === 'sidebar_close_hint') {
                console.log('💡 Content: Sidebar close hint received');
                this.setSidebarState(false);
            }
        });
    }

    createChatButton() {
        console.log('🔘 Content: Creating chat button...');
        
        // Check if button already exists
        if (document.getElementById('chromegpt-floating-button')) {
            console.log('⚠️ Content: Button already exists, skipping...');
            return;
        }
        
        // Create floating button
        const button = document.createElement('div');
        button.id = 'chromegpt-floating-button';
        this.floatingButton = button;
        // Set initial button state (always start as rainbow since we don't know sidebar state yet)
        this.updateButtonAppearance(button);
        
        // Check current sidebar state from background
        this.checkSidebarState();
        
        // Start periodic sidebar state monitoring
        this.startSidebarMonitoring();

        // Add CSS animation
        if (!document.getElementById('chromegpt-styles')) {
            const style = document.createElement('style');
            style.id = 'chromegpt-styles';
            style.textContent = `
                @keyframes chromegpt-rainbow {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                
                .chromegpt-button-base {
                    position: fixed !important;
                    bottom: 20px !important;
                    right: 20px !important;
                    width: 60px !important;
                    height: 60px !important;
                    border-radius: 50% !important;
                    cursor: pointer !important;
                    z-index: 10000 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 24px !important;
                    color: white !important;
                    transition: all 0.3s ease !important;
                    user-select: none !important;
                    border: none !important;
                    outline: none !important;
                }
                
                .chromegpt-button-rainbow {
                    background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1) !important;
                    background-size: 200% 200% !important;
                    animation: chromegpt-rainbow 3s ease infinite !important;
                    box-shadow: 0 4px 20px rgba(255, 107, 107, 0.3) !important;
                }
                
                .chromegpt-button-close {
                    background: linear-gradient(45deg, #ef4444, #dc2626) !important;
                    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4) !important;
                    animation: none !important;
                }
                
                .chromegpt-button-base:hover {
                    transform: scale(1.1) !important;
                }
                
                .chromegpt-widget {
                    position: fixed !important;
                    bottom: 90px !important;
                    right: 20px !important;
                    width: 350px !important;
                    height: 500px !important;
                    background: white !important;
                    border-radius: 12px !important;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
                    z-index: 9999 !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                    display: flex !important;
                    flex-direction: column !important;
                    overflow: hidden !important;
                    border: 2px solid transparent !important;
                    background-clip: padding-box !important;
                }
                
                .chromegpt-header {
                    background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #ffeaa7, #dda0dd, #ff7675) !important;
                    background-size: 400% 400% !important;
                    animation: chromegpt-rainbow 3s ease infinite !important;
                    color: white !important;
                    padding: 16px !important;
                    text-align: center !important;
                    font-weight: 600 !important;
                    font-size: 16px !important;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
                }
                
                .chromegpt-close {
                    position: absolute !important;
                    top: 12px !important;
                    right: 12px !important;
                    background: rgba(255,255,255,0.2) !important;
                    border: none !important;
                    color: white !important;
                    width: 24px !important;
                    height: 24px !important;
                    border-radius: 50% !important;
                    cursor: pointer !important;
                    font-size: 16px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }
                
                .chromegpt-messages {
                    flex: 1 !important;
                    overflow-y: auto !important;
                    padding: 16px !important;
                    background: #f7f7f8 !important;
                }
                
                .chromegpt-message {
                    margin-bottom: 12px !important;
                    padding: 12px 16px !important;
                    border-radius: 18px !important;
                    max-width: 85% !important;
                    font-size: 14px !important;
                    line-height: 1.4 !important;
                }
                
                .chromegpt-message.user {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                    color: white !important;
                    margin-left: auto !important;
                    text-align: right !important;
                }
                
                .chromegpt-message.assistant {
                    background: white !important;
                    color: #374151 !important;
                    border: 1px solid #e5e7eb !important;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
                }
                
                .chromegpt-input-area {
                    padding: 16px !important;
                    background: white !important;
                    border-top: 1px solid #e5e7eb !important;
                }
                
                .chromegpt-input-container {
                    display: flex !important;
                    gap: 8px !important;
                }
                
                .chromegpt-input {
                    flex: 1 !important;
                    border: 1px solid #d1d5db !important;
                    border-radius: 12px !important;
                    padding: 12px 16px !important;
                    font-size: 14px !important;
                    resize: none !important;
                    max-height: 100px !important;
                    min-height: 40px !important;
                    outline: none !important;
                }
                
                .chromegpt-send-btn {
                    background: linear-gradient(135deg, #ff6b6b, #4ecdc4) !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 12px !important;
                    padding: 12px 16px !important;
                    cursor: pointer !important;
                    font-size: 14px !important;
                    font-weight: 500 !important;
                    min-width: 60px !important;
                    transition: all 0.3s ease !important;
                }
                
                .chromegpt-send-btn:hover {
                    background: linear-gradient(135deg, #4ecdc4, #ff6b6b) !important;
                    transform: translateY(-2px) !important;
                }
                
                .chromegpt-loading {
                    color: #6b7280 !important;
                    font-style: italic !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                }
            `;
            document.head.appendChild(style);
        }

        button.addEventListener('click', () => {
            console.log('🖱️ Content: Button clicked! Toggling sidebar...');
            this.toggleSidebar();
        });

        // Wait for DOM to be ready
        if (document.body) {
            document.body.appendChild(button);
            console.log('✅ Content: Button added to page!');
        } else {
            // If body not ready, wait for it
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) {
                    document.body.appendChild(button);
                    console.log('✅ Content: Button added to page after DOM loaded!');
                }
            });
        }
    }

    updateButtonAppearance(button = this.floatingButton) {
        if (!button) return;
        
        if (this.isSidebarOpen) {
            // X button state
            button.innerHTML = `<div class="chromegpt-button-base chromegpt-button-close">✕</div>`;
            console.log('🔴 Content: Button updated to close state');
        } else {
            // Rainbow button state  
            button.innerHTML = `<div class="chromegpt-button-base chromegpt-button-rainbow">🌈</div>`;
            console.log('🌈 Content: Button updated to rainbow state');
        }
    }

    toggleSidebar() {
        if (this.isSidebarOpen) {
            console.log('❌ Content: Closing sidebar...');
            this.closeSidebar();
        } else {
            console.log('📤 Content: Opening sidebar...');
            // Send message to background script to open sidebar
            chrome.runtime.sendMessage({
                type: 'toggle_sidebar'
            }).catch(error => {
                console.error('❌ Content: Error requesting sidebar toggle:', error);
            });
        }
    }
    
    closeSidebar() {
        console.log('🔄 Content: User wants to close sidebar...');
        
        // Chrome's sidePanel API doesn't allow programmatic closing from content scripts
        // So we'll show a prominent message to guide the user
        this.showCloseSidebarInstructions();
        
        // Update our state immediately since user clicked to close
        this.setSidebarState(false);
        
        console.log('💡 Content: Showing close instructions and updating button state');
    }

    showCloseSidebarInstructions() {
        // Create a temporary overlay with close instructions
        const overlay = document.createElement('div');
        overlay.id = 'chromegpt-close-instructions';
        overlay.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                right: 20px;
                transform: translateY(-50%);
                background: linear-gradient(135deg, #ff6b6b, #4ecdc4);
                color: white;
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                z-index: 10001;
                max-width: 300px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: chromegpt-slide-in 0.3s ease;
            ">
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">
                    🌈 Close Sidebar
                </div>
                <div style="font-size: 14px; line-height: 1.4; margin-bottom: 15px;">
                    To close the sidebar, click the <strong>X</strong> button at the top-right of the sidebar panel.
                </div>
                <div style="text-align: center;">
                    <button onclick="document.getElementById('chromegpt-close-instructions').remove()" style="
                        background: rgba(255,255,255,0.2);
                        border: none;
                        color: white;
                        padding: 8px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                    ">Got it!</button>
                </div>
            </div>
        `;

        // Add slide-in animation if not already added
        if (!document.getElementById('chromegpt-instruction-styles')) {
            const style = document.createElement('style');
            style.id = 'chromegpt-instruction-styles';
            style.textContent = `
                @keyframes chromegpt-slide-in {
                    from {
                        opacity: 0;
                        transform: translateY(-50%) translateX(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(-50%) translateX(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (document.getElementById('chromegpt-close-instructions')) {
                overlay.remove();
            }
        }, 5000);

        // Also send message to sidebar if it exists
        chrome.runtime.sendMessage({
            type: 'show_close_instructions'
        }).catch((error) => {
            // Sidebar might not be listening, that's okay
            console.log('💡 Content: Could not send close instructions to sidebar:', error.message);
        });
    }
    
    setSidebarState(isOpen) {
        console.log('🔄 Content: Setting sidebar state to:', isOpen);
        this.isSidebarOpen = isOpen;
        this.updateButtonAppearance();
    }

    startSidebarMonitoring() {
        // Check sidebar state every 2 seconds to detect manual closures
        this.sidebarMonitorInterval = setInterval(() => {
            this.detectSidebarClosure();
        }, 2000);
        
        console.log('👀 Content: Started sidebar monitoring');
    }

    detectSidebarClosure() {
        // Check if there's a sidebar element visible
        // Chrome's sidebar creates elements in the DOM when open
        const sidebarIndicators = [
            'div[data-testid="side-panel"]',
            '.side-panel',
            '[aria-label*="side panel"]',
            '[aria-label*="sidebar"]'
        ];
        
        let sidebarFound = false;
        for (const selector of sidebarIndicators) {
            if (document.querySelector(selector)) {
                sidebarFound = true;
                break;
            }
        }
        
        // If we think the sidebar is open but can't find it, it was probably closed manually
        if (this.isSidebarOpen && !sidebarFound) {
            console.log('🔍 Content: Detected manual sidebar closure');
            this.isSidebarOpen = false;
            this.updateButtonAppearance();
            
            // Notify background script about the state change
            chrome.runtime.sendMessage({
                type: 'sidebar_manually_closed'
            }).catch(error => {
                console.log('💡 Content: Could not notify sidebar closure (background not ready):', error.message);
            });
        }
    }
    
    async checkSidebarState() {
        console.log('🔍 Content: Checking current sidebar state...');
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'get_sidebar_state'
            });
            if (response && typeof response.isOpen === 'boolean') {
                console.log('📊 Content: Received sidebar state:', response.isOpen);
                this.setSidebarState(response.isOpen);
            }
        } catch (error) {
            console.log('⚠️ Content: Could not get sidebar state, assuming closed');
            this.setSidebarState(false);
        }
    }

    toggleWidget() {
        if (this.isWidgetVisible) {
            this.hideWidget();
        } else {
            this.showWidget();
        }
    }

    showWidget() {
        if (this.chatWidget) {
            this.chatWidget.style.display = 'flex';
            this.isWidgetVisible = true;
            return;
        }

        // Create chat widget
        this.chatWidget = document.createElement('div');
        this.chatWidget.className = 'chromegpt-widget';
        this.chatWidget.innerHTML = `
            <div class="chromegpt-header">
                🌈 ChromeGPT ✨
                <button class="chromegpt-close" onclick="this.closest('.chromegpt-widget').style.display='none'">×</button>
            </div>
            <div class="chromegpt-messages" id="chromegpt-messages">
                <div class="chromegpt-message assistant">
                    🌈 Hey there! I'm ChromeGPT, your fabulous AI assistant! ✨ I can chat with you and perform magical actions on web pages. Try these sparkly commands:
                    <br><br>
                    🔍 "Summarize this page"<br>
                    📧 "Find the email on this page"<br>  
                    👆 "Click the sign up button"
                </div>
            </div>
            <div class="chromegpt-input-area">
                <div class="chromegpt-input-container">
                    <textarea class="chromegpt-input" id="chromegpt-input" placeholder="Type your message or command..."></textarea>
                    <button class="chromegpt-send-btn" id="chromegpt-send">Send</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.chatWidget);
        this.isWidgetVisible = true;

        // Setup event listeners
        const input = document.getElementById('chromegpt-input');
        const sendBtn = document.getElementById('chromegpt-send');
        const closeBtn = this.chatWidget.querySelector('.chromegpt-close');

        sendBtn.addEventListener('click', () => this.sendWidgetMessage());
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendWidgetMessage();
            }
        });

        closeBtn.addEventListener('click', () => this.hideWidget());

        // Focus input
        input.focus();
    }

    hideWidget() {
        if (this.chatWidget) {
            this.chatWidget.style.display = 'none';
            this.isWidgetVisible = false;
        }
    }

    async sendWidgetMessage() {
        const input = document.getElementById('chromegpt-input');
        const messagesContainer = document.getElementById('chromegpt-messages');
        const message = input.value.trim();

        if (!message) return;

        // Add user message
        const userMsg = document.createElement('div');
        userMsg.className = 'chromegpt-message user';
        userMsg.textContent = message;
        messagesContainer.appendChild(userMsg);

        // Clear input
        input.value = '';

        // Add loading message
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'chromegpt-message assistant chromegpt-loading';
        loadingMsg.innerHTML = `
            Thinking
            <div style="display: inline-flex; gap: 2px;">
                <span style="width: 4px; height: 4px; background: #6b7280; border-radius: 50%; animation: chromegpt-loading 1.4s infinite;"></span>
                <span style="width: 4px; height: 4px; background: #6b7280; border-radius: 50%; animation: chromegpt-loading 1.4s infinite 0.2s;"></span>
                <span style="width: 4px; height: 4px; background: #6b7280; border-radius: 50%; animation: chromegpt-loading 1.4s infinite 0.4s;"></span>
            </div>
        `;
        
        // Add loading animation
        if (!document.getElementById('chromegpt-loading-styles')) {
            const style = document.createElement('style');
            style.id = 'chromegpt-loading-styles';
            style.textContent = `
                @keyframes chromegpt-loading {
                    0%, 80%, 100% { opacity: 0.3; }
                    40% { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        messagesContainer.appendChild(loadingMsg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            // Send message to background script
            chrome.runtime.sendMessage({
                type: 'chat_message',
                message: message,
                tabId: await this.getCurrentTabId(),
                url: window.location.href,
                title: document.title,
                source: 'widget'
            });

            // Listen for response
            const responseHandler = (response) => {
                if (response.type === 'chat_response' || response.type === 'error') {
                    // Remove loading message
                    loadingMsg.remove();
                    
                    // Add response
                    const responseMsg = document.createElement('div');
                    responseMsg.className = `chromegpt-message assistant ${response.type === 'error' ? 'error' : ''}`;
                    responseMsg.textContent = response.content || response.error;
                    
                    if (response.type === 'error') {
                        responseMsg.style.background = '#fef2f2';
                        responseMsg.style.color = '#dc2626';
                        responseMsg.style.border = '1px solid #fecaca';
                    }
                    
                    messagesContainer.appendChild(responseMsg);
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    
                    // Remove listener
                    chrome.runtime.onMessage.removeListener(responseHandler);
                }
            };

            chrome.runtime.onMessage.addListener(responseHandler);

        } catch (error) {
            loadingMsg.remove();
            const errorMsg = document.createElement('div');
            errorMsg.className = 'chromegpt-message assistant error';
            errorMsg.textContent = 'Error: ' + error.message;
            errorMsg.style.background = '#fef2f2';
            errorMsg.style.color = '#dc2626';
            messagesContainer.appendChild(errorMsg);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    async getCurrentTabId() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({type: 'get_tab_id'}, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error getting tab ID:', chrome.runtime.lastError);
                    resolve(null);
                } else {
                    resolve(response?.tabId || null);
                }
            });
        });
    }
}

// Initialize the content agent
if (typeof window !== 'undefined') {
    console.log('🚀 Content: Initializing ChromeGPT content agent...');
    try {
        const contentAgent = new ContentAgent();
        console.log('✅ Content: ChromeGPT content agent initialized successfully!');
        
        // Also try to create the widget after a short delay to ensure DOM is ready
        setTimeout(() => {
            if (!document.getElementById('chromegpt-floating-button')) {
                console.log('🔄 Content: Retrying widget creation...');
                contentAgent.createFloatingWidget();
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ Content: Error initializing ChromeGPT:', error);
    }
} else {
    console.log('⚠️ Content: Window not available, skipping initialization');
}
