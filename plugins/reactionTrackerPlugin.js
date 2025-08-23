const fs = require('fs').promises;
const path = require('path');

class ReactionTrackerPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Reaction Tracker';
        this.description = 'Track reactions in a specific channel for competitions, with vote limits.';
        this.version = '1.0.0';
        this.enabled = true;

        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;

        this.settingsFile = path.join(__dirname, '../data/reactionTrackerSettings.json');
        this.logFile = path.join(__dirname, '../data/reactionTrackerLog.json');

        this.initializeData();
        this.setupRoutes();
        this.setupDiscordEvents();
    }

    async initializeData() {
        try {
            await fs.access(this.settingsFile).catch(() => fs.writeFile(this.settingsFile, JSON.stringify({}, null, 2)));
            await fs.access(this.logFile).catch(() => fs.writeFile(this.logFile, JSON.stringify({}, null, 2)));
        } catch (error) {
            console.error('Error initializing Reaction Tracker data:', error);
        }
    }

    async loadSettings() {
        try {
            return JSON.parse(await fs.readFile(this.settingsFile, 'utf8'));
        } catch (e) { return {}; }
    }

    async saveSettings(settings) {
        await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
    }

    async loadLog() {
        try {
            return JSON.parse(await fs.readFile(this.logFile, 'utf8'));
        } catch (e) { return {}; }
    }

    async saveLog(log) {
        await fs.writeFile(this.logFile, JSON.stringify(log, null, 2));
    }

    async addLogEntry(guildId, userId, messageId, emoji, action) {
        const log = await this.loadLog();
        if (!log[guildId]) {
            log[guildId] = [];
        }
        log[guildId].unshift({
            userId,
            messageId,
            emoji,
            action,
            timestamp: new Date().toISOString()
        });
        // Keep log from getting too large
        if (log[guildId].length > 5000) {
            log[guildId] = log[guildId].slice(0, 5000);
        }
        await this.saveLog(log);
    }

    setupDiscordEvents() {
        // Auto-react to new audio submissions
        this.client.on('messageCreate', async message => {
            if (message.author.bot || !message.guild) return;
            const settings = (await this.loadSettings())[message.guild.id];
            if (!settings || !settings.enabled || message.channel.id !== settings.channelId) return;

            // Check for audio attachments
            const hasAudio = message.attachments.some(att => att.contentType && att.contentType.startsWith('audio/'));
            if (hasAudio) {
                try {
                    await message.react(settings.allowedEmoji || '👍');
                } catch (error) {
                    console.error('ReactionTracker: Could not auto-react to message:', error);
                }
            }
        });

        // Enforce vote limit on reaction add
        this.client.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot || !reaction.message.guild) return;
            
            const settings = (await this.loadSettings())[reaction.message.guild.id];
            if (!settings || !settings.enabled || reaction.message.channel.id !== settings.channelId || reaction.emoji.name !== settings.allowedEmoji) return;

            // Fetch all messages in the channel to count user's votes
            const channel = reaction.message.channel;
            const messages = await channel.messages.fetch({ limit: 100 }); // Fetch last 100 messages
            
            let userVoteCount = 0;
            messages.forEach(msg => {
                const msgReaction = msg.reactions.cache.get(settings.allowedEmoji);
                if (msgReaction && msgReaction.users.cache.has(user.id)) {
                    userVoteCount++;
                }
            });

            if (userVoteCount > settings.voteLimit) {
                try {
                    await reaction.users.remove(user.id);
                    await user.send(
                        `Hi there! You can only vote for **${settings.voteLimit}** submissions in the #${channel.name} channel. ` +
                        `Your latest vote was removed. To change your vote, please remove a reaction from another submission first.`
                    ).catch(() => console.log(`Could not DM user ${user.id}. They may have DMs disabled.`));
                } catch (error) {
                    console.error('ReactionTracker: Error enforcing vote limit:', error);
                }
            } else {
                // Log the valid vote
                await this.addLogEntry(reaction.message.guild.id, user.id, reaction.message.id, reaction.emoji.name, 'voted');
            }
        });

        // Log when a reaction is removed
        this.client.on('messageReactionRemove', async (reaction, user) => {
             if (user.bot || !reaction.message.guild) return;
            
            const settings = (await this.loadSettings())[reaction.message.guild.id];
            if (!settings || !settings.enabled || reaction.message.channel.id !== settings.channelId || reaction.emoji.name !== settings.allowedEmoji) return;
            
            await this.addLogEntry(reaction.message.guild.id, user.id, reaction.message.id, reaction.emoji.name, 'unvoted');
        });
    }

    setupRoutes() {
        this.app.get('/api/plugins/reaction-tracker/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            const { serverId } = req.params;
            if (!await this.hasAdminPermissions(req.user.id, serverId)) return res.status(403).json({ error: 'Forbidden' });
            
            const settings = await this.loadSettings();
            res.json(settings[serverId] || {
                enabled: false,
                channelId: '1404877878180577434',
                allowedEmoji: '👍',
                voteLimit: 2
            });
        });

        this.app.post('/api/plugins/reaction-tracker/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            const { serverId } = req.params;
            if (!await this.hasAdminPermissions(req.user.id, serverId)) return res.status(403).json({ error: 'Forbidden' });
            
            const settings = await this.loadSettings();
            settings[serverId] = req.body;
            await this.saveSettings(settings);
            res.json({ success: true });
        });

        this.app.get('/api/plugins/reaction-tracker/log/:serverId', this.ensureAuthenticated, async (req, res) => {
            const { serverId } = req.params;
            if (!await this.hasAdminPermissions(req.user.id, serverId)) return res.status(403).json({ error: 'Forbidden' });
            
            const log = (await this.loadLog())[serverId] || [];
            
            // Enrich log with user details for easier display
            const enrichedLog = await Promise.all(log.map(async entry => {
                try {
                    const user = await this.client.users.fetch(entry.userId);
                    return {
                        ...entry,
                        username: user.username,
                        avatar: user.displayAvatarURL()
                    };
                } catch {
                    return { ...entry, username: 'Unknown User', avatar: null };
                }
            }));
            
            res.json(enrichedLog);
        });

        // --- NEW: API Endpoint for backfilling reactions ---
        this.app.post('/api/plugins/reaction-tracker/backfill/:serverId', this.ensureAuthenticated, async (req, res) => {
            const { serverId } = req.params;
            if (!await this.hasAdminPermissions(req.user.id, serverId)) return res.status(403).json({ error: 'Forbidden' });

            try {
                const settings = (await this.loadSettings())[serverId];
                if (!settings || !settings.enabled || !settings.channelId || !settings.allowedEmoji) {
                    return res.status(400).json({ error: 'Plugin is not fully configured for this server.' });
                }

                const channel = await this.client.channels.fetch(settings.channelId);
                if (!channel) {
                    return res.status(404).json({ error: 'Configured channel not found.' });
                }

                let lastId;
                let processedCount = 0;
                let reactedCount = 0;
                const messageLimit = 500; // Safety limit to avoid processing too many messages

                while (processedCount < messageLimit) {
                    const options = { limit: 100 };
                    if (lastId) {
                        options.before = lastId;
                    }

                    const messages = await channel.messages.fetch(options);
                    if (messages.size === 0) {
                        break; // No more messages to fetch
                    }

                    for (const message of messages.values()) {
                        processedCount++;
                        const hasAudio = message.attachments.some(att => att.contentType && att.contentType.startsWith('audio/'));
                        const hasBotReaction = message.reactions.cache.get(settings.allowedEmoji)?.me;

                        if (hasAudio && !hasBotReaction) {
                            await message.react(settings.allowedEmoji);
                            reactedCount++;
                            // Add a delay to avoid Discord rate limits
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                    lastId = messages.last().id;
                }
                
                res.json({ success: true, message: `Processed ${processedCount} messages and added ${reactedCount} new reactions.` });
            } catch (error) {
                console.error("Backfill error:", error);
                res.status(500).json({ error: 'An error occurred during the backfill process.' });
            }
        });
    }

    getFrontendComponent() {
        return {
            id: 'reaction-tracker-plugin',
            name: 'Reaction Tracker',
            description: 'Track reactions for competitions.',
            icon: '🗳️',
            version: '1.0.0',
            containerId: 'reactionTrackerPluginContainer',
            pageId: 'reaction-tracker',
            navIcon: '🗳️',
            html: `
                <div class="plugin-container">
                    <div class="plugin-header">
                        <h3><span class="plugin-icon">🗳️</span> Reaction Tracker</h3>
                        <p>Configure and monitor reaction-based voting for a competition channel.</p>
                    </div>

                    <div class="settings-section">
                        <h3>Server Selection</h3>
                        <div class="form-group">
                            <select id="rtServerSelect" class="form-control">
                                <option value="">Select a server...</option>
                            </select>
                        </div>
                    </div>

                    <div id="rt-content" style="display:none;">
                        <div class="settings-section">
                            <h3>Settings</h3>
                            <div class="form-group">
                                <label><input type="checkbox" id="rtEnabled"> Enable Plugin</label>
                            </div>
                            <div class="form-group">
                                <label for="rtChannelId">Competition Channel</label>
                                <select id="rtChannelId" class="form-control"></select>
                                <small>The bot will auto-react and track votes in this channel.</small>
                            </div>
                            <div class="form-group">
                                <label for="rtAllowedEmoji">Voting Emoji</label>
                                <input type="text" id="rtAllowedEmoji" class="form-control" value="👍">
                                <small>Only this emoji will be counted as a vote.</small>
                            </div>
                            <div class="form-group">
                                <label for="rtVoteLimit">Vote Limit Per User</label>
                                <input type="number" id="rtVoteLimit" class="form-control" value="2" min="1">
                                <small>The maximum number of votes a user can cast in the channel.</small>
                            </div>
                            <!-- NEW: Backfill Button -->
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                <button id="rtSaveSettings" class="btn-primary">Save Settings</button>
                                <button id="rtBackfillReactions" class="btn-secondary"> retroactive reaction</button>
                            </div>
                        </div>

                        <div class="settings-section">
                            <h3>📊 Live Vote Log</h3>
                            <button id="rtRefreshLog" class="btn-secondary">🔄 Refresh Log</button>
                            <div id="rtLogContainer" style="margin-top: 15px; max-height: 500px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px;">
                                <div id="rtLogList"></div>
                                <div id="rtLogLoading" style="text-align: center; padding: 20px; display: none;">Loading...</div>
                            </div>
                        </div>
                    </div>
                </div>`,
            script: `(function() {
                const serverSelect = document.getElementById('rtServerSelect');
                const contentDiv = document.getElementById('rt-content');
                
                const enabledCheck = document.getElementById('rtEnabled');
                const channelSelect = document.getElementById('rtChannelId');
                const emojiInput = document.getElementById('rtAllowedEmoji');
                const limitInput = document.getElementById('rtVoteLimit');
                const saveBtn = document.getElementById('rtSaveSettings');
                const refreshBtn = document.getElementById('rtRefreshLog');
                const logList = document.getElementById('rtLogList');
                const logLoading = document.getElementById('rtLogLoading');
                // NEW: Get the backfill button
                const backfillBtn = document.getElementById('rtBackfillReactions');
                
                let currentServerId = null;

                async function loadServers() {
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
                    } catch (error) { console.error('Error loading servers for Reaction Tracker:', error); }
                }

                serverSelect.addEventListener('change', async () => {
                    currentServerId = serverSelect.value;
                    if (currentServerId) {
                        contentDiv.style.display = 'block';
                        await loadChannels();
                        await loadSettings();
                        await loadLog();
                    } else {
                        contentDiv.style.display = 'none';
                    }
                });

                saveBtn.addEventListener('click', async () => {
                    if (!currentServerId) return;
                    const settings = {
                        enabled: enabledCheck.checked,
                        channelId: channelSelect.value,
                        allowedEmoji: emojiInput.value.trim(),
                        voteLimit: parseInt(limitInput.value) || 2
                    };
                    
                    try {
                        await fetch('/api/plugins/reaction-tracker/settings/' + currentServerId, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(settings)
                        });
                        showNotification('Reaction Tracker settings saved!', 'success');
                    } catch (e) {
                        showNotification('Failed to save settings', 'error');
                    }
                });

                refreshBtn.addEventListener('click', () => {
                    if (currentServerId) loadLog();
                });

                // NEW: Event listener for the backfill button
                backfillBtn.addEventListener('click', async () => {
                    if (!currentServerId) return;
                    if (!confirm('This will scan the history of the selected channel and add the voting emoji to any audio posts that are missing it. This may take a few moments. Continue?')) {
                        return;
                    }

                    backfillBtn.disabled = true;
                    backfillBtn.textContent = 'Processing...';

                    try {
                        const response = await fetch('/api/plugins/reaction-tracker/backfill/' + currentServerId, {
                            method: 'POST'
                        });
                        const result = await response.json();

                        if (response.ok) {
                            showNotification(result.message, 'success');
                        } else {
                            throw new Error(result.error);
                        }
                    } catch (e) {
                        showNotification('Backfill failed: ' + e.message, 'error');
                    } finally {
                        backfillBtn.disabled = false;
                        backfillBtn.textContent = 'Backfill Reactions';
                    }
                });


                async function loadChannels() {
                    try {
                        const response = await fetch('/api/channels/' + currentServerId);
                        const channels = await response.json();
                        const savedSettings = await (await fetch('/api/plugins/reaction-tracker/settings/' + currentServerId)).json();

                        channelSelect.innerHTML = '<option value="">Select a channel...</option>';
                        channels.forEach(ch => {
                            const option = document.createElement('option');
                            option.value = ch.id;
                            option.textContent = '#' + ch.name;
                            if (ch.id === savedSettings.channelId) {
                                option.selected = true;
                            }
                            channelSelect.appendChild(option);
                        });
                    } catch (error) { console.error('Error loading channels:', error); }
                }

                async function loadSettings() {
                    try {
                        const response = await fetch('/api/plugins/reaction-tracker/settings/' + currentServerId);
                        const settings = await response.json();
                        enabledCheck.checked = settings.enabled;
                        channelSelect.value = settings.channelId;
                        emojiInput.value = settings.allowedEmoji;
                        limitInput.value = settings.voteLimit;
                    } catch (error) { console.error('Error loading settings:', error); }
                }
                
                async function loadLog() {
                    if (!currentServerId) return;
                    logLoading.style.display = 'block';
                    logList.innerHTML = '';
                    try {
                        const response = await fetch('/api/plugins/reaction-tracker/log/' + currentServerId);
                        const logData = await response.json();
                        displayLog(logData);
                    } catch (error) {
                        logList.innerHTML = '<p style="color: #ff6b6b; text-align: center;">Error loading log.</p>';
                        console.error('Error loading log:', error);
                    } finally {
                        logLoading.style.display = 'none';
                    }
                }

                function displayLog(logData) {
                    if (logData.length === 0) {
                        logList.innerHTML = '<p style="text-align: center; opacity: 0.7;">No votes have been logged yet.</p>';
                        return;
                    }
                    logList.innerHTML = logData.map(entry => {
                        const actionColor = entry.action === 'voted' ? '#4CAF50' : '#f44336';
                        const actionText = entry.action === 'voted' ? 'Voted' : 'Unvoted';
                        const date = new Date(entry.timestamp).toLocaleString();
                        const messageLink = \`https://discord.com/channels/\${currentServerId}/\${document.getElementById('rtChannelId').value}/\${entry.messageId}\`;
                        
                        return \`
                            <div class="log-entry" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <img src="\${entry.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px;">
                                <div style="flex: 1;">
                                    <strong>\${entry.username}</strong>
                                    <span style="color: \${actionColor}"> \${actionText} </span>
                                    <span>with \${entry.emoji} on 
                                        <a href="\${messageLink}" target="_blank" style="color: #7289da;">this post</a>
                                    </span>
                                </div>
                                <div style="font-size: 0.8em; opacity: 0.7;">\${date}</div>
                            </div>
                        \`;
                    }).join('');
                }

                loadServers();
            })()`
        }
    }
}

module.exports = ReactionTrackerPlugin;