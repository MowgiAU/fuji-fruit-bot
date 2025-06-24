// Define global variables and functions first
let currentUser = null;

// Global utility functions
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function switchToPage(pageId) {
    console.log('Switching to page:', pageId);
    
    // Hide all pages
    const pages = document.querySelectorAll('.plugin-page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const targetPage = document.getElementById(pageId + '-page');
    if (targetPage) {
        targetPage.classList.add('active');
    } else {
        console.error('Page not found:', pageId + '-page');
    }
    
    // Update navigation active state
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const linkPage = link.getAttribute('data-page');
        if (linkPage === pageId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Make functions globally available
window.switchToPage = switchToPage;
window.showNotification = showNotification;

// Plugin component functions
function getMessagePluginComponent() {
    return {
        html: `
            <div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">💬</span> Message Sender</h3>
                    <p>Send messages to your Discord channels with optional attachments, replies, emojis, and stickers</p>
                </div>
                
                <form id="messageForm" enctype="multipart/form-data">
                    <div class="form-group">
                        <label for="serverSelect">Server</label>
                        <select id="serverSelect" required>
                            <option value="">Select a server...</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="channelSelect">Channel</label>
                        <select id="channelSelect" required disabled>
                            <option value="">Select a channel...</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="replyMessageId">Reply to Message (Optional)</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="replyMessageId" placeholder="Enter message ID to reply to...">
                            <button type="button" id="fetchMessageBtn" disabled class="glass-btn">Fetch</button>
                        </div>
                        <div id="originalMessagePreview" style="display: none; margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px; border-left: 4px solid #7289da;">
                            <div id="originalMessageContent"></div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="messageText">Message</label>
                        <textarea id="messageText" placeholder="Type your message here..." rows="4"></textarea>
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button type="button" id="emojiBtn" disabled class="glass-btn">😀 Emojis</button>
                            <button type="button" id="stickerBtn" disabled class="glass-btn">🎭 Stickers</button>
                        </div>
                        <div id="emojiPicker" style="display: none; margin-top: 10px; max-height: 300px; overflow-y: auto; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 10px;">
                            <div id="emojiGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 5px;"></div>
                        </div>
                        <div id="stickerPicker" style="display: none; margin-top: 10px; max-height: 300px; overflow-y: auto; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 10px;">
                            <div id="stickerGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 10px;"></div>
                            <div id="selectedSticker" style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px; display: none;">
                                <strong>Selected Sticker:</strong> <span id="selectedStickerName"></span>
                                <button type="button" id="clearStickerBtn" class="glass-btn-small">Clear</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="attachments">Attachments</label>
                        <input type="file" id="attachments" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx">
                        <div id="attachmentPreview" style="margin-top: 0.5rem;"></div>
                    </div>
                    
                    <button type="submit" class="btn-primary" disabled>
                        <span class="btn-text">Send Message</span>
                        <span class="btn-loader" style="display: none;">Sending...</span>
                    </button>
                </form>
            </div>
        `,
        script: `
            (function() {
                const serverSelect = document.getElementById('serverSelect');
                const channelSelect = document.getElementById('channelSelect');
                const messageForm = document.getElementById('messageForm');
                const messageText = document.getElementById('messageText');
                const attachments = document.getElementById('attachments');
                const attachmentPreview = document.getElementById('attachmentPreview');
                const replyMessageId = document.getElementById('replyMessageId');
                const fetchMessageBtn = document.getElementById('fetchMessageBtn');
                const originalMessagePreview = document.getElementById('originalMessagePreview');
                const originalMessageContent = document.getElementById('originalMessageContent');
                const emojiBtn = document.getElementById('emojiBtn');
                const stickerBtn = document.getElementById('stickerBtn');
                const emojiPicker = document.getElementById('emojiPicker');
                const stickerPicker = document.getElementById('stickerPicker');
                const emojiGrid = document.getElementById('emojiGrid');
                const stickerGrid = document.getElementById('stickerGrid');
                const selectedSticker = document.getElementById('selectedSticker');
                const selectedStickerName = document.getElementById('selectedStickerName');
                const clearStickerBtn = document.getElementById('clearStickerBtn');
                const submitBtn = messageForm ? messageForm.querySelector('button[type="submit"]') : null;
                const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
                const btnLoader = submitBtn ? submitBtn.querySelector('.btn-loader') : null;
                let currentReplyMessageId = null;
                let currentStickerId = null;
                let serverEmojis = [];
                let serverStickers = [];
                if (serverSelect) {
                    loadMessageServers();
                    serverSelect.addEventListener('change', function() {
                        const serverId = this.value;
                        if (serverId) {
                            loadMessageChannels(serverId);
                            loadEmojisAndStickers(serverId);
                            channelSelect.disabled = false;
                            if (emojiBtn) emojiBtn.disabled = false;
                            if (stickerBtn) stickerBtn.disabled = false;
                        } else {
                            channelSelect.disabled = true;
                            channelSelect.innerHTML = '<option value="">Select a channel...</option>';
                            if (emojiBtn) emojiBtn.disabled = true;
                            if (stickerBtn) stickerBtn.disabled = true;
                            if (emojiPicker) emojiPicker.style.display = 'none';
                            if (stickerPicker) stickerPicker.style.display = 'none';
                        }
                        updateFetchButton();
                        updateSubmitButton();
                    });
                }
                if (channelSelect) {
                    channelSelect.addEventListener('change', function() {
                        updateFetchButton();
                        updateSubmitButton();
                        clearReplyPreview();
                    });
                }
                if (replyMessageId) {
                    replyMessageId.addEventListener('input', function() {
                        updateFetchButton();
                        clearReplyPreview();
                    });
                }
                if (fetchMessageBtn) {
                    fetchMessageBtn.addEventListener('click', async function() {
                        await fetchOriginalMessage();
                    });
                }
                if (emojiBtn) {
                    emojiBtn.addEventListener('click', function() {
                        if (emojiPicker.style.display === 'none') {
                            emojiPicker.style.display = 'block';
                            if (stickerPicker) stickerPicker.style.display = 'none';
                        } else {
                            emojiPicker.style.display = 'none';
                        }
                    });
                }
                if (stickerBtn) {
                    stickerBtn.addEventListener('click', function() {
                        if (stickerPicker.style.display === 'none') {
                            stickerPicker.style.display = 'block';
                            if (emojiPicker) emojiPicker.style.display = 'none';
                        } else {
                            stickerPicker.style.display = 'none';
                        }
                    });
                }
                if (clearStickerBtn) {
                    clearStickerBtn.addEventListener('click', function() {
                        currentStickerId = null;
                        selectedSticker.style.display = 'none';
                        updateSubmitButton();
                    });
                }
                if (messageText) {
                    messageText.addEventListener('input', updateSubmitButton);
                }
                if (attachments) {
                    attachments.addEventListener('change', function() {
                        updateAttachmentPreview();
                        updateSubmitButton();
                    });
                }
                if (messageForm) {
                    messageForm.addEventListener('submit', async function(e) {
                        e.preventDefault();
                        await sendMessage();
                    });
                }
                async function loadMessageServers() {
                    try {
                        const response = await fetch('/api/servers');
                        const servers = await response.json();
                        serverSelect.innerHTML = '<option value="">Select a server...</option>';
                        servers.forEach(server => {
                            const option = document.createElement('option');
                            option.value = server.id;
                            option.textContent = server.name;
                            serverSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading servers:', error);
                        showNotification('Error loading servers', 'error');
                    }
                }
                async function loadMessageChannels(serverId) {
                    try {
                        channelSelect.innerHTML = '<option value="">Loading...</option>';
                        const response = await fetch(\`/api/channels/\${serverId}\`);
                        const channels = await response.json();
                        channelSelect.innerHTML = '<option value="">Select a channel...</option>';
                        channels.forEach(channel => {
                            const option = document.createElement('option');
                            option.value = channel.id;
                            option.textContent = \`# \${channel.name}\`;
                            channelSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading channels:', error);
                        channelSelect.innerHTML = '<option value="">Error loading channels</option>';
                    }
                }
                async function loadEmojisAndStickers(serverId) {
                    try {
                        const response = await fetch(\`/api/plugins/message/emojis/\${serverId}\`);
                        const data = await response.json();
                        if (response.ok) {
                            serverEmojis = data.emojis;
                            serverStickers = data.stickers;
                            displayEmojis();
                            displayStickers();
                        } else {
                            console.error('Error loading emojis and stickers:', data.error);
                        }
                    } catch (error) {
                        console.error('Error loading emojis and stickers:', error);
                    }
                }
                function displayEmojis() {
                    if (!emojiGrid) return;
                    emojiGrid.innerHTML = '';
                    serverEmojis.forEach(emoji => {
                        const emojiElement = document.createElement('div');
                        emojiElement.style.cssText = 'cursor: pointer; padding: 5px; border-radius: 4px; text-align: center; transition: background 0.2s;';
                        emojiElement.innerHTML = \`<img src="\${emoji.url}" alt="\${emoji.name}" title="\${emoji.name}" style="width: 32px; height: 32px;">\`;
                        emojiElement.addEventListener('click', function() {
                            insertEmoji(emoji.usage);
                        });
                        emojiElement.addEventListener('mouseenter', function() {
                            this.style.background = 'rgba(255,255,255,0.1)';
                        });
                        emojiElement.addEventListener('mouseleave', function() {
                            this.style.background = 'transparent';
                        });
                        emojiGrid.appendChild(emojiElement);
                    });
                }
                function displayStickers() {
                    if (!stickerGrid) return;
                    stickerGrid.innerHTML = '';
                    serverStickers.forEach(sticker => {
                        const stickerElement = document.createElement('div');
                        stickerElement.style.cssText = 'cursor: pointer; padding: 5px; border-radius: 4px; text-align: center; transition: background 0.2s;';
                        stickerElement.innerHTML = \`<img src="\${sticker.url}" alt="\${sticker.name}" title="\${sticker.name}" style="width: 50px; height: 50px; object-fit: contain;">\`;
                        stickerElement.addEventListener('click', function() {
                            selectSticker(sticker);
                        });
                        stickerElement.addEventListener('mouseenter', function() {
                            this.style.background = 'rgba(255,255,255,0.1)';
                        });
                        stickerElement.addEventListener('mouseleave', function() {
                            this.style.background = 'transparent';
                        });
                        stickerGrid.appendChild(stickerElement);
                    });
                }
                function insertEmoji(emojiUsage) {
                    if (!messageText) return;
                    const currentText = messageText.value;
                    const cursorPos = messageText.selectionStart;
                    const newText = currentText.slice(0, cursorPos) + emojiUsage + ' ' + currentText.slice(cursorPos);
                    messageText.value = newText;
                    messageText.focus();
                    messageText.setSelectionRange(cursorPos + emojiUsage.length + 1, cursorPos + emojiUsage.length + 1);
                    updateSubmitButton();
                }
                function selectSticker(sticker) {
                    currentStickerId = sticker.id;
                    if (selectedStickerName) selectedStickerName.textContent = sticker.name;
                    if (selectedSticker) selectedSticker.style.display = 'block';
                    if (stickerPicker) stickerPicker.style.display = 'none';
                    updateSubmitButton();
                }
                async function fetchOriginalMessage() {
                    const channelId = channelSelect ? channelSelect.value : '';
                    const messageId = replyMessageId ? replyMessageId.value.trim() : '';
                    if (!channelId || !messageId) return;
                    try {
                        if (fetchMessageBtn) {
                            fetchMessageBtn.textContent = 'Fetching...';
                            fetchMessageBtn.disabled = true;
                        }
                        const response = await fetch(\`/api/plugins/message/\${channelId}/\${messageId}\`);
                        const messageData = await response.json();
                        if (response.ok) {
                            currentReplyMessageId = messageId;
                            displayOriginalMessage(messageData);
                            updateSubmitButton();
                        } else {
                            throw new Error(messageData.error || 'Failed to fetch message');
                        }
                    } catch (error) {
                        console.error('Error fetching message:', error);
                        showNotification(error.message, 'error');
                        clearReplyPreview();
                    } finally {
                        if (fetchMessageBtn) {
                            fetchMessageBtn.textContent = 'Fetch';
                            updateFetchButton();
                        }
                    }
                }
                function displayOriginalMessage(messageData) {
                    if (!originalMessageContent) return;
                    const createdAt = new Date(messageData.createdAt).toLocaleString();
                    originalMessageContent.innerHTML = \`
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <img src="\${messageData.author.avatar}" alt="Avatar" style="width: 20px; height: 20px; border-radius: 50%;">
                            <strong>\${messageData.author.username}</strong>
                            <span style="opacity: 0.7; font-size: 0.9em;">\${createdAt}</span>
                        </div>
                        <div style="margin-left: 28px;">
                            \${messageData.content || '<em>No text content</em>'}
                        </div>
                        <div style="margin-left: 28px; margin-top: 4px; opacity: 0.7; font-size: 0.9em;">
                            in #\${messageData.channelName} • \${messageData.guildName}
                        </div>
                    \`;
                    if (originalMessagePreview) originalMessagePreview.style.display = 'block';
                }
                function clearReplyPreview() {
                    currentReplyMessageId = null;
                    if (originalMessagePreview) originalMessagePreview.style.display = 'none';
                    updateSubmitButton();
                }
                function updateFetchButton() {
                    if (!fetchMessageBtn) return;
                    const hasChannel = channelSelect ? channelSelect.value : false;
                    const hasMessageId = replyMessageId ? replyMessageId.value.trim() : false;
                    fetchMessageBtn.disabled = !hasChannel || !hasMessageId;
                }
                function updateAttachmentPreview() {
                    if (!attachmentPreview || !attachments) return;
                    const files = Array.from(attachments.files);
                    attachmentPreview.innerHTML = '';
                    if (files.length > 0) {
                        files.forEach((file, index) => {
                            const fileDiv = document.createElement('div');
                            fileDiv.style.cssText = 'background: rgba(255,255,255,0.1); border-radius: 8px; padding: 0.5rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;';
                            fileDiv.innerHTML = \`
                                <span style="font-weight: 500;">\${file.name}</span>
                                <span style="opacity: 0.7; font-size: 0.9rem;">(\${formatFileSize(file.size)})</span>
                            \`;
                            attachmentPreview.appendChild(fileDiv);
                        });
                    }
                }
                function updateSubmitButton() {
                    if (!submitBtn) return;
                    const hasServer = serverSelect ? serverSelect.value : false;
                    const hasChannel = channelSelect ? channelSelect.value : false;
                    const hasMessage = messageText ? messageText.value.trim() : false;
                    const hasAttachments = attachments ? attachments.files.length > 0 : false;
                    const hasSticker = currentStickerId;
                    const canSubmit = hasServer && hasChannel && (hasMessage || hasAttachments || hasSticker);
                    submitBtn.disabled = !canSubmit;
                }
                async function sendMessage() {
                    if (!serverSelect || !channelSelect) return;
                    const formData = new FormData();
                    formData.append('serverId', serverSelect.value);
                    formData.append('channelId', channelSelect.value);
                    formData.append('message', messageText ? messageText.value : '');
                    if (currentReplyMessageId) {
                        formData.append('replyToMessageId', currentReplyMessageId);
                    }
                    if (currentStickerId) {
                        formData.append('stickerId', currentStickerId);
                    }
                    if (attachments) {
                        Array.from(attachments.files).forEach(file => {
                            formData.append('attachments', file);
                        });
                    }
                    try {
                        if (btnText) btnText.style.display = 'none';
                        if (btnLoader) btnLoader.style.display = 'inline';
                        if (submitBtn) submitBtn.disabled = true;
                        const response = await fetch('/api/plugins/message/send', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();
                        if (response.ok) {
                            let messageType = 'Message sent successfully!';
                            if (currentReplyMessageId && currentStickerId) {
                                messageType = 'Reply with sticker sent successfully!';
                            } else if (currentReplyMessageId) {
                                messageType = 'Reply sent successfully!';
                            } else if (currentStickerId) {
                                messageType = 'Sticker sent successfully!';
                            }
                            showNotification(messageType, 'success');
                            if (messageText) messageText.value = '';
                            if (attachments) attachments.value = '';
                            if (replyMessageId) replyMessageId.value = '';
                            currentStickerId = null;
                            if (selectedSticker) selectedSticker.style.display = 'none';
                            updateAttachmentPreview();
                            clearReplyPreview();
                            updateSubmitButton();
                            updateFetchButton();
                        } else {
                            throw new Error(result.error || 'Failed to send message');
                        }
                    } catch (error) {
                        console.error('Error sending message:', error);
                        showNotification(error.message, 'error');
                    } finally {
                        if (btnText) btnText.style.display = 'inline';
                        if (btnLoader) btnLoader.style.display = 'none';
                        updateSubmitButton();
                    }
                }
                function formatFileSize(bytes) {
                    if (bytes === 0) return '0 Bytes';
                    const k = 1024;
                    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                }
            })();
        `
    };
}

function getWordFilterPluginComponent() {
    return {
        html: `
            <div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">🚫</span> Word Filter</h3>
                    <p>Automatically detect and filter inappropriate words from messages</p>
                </div>
                
                <form id="wordFilterForm">
                    <div class="form-group">
                        <label for="filterServerSelect">Server</label>
                        <select id="filterServerSelect" required>
                            <option value="">Select a server...</option>
                        </select>
                    </div>
                    
                    <div id="filterSettings" style="display: none;">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="filterEnabled" style="margin-right: 8px;">
                                Enable Word Filter
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label for="logChannelSelect">Log Channel (Optional)</label>
                            <select id="logChannelSelect">
                                <option value="">Select a channel for logs...</option>
                            </select>
                            <small style="opacity: 0.7; display: block; margin-top: 4px;">
                                Choose where filtered message logs will be sent
                            </small>
                        </div>
                        
                        <div class="form-group">
                            <label for="newWord">Add Blocked Word</label>
                            <div style="display: flex; gap: 10px;">
                                <input type="text" id="newWord" placeholder="Enter word to block...">
                                <button type="button" id="addWordBtn" class="glass-btn">Add Word</button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Blocked Words</label>
                            <div id="blockedWordsList" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px;">
                                <div id="noWordsMessage" style="opacity: 0.6; text-align: center; padding: 20px;">
                                    No blocked words configured
                                </div>
                            </div>
                        </div>
                        
                        <button type="button" id="saveFilterSettings" class="btn-primary">
                            <span class="btn-text">Save Settings</span>
                            <span class="btn-loader" style="display: none;">Saving...</span>
                        </button>
                    </div>
                </form>
            </div>
        `,
        script: `
            (function() {
                const filterServerSelect = document.getElementById('filterServerSelect');
                const logChannelSelect = document.getElementById('logChannelSelect');
                const filterSettings = document.getElementById('filterSettings');
                const filterEnabled = document.getElementById('filterEnabled');
                const newWord = document.getElementById('newWord');
                const addWordBtn = document.getElementById('addWordBtn');
                const blockedWordsList = document.getElementById('blockedWordsList');
                const noWordsMessage = document.getElementById('noWordsMessage');
                const saveFilterSettings = document.getElementById('saveFilterSettings');
                const btnText = saveFilterSettings ? saveFilterSettings.querySelector('.btn-text') : null;
                const btnLoader = saveFilterSettings ? saveFilterSettings.querySelector('.btn-loader') : null;
                let currentServerId = null;
                let currentSettings = null;
                if (filterServerSelect) {
                    filterServerSelect.addEventListener('change', function() {
                        const serverId = this.value;
                        if (serverId) {
                            currentServerId = serverId;
                            loadFilterChannels(serverId);
                            loadFilterSettings(serverId);
                            filterSettings.style.display = 'block';
                        } else {
                            filterSettings.style.display = 'none';
                        }
                    });
                    loadFilterServers();
                }
                if (addWordBtn) {
                    addWordBtn.addEventListener('click', addBlockedWord);
                }
                if (newWord) {
                    newWord.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            addBlockedWord();
                        }
                    });
                }
                if (saveFilterSettings) {
                    saveFilterSettings.addEventListener('click', saveFilterSettings_internal);
                }
                async function loadFilterServers() {
                    try {
                        const response = await fetch('/api/servers');
                        const servers = await response.json();
                        filterServerSelect.innerHTML = '<option value="">Select a server...</option>';
                        servers.forEach(server => {
                            const option = document.createElement('option');
                            option.value = server.id;
                            option.textContent = server.name;
                            filterServerSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading servers:', error);
                        showNotification('Error loading servers', 'error');
                    }
                }
                async function loadFilterChannels(serverId) {
                    try {
                        logChannelSelect.innerHTML = '<option value="">Loading...</option>';
                        const response = await fetch(\`/api/channels/\${serverId}\`);
                        const channels = await response.json();
                        logChannelSelect.innerHTML = '<option value="">Select a channel for logs...</option>';
                        channels.forEach(channel => {
                            const option = document.createElement('option');
                            option.value = channel.id;
                            option.textContent = \`# \${channel.name}\`;
                            logChannelSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading channels:', error);
                        logChannelSelect.innerHTML = '<option value="">Error loading channels</option>';
                    }
                }
                async function loadFilterSettings(serverId) {
                    try {
                        const response = await fetch(\`/api/plugins/wordfilter/settings/\${serverId}\`);
                        const settings = await response.json();
                        currentSettings = settings;
                        filterEnabled.checked = settings.enabled;
                        if (settings.logChannelId && logChannelSelect) {
                            logChannelSelect.value = settings.logChannelId;
                        }
                        displayBlockedWords(settings.blockedWords || []);
                    } catch (error) {
                        console.error('Error loading filter settings:', error);
                        showNotification('Error loading filter settings', 'error');
                    }
                }
                function displayBlockedWords(words) {
                    if (!blockedWordsList) return;
                    if (words.length === 0) {
                        blockedWordsList.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No blocked words configured</div>';
                        return;
                    }
                    blockedWordsList.innerHTML = '';
                    words.forEach(word => {
                        const wordElement = document.createElement('div');
                        wordElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 6px;';
                        wordElement.innerHTML = \`
                            <span style="font-family: monospace;">\${word}</span>
                            <button type="button" onclick="window.removeFilterWord('\${word}')" class="glass-btn-small">Remove</button>
                        \`;
                        blockedWordsList.appendChild(wordElement);
                    });
                }
                async function addBlockedWord() {
                    const word = newWord ? newWord.value.trim() : '';
                    if (!word || !currentServerId) {
                        showNotification('Please enter a word and select a server', 'error');
                        return;
                    }
                    try {
                        const response = await fetch(\`/api/plugins/wordfilter/words/\${currentServerId}\`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ word
                            })
                        });
                        const result = await response.json();
                        if (response.ok) {
                            newWord.value = '';
                            displayBlockedWords(result.blockedWords);
                            currentSettings.blockedWords = result.blockedWords;
                            showNotification('Word added successfully', 'success');
                        } else {
                            throw new Error(result.error || 'Failed to add word');
                        }
                    } catch (error) {
                        console.error('Error adding word:', error);
                        showNotification(error.message, 'error');
                    }
                }
                window.removeFilterWord = async function(word) {
                    if (!currentServerId) return;
                    try {
                        const response = await fetch(\`/api/plugins/wordfilter/words/\${currentServerId}/\${encodeURIComponent(word)}\`, {
                            method: 'DELETE'
                        });
                        const result = await response.json();
                        if (response.ok) {
                            displayBlockedWords(result.blockedWords);
                            currentSettings.blockedWords = result.blockedWords;
                            showNotification('Word removed successfully', 'success');
                        } else {
                            throw new Error(result.error || 'Failed to remove word');
                        }
                    } catch (error) {
                        console.error('Error removing word:', error);
                        showNotification(error.message, 'error');
                    }
                };
                async function saveFilterSettings_internal() {
                    if (!currentServerId) {
                        showNotification('Please select a server first', 'error');
                        return;
                    }
                    try {
                        if (btnText) btnText.style.display = 'none';
                        if (btnLoader) btnLoader.style.display = 'inline';
                        if (saveFilterSettings) saveFilterSettings.disabled = true;
                        const settings = {
                            enabled: filterEnabled ? filterEnabled.checked : false,
                            logChannelId: logChannelSelect ? logChannelSelect.value || null : null,
                            blockedWords: currentSettings?.blockedWords || []
                        };
                        const response = await fetch(\`/api/plugins/wordfilter/settings/\${currentServerId}\`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(settings)
                        });
                        const result = await response.json();
                        if (response.ok) {
                            showNotification('Filter settings saved successfully!', 'success');
                            currentSettings = settings;
                        } else {
                            throw new Error(result.error || 'Failed to save settings');
                        }
                    } catch (error) {
                        console.error('Error saving settings:', error);
                        showNotification(error.message, 'error');
                    } finally {
                        if (btnText) btnText.style.display = 'inline';
                        if (btnLoader) btnLoader.style.display = 'none';
                        if (saveFilterSettings) saveFilterSettings.disabled = false;
                    }
                }
            })();
        `
    };
}

function getLevelingPluginComponent() {
    return {
        html: `
            <div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">📈</span> Leveling System</h3>
                    <p>Configure XP sources, view leaderboards, and manage user levels</p>
                </div>

                <div class="settings-section">
                    <h3>Settings</h3>
                    <div class="form-group">
                        <label>Server:</label>
                        <select id="leveling-server-select" class="form-control">
                            <option value="">Select a server...</option>
                        </select>
                    </div>

                    <div id="leveling-settings-container" style="display: none;">
                        <div class="form-group">
                            <label>XP Sources:</label>
                            <div class="checkbox-group">
                                <label><input type="checkbox" id="xp-source-messages"> Messages</label>
                                <label><input type="checkbox" id="xp-source-voice"> Voice Activity</label>
                                <label><input type="checkbox" id="xp-source-reactions"> Reactions</label>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Level Up Channel:</label>
                            <select id="levelup-channel-select" class="form-control">
                                <option value="">No level up announcements</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>XP Multiplier:</label>
                            <input type="number" id="xp-multiplier" class="form-control" min="0.1" max="10" step="0.1" value="1.0">
                        </div>

                        <button id="save-leveling-settings" class="btn-primary">
                            <span class="btn-text">Save Settings</span>
                            <span class="btn-loader" style="display: none;">Saving...</span>
                        </button>
                    </div>
                </div>

                <div class="leaderboard-section" style="display: none;" id="leaderboard-section">
                    <h3>Leaderboards</h3>
                    <div class="button-group">
                        <button class="btn-secondary leaderboard-btn active" data-type="overall">Overall XP</button>
                        <button class="btn-secondary leaderboard-btn" data-type="voice">Voice Time</button>
                        <button class="btn-secondary leaderboard-btn" data-type="reactions">Reactions</button>
                    </div>

                    <div id="leaderboard-container">
                        <div class="loading">Loading leaderboard...</div>
                    </div>
                </div>

                <div class="admin-section" style="display: none;" id="admin-section">
                    <h3>Admin Actions</h3>
                    <div class="form-group">
                        <label>Add XP to User:</label>
                        <input type="text" id="target-user-id" class="form-control" placeholder="User ID" style="margin-bottom: 0.5rem;">
                        <input type="number" id="xp-amount" class="form-control" placeholder="XP Amount" style="margin-bottom: 0.5rem;">
                        <button id="add-xp-btn" class="btn-primary">Add XP</button>
                    </div>
                </div>
            </div>
        `,
        script: `
            (function() {
                let currentGuildId = null;
                let currentLeaderboardType = 'overall';
                async function loadLevelingServers() {
                    try {
                        const response = await fetch('/api/servers');
                        const servers = await response.json();
                        const select = document.getElementById('leveling-server-select');
                        if (select) {
                            select.innerHTML = '<option value="">Select a server...</option>';
                            servers.forEach(server => {
                                const option = document.createElement('option');
                                option.value = server.id;
                                option.textContent = server.name;
                                select.appendChild(option);
                            });
                        }
                    } catch (error) {
                        console.error('Error loading servers:', error);
                        showNotification('Error loading servers', 'error');
                    }
                }
                function initializeLevelingPage() {
                    loadLevelingServers();
                    const serverSelect = document.getElementById('leveling-server-select');
                    if (serverSelect) {
                        serverSelect.addEventListener('change', function() {
                            currentGuildId = this.value;
                            if (currentGuildId) {
                                loadLevelingSettings();
                                loadLevelingChannels();
                                loadLeaderboard();
                                document.getElementById('leveling-settings-container').style.display = 'block';
                                document.getElementById('leaderboard-section').style.display = 'block';
                                document.getElementById('admin-section').style.display = 'block';
                            } else {
                                document.getElementById('leveling-settings-container').style.display = 'none';
                                document.getElementById('leaderboard-section').style.display = 'none';
                                document.getElementById('admin-section').style.display = 'none';
                            }
                        });
                    }
                    const saveBtn = document.getElementById('save-leveling-settings');
                    if (saveBtn) {
                        saveBtn.addEventListener('click', saveLevelingSettings);
                    }
                    const addXpBtn = document.getElementById('add-xp-btn');
                    if (addXpBtn) {
                        addXpBtn.addEventListener('click', addXPToUser);
                    }
                    document.querySelectorAll('.leaderboard-btn').forEach(btn => {
                        btn.addEventListener('click', function() {
                            document.querySelectorAll('.leaderboard-btn').forEach(b => b.classList.remove('active'));
                            this.classList.add('active');
                            currentLeaderboardType = this.dataset.type;
                            loadLeaderboard();
                        });
                    });
                }
                async function loadLevelingSettings() {
                    try {
                        const response = await fetch(\`/api/plugins/leveling/settings/\${currentGuildId}\`);
                        const settings = await response.json();
                        const messagesCheckbox = document.getElementById('xp-source-messages');
                        const voiceCheckbox = document.getElementById('xp-source-voice');
                        const reactionsCheckbox = document.getElementById('xp-source-reactions');
                        const channelSelect = document.getElementById('levelup-channel-select');
                        const multiplierInput = document.getElementById('xp-multiplier');
                        if (messagesCheckbox) messagesCheckbox.checked = settings.xpSources?.messages || false;
                        if (voiceCheckbox) voiceCheckbox.checked = settings.xpSources?.voice || false;
                        if (reactionsCheckbox) reactionsCheckbox.checked = settings.xpSources?.reactions || false;
                        if (channelSelect) channelSelect.value = settings.levelUpChannel || '';
                        if (multiplierInput) multiplierInput.value = settings.xpMultiplier || 1.0;
                    } catch (error) {
                        console.error('Error loading leveling settings:', error);
                        showNotification('Error loading settings', 'error');
                    }
                }
                async function saveLevelingSettings() {
                    try {
                        const messagesCheckbox = document.getElementById('xp-source-messages');
                        const voiceCheckbox = document.getElementById('xp-source-voice');
                        const reactionsCheckbox = document.getElementById('xp-source-reactions');
                        const channelSelect = document.getElementById('levelup-channel-select');
                        const multiplierInput = document.getElementById('xp-multiplier');
                        const saveBtn = document.getElementById('save-leveling-settings');
                        const btnText = saveBtn ? saveBtn.querySelector('.btn-text') : null;
                        const btnLoader = saveBtn ? saveBtn.querySelector('.btn-loader') : null;
                        if (btnText) btnText.style.display = 'none';
                        if (btnLoader) btnLoader.style.display = 'inline';
                        if (saveBtn) saveBtn.disabled = true;
                        const settings = {
                            xpSources: {
                                messages: messagesCheckbox ? messagesCheckbox.checked : false,
                                voice: voiceCheckbox ? voiceCheckbox.checked : false,
                                reactions: reactionsCheckbox ? reactionsCheckbox.checked : false
                            },
                            levelUpChannel: channelSelect ? channelSelect.value || null : null,
                            xpMultiplier: multiplierInput ? parseFloat(multiplierInput.value) : 1.0
                        };
                        const response = await fetch(\`/api/plugins/leveling/settings/\${currentGuildId}\`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(settings)
                        });
                        if (response.ok) {
                            showNotification('Settings saved successfully!', 'success');
                        } else {
                            throw new Error('Failed to save settings');
                        }
                    } catch (error) {
                        console.error('Error saving settings:', error);
                        showNotification('Error saving settings', 'error');
                    } finally {
                        const saveBtn = document.getElementById('save-leveling-settings');
                        const btnText = saveBtn ? saveBtn.querySelector('.btn-text') : null;
                        const btnLoader = saveBtn ? saveBtn.querySelector('.btn-loader') : null;
                        if (btnText) btnText.style.display = 'inline';
                        if (btnLoader) btnLoader.style.display = 'none';
                        if (saveBtn) saveBtn.disabled = false;
                    }
                }
                async function loadLevelingChannels() {
                    try {
                        const response = await fetch(\`/api/channels/\${currentGuildId}\`);
                        const channels = await response.json();
                        const select = document.getElementById('levelup-channel-select');
                        if (select) {
                            select.innerHTML = '<option value="">No level up announcements</option>';
                            channels.forEach(channel => {
                                const option = document.createElement('option');
                                option.value = channel.id;
                                option.textContent = \`#\${channel.name}\`;
                                select.appendChild(option);
                            });
                        }
                    } catch (error) {
                        console.error('Error loading channels:', error);
                    }
                }
                async function loadLeaderboard() {
                    try {
                        const container = document.getElementById('leaderboard-container');
                        if (container) {
                            container.innerHTML = '<div class="loading">Loading leaderboard...</div>';
                            const response = await fetch(\`/api/plugins/leveling/leaderboard/\${currentGuildId}/\${currentLeaderboardType}?limit=10\`);
                            const leaderboard = await response.json();
                            if (leaderboard.length === 0) {
                                container.innerHTML = '<div class="no-data">No data available</div>';
                                return;
                            }
                            let html = '<div class="leaderboard">';
                            leaderboard.forEach(user => {
                                const valueText = currentLeaderboardType === 'voice' ?
                                    \`\${user.value} minutes\` :
                                    currentLeaderboardType === 'reactions' ?
                                    \`\${user.value} reactions\` :
                                    \`\${user.value} XP (Level \${user.level})\`;
                                html += \`
                                    <div class="leaderboard-entry">
                                        <div class="rank">#\${user.rank}</div>
                                        <div class="user-info">
                                            <img src="\${user.avatar || '/default-avatar.png'}" alt="Avatar" class="avatar">
                                            <span class="username">\${user.displayName}</span>
                                        </div>
                                        <div class="value">\${valueText}</div>
                                    </div>
                                \`;
                            });
                            html += '</div>';
                            container.innerHTML = html;
                        }
                    } catch (error) {
                        console.error('Error loading leaderboard:', error);
                        const container = document.getElementById('leaderboard-container');
                        if (container) {
                            container.innerHTML = '<div class="error">Error loading leaderboard</div>';
                        }
                    }
                }
                async function addXPToUser() {
                    try {
                        const userIdInput = document.getElementById('target-user-id');
                        const amountInput = document.getElementById('xp-amount');
                        const userId = userIdInput ? userIdInput.value.trim() : '';
                        const amount = amountInput ? parseInt(amountInput.value) : 0;
                        if (!userId || !amount) {
                            showNotification('Please enter both User ID and XP amount', 'error');
                            return;
                        }
                        const response = await fetch('/api/plugins/leveling/addxp', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                guildId: currentGuildId,
                                userId: userId,
                                amount: amount
                            })
                        });
                        if (response.ok) {
                            showNotification(\`Added \${amount} XP to user successfully!\`, 'success');
                            if (userIdInput) userIdInput.value = '';
                            if (amountInput) amountInput.value = '';
                            loadLeaderboard();
                        } else {
                            throw new Error('Failed to add XP');
                        }
                    } catch (error) {
                        console.error('Error adding XP:', error);
                        showNotification('Error adding XP', 'error');
                    }
                }
                initializeLevelingPage();
            })();
        `
    };
}

function getChannelRulesPluginComponent() {
    return {
        html: `
            <div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">⚖️</span> Channel Rules</h3>
                    <p>Set up automated rules for channels with custom conditions and actions</p>
                </div>
                
                <form id="channelRulesForm">
                    <div class="form-group">
                        <label for="rulesServerSelect">Server</label>
                        <select id="rulesServerSelect" required>
                            <option value="">Select a server...</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="rulesChannelSelect">Channel</label>
                        <select id="rulesChannelSelect" required disabled>
                            <option value="">Select a channel...</option>
                        </select>
                    </div>
                    
                    <div id="channelRulesSettings" style="display: none;">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="rulesEnabled" style="margin-right: 8px;">
                                Enable Rules for This Channel
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label for="rulesLogChannelSelect">Log Channel (Optional)</label>
                            <select id="rulesLogChannelSelect">
                                <option value="">Select a channel for violation logs...</option>
                            </select>
                            <small style="opacity: 0.7; display: block; margin-top: 4px;">
                                Choose where rule violation logs will be sent
                            </small>
                        </div>
                        
                        <div class="form-group">
                            <label>Channel Rules</label>
                            <div id="rulesList" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                                <div id="noRulesMessage" style="opacity: 0.6; text-align: center; padding: 20px;">
                                    No rules configured for this channel
                                </div>
                            </div>
                            
                            <button type="button" id="addRuleBtn" class="glass-btn" style="width: 100%;">
                                + Add New Rule
                            </button>
                        </div>
                        
                        <div class="form-group">
                            <button type="button" id="saveChannelRules" class="btn-primary">
                                <span class="btn-text">Save Rules</span>
                                <span class="btn-loader" style="display: none;">Saving...</span>
                            </button>
                            
                            <button type="button" id="deleteChannelRules" class="glass-btn" style="margin-left: 10px;">
                                Delete All Rules
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <!-- Rule Creation Modal -->
            <div id="ruleModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center;">
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 15px; padding: 2rem; max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.2);">
                    <h3 style="margin-bottom: 1rem; color: white;">Create New Rule</h3>
                    
                    <div class="form-group">
                        <label for="ruleType">Rule Type</label>
                        <select id="ruleType" class="form-control">
                            <option value="">Select rule type...</option>
                            <optgroup label="File Requirements">
                                <option value="must_contain_audio">Must Contain Audio File</option>
                                <option value="must_contain_image">Must Contain Image</option>
                                <option value="must_contain_video">Must Contain Video</option>
                                <option value="must_contain_file">Must Contain Any File</option>
                            </optgroup>
                            <optgroup label="File Blocking">
                                <option value="block_audio">Block Audio Files</option>
                                <option value="block_images">Block Images</option>
                                <option value="block_videos">Block Videos</option>
                                <option value="block_all_files">Block All File Attachments</option>
                                <option value="block_file_extensions">Block Specific File Extensions</option>
                                <option value="block_large_files">Block Large Files</option>
                            </optgroup>
                            <optgroup label="Content Rules">
                                <option value="blocked_domains">Block Specific Domains</option>
                                <option value="required_text">Require Specific Text</option>
                                <option value="blocked_text">Block Specific Text</option>
                                <option value="min_length">Minimum Message Length</option>
                                <option value="max_length">Maximum Message Length</option>
                            </optgroup>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="ruleAction">Action When Rule is Violated</label>
                        <select id="ruleAction" class="form-control">
                            <option value="delete">Delete Message Only</option>
                            <option value="dm">Send DM to User Only</option>
                            <option value="delete_and_dm">Delete Message & Send DM</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="customMessage">Custom Message (Optional)</label>
                        <textarea id="customMessage" class="form-control" rows="3" placeholder="Custom message to send to user when rule is violated..."></textarea>
                    </div>
                    
                    <div id="domainsConfig" style="display: none;" class="form-group">
                        <label>Blocked Domains</label>
                        <input type="text" id="domainInput" class="form-control" placeholder="Enter domain (e.g., youtube.com)" style="margin-bottom: 0.5rem;">
                        <button type="button" id="addDomainBtn" class="glass-btn">Add Domain</button>
                        <div id="domainsList" style="margin-top: 0.5rem;"></div>
                    </div>
                    
                    <div id="textsConfig" style="display: none;" class="form-group">
                        <label id="textsLabel">Text Phrases</label>
                        <input type="text" id="textInput" class="form-control" placeholder="Enter text phrase..." style="margin-bottom: 0.5rem;">
                        <button type="button" id="addTextBtn" class="glass-btn">Add Text</button>
                        <div id="textsList" style="margin-top: 0.5rem;"></div>
                    </div>
                    
                    <div id="extensionsConfig" style="display: none;" class="form-group">
                        <label>Blocked File Extensions</label>
                        <input type="text" id="extensionInput" class="form-control" placeholder="Enter extension (e.g., exe, zip, rar)" style="margin-bottom: 0.5rem;">
                        <button type="button" id="addExtensionBtn" class="glass-btn">Add Extension</button>
                        <div id="extensionsList" style="margin-top: 0.5rem;"></div>
                        <small style="opacity: 0.7; display: block; margin-top: 4px;">
                            Enter file extensions without the dot (e.g., "exe" not ".exe")
                        </small>
                    </div>
                    
                    <div id="fileSizeConfig" style="display: none;" class="form-group">
                        <label for="maxFileSize">Maximum File Size</label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="maxFileSize" class="form-control" min="1" max="25" placeholder="Size" style="flex: 1;">
                            <select id="fileSizeUnit" class="form-control" style="flex: 0 0 auto; width: auto;">
                                <option value="KB">KB</option>
                                <option value="MB" selected>MB</option>
                            </select>
                        </div>
                        <small style="opacity: 0.7; display: block; margin-top: 4px;">
                            Files larger than this size will be blocked
                        </small>
                    </div>
                    
                    <div id="lengthConfig" style="display: none;" class="form-group">
                        <label for="lengthValue" id="lengthLabel">Length</label>
                        <input type="number" id="lengthValue" class="form-control" min="1" max="2000" placeholder="Enter length...">
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 1.5rem;">
                        <button type="button" id="saveRule" class="btn-primary">Save Rule</button>
                        <button type="button" id="cancelRule" class="glass-btn">Cancel</button>
                    </div>
                </div>
            </div>
        `,
        script: `
            (function() {
                const rulesServerSelect = document.getElementById('rulesServerSelect');
                const rulesChannelSelect = document.getElementById('rulesChannelSelect');
                const rulesLogChannelSelect = document.getElementById('rulesLogChannelSelect');
                const channelRulesSettings = document.getElementById('channelRulesSettings');
                const rulesEnabled = document.getElementById('rulesEnabled');
                const rulesList = document.getElementById('rulesList');
                const noRulesMessage = document.getElementById('noRulesMessage');
                const addRuleBtn = document.getElementById('addRuleBtn');
                const saveChannelRules = document.getElementById('saveChannelRules');
                const deleteChannelRules = document.getElementById('deleteChannelRules');
                const btnText = saveChannelRules ? saveChannelRules.querySelector('.btn-text') : null;
                const btnLoader = saveChannelRules ? saveChannelRules.querySelector('.btn-loader') : null;
                const ruleModal = document.getElementById('ruleModal');
                const ruleType = document.getElementById('ruleType');
                const ruleAction = document.getElementById('ruleAction');
                const customMessage = document.getElementById('customMessage');
                const saveRule = document.getElementById('saveRule');
                const cancelRule = document.getElementById('cancelRule');
                const domainsConfig = document.getElementById('domainsConfig');
                const textsConfig = document.getElementById('textsConfig');
                const extensionsConfig = document.getElementById('extensionsConfig');
                const fileSizeConfig = document.getElementById('fileSizeConfig');
                const lengthConfig = document.getElementById('lengthConfig');
                const domainInput = document.getElementById('domainInput');
                const addDomainBtn = document.getElementById('addDomainBtn');
                const domainsList = document.getElementById('domainsList');
                const textInput = document.getElementById('textInput');
                const addTextBtn = document.getElementById('addTextBtn');
                const textsList = document.getElementById('textsList');
                const textsLabel = document.getElementById('textsLabel');
                const extensionInput = document.getElementById('extensionInput');
                const addExtensionBtn = document.getElementById('addExtensionBtn');
                const extensionsList = document.getElementById('extensionsList');
                const maxFileSize = document.getElementById('maxFileSize');
                const fileSizeUnit = document.getElementById('fileSizeUnit');
                const lengthValue = document.getElementById('lengthValue');
                const lengthLabel = document.getElementById('lengthLabel');
                let currentServerId = null;
                let currentChannelId = null;
                let currentRules = [];
                let tempDomains = [];
                let tempTexts = [];
                let tempExtensions = [];
                let editingRuleIndex = -1;
                if (rulesServerSelect) {
                    loadRulesServers();
                    rulesServerSelect.addEventListener('change', function() {
                        const serverId = this.value;
                        currentServerId = serverId;
                        if (serverId) {
                            loadRulesChannels(serverId);
                            if (rulesChannelSelect) rulesChannelSelect.disabled = false;
                        } else {
                            if (rulesChannelSelect) {
                                rulesChannelSelect.disabled = true;
                                rulesChannelSelect.innerHTML = '<option value="">Select a channel...</option>';
                            }
                            if (channelRulesSettings) channelRulesSettings.style.display = 'none';
                        }
                    });
                }
                if (rulesChannelSelect) {
                    rulesChannelSelect.addEventListener('change', function() {
                        const channelId = this.value;
                        currentChannelId = channelId;
                        if (channelId && currentServerId) {
                            loadChannelRules(currentServerId, channelId);
                            loadRulesLogChannels(currentServerId);
                            if (channelRulesSettings) channelRulesSettings.style.display = 'block';
                        } else {
                            if (channelRulesSettings) channelRulesSettings.style.display = 'none';
                        }
                    });
                }
                if (addRuleBtn) {
                    addRuleBtn.addEventListener('click', function() {
                        openRuleModal();
                    });
                }
                if (saveChannelRules) {
                    saveChannelRules.addEventListener('click', saveRules);
                }
                if (deleteChannelRules) {
                    deleteChannelRules.addEventListener('click', function() {
                        if (confirm('Are you sure you want to delete all rules for this channel?')) {
                            deleteAllRules();
                        }
                    });
                }
                if (ruleType) {
                    ruleType.addEventListener('change', function() {
                        updateRuleConfig(this.value);
                    });
                }
                if (saveRule) {
                    saveRule.addEventListener('click', function() {
                        saveCurrentRule();
                    });
                }
                if (cancelRule) {
                    cancelRule.addEventListener('click', function() {
                        closeRuleModal();
                    });
                }
                if (addDomainBtn) {
                    addDomainBtn.addEventListener('click', addDomain);
                }
                if (domainInput) {
                    domainInput.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            addDomain();
                        }
                    });
                }
                if (addTextBtn) {
                    addTextBtn.addEventListener('click', addText);
                }
                if (textInput) {
                    textInput.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            addText();
                        }
                    });
                }
                if (addExtensionBtn) {
                    addExtensionBtn.addEventListener('click', addExtension);
                }
                if (extensionInput) {
                    extensionInput.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            addExtension();
                        }
                    });
                }
                if (ruleModal) {
                    ruleModal.addEventListener('click', function(e) {
                        if (e.target === ruleModal) {
                            closeRuleModal();
                        }
                    });
                }
                async function loadRulesServers() {
                    try {
                        const response = await fetch('/api/servers');
                        const servers = await response.json();
                        rulesServerSelect.innerHTML = '<option value="">Select a server...</option>';
                        servers.forEach(server => {
                            const option = document.createElement('option');
                            option.value = server.id;
                            option.textContent = server.name;
                            rulesServerSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading servers:', error);
                        showNotification('Error loading servers', 'error');
                    }
                }
                async function loadRulesChannels(serverId) {
                    try {
                        rulesChannelSelect.innerHTML = '<option value="">Loading...</option>';
                        const response = await fetch(\`/api/channels/\${serverId}\`);
                        const channels = await response.json();
                        rulesChannelSelect.innerHTML = '<option value="">Select a channel...</option>';
                        channels.forEach(channel => {
                            const option = document.createElement('option');
                            option.value = channel.id;
                            option.textContent = \`# \${channel.name}\`;
                            rulesChannelSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading channels:', error);
                        rulesChannelSelect.innerHTML = '<option value="">Error loading channels</option>';
                    }
                }
                async function loadRulesLogChannels(serverId) {
                    try {
                        const response = await fetch(\`/api/channels/\${serverId}\`);
                        const channels = await response.json();
                        rulesLogChannelSelect.innerHTML = '<option value="">Select a channel for violation logs...</option>';
                        channels.forEach(channel => {
                            const option = document.createElement('option');
                            option.value = channel.id;
                            option.textContent = \`# \${channel.name}\`;
                            rulesLogChannelSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading log channels:', error);
                    }
                }
                async function loadChannelRules(serverId, channelId) {
                    try {
                        const response = await fetch(\`/api/plugins/channelrules/rules/\${serverId}/\${channelId}\`);
                        const rules = await response.json();
                        if (rulesEnabled) rulesEnabled.checked = rules.enabled || false;
                        if (rulesLogChannelSelect) rulesLogChannelSelect.value = rules.logChannelId || '';
                        currentRules = rules.rules || [];
                        displayRules();
                    } catch (error) {
                        console.error('Error loading channel rules:', error);
                        showNotification('Error loading channel rules', 'error');
                    }
                }
                function displayRules() {
                    if (!rulesList) return;
                    if (currentRules.length === 0) {
                        rulesList.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No rules configured for this channel</div>';
                        return;
                    }
                    rulesList.innerHTML = '';
                    currentRules.forEach((rule, index) => {
                        const ruleElement = document.createElement('div');
                        ruleElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.1); border-radius: 8px; border-left: 4px solid #7289da;';
                        const ruleInfo = getRuleDisplayInfo(rule);
                        ruleElement.innerHTML = \`
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;">\${ruleInfo.title}</div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">\${ruleInfo.description}</div>
                                <div style="font-size: 0.8rem; opacity: 0.6; margin-top: 2px;">Action: \${getActionDisplay(rule.action)}</div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button type="button" onclick="window.editChannelRule(\${index})" class="glass-btn-small">Edit</button>
                                <button type="button" onclick="window.removeChannelRule(\${index})" class="glass-btn-small">Remove</button>
                            </div>
                        \`;
                        rulesList.appendChild(ruleElement);
                    });
                }
                function getRuleDisplayInfo(rule) {
                    const typeDisplays = {
                        'must_contain_audio': { title: 'Must Contain Audio', description: 'Messages must include audio files' },
                        'must_contain_image': { title: 'Must Contain Image', description: 'Messages must include image files' },
                        'must_contain_video': { title: 'Must Contain Video', description: 'Messages must include video files' },
                        'must_contain_file': { title: 'Must Contain File', description: 'Messages must include any file attachment' },
                        'block_audio': { title: 'Block Audio', description: 'Audio files are blocked' },
                        'block_images': { title: 'Block Images', description: 'Image files are blocked' },
                        'block_videos': { title: 'Block Videos', description: 'Video files are blocked' },
                        'block_all_files': { title: 'Block All Files', description: 'All file attachments are blocked' },
                        'block_file_extensions': { title: 'Block Extensions', description: \`Blocked: .\${(rule.extensions || []).join(', .')}\` },
                        'block_large_files': { title: 'Block Large Files', description: \`Files over \${formatFileSize(rule.maxSize || 10485760)} are blocked\` },
                        'blocked_domains': { title: 'Blocked Domains', description: \`Blocked: \${(rule.domains || []).join(', ')}\` },
                        'required_text': { title: 'Required Text', description: \`Must contain: \${(rule.texts || []).join(', ')}\` },
                        'blocked_text': { title: 'Blocked Text', description: \`Cannot contain: \${(rule.texts || []).join(', ')}\` },
                        'min_length': { title: 'Minimum Length', description: \`Messages must be at least \${rule.length || 0} characters\` },
                        'max_length': { title: 'Maximum Length', description: \`Messages must be no more than \${rule.length || 2000} characters\` }
                    };
                    return typeDisplays[rule.type] || { title: rule.type, description: 'Custom rule' };
                }
                function getActionDisplay(action) {
                    const displayMap = {
                        'delete': 'Delete Message',
                        'dm': 'Send DM',
                        'delete_and_dm': 'Delete & DM'
                    };
                    return displayMap[action] || action;
                }
                function formatFileSize(bytes) {
                    if (bytes === 0) return '0 Bytes';
                    const k = 1024;
                    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                }
                window.editChannelRule = function(index) {
                    editingRuleIndex = index;
                    const rule = currentRules[index];
                    if (ruleType) ruleType.value = rule.type;
                    if (ruleAction) ruleAction.value = rule.action;
                    if (customMessage) customMessage.value = rule.customMessage || '';
                    updateRuleConfig(rule.type);
                    if (rule.type === 'blocked_domains' && rule.domains) {
                        tempDomains = [...rule.domains];
                        displayDomains();
                    }
                    if ((rule.type === 'required_text' || rule.type === 'blocked_text') && rule.texts) {
                        tempTexts = [...rule.texts];
                        displayTexts();
                    }
                    if (rule.type === 'block_file_extensions' && rule.extensions) {
                        tempExtensions = [...rule.extensions];
                        displayExtensions();
                    }
                    if (rule.type === 'block_large_files' && rule.maxSize) {
                        const sizeInMB = rule.maxSize / (1024 * 1024);
                        if (maxFileSize) maxFileSize.value = sizeInMB;
                        if (fileSizeUnit) fileSizeUnit.value = 'MB';
                    }
                    if ((rule.type === 'min_length' || rule.type === 'max_length') && lengthValue) {
                        lengthValue.value = rule.length || '';
                    }
                    openRuleModal();
                };
                window.removeChannelRule = function(index) {
                    if (confirm('Are you sure you want to remove this rule?')) {
                        currentRules.splice(index, 1);
                        displayRules();
                    }
                };
                function openRuleModal() {
                    if (ruleModal) {
                        ruleModal.style.display = 'flex';
                        if (editingRuleIndex === -1) {
                            if (ruleType) ruleType.value = '';
                            if (ruleAction) ruleAction.value = 'delete_and_dm';
                            if (customMessage) customMessage.value = '';
                            tempDomains = [];
                            tempTexts = [];
                            tempExtensions = [];
                            if (maxFileSize) maxFileSize.value = '';
                            if (fileSizeUnit) fileSizeUnit.value = 'MB';
                            updateRuleConfig('');
                        }
                    }
                }
                function closeRuleModal() {
                    if (ruleModal) {
                        ruleModal.style.display = 'none';
                        editingRuleIndex = -1;
                    }
                }
                function updateRuleConfig(type) {
                    if (domainsConfig) domainsConfig.style.display = 'none';
                    if (textsConfig) textsConfig.style.display = 'none';
                    if (extensionsConfig) extensionsConfig.style.display = 'none';
                    if (fileSizeConfig) fileSizeConfig.style.display = 'none';
                    if (lengthConfig) lengthConfig.style.display = 'none';
                    switch (type) {
                        case 'blocked_domains':
                            if (domainsConfig) domainsConfig.style.display = 'block';
                            displayDomains();
                            break;
                        case 'required_text':
                            if (textsConfig) {
                                textsConfig.style.display = 'block';
                                if (textsLabel) textsLabel.textContent = 'Required Text Phrases';
                            }
                            displayTexts();
                            break;
                        case 'blocked_text':
                            if (textsConfig) {
                                textsConfig.style.display = 'block';
                                if (textsLabel) textsLabel.textContent = 'Blocked Text Phrases';
                            }
                            displayTexts();
                            break;
                        case 'block_file_extensions':
                            if (extensionsConfig) extensionsConfig.style.display = 'block';
                            displayExtensions();
                            break;
                        case 'block_large_files':
                            if (fileSizeConfig) fileSizeConfig.style.display = 'block';
                            break;
                        case 'min_length':
                            if (lengthConfig) {
                                lengthConfig.style.display = 'block';
                                if (lengthLabel) lengthLabel.textContent = 'Minimum Length (characters)';
                            }
                            break;
                        case 'max_length':
                            if (lengthConfig) {
                                lengthConfig.style.display = 'block';
                                if (lengthLabel) lengthLabel.textContent = 'Maximum Length (characters)';
                            }
                            break;
                    }
                }
                function addDomain() {
                    const domain = domainInput ? domainInput.value.trim() : '';
                    if (domain && !tempDomains.includes(domain)) {
                        tempDomains.push(domain);
                        if (domainInput) domainInput.value = '';
                        displayDomains();
                    }
                }
                function displayDomains() {
                    if (!domainsList) return;
                    domainsList.innerHTML = '';
                    tempDomains.forEach((domain, index) => {
                        const domainElement = document.createElement('div');
                        domainElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 4px;';
                        domainElement.innerHTML = \`
                            <span>\${domain}</span>
                            <button type="button" onclick="window.removeTempDomain(\${index})" class="glass-btn-small">Remove</button>
                        \`;
                        domainsList.appendChild(domainElement);
                    });
                }
                function addText() {
                    const text = textInput ? textInput.value.trim() : '';
                    if (text && !tempTexts.includes(text)) {
                        tempTexts.push(text);
                        if (textInput) textInput.value = '';
                        displayTexts();
                    }
                }
                function displayTexts() {
                    if (!textsList) return;
                    textsList.innerHTML = '';
                    tempTexts.forEach((text, index) => {
                        const textElement = document.createElement('div');
                        textElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 4px;';
                        textElement.innerHTML = \`
                            <span>\${text}</span>
                            <button type="button" onclick="window.removeTempText(\${index})" class="glass-btn-small">Remove</button>
                        \`;
                        textsList.appendChild(textElement);
                    });
                }
                function addExtension() {
                    const extension = extensionInput ? extensionInput.value.trim().toLowerCase().replace('.', '') : '';
                    if (extension && !tempExtensions.includes(extension)) {
                        tempExtensions.push(extension);
                        if (extensionInput) extensionInput.value = '';
                        displayExtensions();
                    }
                }
                function displayExtensions() {
                    if (!extensionsList) return;
                    extensionsList.innerHTML = '';
                    tempExtensions.forEach((extension, index) => {
                        const extensionElement = document.createElement('div');
                        extensionElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 4px;';
                        extensionElement.innerHTML = \`
                            <span>.\${extension}</span>
                            <button type="button" onclick="window.removeTempExtension(\${index})" class="glass-btn-small">Remove</button>
                        \`;
                        extensionsList.appendChild(extensionElement);
                    });
                }
                window.removeTempDomain = function(index) {
                    tempDomains.splice(index, 1);
                    displayDomains();
                };
                window.removeTempText = function(index) {
                    tempTexts.splice(index, 1);
                    displayTexts();
                };
                window.removeTempExtension = function(index) {
                    tempExtensions.splice(index, 1);
                    displayExtensions();
                };
                function saveCurrentRule() {
                    const type = ruleType ? ruleType.value : '';
                    const action = ruleAction ? ruleAction.value : 'delete_and_dm';
                    const message = customMessage ? customMessage.value.trim() : '';
                    if (!type) {
                        showNotification('Please select a rule type', 'error');
                        return;
                    }
                    const rule = {
                        type: type,
                        action: action,
                        customMessage: message || null
                    };
                    switch (type) {
                        case 'blocked_domains':
                            if (tempDomains.length === 0) {
                                showNotification('Please add at least one domain', 'error');
                                return;
                            }
                            rule.domains = [...tempDomains];
                            break;
                        case 'required_text':
                        case 'blocked_text':
                            if (tempTexts.length === 0) {
                                showNotification('Please add at least one text phrase', 'error');
                                return;
                            }
                            rule.texts = [...tempTexts];
                            break;
                        case 'block_file_extensions':
                            if (tempExtensions.length === 0) {
                                showNotification('Please add at least one file extension', 'error');
                                return;
                            }
                            rule.extensions = [...tempExtensions];
                            break;
                        case 'block_large_files':
                            const size = maxFileSize ? parseFloat(maxFileSize.value) : 0;
                            const unit = fileSizeUnit ? fileSizeUnit.value : 'MB';
                            if (!size || size <= 0) {
                                showNotification('Please enter a valid file size', 'error');
                                return;
                            }
                            const sizeInBytes = unit === 'KB' ? size * 1024 : size * 1024 * 1024;
                            rule.maxSize = sizeInBytes;
                            break;
                        case 'min_length':
                        case 'max_length':
                            const length = lengthValue ? parseInt(lengthValue.value) : 0;
                            if (!length || length < 1) {
                                showNotification('Please enter a valid length', 'error');
                                return;
                            }
                            rule.length = length;
                            break;
                    }
                    if (editingRuleIndex >= 0) {
                        currentRules[editingRuleIndex] = rule;
                    } else {
                        currentRules.push(rule);
                    }
                    displayRules();
                    closeRuleModal();
                    showNotification('Rule saved successfully', 'success');
                }
                async function saveRules() {
                    if (!currentServerId || !currentChannelId) {
                        showNotification('Please select a server and channel', 'error');
                        return;
                    }
                    try {
                        if (btnText) btnText.style.display = 'none';
                        if (btnLoader) btnLoader.style.display = 'inline';
                        if (saveChannelRules) saveChannelRules.disabled = true;
                        const settings = {
                            enabled: rulesEnabled ? rulesEnabled.checked : false,
                            rules: currentRules,
                            logChannelId: rulesLogChannelSelect ? rulesLogChannelSelect.value || null : null
                        };
                        const response = await fetch(\`/api/plugins/channelrules/rules/\${currentServerId}/\${currentChannelId}\`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(settings)
                        });
                        const result = await response.json();
                        if (response.ok) {
                            showNotification('Channel rules saved successfully!', 'success');
                        } else {
                            throw new Error(result.error || 'Failed to save rules');
                        }
                    } catch (error) {
                        console.error('Error saving rules:', error);
                        showNotification(error.message, 'error');
                    } finally {
                        if (btnText) btnText.style.display = 'inline';
                        if (btnLoader) btnLoader.style.display = 'none';
                        if (saveChannelRules) saveChannelRules.disabled = false;
                    }
                }
                async function deleteAllRules() {
                    if (!currentServerId || !currentChannelId) {
                        showNotification('Please select a server and channel', 'error');
                        return;
                    }
                    try {
                        const response = await fetch(\`/api/plugins/channelrules/rules/\${currentServerId}/\${currentChannelId}\`, {
                            method: 'DELETE'
                        });
                        const result = await response.json();
                        if (response.ok) {
                            currentRules = [];
                            if (rulesEnabled) rulesEnabled.checked = false;
                            if (rulesLogChannelSelect) rulesLogChannelSelect.value = '';
                            displayRules();
                            showNotification('All rules deleted successfully!', 'success');
                        } else {
                            throw new Error(result.error || 'Failed to delete rules');
                        }
                    } catch (error) {
                        console.error('Error deleting rules:', error);
                        showNotification(error.message, 'error');
                    }
                }
            })();
        `
    };
}

// NEW: Add the getAutoRolePluginComponent function
function getAutoRolePluginComponent() {
    return {
        html: `
            <div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">🎭</span> Auto-Role System</h3>
                    <p>Configure automatic role assignment, reaction roles, and level-based roles</p>
                </div>

                <div class="settings-section">
                    <h3>Server Selection</h3>
                    <div class="form-group">
                        <label>Server:</label>
                        <select id="autorole-server-select" class="form-control">
                            <option value="">Select a server...</option>
                        </select>
                    </div>
                </div>

                <!-- Join Roles Section -->
                <div class="settings-section" id="join-roles-section" style="display: none;">
                    <h3>👋 Join Roles</h3>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="join-roles-enabled"> Enable Join Roles
                        </label>
                    </div>
                    
                    <div id="join-roles-config" style="display: none;">
                        <div class="form-group">
                            <label>Roles to Assign:</label>
                            <select id="join-roles-select" class="form-control" multiple>
                                <option value="">Loading roles...</option>
                            </select>
                            <small style="opacity: 0.7;">Hold Ctrl/Cmd to select multiple roles</small>
                        </div>
                        
                        <div class="form-group">
                            <label>Delay (minutes):</label>
                            <input type="number" id="join-roles-delay" class="form-control" min="0" max="1440" value="0">
                            <small style="opacity: 0.7;">0 = assign immediately</small>
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="join-roles-exclude-bots" checked> Exclude Bots
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label>Minimum Account Age (days):</label>
                            <input type="number" id="join-roles-min-age" class="form-control" min="0" max="365" value="0">
                            <small style="opacity: 0.7;">0 = no age requirement</small>
                        </div>
                    </div>
                </div>

                <!-- Level Roles Section -->
                <div class="settings-section" id="level-roles-section" style="display: none;">
                    <h3>📈 Level Roles</h3>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="level-roles-enabled"> Enable Level Roles
                        </label>
                    </div>
                    
                    <div id="level-roles-config" style="display: none;">
                        <div class="form-group">
                            <label>Level Roles:</label>
                            <div id="level-roles-list" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                                <div id="no-level-roles" style="opacity: 0.6; text-align: center; padding: 20px;">
                                    No level roles configured
                                </div>
                            </div>
                            
                            <button type="button" id="add-level-role-btn" class="glass-btn" style="width: 100%;">
                                + Add Level Role
                            </button>
                        </div>
                        
                        <div class="form-group">
                            <button type="button" id="sync-level-roles-btn" class="glass-btn">
                                🔄 Sync All Level Roles
                            </button>
                            <small style="opacity: 0.7; display: block; margin-top: 4px;">
                                Apply level roles to all existing members
                            </small>
                        </div>
                    </div>
                </div>

                <!-- Reaction Roles Section -->
                <div class="settings-section" id="reaction-roles-section" style="display: none;">
                    <h3>⭐ Reaction Roles</h3>
                    
                    <div class="form-group">
                        <label>Existing Reaction Role Messages:</label>
                        <div id="reaction-roles-list" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                            <div id="no-reaction-roles" style="opacity: 0.6; text-align: center; padding: 20px;">
                                No reaction role messages
                            </div>
                        </div>
                        
                        <button type="button" id="create-reaction-role-btn" class="glass-btn" style="width: 100%;">
                            + Create Reaction Role Message
                        </button>
                    </div>
                </div>

                <!-- Log Channel Section -->
                <div class="settings-section" id="log-channel-section" style="display: none;">
                    <h3>📝 Logging</h3>
                    <div class="form-group">
                        <label>Log Channel:</label>
                        <select id="log-channel-select" class="form-control">
                            <option value="">No logging</option>
                        </select>
                    </div>
                </div>

                <!-- Save Button -->
                <div class="settings-section" id="save-section" style="display: none;">
                    <button id="save-autorole-settings" class="btn-primary">
                        <span class="btn-text">Save Settings</span>
                        <span class="btn-loader" style="display: none;">Saving...</span>
                    </button>
                </div>
            </div>

            <!-- Level Role Modal -->
            <div id="level-role-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center;">
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 15px; padding: 2rem; max-width: 500px; width: 90%; border: 1px solid rgba(255,255,255,0.2);">
                    <h3 style="margin-bottom: 1rem; color: white;">Add Level Role</h3>
                    
                    <div class="form-group">
                        <label for="level-role-level">Level:</label>
                        <input type="number" id="level-role-level" class="form-control" min="1" max="999" placeholder="Level required">
                    </div>
                    
                    <div class="form-group">
                        <label for="level-role-role">Role:</label>
                        <select id="level-role-role" class="form-control">
                            <option value="">Select a role...</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="level-role-remove-old"> Remove Lower Level Roles
                        </label>
                        <small style="opacity: 0.7; display: block; margin-top: 4px;">
                            Automatically remove roles from lower levels when this role is assigned
                        </small>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 1.5rem;">
                        <button type="button" id="save-level-role" class="btn-primary">Add Role</button>
                        <button type="button" id="cancel-level-role" class="glass-btn">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- Reaction Role Modal -->
            <div id="reaction-role-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center; overflow-y: auto;">
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 15px; padding: 2rem; max-width: 700px; width: 90%; max-height: 90vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.2); margin: 20px;">
                    <h3 style="margin-bottom: 1rem; color: white;">Create Reaction Role Message</h3>
                    
                    <div class="form-group">
                        <label for="rr-channel">Channel:</label>
                        <select id="rr-channel" class="form-control">
                            <option value="">Select a channel...</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="rr-title">Title:</label>
                        <input type="text" id="rr-title" class="form-control" placeholder="Role Selection" maxlength="256">
                    </div>
                    
                    <div class="form-group">
                        <label for="rr-description">Description:</label>
                        <textarea id="rr-description" class="form-control" rows="3" placeholder="React to get roles!" maxlength="2048"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="rr-max-roles">Maximum Roles (0 = unlimited):</label>
                        <input type="number" id="rr-max-roles" class="form-control" min="0" max="20" value="0">
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="rr-remove-on-unreact" checked> Remove Role When Unreacted
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label>Roles:</label>
                        <div id="rr-roles-list" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                            <div id="no-rr-roles" style="opacity: 0.6; text-align: center; padding: 20px;">
                                No roles added yet
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            <input type="text" id="rr-emoji" class="form-control" placeholder="Emoji (e.g., 🎮)" maxlength="2" style="max-width: 80px;">
                            <select id="rr-role" class="form-control" style="flex: 1;">
                                <option value="">Select role...</option>
                            </select>
                            <button type="button" id="add-rr-role" class="glass-btn">Add</button>
                        </div>
                        
                        <div class="form-group">
                            <label for="rr-role-description">Role Description (optional):</label>
                            <input type="text" id="rr-role-description" class="form-control" placeholder="Additional description for this role" maxlength="100">
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 1.5rem;">
                        <button type="button" id="create-rr-message" class="btn-primary">Create Message</button>
                        <button type="button" id="cancel-rr-message" class="glass-btn">Cancel</button>
                    </div>
                </div>
            </div>
        `,
        script: `
            (function() {
                let currentGuildId = null;
                let serverRoles = [];
                let levelRoles = [];
                let reactionRoleRoles = [];

                async function initializeAutoRolePlugin() {
                    await loadAutoRoleServers();
                    setupEventListeners();
                }

                function setupEventListeners() {
                    const serverSelect = document.getElementById('autorole-server-select');
                    if (serverSelect) {
                        serverSelect.addEventListener('change', handleServerChange);
                    }
                    const joinRolesEnabled = document.getElementById('join-roles-enabled');
                    if (joinRolesEnabled) {
                        joinRolesEnabled.addEventListener('change', toggleJoinRolesConfig);
                    }
                    const levelRolesEnabled = document.getElementById('level-roles-enabled');
                    if (levelRolesEnabled) {
                        levelRolesEnabled.addEventListener('change', toggleLevelRolesConfig);
                    }
                    const addLevelRoleBtn = document.getElementById('add-level-role-btn');
                    if (addLevelRoleBtn) {
                        addLevelRoleBtn.addEventListener('click', openLevelRoleModal);
                    }
                    const syncLevelRolesBtn = document.getElementById('sync-level-roles-btn');
                    if (syncLevelRolesBtn) {
                        syncLevelRolesBtn.addEventListener('click', syncLevelRoles);
                    }
                    const createReactionRoleBtn = document.getElementById('create-reaction-role-btn');
                    if (createReactionRoleBtn) {
                        createReactionRoleBtn.addEventListener('click', openReactionRoleModal);
                    }
                    const saveBtn = document.getElementById('save-autorole-settings');
                    if (saveBtn) {
                        saveBtn.addEventListener('click', saveAutoRoleSettings);
                    }
                    setupModalEventListeners();
                }

                function setupModalEventListeners() {
                    const saveLevelRole = document.getElementById('save-level-role');
                    if (saveLevelRole) {
                        saveLevelRole.addEventListener('click', saveLevelRole_handler);
                    }
                    const cancelLevelRole = document.getElementById('cancel-level-role');
                    if (cancelLevelRole) {
                        cancelLevelRole.addEventListener('click', closeLevelRoleModal);
                    }
                    const addRRRole = document.getElementById('add-rr-role');
                    if (addRRRole) {
                        addRRRole.addEventListener('click', addReactionRoleRole);
                    }
                    const createRRMessage = document.getElementById('create-rr-message');
                    if (createRRMessage) {
                        createRRMessage.addEventListener('click', createReactionRoleMessage);
                    }
                    const cancelRRMessage = document.getElementById('cancel-rr-message');
                    if (cancelRRMessage) {
                        cancelRRMessage.addEventListener('click', closeReactionRoleModal);
                    }
                    const levelRoleModal = document.getElementById('level-role-modal');
                    if (levelRoleModal) {
                        levelRoleModal.addEventListener('click', function(e) {
                            if (e.target === levelRoleModal) closeLevelRoleModal();
                        });
                    }
                    const reactionRoleModal = document.getElementById('reaction-role-modal');
                    if (reactionRoleModal) {
                        reactionRoleModal.addEventListener('click', function(e) {
                            if (e.target === reactionRoleModal) closeReactionRoleModal();
                        });
                    }
                }

                async function loadAutoRoleServers() {
                    try {
                        const response = await fetch('/api/servers');
                        const servers = await response.json();
                        const select = document.getElementById('autorole-server-select');
                        if (select) {
                            select.innerHTML = '<option value="">Select a server...</option>';
                            servers.forEach(server => {
                                const option = document.createElement('option');
                                option.value = server.id;
                                option.textContent = server.name;
                                select.appendChild(option);
                            });
                        }
                    } catch (error) {
                        console.error('Error loading servers:', error);
                        showNotification('Error loading servers', 'error');
                    }
                }

                async function handleServerChange() {
                    const serverSelect = document.getElementById('autorole-server-select');
                    currentGuildId = serverSelect ? serverSelect.value : null;
                    if (currentGuildId) {
                        await Promise.all([
                            loadServerRoles(),
                            loadChannels(),
                            loadAutoRoleSettings(),
                            loadLevelRoles(),
                            loadReactionRoles()
                        ]);
                        showSections();
                    } else {
                        hideSections();
                    }
                }

                function showSections() {
                    const sections = ['join-roles-section', 'level-roles-section', 'reaction-roles-section', 'log-channel-section', 'save-section'];
                    sections.forEach(sectionId => {
                        const section = document.getElementById(sectionId);
                        if (section) section.style.display = 'block';
                    });
                }

                function hideSections() {
                    const sections = ['join-roles-section', 'level-roles-section', 'reaction-roles-section', 'log-channel-section', 'save-section'];
                    sections.forEach(sectionId => {
                        const section = document.getElementById(sectionId);
                        if (section) section.style.display = 'none';
                    });
                }

                async function loadServerRoles() {
                    try {
                        const response = await fetch(\`/api/plugins/autorole/roles/\${currentGuildId}\`);
                        serverRoles = await response.json();
                        populateRoleSelects();
                    } catch (error) {
                        console.error('Error loading server roles:', error);
                    }
                }

                function populateRoleSelects() {
                    const selects = ['join-roles-select', 'level-role-role', 'rr-role'];
                    selects.forEach(selectId => {
                        const select = document.getElementById(selectId);
                        if (select) {
                            const isMultiple = select.hasAttribute('multiple');
                            select.innerHTML = isMultiple ? '' : '<option value="">Select a role...</option>';
                            serverRoles.forEach(role => {
                                const option = document.createElement('option');
                                option.value = role.id;
                                option.textContent = \`\${role.name} (\${role.memberCount} members)\`;
                                option.style.color = role.color || '#ffffff';
                                select.appendChild(option);
                            });
                        }
                    });
                }

                async function loadChannels() {
                    try {
                        const response = await fetch(\`/api/channels/\${currentGuildId}\`);
                        const channels = await response.json();
                        const selects = ['log-channel-select', 'rr-channel'];
                        selects.forEach(selectId => {
                            const select = document.getElementById(selectId);
                            if (select) {
                                const hasNoOption = selectId === 'log-channel-select';
                                select.innerHTML = hasNoOption ? '<option value="">No logging</option>' : '<option value="">Select a channel...</option>';
                                channels.forEach(channel => {
                                    const option = document.createElement('option');
                                    option.value = channel.id;
                                    option.textContent = \`# \${channel.name}\`;
                                    select.appendChild(option);
                                });
                            }
                        });
                    } catch (error) {
                        console.error('Error loading channels:', error);
                    }
                }

                async function loadAutoRoleSettings() {
                    try {
                        const response = await fetch(\`/api/plugins/autorole/settings/\${currentGuildId}\`);
                        const settings = await response.json();
                        const joinRolesEnabled = document.getElementById('join-roles-enabled');
                        if (joinRolesEnabled) {
                            joinRolesEnabled.checked = settings.joinRoles?.enabled || false;
                            toggleJoinRolesConfig();
                        }
                        const joinRolesSelect = document.getElementById('join-roles-select');
                        if (joinRolesSelect && settings.joinRoles?.roles) {
                            Array.from(joinRolesSelect.options).forEach(option => {
                                option.selected = settings.joinRoles.roles.includes(option.value);
                            });
                        }
                        const joinRolesDelay = document.getElementById('join-roles-delay');
                        if (joinRolesDelay) {
                            joinRolesDelay.value = settings.joinRoles?.delay || 0;
                        }
                        const joinRolesExcludeBots = document.getElementById('join-roles-exclude-bots');
                        if (joinRolesExcludeBots) {
                            joinRolesExcludeBots.checked = settings.joinRoles?.excludeBots !== false;
                        }
                        const joinRolesMinAge = document.getElementById('join-roles-min-age');
                        if (joinRolesMinAge) {
                            joinRolesMinAge.value = settings.joinRoles?.minAccountAge || 0;
                        }
                        const logChannelSelect = document.getElementById('log-channel-select');
                        if (logChannelSelect) {
                            logChannelSelect.value = settings.logChannelId || '';
                        }
                    } catch (error) {
                        console.error('Error loading auto-role settings:', error);
                    }
                }

                async function loadLevelRoles() {
                    try {
                        const response = await fetch(\`/api/plugins/autorole/levelroles/\${currentGuildId}\`);
                        const settings = await response.json();
                        const levelRolesEnabled = document.getElementById('level-roles-enabled');
                        if (levelRolesEnabled) {
                            levelRolesEnabled.checked = settings.enabled || false;
                            toggleLevelRolesConfig();
                        }
                        levelRoles = settings.roles || [];
                        displayLevelRoles();
                    } catch (error) {
                        console.error('Error loading level roles:', error);
                    }
                }

                function displayLevelRoles() {
                    const list = document.getElementById('level-roles-list');
                    if (!list) return;
                    if (levelRoles.length === 0) {
                        list.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No level roles configured</div>';
                        return;
                    }
                    list.innerHTML = '';
                    levelRoles
                        .sort((a, b) => a.level - b.level)
                        .forEach((levelRole, index) => {
                            const role = serverRoles.find(r => r.id === levelRole.roleId);
                            const roleElement = document.createElement('div');
                            roleElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.1); border-radius: 8px; border-left: 4px solid #7289da;';
                            roleElement.innerHTML = \`
                                <div>
                                    <div style="font-weight: 600; margin-bottom: 4px;">Level \${levelRole.level}</div>
                                    <div style="font-size: 0.9rem; opacity: 0.8;">\${role ? role.name : 'Unknown Role'}</div>
                                    <div style="font-size: 0.8rem; opacity: 0.6; margin-top: 2px;">
                                        \${levelRole.removeOldRoles ? 'Removes lower level roles' : 'Keeps lower level roles'}
                                    </div>
                                </div>
                                <button type="button" onclick="window.removeLevelRole(\${index})" class="glass-btn-small">Remove</button>
                            \`;
                            list.appendChild(roleElement);
                        });
                }

                window.removeLevelRole = function(index) {
                    if (confirm('Remove this level role?')) {
                        levelRoles.splice(index, 1);
                        displayLevelRoles();
                    }
                };

                async function loadReactionRoles() {
                    try {
                        const response = await fetch(\`/api/plugins/autorole/reactionroles/\${currentGuildId}\`);
                        const reactionRoles = await response.json();
                        displayReactionRoles(reactionRoles);
                    } catch (error) {
                        console.error('Error loading reaction roles:', error);
                    }
                }

                function displayReactionRoles(reactionRoles) {
                    const list = document.getElementById('reaction-roles-list');
                    if (!list) return;
                    const messages = Object.values(reactionRoles);
                    if (messages.length === 0) {
                        list.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No reaction role messages</div>';
                        return;
                    }
                    list.innerHTML = '';
                    messages.forEach(message => {
                        const messageElement = document.createElement('div');
                        messageElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.1); border-radius: 8px; border-left: 4px solid #7289da;';
                        const roleCount = Object.keys(message.roles).length;
                        const createdAt = new Date(message.createdAt).toLocaleDateString();
                        messageElement.innerHTML = \`
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;">\${message.title || 'Reaction Role Message'}</div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">\${roleCount} role(s) • Created \${createdAt}</div>
                                <div style="font-size: 0.8rem; opacity: 0.6; margin-top: 2px;">
                                    Max roles: \${message.maxRoles || 'Unlimited'} • Remove on unreact: \${message.removeOnUnreact ? 'Yes' : 'No'}
                                </div>
                            </div>
                            <button type="button" onclick="window.deleteReactionRole('\${message.messageId}')" class="glass-btn-small">Delete</button>
                        \`;
                        list.appendChild(messageElement);
                    });
                }

                window.deleteReactionRole = async function(messageId) {
                    if (!confirm('Delete this reaction role message? This cannot be undone.')) return;
                    try {
                        const response = await fetch(\`/api/plugins/autorole/reactionroles/\${currentGuildId}/\${messageId}\`, {
                            method: 'DELETE'
                        });
                        if (response.ok) {
                            showNotification('Reaction role message deleted', 'success');
                            await loadReactionRoles();
                        } else {
                            throw new Error('Failed to delete message');
                        }
                    } catch (error) {
                        console.error('Error deleting reaction role:', error);
                        showNotification('Error deleting reaction role message', 'error');
                    }
                };

                function toggleJoinRolesConfig() {
                    const enabled = document.getElementById('join-roles-enabled');
                    const config = document.getElementById('join-roles-config');
                    if (enabled && config) {
                        config.style.display = enabled.checked ? 'block' : 'none';
                    }
                }

                function toggleLevelRolesConfig() {
                    const enabled = document.getElementById('level-roles-enabled');
                    const config = document.getElementById('level-roles-config');
                    if (enabled && config) {
                        config.style.display = enabled.checked ? 'block' : 'none';
                    }
                }

                function openLevelRoleModal() {
                    const modal = document.getElementById('level-role-modal');
                    if (modal) {
                        const levelInput = document.getElementById('level-role-level');
                        const roleSelect = document.getElementById('level-role-role');
                        const removeOldCheckbox = document.getElementById('level-role-remove-old');
                        if (levelInput) levelInput.value = '';
                        if (roleSelect) roleSelect.value = '';
                        if (removeOldCheckbox) removeOldCheckbox.checked = false;
                        modal.style.display = 'flex';
                    }
                }

                function closeLevelRoleModal() {
                    const modal = document.getElementById('level-role-modal');
                    if (modal) {
                        modal.style.display = 'none';
                    }
                }

                function saveLevelRole_handler() {
                    const levelInput = document.getElementById('level-role-level');
                    const roleSelect = document.getElementById('level-role-role');
                    const removeOldCheckbox = document.getElementById('level-role-remove-old');
                    const level = levelInput ? parseInt(levelInput.value) : 0;
                    const roleId = roleSelect ? roleSelect.value : '';
                    const removeOldRoles = removeOldCheckbox ? removeOldCheckbox.checked : false;
                    if (!level || level < 1) {
                        showNotification('Please enter a valid level', 'error');
                        return;
                    }
                    if (!roleId) {
                        showNotification('Please select a role', 'error');
                        return;
                    }
                    if (levelRoles.some(lr => lr.level === level)) {
                        showNotification('A role is already configured for this level', 'error');
                        return;
                    }
                    if (levelRoles.some(lr => lr.roleId === roleId)) {
                        showNotification('This role is already used for another level', 'error');
                        return;
                    }
                    levelRoles.push({
                        level: level,
                        roleId: roleId,
                        removeOldRoles: removeOldRoles
                    });
                    displayLevelRoles();
                    closeLevelRoleModal();
                    showNotification('Level role added successfully', 'success');
                }

                function openReactionRoleModal() {
                    const modal = document.getElementById('reaction-role-modal');
                    if (modal) {
                        const inputs = ['rr-channel', 'rr-title', 'rr-description', 'rr-max-roles', 'rr-emoji', 'rr-role', 'rr-role-description'];
                        inputs.forEach(inputId => {
                            const input = document.getElementById(inputId);
                            if (input) {
                                if (input.type === 'checkbox') {
                                    input.checked = inputId === 'rr-remove-on-unreact';
                                } else {
                                    input.value = '';
                                }
                            }
                        });
                        reactionRoleRoles = [];
                        displayReactionRoleRoles();
                        modal.style.display = 'flex';
                    }
                }

                function closeReactionRoleModal() {
                    const modal = document.getElementById('reaction-role-modal');
                    if (modal) {
                        modal.style.display = 'none';
                    }
                }

                function addReactionRoleRole() {
                    const emojiInput = document.getElementById('rr-emoji');
                    const roleSelect = document.getElementById('rr-role');
                    const descriptionInput = document.getElementById('rr-role-description');
                    const emoji = emojiInput ? emojiInput.value.trim() : '';
                    const roleId = roleSelect ? roleSelect.value : '';
                    const description = descriptionInput ? descriptionInput.value.trim() : '';
                    if (!emoji) {
                        showNotification('Please enter an emoji', 'error');
                        return;
                    }
                    if (!roleId) {
                        showNotification('Please select a role', 'error');
                        return;
                    }
                    if (reactionRoleRoles.some(rr => rr.emoji === emoji)) {
                        showNotification('This emoji is already used', 'error');
                        return;
                    }
                    if (reactionRoleRoles.some(rr => rr.roleId === roleId)) {
                        showNotification('This role is already used', 'error');
                        return;
                    }
                    const role = serverRoles.find(r => r.id === roleId);
                    if (!role) {
                        showNotification('Role not found', 'error');
                        return;
                    }
                    reactionRoleRoles.push({
                        emoji: emoji,
                        roleId: roleId,
                        roleName: role.name,
                        description: description
                    });
                    if (emojiInput) emojiInput.value = '';
                    if (roleSelect) roleSelect.value = '';
                    if (descriptionInput) descriptionInput.value = '';
                    displayReactionRoleRoles();
                    showNotification('Role added to message', 'success');
                }

                function displayReactionRoleRoles() {
                    const list = document.getElementById('rr-roles-list');
                    if (!list) return;
                    if (reactionRoleRoles.length === 0) {
                        list.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No roles added yet</div>';
                        return;
                    }
                    list.innerHTML = '';
                    reactionRoleRoles.forEach((roleData, index) => {
                        const roleElement = document.createElement('div');
                        roleElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 6px;';
                        roleElement.innerHTML = \`
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 1.2em;">\${roleData.emoji}</span>
                                <div>
                                    <div style="font-weight: 600;">\${roleData.roleName}</div>
                                    \${roleData.description ? \`<div style="font-size: 0.8rem; opacity: 0.7;">\${roleData.description}</div>\` : ''}
                                </div>
                            </div>
                            <button type="button" onclick="window.removeReactionRoleRole(\${index})" class="glass-btn-small">Remove</button>
                        \`;
                        list.appendChild(roleElement);
                    });
                }

                window.removeReactionRoleRole = function(index) {
                    reactionRoleRoles.splice(index, 1);
                    displayReactionRoleRoles();
                };

                async function createReactionRoleMessage() {
                    const channelSelect = document.getElementById('rr-channel');
                    const titleInput = document.getElementById('rr-title');
                    const descriptionInput = document.getElementById('rr-description');
                    const maxRolesInput = document.getElementById('rr-max-roles');
                    const removeOnUnreactInput = document.getElementById('rr-remove-on-unreact');
                    const channelId = channelSelect ? channelSelect.value : '';
                    const title = titleInput ? titleInput.value.trim() : '';
                    const description = descriptionInput ? descriptionInput.value.trim() : '';
                    const maxRoles = maxRolesInput ? parseInt(maxRolesInput.value) : 0;
                    const removeOnUnreact = removeOnUnreactInput ? removeOnUnreactInput.checked : true;
                    if (!channelId) {
                        showNotification('Please select a channel', 'error');
                        return;
                    }
                    if (reactionRoleRoles.length === 0) {
                        showNotification('Please add at least one role', 'error');
                        return;
                    }
                    try {
                        const createBtn = document.getElementById('create-rr-message');
                        if (createBtn) {
                            createBtn.disabled = true;
                            createBtn.textContent = 'Creating...';
                        }
                        const response = await fetch(\`/api/plugins/autorole/reactionroles/\${currentGuildId}/create\`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                channelId: channelId,
                                title: title,
                                description: description,
                                roles: reactionRoleRoles,
                                maxRoles: maxRoles,
                                removeOnUnreact: removeOnUnreact
                            })
                        });
                        const result = await response.json();
                        if (response.ok) {
                            showNotification('Reaction role message created successfully!', 'success');
                            closeReactionRoleModal();
                            await loadReactionRoles();
                        } else {
                            throw new Error(result.error || 'Failed to create message');
                        }
                    } catch (error) {
                        console.error('Error creating reaction role message:', error);
                        showNotification(error.message, 'error');
                    } finally {
                        const createBtn = document.getElementById('create-rr-message');
                        if (createBtn) {
                            createBtn.disabled = false;
                            createBtn.textContent = 'Create Message';
                        }
                    }
                }

                async function syncLevelRoles() {
                    try {
                        const syncBtn = document.getElementById('sync-level-roles-btn');
                        if (syncBtn) {
                            syncBtn.disabled = true;
                            syncBtn.innerHTML = '🔄 Syncing...';
                        }
                        const response = await fetch(\`/api/plugins/autorole/sync-level-roles/\${currentGuildId}\`, {
                            method: 'POST'
                        });
                        const result = await response.json();
                        if (response.ok) {
                            showNotification(result.message, 'success');
                        } else {
                            throw new Error(result.error || 'Failed to sync level roles');
                        }
                    } catch (error) {
                        console.error('Error syncing level roles:', error);
                        showNotification(error.message, 'error');
                    } finally {
                        const syncBtn = document.getElementById('sync-level-roles-btn');
                        if (syncBtn) {
                            syncBtn.disabled = false;
                            syncBtn.innerHTML = '🔄 Sync All Level Roles';
                        }
                    }
                }

                async function saveAutoRoleSettings() {
                    if (!currentGuildId) {
                        showNotification('Please select a server', 'error');
                        return;
                    }
                    try {
                        const saveBtn = document.getElementById('save-autorole-settings');
                        const btnText = saveBtn ? saveBtn.querySelector('.btn-text') : null;
                        const btnLoader = saveBtn ? saveBtn.querySelector('.btn-loader') : null;
                        if (saveBtn) saveBtn.disabled = true;
                        if (btnText) btnText.style.display = 'none';
                        if (btnLoader) btnLoader.style.display = 'inline';
                        const joinRolesEnabled = document.getElementById('join-roles-enabled');
                        const joinRolesSelect = document.getElementById('join-roles-select');
                        const joinRolesDelay = document.getElementById('join-roles-delay');
                        const joinRolesExcludeBots = document.getElementById('join-roles-exclude-bots');
                        const joinRolesMinAge = document.getElementById('join-roles-min-age');
                        const logChannelSelect = document.getElementById('log-channel-select');
                        const selectedJoinRoles = joinRolesSelect ?
                            Array.from(joinRolesSelect.selectedOptions).map(option => option.value) : [];
                        const autoRoleSettings = {
                            joinRoles: {
                                enabled: joinRolesEnabled ? joinRolesEnabled.checked : false,
                                roles: selectedJoinRoles,
                                delay: joinRolesDelay ? parseInt(joinRolesDelay.value) : 0,
                                excludeBots: joinRolesExcludeBots ? joinRolesExcludeBots.checked : true,
                                minAccountAge: joinRolesMinAge ? parseInt(joinRolesMinAge.value) : 0
                            },
                            logChannelId: logChannelSelect ? logChannelSelect.value || null : null
                        };
                        const autoRoleResponse = await fetch(\`/api/plugins/autorole/settings/\${currentGuildId}\`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(autoRoleSettings)
                        });
                        if (!autoRoleResponse.ok) {
                            throw new Error('Failed to save auto-role settings');
                        }
                        const levelRolesEnabled = document.getElementById('level-roles-enabled');
                        const levelRoleSettings = {
                            enabled: levelRolesEnabled ? levelRolesEnabled.checked : false,
                            roles: levelRoles,
                            logChannelId: logChannelSelect ? logChannelSelect.value || null : null
                        };
                        const levelRoleResponse = await fetch(\`/api/plugins/autorole/levelroles/\${currentGuildId}\`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(levelRoleSettings)
                        });
                        if (!levelRoleResponse.ok) {
                            throw new Error('Failed to save level role settings');
                        }
                        showNotification('Auto-role settings saved successfully!', 'success');
                    } catch (error) {
                        console.error('Error saving auto-role settings:', error);
                        showNotification(error.message, 'error');
                    } finally {
                        const saveBtn = document.getElementById('save-autorole-settings');
                        const btnText = saveBtn ? saveBtn.querySelector('.btn-text') : null;
                        const btnLoader = saveBtn ? saveBtn.querySelector('.btn-loader') : null;
                        if (saveBtn) saveBtn.disabled = false;
                        if (btnText) btnText.style.display = 'inline';
                        if (btnLoader) btnLoader.style.display = 'none';
                    }
                }
                initializeAutoRolePlugin();
            })();
        `
    };
}


// Initialize the application
async function loadUser() {
    try {
        const response = await fetch('/api/user');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        currentUser = await response.json();
        
        const username = document.getElementById('username');
        const userAvatar = document.getElementById('userAvatar');
        
        if (username) username.textContent = currentUser.username;
        
        if (userAvatar) {
            if (currentUser.avatar) {
                userAvatar.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png" width="40" height="40" style="border-radius: 50%;">`;
            } else {
                userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
            }
        }
    } catch (error) {
        console.error('Error loading user:', error);
        window.location.href = '/login.html';
    }
}

async function loadPlugins() {
    try {
        // Load message plugin
        const messagePlugin = getMessagePluginComponent();
        const messageContainer = document.getElementById('messagePluginContainer');
        if (messageContainer) {
            messageContainer.innerHTML = messagePlugin.html;
        }
        
        // Load word filter plugin
        const wordFilterPlugin = getWordFilterPluginComponent();
        const wordFilterContainer = document.getElementById('wordFilterPluginContainer');
        if (wordFilterContainer) {
            wordFilterContainer.innerHTML = wordFilterPlugin.html;
        }
        
        // Load leveling plugin
        const levelingPlugin = getLevelingPluginComponent();
        const levelingContainer = document.getElementById('levelingPluginContainer');
        if (levelingContainer) {
            levelingContainer.innerHTML = levelingPlugin.html;
        }
        
        // Load channel rules plugin
        const channelRulesPlugin = getChannelRulesPluginComponent();
        const channelRulesContainer = document.getElementById('channelRulesPluginContainer');
        if (channelRulesContainer) {
            channelRulesContainer.innerHTML = channelRulesPlugin.html;
        }
        
        // NEW: Load auto role plugin
        const autoRolePlugin = getAutoRolePluginComponent();
        const autoRoleContainer = document.getElementById('autoRolePluginContainer');
        if (autoRoleContainer) {
            autoRoleContainer.innerHTML = autoRolePlugin.html;
        }
        
        // Execute plugin scripts after a short delay to ensure DOM is updated
        setTimeout(() => {
            try {
                eval(messagePlugin.script);
            } catch (error) {
                console.error('Error executing message plugin script:', error);
            }
            
            try {
                eval(wordFilterPlugin.script);
            } catch (error) {
                console.error('Error executing word filter script:', error);
            }
            
            try {
                eval(levelingPlugin.script);
            } catch (error) {
                console.error('Error executing leveling plugin script:', error);
            }
            
            try {
                eval(channelRulesPlugin.script);
            } catch (error) {
                console.error('Error executing channel rules plugin script:', error);
            }
            
            // NEW: Execute auto role plugin script
            try {
                eval(autoRolePlugin.script);
            } catch (error) {
                console.error('Error executing auto role plugin script:', error);
            }
            
        }, 100);
        
    } catch (error) {
        console.error('Error loading plugins:', error);
        showNotification('Error loading plugins', 'error');
    }
}

function setupNavigation() {
    document.addEventListener('click', function(e) {
        const navLink = e.target.closest('.nav-link');
        if (navLink) {
            e.preventDefault();
            const page = navLink.getAttribute('data-page');
            switchToPage(page);
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('mobile-open');
            return;
        }
        
        const featureCard = e.target.closest('.feature-card');
        if (featureCard) {
            const page = featureCard.getAttribute('data-page');
            switchToPage(page);
            return;
        }
        
        const mobileMenuBtn = e.target.closest('#mobileMenuBtn');
        if (mobileMenuBtn) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('mobile-open');
            return;
        }
        
        const sidebar = document.getElementById('sidebar');
        const mobileMenuBtnElem = document.getElementById('mobileMenuBtn');
        if (sidebar && !sidebar.contains(e.target) && mobileMenuBtnElem && !mobileMenuBtnElem.contains(e.target)) {
            sidebar.classList.remove('mobile-open');
        }
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    setupNavigation();
    await loadUser();
    await loadPlugins();
    
    // Set the initial page
    switchToPage('overview');
});
