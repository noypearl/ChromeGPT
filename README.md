# ChromeGPT - Chrome Extension ✨

A powerful Chrome extension that brings ChatGPT's intelligence directly to your browser with advanced agentic capabilities. Chat with AI and perform actions on web pages using natural language commands.

## 🚀 Features

### Chat Interface
- Clean, intuitive popup chat interface
- Real-time conversation with ChatGPT
- Persistent chat history
- Loading states and error handling

### Agent Capabilities
- **Page Summarization**: "Summarize this page"
- **Information Extraction**: "Find the email on this page", "Find phone numbers"
- **Element Interaction**: "Click the sign up button", "Fill the form"
- **Text Extraction**: "Get the price", "Find the main heading"
- **Navigation**: "Scroll down", "Scroll up"

### Security & Privacy
- API key stored locally in Chrome storage
- No data sent to external servers (except OpenAI API)
- Secure API key management with visibility toggle

## 📋 Prerequisites

1. **Chrome Browser** (Version 88 or higher)
2. **OpenAI API Key** - Get one from [OpenAI Platform](https://platform.openai.com/api-keys)
3. **OpenAI Account Credits** - Ensure your account has available credits

## 🛠️ Installation

### Step 1: Download the Extension Files
1. Download or clone all the extension files to a local folder
2. Ensure you have all these files in the same directory:
   - `manifest.json`
   - `popup.html`
   - `popup.js`
   - `background.js`
   - `content.js`
   - `options.html`
   - `options.js`

### Step 2: Load Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the folder containing your extension files
5. The extension should now appear in your extensions list

### Step 3: Configure Your API Key
1. Click the extension icon in your Chrome toolbar
2. Click **"Go to Options"** in the popup
3. Or right-click the extension icon and select **"Options"**
4. Follow the instructions to get your OpenAI API key:
   - Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
   - Sign in to your OpenAI account
   - Click "Create new secret key"
   - Copy the key (starts with `sk-`)
5. Paste your API key in the options page
6. Click **"Test Connection"** to verify it works
7. Click **"Save Configuration"**

## 🎯 Usage

### Basic Chat
1. Click the extension icon to open the chat popup
2. Type any message or question
3. Press Enter or click Send
4. The AI will respond using ChatGPT

### Agent Commands

#### Page Summarization
```
"Summarize this page"
"Give me a summary of this article"
```

#### Find Information
```
"Find the email on this page"
"Find phone numbers"
"Get contact information"
```

#### Click Elements
```
"Click the sign up button"
"Press the submit button"
"Click login"
```

#### Extract Text
```
"Get the price"
"Find the main heading"
"Extract the product description"
```

#### Navigation
```
"Scroll down"
"Scroll up"
```

### Tips for Best Results
- Be specific with button names: "Click the 'Get Started' button"
- Use natural language: "Find the email address on this page"
- Commands work on most websites, but complex sites may need more specific instructions

## 🔧 File Structure

```
ChromeGPT/
├── manifest.json          # Extension configuration
├── popup.html            # Chat interface UI
├── popup.js              # UI logic and messaging
├── background.js         # Main orchestrator and API handler
├── content.js            # Page interaction agent
├── options.html          # Settings page UI
├── options.js            # Settings logic
└── README.md            # This file
```

## 🛡️ Security & Privacy

- **API Key Security**: Your OpenAI API key is stored locally using Chrome's secure storage API
- **No External Servers**: All data stays between your browser and OpenAI's servers
- **Permissions**: The extension only requests necessary permissions:
  - `activeTab`: To interact with the current webpage
  - `scripting`: To inject content scripts for page interaction
  - `storage`: To save your API key and chat history locally

## 🚨 Troubleshooting

### Extension Not Loading
- Ensure all files are in the same folder
- Check that Developer mode is enabled in Chrome
- Try refreshing the extensions page

### API Key Issues
- Verify your API key starts with `sk-`
- Check your OpenAI account has available credits
- Use the "Test Connection" button in options
- Make sure you're using a valid OpenAI API key (not ChatGPT Plus subscription)

### Commands Not Working
- Ensure you're on a webpage (not chrome:// pages)
- Try refreshing the page and retry the command
- Some websites may block certain interactions
- Check the browser console for any error messages

### Chat Not Responding
- Check your internet connection
- Verify your API key is correctly configured
- Check OpenAI service status
- Ensure your OpenAI account has sufficient credits

## 🔄 Updates

To update the extension:
1. Download the new version files
2. Replace the old files in your extension folder
3. Go to `chrome://extensions/`
4. Click the refresh icon on your extension

## 💡 Advanced Usage

### Custom Commands
The extension recognizes natural language patterns. You can try variations like:
- "Find all the links on this page"
- "What's the main topic of this article?"
- "Help me fill out this form"
- "Show me the product details"

### Multiple Tabs
The extension works independently on each tab, so you can have different conversations for different websites.

## 🤝 Contributing

This extension is built with vanilla JavaScript and follows Chrome Extension Manifest V3 standards. Key components:

- **Popup**: User interface for chat
- **Background Script**: Handles API calls and message routing
- **Content Script**: Performs actions on web pages
- **Options Page**: Configuration interface

## 📄 License

This project is open source. Feel free to modify and distribute according to your needs.

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify your OpenAI API key and account status
3. Check Chrome's developer console for error messages
4. Ensure you're using a supported Chrome version

---

**Enjoy your new AI-powered browsing experience! 🎉**
