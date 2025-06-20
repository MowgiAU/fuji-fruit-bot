const fs = require('fs');
const path = require('path');

class WordFilterPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Word Filter';
        this.description = 'Automatically detect and filter inappropriate words from messages';
        this.version = '1.0.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        // Storage for filter settings per server
        this.filterSettings = this.loadFilterSettings();
        
        this.setupRoutes();
        this.setupMessageListener();
    }

    loadFilterSettings() {
        try {
            const settingsPath = './data/wordFilterSettings.json';
            if (fs.existsSync(settingsPath)) {
                return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading word filter settings:', error);
        }
        return {};
    }

    saveFilterSettings() {
        try {
            const dataDir = './data';
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }
            fs.writeFileSync('./data/wordFilterSettings.json', JSON.stringify(this.filterSettings, null, 2));
        } catch (error) {
            console.error('Error saving word filter settings:', error);
        }
    }

    setupRoutes() {
        // Get filter settings for a server
        this.app.get('/api/plugins/wordfilter/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }
                
                const settings = this.filterSettings[serverId] || {
                    enabled: false,
                    logChannelId: null,
                    blockedWords: []
                };
                
                res.json(settings);
            } catch (error) {
                console.error('Error getting filter settings:', error);
                res.status(500).json({ error: 'Failed to get filter settings' });
            }
        });

        // Update filter settings for a server
        this.app.post('/api/plugins/wordfilter/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { enabled, logChannelId, blockedWords } = req.body;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }
                
                this.filterSettings[serverId] = {
                    enabled: enabled || false,
                    logChannelId: logChannelId || null,
                    blockedWords: blockedWords || []
                };
                
                this.saveFilterSettings();
                res.json({ success: true, message: 'Filter settings updated successfully' });
            } catch (error) {
                console.error('Error updating filter settings:', error);
                res.status(500).json({ error: 'Failed to update filter settings' });
            }
        });

        // Add a blocked word
        this.app.post('/api/plugins/wordfilter/words/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { word } = req.body;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }
                
                if (!word || word.trim() === '') {
                    return res.status(400).json({ error: 'Word cannot be empty' });
                }
                
                if (!this.filterSettings[serverId]) {
                    this.filterSettings[serverId] = { enabled: false, logChannelId: null, blockedWords: [] };
                }
                
                const normalizedWord = word.trim().toLowerCase();
                if (!this.filterSettings[serverId].blockedWords.includes(normalizedWord)) {
                    this.filterSettings[serverId].blockedWords.push(normalizedWord);
                    this.saveFilterSettings();
                }
                
                res.json({ success: true, blockedWords: this.filterSettings[serverId].blockedWords });
            } catch (error) {
                console.error('Error adding blocked word:', error);
                res.status(500).json({ error: 'Failed to add blocked word' });
            }
        });

        // Remove a blocked word
        this.app.delete('/api/plugins/wordfilter/words/:serverId/:word', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, word } = req.params;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }
                
                if (this.filterSettings[serverId]) {
                    const normalizedWord = decodeURIComponent(word).toLowerCase();
                    this.filterSettings[serverId].blockedWords = this.filterSettings[serverId].blockedWords
                        .filter(w => w !== normalizedWord);
                    this.saveFilterSettings();
                }
                
                res.json({ success: true, blockedWords: this.filterSettings[serverId]?.blockedWords || [] });
            } catch (error) {
                console.error('Error removing blocked word:', error);
                res.status(500).json({ error: 'Failed to remove blocked word' });
            }
        });
    }

    setupMessageListener() {
        this.client.on('messageCreate', async (message) => {
            // Ignore bot messages
            if (message.author.bot) return;
            
            // Ignore DMs
            if (!message.guild) return;
            
            const serverId = message.guild.id;
            const settings = this.filterSettings[serverId];
            
            // Check if filter is enabled for this server
            if (!settings || !settings.enabled || !settings.blockedWords.length) return;
            
            // Check for blocked words
            const detectedWords = this.detectBlockedWords(message.content, settings.blockedWords);
            if (detectedWords.length === 0) return;
            
            try {
                // Delete the original message
                await message.delete();
                
                // Create censored version with sanitized mentions
                let censoredContent = this.sanitizeMentions(message.content);
                detectedWords.forEach(word => {
                    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\    setupMessageListener() {
        this.client.on('messageCreate', async (message) => {
            // Ignore bot messages
            if (message.author.bot) return;
            
            // Ignore DMs
            if (!message.guild) return;
            
            const serverId = message.guild.id;
            const settings = this.filterSettings[serverId];
            
            // Check if filter is enabled for this server
            if (!settings || !settings.enabled || !settings.blockedWords.length) return;
            
            // Check for blocked words
            const detectedWords = this.detectBlockedWords(message.content, settings.blockedWords);
            if (detectedWords.length === 0) return;
            
            try {
                // Delete the original message
                await message.delete();
                
                // Create censored version
                let censoredContent = message.content;
                detectedWords.forEach(word => {
                    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    censoredContent = censoredContent.replace(regex, '❌');
                });
                
                // Reply in the same channel
                const replyContent = `${message.author}, your message contained blocked words and was removed:\n\n> ${censoredContent}`;
                await message.channel.send(replyContent);
                
                // Log to designated channel if configured
                if (settings.logChannelId) {
                    const logChannel = this.client.channels.cache.get(settings.logChannelId);
                    if (logChannel) {
                        const logEmbed = {
                            color: 0xff6b6b,
                            title: '🚫 Message Filtered',
                            fields: [
                                {
                                    name: 'User',
                                    value: `${message.author} (${message.author.tag})`,
                                    inline: true
                                },
                                {
                                    name: 'Channel',
                                    value: `${message.channel}`,
                                    inline: true
                                },
                                {
                                    name: 'Detected Words',
                                    value: detectedWords.map(w => `\`${w}\``).join(', '),
                                    inline: false
                                },
                                {
                                    name: 'Original Message',
                                    value: message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content,
                                    inline: false
                                },
                                {
                                    name: 'Censored Version',
                                    value: censoredContent.length > 1000 ? censoredContent.substring(0, 1000) + '...' : censoredContent,
                                    inline: false
                                }
                            ],
                            timestamp: new Date().toISOString(),
                            footer: {
                                text: `Message ID: ${message.id}`
                            }
                        };
                        
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }
                
                console.log(`Filtered message from ${message.author.tag} in ${message.guild.name}#${message.channel.name}: detected words [${detectedWords.join(', ')}]`);
                
            } catch (error) {
                console.error('Error filtering message:', error);
            }
        });
    }'), 'gi');
                    censoredContent = censoredContent.replace(regex, '❌');
                });
                
                // Reply in the same channel with sanitized content
                const replyContent = `${message.author}, your message contained blocked words and was removed:\n\n> ${censoredContent}`;
                await message.channel.send(replyContent);
                
                // Log to designated channel if configured
                if (settings.logChannelId) {
                    const logChannel = this.client.channels.cache.get(settings.logChannelId);
                    if (logChannel) {
                        // Sanitize content for logs too
                        const sanitizedOriginal = this.sanitizeMentions(message.content);
                        const sanitizedCensored = this.sanitizeMentions(censoredContent);
                        
                        const logEmbed = {
                            color: 0xff6b6b,
                            title: '🚫 Message Filtered',
                            fields: [
                                {
                                    name: 'User',
                                    value: `${message.author} (${message.author.tag})`,
                                    inline: true
                                },
                                {
                                    name: 'Channel',
                                    value: `${message.channel}`,
                                    inline: true
                                },
                                {
                                    name: 'Detected Words',
                                    value: detectedWords.map(w => `\`${w}\``).join(', '),
                                    inline: false
                                },
                                {
                                    name: 'Original Message (Sanitized)',
                                    value: sanitizedOriginal.length > 1000 ? sanitizedOriginal.substring(0, 1000) + '...' : sanitizedOriginal,
                                    inline: false
                                },
                                {
                                    name: 'Censored Version',
                                    value: sanitizedCensored.length > 1000 ? sanitizedCensored.substring(0, 1000) + '...' : sanitizedCensored,
                                    inline: false
                                }
                            ],
                            timestamp: new Date().toISOString(),
                            footer: {
                                text: `Message ID: ${message.id}`
                            }
                        };
                        
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }
                
                console.log(`Filtered message from ${message.author.tag} in ${message.guild.name}#${message.channel.name}: detected words [${detectedWords.join(', ')}]`);
                
            } catch (error) {
                console.error('Error filtering message:', error);
            }
        });
    }

    sanitizeMentions(content) {
        return content
            // Sanitize @everyone and @here
            .replace(/@everyone/gi, '@​everyone') // Zero-width space
            .replace(/@here/gi, '@​here')
            // Sanitize user mentions <@!123> or <@123>
            .replace(/<@!?\d+>/g, (match) => {
                return match.replace('@', '@​'); // Zero-width space
            })
            // Sanitize role mentions <@&123>
            .replace(/<@&\d+>/g, (match) => {
                return match.replace('@', '@​'); // Zero-width space
            })
            // Sanitize channel mentions <#123>
            .replace(/<#\d+>/g, (match) => {
                return match.replace('#', '#​'); // Zero-width space
            })
            // Sanitize any remaining @ symbols that could be used for mentions
            .replace(/@(?!​)/g, '@​'); // Add zero-width space after @ if not already present
    }

    detectBlockedWords(content, blockedWords) {
        const detected = [];
        const normalizedContent = content.toLowerCase();
        
        blockedWords.forEach(word => {
            // Use word boundaries to avoid false positives
            const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(normalizedContent)) {
                detected.push(word);
            }
        });
        
        return detected;
    }

    getFrontendComponent() {
        return {
            id: 'wordfilter-plugin',
            name: 'Word Filter',
            description: 'Automatically filter inappropriate words',
            icon: '🚫',
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
                    const btnText = saveFilterSettings.querySelector('.btn-text');
                    const btnLoader = saveFilterSettings.querySelector('.btn-loader');
                    
                    let currentServerId = null;
                    let currentSettings = null;
                    
                    // Load servers
                    loadServers();
                    
                    // Event listeners
                    filterServerSelect.addEventListener('change', function() {
                        const serverId = this.value;
                        if (serverId) {
                            currentServerId = serverId;
                            loadChannels(serverId);
                            loadFilterSettings(serverId);
                            filterSettings.style.display = 'block';
                        } else {
                            filterSettings.style.display = 'none';
                        }
                    });
                    
                    addWordBtn.addEventListener('click', addBlockedWord);
                    newWord.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            addBlockedWord();
                        }
                    });
                    
                    saveFilterSettings.addEventListener('click', saveSettings);
                    
                    async function loadServers() {
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
                    
                    async function loadChannels(serverId) {
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
                            logChannelSelect.value = settings.logChannelId || '';
                            
                            displayBlockedWords(settings.blockedWords || []);
                        } catch (error) {
                            console.error('Error loading filter settings:', error);
                            showNotification('Error loading filter settings', 'error');
                        }
                    }
                    
                    function displayBlockedWords(words) {
                        if (words.length === 0) {
                            noWordsMessage.style.display = 'block';
                            blockedWordsList.innerHTML = '<div id="noWordsMessage" style="opacity: 0.6; text-align: center; padding: 20px;">No blocked words configured</div>';
                            return;
                        }
                        
                        noWordsMessage.style.display = 'none';
                        blockedWordsList.innerHTML = '';
                        
                        words.forEach(word => {
                            const wordElement = document.createElement('div');
                            wordElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 6px;';
                            wordElement.innerHTML = \`
                                <span style="font-family: monospace;">\${word}</span>
                                <button type="button" onclick="removeWord('\${word}')" class="glass-btn-small">Remove</button>
                            \`;
                            blockedWordsList.appendChild(wordElement);
                        });
                    }
                    
                    async function addBlockedWord() {
                        const word = newWord.value.trim();
                        if (!word || !currentServerId) return;
                        
                        try {
                            const response = await fetch(\`/api/plugins/wordfilter/words/\${currentServerId}\`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ word })
                            });
                            
                            const result = await response.json();
                            
                            if (response.ok) {
                                newWord.value = '';
                                displayBlockedWords(result.blockedWords);
                                showNotification('Word added successfully', 'success');
                            } else {
                                throw new Error(result.error || 'Failed to add word');
                            }
                        } catch (error) {
                            console.error('Error adding word:', error);
                            showNotification(error.message, 'error');
                        }
                    }
                    
                    window.removeWord = async function(word) {
                        if (!currentServerId) return;
                        
                        try {
                            const response = await fetch(\`/api/plugins/wordfilter/words/\${currentServerId}/\${encodeURIComponent(word)}\`, {
                                method: 'DELETE'
                            });
                            
                            const result = await response.json();
                            
                            if (response.ok) {
                                displayBlockedWords(result.blockedWords);
                                showNotification('Word removed successfully', 'success');
                            } else {
                                throw new Error(result.error || 'Failed to remove word');
                            }
                        } catch (error) {
                            console.error('Error removing word:', error);
                            showNotification(error.message, 'error');
                        }
                    };
                    
                    async function saveSettings() {
                        if (!currentServerId) return;
                        
                        try {
                            btnText.style.display = 'none';
                            btnLoader.style.display = 'inline';
                            saveFilterSettings.disabled = true;
                            
                            const settings = {
                                enabled: filterEnabled.checked,
                                logChannelId: logChannelSelect.value || null,
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
                            btnText.style.display = 'inline';
                            btnLoader.style.display = 'none';
                            saveFilterSettings.disabled = false;
                        }
                    }
                })();
            `
        };
    }
}

module.exports = WordFilterPlugin;