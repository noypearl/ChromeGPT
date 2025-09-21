class OptionsManager {
    constructor() {
        this.apiKeyInput = document.getElementById('apiKey');
        this.saveButton = document.getElementById('saveButton');
        this.testButton = document.getElementById('testButton');
        this.togglePasswordButton = document.getElementById('togglePassword');
        this.statusMessage = document.getElementById('statusMessage');
        this.debugLogging = document.getElementById('debugLogging');
        this.openLogsButton = document.getElementById('openLogsButton');
        this.debugSection = document.getElementById('debugSection');
        this.debugConsole = document.getElementById('debugConsole');
        this.clearLogsButton = document.getElementById('clearLogsButton');
        this.exportLogsButton = document.getElementById('exportLogsButton');
        this.refreshLogsButton = document.getElementById('refreshLogsButton');
        
        this.debugLogs = [];
        
        this.init();
    }

    init() {
        this.loadSavedSettings();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.saveButton.addEventListener('click', () => this.saveSettings());
        this.testButton.addEventListener('click', () => this.testConnection());
        this.togglePasswordButton.addEventListener('click', () => this.togglePasswordVisibility());
        this.openLogsButton.addEventListener('click', () => this.toggleDebugConsole());
        this.clearLogsButton.addEventListener('click', () => this.clearDebugLogs());
        this.exportLogsButton.addEventListener('click', () => this.exportDebugLogs());
        this.refreshLogsButton.addEventListener('click', () => this.refreshDebugLogs());
        
        this.debugLogging.addEventListener('change', () => this.toggleDebugLogging());
        
        this.apiKeyInput.addEventListener('input', () => {
            this.hideStatus();
            this.updateButtonStates();
        });

        this.apiKeyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.saveSettings();
            }
        });

        // Listen for debug messages from background/content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'debug_log') {
                this.addDebugLog(message.log);
            }
        });
    }

    loadSavedSettings() {
        chrome.storage.sync.get(['openai_api_key', 'debug_logging'], (result) => {
            if (result.openai_api_key) {
                this.apiKeyInput.value = result.openai_api_key;
                this.updateButtonStates();
            }
            
            if (result.debug_logging) {
                this.debugLogging.checked = result.debug_logging;
            }
        });
    }

    saveSettings() {
        const apiKey = this.apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showStatus('Please enter your OpenAI API key', 'error');
            return;
        }

        if (!this.isValidApiKeyFormat(apiKey)) {
            this.showStatus('Invalid API key format. OpenAI keys start with "sk-"', 'error');
            return;
        }

        this.saveButton.disabled = true;
        this.saveButton.textContent = 'Saving...';

        const debugLogging = this.debugLogging.checked;
        
        chrome.storage.sync.set({ 
            openai_api_key: apiKey,
            debug_logging: debugLogging
        }, () => {
            if (chrome.runtime.lastError) {
                this.showStatus('Error saving settings: ' + chrome.runtime.lastError.message, 'error');
            } else {
                this.showStatus('Settings saved successfully!', 'success');
            }
            
            this.saveButton.disabled = false;
            this.saveButton.textContent = 'Save Configuration';
        });
    }

    async testConnection() {
        const apiKey = this.apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showStatus('Please enter your API key first', 'error');
            return;
        }

        this.testButton.disabled = true;
        this.testButton.textContent = 'Testing...';

        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const hasGPTModel = data.data.some(model => 
                    model.id.includes('gpt-3.5-turbo') || model.id.includes('gpt-4')
                );
                
                if (hasGPTModel) {
                    this.showStatus('✅ Connection successful! Your API key is working.', 'success');
                } else {
                    this.showStatus('⚠️ API key works, but no GPT models available. Check your account.', 'error');
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                let errorMessage = 'Connection failed. ';
                
                switch (response.status) {
                    case 401:
                        errorMessage += 'Invalid API key.';
                        break;
                    case 429:
                        errorMessage += 'Rate limit exceeded.';
                        break;
                    case 403:
                        errorMessage += 'Access denied. Check your account status.';
                        break;
                    default:
                        errorMessage += errorData.error?.message || `HTTP ${response.status}`;
                }
                
                this.showStatus(errorMessage, 'error');
            }
        } catch (error) {
            this.showStatus('Network error: ' + error.message, 'error');
        } finally {
            this.testButton.disabled = false;
            this.testButton.textContent = 'Test Connection';
        }
    }

    togglePasswordVisibility() {
        const isPassword = this.apiKeyInput.type === 'password';
        this.apiKeyInput.type = isPassword ? 'text' : 'password';
        this.togglePasswordButton.textContent = isPassword ? 'Hide' : 'Show';
    }

    isValidApiKeyFormat(apiKey) {
        // OpenAI API keys start with 'sk-' and can contain letters, numbers, underscores, and dashes
        // Just check it starts with 'sk-' and has reasonable length
        return apiKey.startsWith('sk-') && apiKey.length > 10;
    }

    showStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message status-${type}`;
        this.statusMessage.style.display = 'block';
        
        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                this.hideStatus();
            }, 3000);
        }
    }

    hideStatus() {
        this.statusMessage.style.display = 'none';
    }

    updateButtonStates() {
        const hasApiKey = this.apiKeyInput.value.trim().length > 0;
        this.testButton.disabled = !hasApiKey;
        this.saveButton.disabled = !hasApiKey;
    }

    toggleDebugLogging() {
        const isEnabled = this.debugLogging.checked;
        chrome.storage.sync.set({ debug_logging: isEnabled }, () => {
            if (isEnabled) {
                this.showStatus('Debug logging enabled. Check console for detailed logs.', 'success');
            } else {
                this.showStatus('Debug logging disabled.', 'success');
            }
        });
    }

    toggleDebugConsole() {
        const isVisible = this.debugSection.style.display !== 'none';
        if (isVisible) {
            this.debugSection.style.display = 'none';
            this.openLogsButton.textContent = 'Open Debug Console';
        } else {
            this.debugSection.style.display = 'block';
            this.openLogsButton.textContent = 'Close Debug Console';
            this.refreshDebugLogs();
        }
    }

    addDebugLog(logEntry) {
        const timestamp = new Date().toLocaleTimeString();
        const logWithTime = `[${timestamp}] ${logEntry}`;
        
        this.debugLogs.push(logWithTime);
        
        // Keep only last 100 logs to prevent memory issues
        if (this.debugLogs.length > 100) {
            this.debugLogs.shift();
        }

        // Update console display if visible
        if (this.debugSection.style.display !== 'none') {
            this.updateDebugConsoleDisplay();
        }
    }

    updateDebugConsoleDisplay() {
        const consoleHtml = this.debugLogs.map(log => {
            let color = '#f3f4f6'; // default white
            
            if (log.includes('✅') || log.includes('success')) {
                color = '#10b981'; // green
            } else if (log.includes('❌') || log.includes('error') || log.includes('Error')) {
                color = '#ef4444'; // red
            } else if (log.includes('⚠️') || log.includes('warning')) {
                color = '#f59e0b'; // yellow
            } else if (log.includes('🔍') || log.includes('🚀') || log.includes('📝')) {
                color = '#3b82f6'; // blue
            } else if (log.includes('🌈')) {
                color = '#8b5cf6'; // purple
            }
            
            return `<div style="color: ${color}; margin-bottom: 2px;">${this.escapeHtml(log)}</div>`;
        }).join('');

        this.debugConsole.innerHTML = consoleHtml || '<div style="color: #6b7280;">No debug logs yet...</div>';
        this.debugConsole.scrollTop = this.debugConsole.scrollHeight;
    }

    clearDebugLogs() {
        this.debugLogs = [];
        this.debugConsole.innerHTML = '<div style="color: #10b981;">🌈 Debug logs cleared</div>';
        this.showStatus('Debug logs cleared.', 'success');
    }

    exportDebugLogs() {
        const logsText = this.debugLogs.join('\n');
        const blob = new Blob([logsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `chromegpt-debug-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showStatus('Debug logs exported successfully.', 'success');
    }

    refreshDebugLogs() {
        // Request fresh logs from background script
        chrome.runtime.sendMessage({ type: 'get_debug_logs' }, (response) => {
            if (response && response.logs) {
                this.debugLogs = response.logs;
                this.updateDebugConsoleDisplay();
            }
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the options manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new OptionsManager();
});
