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
                    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
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
            html: `<!-- Frontend component will be handled by dashboard -->`,
            script: `console.log('Word filter plugin frontend loaded');`
        };
    }
}

module.exports = WordFilterPlugin;