const fs = require('fs').promises;
const path = require('path');
const { ChannelType, PermissionFlagsBits, Collection } = require('discord.js');

class MessageCleanupPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Message Cleanup';
        this.description = 'Clean up user messages with slash commands and dashboard management';
        this.version = '1.1.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        // Role-based permissions - FIXED: Updated to match app.js
        this.MODERATOR_ROLE_ID = '1392001716962197514';
        this.REQUIRED_PERMISSIONS = [
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ViewChannel
        ];
        
        // Rate limiting
        this.userCooldowns = new Map();
        this.guildCooldowns = new Map();
        this.USER_RATE_LIMIT = 5 * 60 * 1000; // 5 minutes
        this.GUILD_RATE_LIMIT = 3 * 60 * 1000; // 3 minutes
        
        this.dataFile = path.join(__dirname, '../data/messageCleanup.json');
        this.cleanupData = {};
        
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupRoutes();
        this.setupDiscordListeners();
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8');
            this.cleanupData = JSON.parse(data);
        } catch (error) {
            this.cleanupData = { logs: [], settings: {} };
            await this.saveData();
        }
    }

    async saveData() {
        try {
            await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
            await fs.writeFile(this.dataFile, JSON.stringify(this.cleanupData, null, 2));
        } catch (error) {
            console.error('Error saving cleanup data:', error);
        }
    }

    // Enhanced permission checking
    hasRequiredPermissions(member, guild) {
        try {
            // Check if user is admin
            if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                return { allowed: true, reason: 'Administrator' };
            }

            // Check if user has moderator role
            if (member.roles.cache.has(this.MODERATOR_ROLE_ID)) {
                return { allowed: true, reason: 'Moderator role' };
            }

            // Check if user has required permissions
            const hasPermissions = this.REQUIRED_PERMISSIONS.every(perm => 
                member.permissions.has(perm)
            );

            if (hasPermissions) {
                return { allowed: true, reason: 'Required permissions' };
            }

            return { allowed: false, reason: 'Insufficient permissions' };
        } catch (error) {
            console.error('Error checking permissions:', error);
            return { allowed: false, reason: 'Permission check failed' };
        }
    }

    // Rate limiting check
    checkRateLimit(userId, guildId, type = 'user') {
        const now = Date.now();
        
        if (type === 'user') {
            const userKey = `${userId}-${guildId}`;
            const lastUsed = this.userCooldowns.get(userKey);
            
            if (lastUsed && (now - lastUsed) < this.USER_RATE_LIMIT) {
                const remaining = Math.ceil((this.USER_RATE_LIMIT - (now - lastUsed)) / 1000);
                return { allowed: false, remainingSeconds: remaining };
            }
            
            this.userCooldowns.set(userKey, now);
            return { allowed: true };
        } else if (type === 'guild') {
            const lastUsed = this.guildCooldowns.get(guildId);
            
            if (lastUsed && (now - lastUsed) < this.GUILD_RATE_LIMIT) {
                const remaining = Math.ceil((this.GUILD_RATE_LIMIT - (now - lastUsed)) / 1000);
                return { allowed: false, remainingSeconds: remaining };
            }
            
            this.guildCooldowns.set(guildId, now);
            return { allowed: true };
        }
        
        return { allowed: true };
    }

    // Input sanitization for dashboard
    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input
            .replace(/[<>&"']/g, (char) => {
                const entities = {
                    '<': '&lt;',
                    '>': '&gt;',
                    '&': '&amp;',
                    '"': '&quot;',
                    "'": '&#x27;'
                };
                return entities[char];
            })
            .slice(0, 2000); // Limit length
    }

    setupRoutes() {
        // Get user messages for dashboard
        this.app.get('/api/plugins/cleanup/messages/:serverId/:userId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, userId } = req.params;
                const { channelId, limit = 50 } = req.query;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                // Input validation
                if (!/^\d{17,19}$/.test(serverId) || !/^\d{17,19}$/.test(userId)) {
                    return res.status(400).json({ error: 'Invalid ID format' });
                }

                const guild = this.client.guilds.cache.get(serverId);
                if (!guild) {
                    return res.status(404).json({ error: 'Server not found' });
                }

                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) {
                    return res.status(404).json({ error: 'User not found' });
                }

                const messages = [];
                let channels;
                
                if (channelId) {
                    const channel = guild.channels.cache.get(channelId);
                    channels = channel ? [channel] : [];
                } else {
                    channels = [...guild.channels.cache.filter(ch => 
                        ch.type === ChannelType.GuildText && 
                        ch.permissionsFor(guild.members.me).has([
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ViewChannel
                        ])
                    ).values()];
                }

                for (const channel of channels) {
                    try {
                        const channelMessages = await channel.messages.fetch({ limit: 100 });
                        const userMessages = channelMessages.filter(msg => msg.author.id === userId);
                        
                        for (const msg of userMessages.values()) {
                            messages.push({
                                id: msg.id,
                                content: this.sanitizeInput(msg.content) || '[No text content]',
                                channelId: channel.id,
                                channelName: this.sanitizeInput(channel.name),
                                timestamp: msg.createdAt.toISOString(),
                                attachments: msg.attachments.size,
                                embeds: msg.embeds.length,
                                hasMedia: msg.attachments.size > 0 || msg.embeds.length > 0,
                                age: Date.now() - msg.createdTimestamp
                            });
                        }
                    } catch (error) {
                        console.error(`Error fetching messages from ${channel.name}:`, error);
                    }
                }

                // Sort by timestamp and limit
                messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                res.json({
                    user: {
                        id: member.id,
                        username: this.sanitizeInput(member.user.username),
                        displayName: this.sanitizeInput(member.displayName || member.user.username),
                        avatar: member.user.displayAvatarURL({ dynamic: true, size: 128 })
                    },
                    messages: messages.slice(0, parseInt(limit)),
                    totalFound: messages.length
                });
            } catch (error) {
                console.error('Error fetching user messages:', error);
                res.status(500).json({ error: 'Failed to fetch messages' });
            }
        });

        // Delete specific messages from dashboard
        this.app.post('/api/plugins/cleanup/delete', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, messageIds, reason = 'Dashboard cleanup' } = req.body;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                // Input validation
                if (!Array.isArray(messageIds) || messageIds.length === 0) {
                    return res.status(400).json({ error: 'Invalid message IDs' });
                }

                if (messageIds.length > 100) {
                    return res.status(400).json({ error: 'Too many messages (max 100)' });
                }

                const guild = this.client.guilds.cache.get(serverId);
                if (!guild) {
                    return res.status(404).json({ error: 'Server not found' });
                }

                const results = { success: 0, failed: 0, errors: [] };
                const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

                for (const messageId of messageIds) {
                    try {
                        // Find the message across all channels
                        let message = null;
                        let messageChannel = null;
                        
                        for (const channel of guild.channels.cache.values()) {
                            if (channel.type !== ChannelType.GuildText) continue;
                            try {
                                message = await channel.messages.fetch(messageId);
                                messageChannel = channel;
                                break;
                            } catch (e) {
                                // Message not in this channel, continue
                            }
                        }

                        if (message) {
                            const messageAge = Date.now() - message.createdTimestamp;
                            
                            // Handle old messages (>14 days) with individual deletion
                            if (messageAge > FOURTEEN_DAYS) {
                                await this.deleteOldMessage(message);
                            } else {
                                await message.delete();
                            }
                            
                            results.success++;
                            
                            // Log the deletion
                            await this.logCleanup({
                                serverId,
                                moderatorId: req.user.id,
                                targetUserId: message.author.id,
                                channelId: messageChannel.id,
                                messageId: message.id,
                                reason: this.sanitizeInput(reason),
                                method: 'dashboard',
                                timestamp: new Date().toISOString()
                            });
                        } else {
                            results.failed++;
                            results.errors.push(`Message ${messageId} not found or already deleted`);
                        }
                    } catch (error) {
                        results.failed++;
                        results.errors.push(`Failed to delete ${messageId}: ${error.message}`);
                        console.error(`Error deleting message ${messageId}:`, error);
                    }
                    
                    // Rate limiting delay
                    await this.delay(100);
                }

                res.json(results);
            } catch (error) {
                console.error('Error deleting messages:', error);
                res.status(500).json({ error: 'Failed to delete messages' });
            }
        });

        // Get cleanup logs
        this.app.get('/api/plugins/cleanup/logs/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { limit = 100 } = req.query;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                const logs = this.cleanupData.logs
                    .filter(log => log.serverId === serverId)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, parseInt(limit))
                    .map(log => ({
                        ...log,
                        reason: this.sanitizeInput(log.reason || '')
                    }));

                res.json(logs);
            } catch (error) {
                console.error('Error fetching logs:', error);
                res.status(500).json({ error: 'Failed to fetch logs' });
            }
        });
    }

    setupDiscordListeners() {
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand() || interaction.commandName !== 'clean') return;
            await this.handleCleanCommand(interaction);
        });
    }

    async handleCleanCommand(interaction) {
        try {
            // Check permissions first
            const permissionCheck = this.hasRequiredPermissions(interaction.member, interaction.guild);
            if (!permissionCheck.allowed) {
                return await interaction.reply({ 
                    content: `❌ Access denied: ${permissionCheck.reason}. You need Administrator permissions, the Moderator role, or Manage Messages permission.`, 
                    ephemeral: true 
                });
            }

            // Check rate limits
            const userRateLimit = this.checkRateLimit(interaction.user.id, interaction.guild.id, 'user');
            if (!userRateLimit.allowed) {
                return await interaction.reply({
                    content: `❌ Rate limit exceeded. Please wait ${userRateLimit.remainingSeconds} seconds before using this command again.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('user');
            const count = interaction.options.getInteger('count') || 10;
            const channelOption = interaction.options.getString('channels') || 'current';
            const specificChannels = interaction.options.getString('specific_channels');
            const reason = this.sanitizeInput(interaction.options.getString('reason') || 'Message cleanup');

            // Validate inputs
            if (count > 100) {
                return await interaction.editReply('❌ Cannot delete more than 100 messages at once.');
            }

            // Determine which channels to clean
            let channelsToClean = [];
            
            if (channelOption === 'current') {
                channelsToClean = [interaction.channel];
            } else if (channelOption === 'all') {
                channelsToClean = [...interaction.guild.channels.cache
                    .filter(ch => 
                        ch.type === ChannelType.GuildText && 
                        ch.permissionsFor(interaction.guild.members.me).has([
                            PermissionFlagsBits.ReadMessageHistory, 
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.ViewChannel
                        ])
                    ).values()];
            } else if (channelOption === 'specific' && specificChannels) {
                const channelIds = specificChannels.split(',').map(id => id.trim());
                channelsToClean = channelIds
                    .map(id => interaction.guild.channels.cache.get(id))
                    .filter(ch => ch && ch.type === ChannelType.GuildText);
            }

            if (channelsToClean.length === 0) {
                return await interaction.editReply('❌ No valid channels found to clean.');
            }

            const results = { total: 0, deleted: 0, failed: 0, channels: [] };
            const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

            for (const channel of channelsToClean) {
                try {
                    const channelResult = { name: channel.name, deleted: 0, failed: 0 };
                    
                    // Check bot permissions in channel
                    if (!channel.permissionsFor(interaction.guild.members.me).has([
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages
                    ])) {
                        channelResult.failed = 'Missing permissions';
                        results.channels.push(channelResult);
                        continue;
                    }
                    
                    // Fetch messages from the channel
                    const messages = await channel.messages.fetch({ limit: 100 });
                    let userMessages = targetUser ? 
                        messages.filter(msg => msg.author.id === targetUser.id) :
                        messages.filter(msg => !msg.author.bot);

                    // Limit to requested count
                    const messagesToDelete = [...userMessages.values()].slice(0, count === -1 ? userMessages.size : count);

                    // Separate old and new messages
                    const oldMessages = messagesToDelete.filter(msg => 
                        (Date.now() - msg.createdTimestamp) > FOURTEEN_DAYS
                    );
                    const newMessages = messagesToDelete.filter(msg => 
                        (Date.now() - msg.createdTimestamp) <= FOURTEEN_DAYS
                    );

                    // Bulk delete new messages (more efficient)
                    if (newMessages.length > 0) {
                        try {
                            if (newMessages.length === 1) {
                                await newMessages[0].delete();
                            } else {
                                await channel.bulkDelete(newMessages, true);
                            }
                            channelResult.deleted += newMessages.length;
                            results.deleted += newMessages.length;

                            // Log bulk deletion
                            for (const message of newMessages) {
                                await this.logCleanup({
                                    serverId: interaction.guild.id,
                                    moderatorId: interaction.user.id,
                                    targetUserId: message.author.id,
                                    channelId: channel.id,
                                    messageId: message.id,
                                    reason,
                                    method: 'slash_command_bulk',
                                    timestamp: new Date().toISOString()
                                });
                            }
                        } catch (error) {
                            console.error('Bulk delete failed:', error);
                            channelResult.failed += newMessages.length;
                            results.failed += newMessages.length;
                        }
                    }

                    // Individual delete for old messages
                    for (const message of oldMessages) {
                        try {
                            await this.deleteOldMessage(message);
                            channelResult.deleted++;
                            results.deleted++;
                            
                            // Log individual deletion
                            await this.logCleanup({
                                serverId: interaction.guild.id,
                                moderatorId: interaction.user.id,
                                targetUserId: message.author.id,
                                channelId: channel.id,
                                messageId: message.id,
                                reason,
                                method: 'slash_command_individual',
                                timestamp: new Date().toISOString()
                            });
                        } catch (error) {
                            console.error('Individual delete failed:', error);
                            channelResult.failed++;
                            results.failed++;
                        }
                    }

                    results.total += messagesToDelete.length;
                    results.channels.push(channelResult);
                } catch (error) {
                    console.error(`Error cleaning channel ${channel.name}:`, error);
                    results.channels.push({ name: channel.name, deleted: 0, failed: 'Error accessing channel' });
                }
            }

            // Create summary embed
            const embed = {
                color: results.deleted > 0 ? 0x00ff00 : 0xff0000,
                title: '🧹 Message Cleanup Complete',
                fields: [
                    {
                        name: 'Target User',
                        value: targetUser ? `${targetUser.tag}` : 'All users',
                        inline: true
                    },
                    {
                        name: 'Messages Deleted',
                        value: `${results.deleted}`,
                        inline: true
                    },
                    {
                        name: 'Failed',
                        value: `${results.failed}`,
                        inline: true
                    },
                    {
                        name: 'Channels Cleaned',
                        value: results.channels.map(ch => `**#${ch.name}**: ${ch.deleted} deleted`).join('\n') || 'None',
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: { text: `Reason: ${reason} | Moderator: ${interaction.user.tag}` }
            };

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in clean command:', error);
            try {
                await interaction.editReply('❌ An error occurred while cleaning messages. Please try again later.');
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    }

    // Helper method for deleting old messages with proper delay
    async deleteOldMessage(message) {
        await message.delete();
        await this.delay(1000); // 1 second delay for old messages
    }

    // Helper method for delays
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async logCleanup(logData) {
        try {
            this.cleanupData.logs.push(logData);
            
            // Keep only last 1000 logs per server
            const serverLogs = this.cleanupData.logs.filter(log => log.serverId === logData.serverId);
            if (serverLogs.length > 1000) {
                this.cleanupData.logs = this.cleanupData.logs.filter(log => 
                    log.serverId !== logData.serverId || 
                    serverLogs.slice(-1000).includes(log)
                );
            }
            
            await this.saveData();
        } catch (error) {
            console.error('Error logging cleanup:', error);
        }
    }

    getSlashCommands() {
        return [{
            name: 'clean',
            description: 'Clean up user messages (Moderator/Admin only)',
            defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
            options: [
                {
                    name: 'user',
                    description: 'User whose messages to clean (leave empty for all users)',
                    type: 6, // USER
                    required: false
                },
                {
                    name: 'count',
                    description: 'Number of messages to delete (1-100, or -1 for all)',
                    type: 4, // INTEGER
                    required: false,
                    min_value: -1,
                    max_value: 100
                },
                {
                    name: 'channels',
                    description: 'Which channels to clean',
                    type: 3, // STRING
                    required: false,
                    choices: [
                        { name: 'Current channel only', value: 'current' },
                        { name: 'All channels', value: 'all' },
                        { name: 'Specific channels', value: 'specific' }
                    ]
                },
                {
                    name: 'specific_channels',
                    description: 'Channel IDs separated by commas (only if "specific" is selected)',
                    type: 3, // STRING
                    required: false
                },
                {
                    name: 'reason',
                    description: 'Reason for cleanup (for audit logs)',
                    type: 3, // STRING
                    required: false
                }
            ]
        }];
    }

    getFrontendComponent() {
        return {
            id: 'message-cleanup-plugin',
            name: 'Message Cleanup',
            description: 'Search and manage user messages with bulk deletion capabilities',
            icon: '🧹',
            version: '1.1.0',
            
            containerId: 'messageCleanupPluginContainer',
            pageId: 'message-cleanup',
            navIcon: '🧹',
            
            html: `<div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">🧹</span> Message Cleanup Dashboard</h3>
                    <p>Search for user messages and manage them with bulk deletion tools</p>
                </div>

                <div class="search-section" style="background: rgba(100, 149, 237, 0.1); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h4>🔍 User Message Search</h4>
                    <div class="search-form" style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end;">
                        <div>
                            <label for="userSearch">User ID or @mention:</label>
                            <input type="text" id="userSearch" placeholder="Enter user ID (17-19 digits)..." class="form-input" pattern="[0-9]{17,19}">
                        </div>
                        <div>
                            <label for="channelFilter">Channel (optional):</label>
                            <select id="channelFilter" class="form-select">
                                <option value="">All channels</option>
                            </select>
                        </div>
                        <button onclick="searchUserMessages()" class="btn btn-primary">Search Messages</button>
                    </div>
                </div>

                <div id="userInfo" class="user-info-section" style="display: none; margin-bottom: 20px;">
                    <!-- User info will be populated here -->
                </div>

                <div class="messages-section">
                    <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4>📝 Messages</h4>
                        <div class="bulk-actions" style="display: none;">
                            <button onclick="selectAllMessages()" class="btn btn-secondary btn-sm">Select All</button>
                            <button onclick="clearSelection()" class="btn btn-secondary btn-sm">Clear</button>
                            <button onclick="deleteSelectedMessages()" class="btn btn-danger btn-sm">Delete Selected</button>
                        </div>
                    </div>
                    
                    <div id="messagesContainer" class="messages-container">
                        <div class="empty-state">
                            <p>🔍 Search for a user to view their messages</p>
                        </div>
                    </div>
                </div>

                <div class="logs-section" style="margin-top: 30px;">
                    <h4>📊 Cleanup Logs</h4>
                    <div id="logsContainer" class="logs-container">
                        <div class="empty-state">
                            <p>Loading cleanup logs...</p>
                        </div>
                    </div>
                </div>

                <!-- Delete Confirmation Modal -->
                <div id="deleteModal" class="modal" style="display: none;">
                    <div class="modal-content">
                        <h4>⚠️ Confirm Deletion</h4>
                        <p>Are you sure you want to delete <span id="deleteCount">0</span> selected message(s)?</p>
                        <div class="warning-box" style="background: rgba(255, 71, 87, 0.1); border: 1px solid rgba(255, 71, 87, 0.3); border-radius: 5px; padding: 10px; margin: 10px 0;">
                            <small><strong>Warning:</strong> This action cannot be undone. Messages older than 14 days will be deleted individually (slower process).</small>
                        </div>
                        <div class="modal-form">
                            <label for="deleteReason">Reason (required for audit):</label>
                            <input type="text" id="deleteReason" placeholder="Enter reason for deletion..." class="form-input" required maxlength="500">
                        </div>
                        <div class="modal-actions">
                            <button onclick="confirmDeletion()" class="btn btn-danger">Delete Messages</button>
                            <button onclick="closeDeleteModal()" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>`,
            
            script: `
                // Message Cleanup Plugin JavaScript - Complete Integrated Version
                (function() {
                    'use strict';
                    
                    // Global variables for the plugin
                    let selectedMessages = new Set();
                    let currentUserData = null;
                    let currentServerId = window.currentServerId || document.body.dataset.serverId;

                    // Ensure DOM is ready and initialize
                    function initializePlugin() {
                        console.log('Initializing Message Cleanup Plugin...');
                        
                        // FIXED: Better server ID detection
                        detectCurrentServerId();
                        
                        // Make functions globally available
                        window.searchUserMessages = searchUserMessages;
                        window.toggleMessageSelection = toggleMessageSelection;
                        window.selectAllMessages = selectAllMessages;
                        window.clearSelection = clearSelection;
                        window.updateBulkActions = updateBulkActions;
                        window.deleteSelectedMessages = deleteSelectedMessages;
                        window.confirmDeletion = confirmDeletion;
                        window.deleteMessage = deleteMessage;
                        window.closeDeleteModal = closeDeleteModal;
                        window.loadCleanupLogs = loadCleanupLogs;
                        window.loadChannels = loadChannels;
                        window.showNotification = showNotification;
                        
                        // Load initial data
                        loadChannels();
                        loadCleanupLogs();
                        setupEventListeners();
                    }

                    // FIXED: Better server ID detection function
                    function detectCurrentServerId() {
                        // Try multiple methods to get the server ID
                        currentServerId = window.currentServerId 
                            || document.body.dataset.serverId 
                            || new URLSearchParams(window.location.search).get('serverId')
                            || localStorage.getItem('selectedServer')
                            || localStorage.getItem('serverId');
                        
                        console.log('Detected server ID:', currentServerId);
                        
                        // If still not found, try to get from server selector
                        if (!currentServerId) {
                            const serverSelect = document.querySelector('#serverSelect, .server-select, [name="serverId"]');
                            if (serverSelect && serverSelect.value) {
                                currentServerId = serverSelect.value;
                                console.log('Got server ID from selector:', currentServerId);
                            }
                        }
                        
                        // Set it globally for other functions to use
                        if (currentServerId) {
                            window.currentServerId = currentServerId;
                            document.body.dataset.serverId = currentServerId;
                        }
                        
                        return currentServerId;
                    }

                    function setupEventListeners() {
                        const userSearchInput = document.getElementById('userSearch');
                        if (userSearchInput) {
                            userSearchInput.addEventListener('keypress', (e) => {
                                if (e.key === 'Enter') searchUserMessages();
                            });
                            userSearchInput.addEventListener('input', (e) => {
                                const value = e.target.value.trim();
                                if (value && !/^<?@?!?\\d{17,19}>?$/.test(value)) {
                                    e.target.style.borderColor = '#ff6b6b';
                                } else {
                                    e.target.style.borderColor = '';
                                }
                            });
                        }

                        const deleteModal = document.getElementById('deleteModal');
                        if (deleteModal) {
                            deleteModal.addEventListener('click', (e) => {
                                if (e.target === e.currentTarget) closeDeleteModal();
                            });
                        }
                    }

                    async function loadChannels() {
                        try {
                            // FIXED: Ensure we have a server ID before making API calls
                            const serverId = detectCurrentServerId();
                            if (!serverId) {
                                console.warn('No server ID available for loading channels');
                                return;
                            }
                            
                            const response = await fetch(\`/api/servers/\${serverId}/channels\`);
                            const channels = await response.json();
                            const channelSelect = document.getElementById('channelFilter');
                            if (channelSelect) {
                                channelSelect.innerHTML = '<option value="">All channels</option>';
                                channels.filter(ch => ch.type === 0).forEach(channel => {
                                    const option = document.createElement('option');
                                    option.value = channel.id;
                                    option.textContent = '#' + channel.name;
                                    channelSelect.appendChild(option);
                                });
                            }
                        } catch (error) {
                            console.error('Error loading channels:', error);
                            showNotification('Failed to load channels', 'error');
                        }
                    }

                    async function searchUserMessages() {
                        // FIXED: Always detect current server ID before making the call
                        const serverId = detectCurrentServerId();
                        
                        if (!serverId) {
                            showNotification('Server ID not found. Please select a server first.', 'error');
                            console.error('No server ID available for search');
                            return;
                        }
                        
                        const userInput = document.getElementById('userSearch')?.value?.trim();
                        const channelId = document.getElementById('channelFilter')?.value;
                        
                        if (!userInput) {
                            showNotification('Please enter a user ID', 'error');
                            return;
                        }

                        const userId = userInput.replace(/[<@!>]/g, '');
                        if (!/^\\d{17,19}$/.test(userId)) {
                            showNotification('Invalid user ID format', 'error');
                            return;
                        }

                        try {
                            showNotification('Searching messages...', 'info');
                            const url = \`/api/plugins/cleanup/messages/\${serverId}/\${userId}\${channelId ? '?channelId=' + channelId : ''}\`;
                            console.log('Making request to:', url);
                            
                            const response = await fetch(url);
                            const data = await response.json();
                            
                            if (!response.ok) {
                                throw new Error(data.error || 'Failed to fetch messages');
                            }
                            
                            currentUserData = data;
                            displayUserInfo(data.user);
                            displayMessages(data.messages);
                            showNotification(\`Found \${data.messages.length} messages\`, 'success');
                        } catch (error) {
                            console.error('Error searching messages:', error);
                            showNotification('Error: ' + error.message, 'error');
                        }
                    }

                    function displayUserInfo(user) {
                        const userInfoSection = document.getElementById('userInfo');
                        if (!userInfoSection) return;
                        
                        userInfoSection.style.display = 'block';
                        userInfoSection.innerHTML = \`
                            <div class="user-card" style="display: flex; align-items: center; gap: 15px; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px;">
                                <img src="\${user.avatar}" alt="Avatar" style="width: 50px; height: 50px; border-radius: 50%;">
                                <div>
                                    <h4 style="margin: 0;">\${user.displayName || user.username}</h4>
                                    <p style="margin: 5px 0; opacity: 0.8;">@\${user.username} • ID: \${user.id}</p>
                                    <p style="margin: 0; font-size: 0.9em; opacity: 0.7;">Found \${currentUserData.totalFound} messages</p>
                                </div>
                            </div>
                        \`;
                    }

                    function displayMessages(messages) {
                        const container = document.getElementById('messagesContainer');
                        const bulkActions = document.querySelector('.bulk-actions');
                        
                        if (!container) return;
                        
                        if (messages.length === 0) {
                            container.innerHTML = '<div class="empty-state"><p>No messages found for this user</p></div>';
                            if (bulkActions) bulkActions.style.display = 'none';
                            return;
                        }
                        
                        if (bulkActions) bulkActions.style.display = 'flex';
                        selectedMessages.clear();
                        
                        container.innerHTML = messages.map(msg => {
                            const isOld = msg.age > (14 * 24 * 60 * 60 * 1000);
                            const ageWarning = isOld ? '<div style="color: #ffa502; font-size: 0.8em; margin-top: 5px;">⚠️ Old message (>14 days)</div>' : '';
                            
                            return \`
                            <div class="message-item" data-message-id="\${msg.id}" style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 3px solid \${isOld ? '#ffa502' : '#7289da'};">
                                <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <input type="checkbox" class="message-checkbox" onchange="toggleMessageSelection('\${msg.id}')">
                                        <span class="channel-name">#\${msg.channelName}</span>
                                        <span class="timestamp">\${new Date(msg.timestamp).toLocaleString()}</span>
                                    </div>
                                    <button onclick="deleteMessage('\${msg.id}')" class="btn btn-danger btn-sm">Delete</button>
                                </div>
                                <div class="message-content" style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px;">
                                    <p style="margin: 0; word-break: break-word;">\${msg.content}</p>
                                    \${msg.hasMedia ? '<div style="margin-top: 5px; font-size: 0.8em;">📎 Has attachments</div>' : ''}
                                    \${ageWarning}
                                </div>
                            </div>\`;
                        }).join('');
                    }

                    function toggleMessageSelection(messageId) {
                        if (selectedMessages.has(messageId)) {
                            selectedMessages.delete(messageId);
                        } else {
                            selectedMessages.add(messageId);
                        }
                        updateBulkActions();
                    }

                    function selectAllMessages() {
                        document.querySelectorAll('.message-checkbox').forEach(checkbox => {
                            checkbox.checked = true;
                            selectedMessages.add(checkbox.closest('.message-item').dataset.messageId);
                        });
                        updateBulkActions();
                    }

                    function clearSelection() {
                        document.querySelectorAll('.message-checkbox').forEach(checkbox => {
                            checkbox.checked = false;
                        });
                        selectedMessages.clear();
                        updateBulkActions();
                    }

                    function updateBulkActions() {
                        const deleteBtn = document.querySelector('.bulk-actions button[onclick="deleteSelectedMessages()"]');
                        if (deleteBtn) {
                            deleteBtn.textContent = \`Delete Selected (\${selectedMessages.size})\`;
                            deleteBtn.disabled = selectedMessages.size === 0;
                        }
                    }

                    function deleteSelectedMessages() {
                        if (selectedMessages.size === 0) return;
                        if (selectedMessages.size > 100) {
                            showNotification('Cannot delete more than 100 messages at once', 'error');
                            return;
                        }
                        
                        const deleteCount = document.getElementById('deleteCount');
                        const deleteModal = document.getElementById('deleteModal');
                        if (deleteCount) deleteCount.textContent = selectedMessages.size;
                        if (deleteModal) deleteModal.style.display = 'flex';
                    }

                    async function confirmDeletion() {
                        const reasonInput = document.getElementById('deleteReason');
                        const reason = reasonInput?.value?.trim();
                        
                        if (!reason) {
                            showNotification('Reason is required for audit logging', 'error');
                            return;
                        }
                        
                        // FIXED: Get current server ID
                        const serverId = detectCurrentServerId();
                        if (!serverId) {
                            showNotification('Server ID not found', 'error');
                            return;
                        }
                        
                        try {
                            showNotification('Deleting messages...', 'info');
                            const response = await fetch('/api/plugins/cleanup/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    serverId: serverId,
                                    messageIds: Array.from(selectedMessages),
                                    reason: reason
                                })
                            });
                            
                            const result = await response.json();
                            if (!response.ok) {
                                throw new Error(result.error || 'Failed to delete messages');
                            }
                            
                            showNotification(\`Deleted \${result.success} messages\`, 'success');
                            await searchUserMessages();
                            closeDeleteModal();
                            loadCleanupLogs();
                        } catch (error) {
                            console.error('Error deleting messages:', error);
                            showNotification('Error: ' + error.message, 'error');
                        }
                    }

                    async function deleteMessage(messageId) {
                        const reason = prompt('Enter reason for deletion:');
                        if (!reason?.trim()) {
                            showNotification('Reason is required', 'error');
                            return;
                        }
                        
                        // FIXED: Get current server ID
                        const serverId = detectCurrentServerId();
                        if (!serverId) {
                            showNotification('Server ID not found', 'error');
                            return;
                        }
                        
                        try {
                            const response = await fetch('/api/plugins/cleanup/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    serverId: serverId,
                                    messageIds: [messageId],
                                    reason: reason.trim()
                                })
                            });
                            
                            const result = await response.json();
                            if (result.success > 0) {
                                showNotification('Message deleted successfully', 'success');
                                document.querySelector(\`[data-message-id="\${messageId}"]\`)?.remove();
                                loadCleanupLogs();
                            }
                        } catch (error) {
                            showNotification('Error: ' + error.message, 'error');
                        }
                    }

                    function closeDeleteModal() {
                        const deleteModal = document.getElementById('deleteModal');
                        const deleteReason = document.getElementById('deleteReason');
                        if (deleteModal) deleteModal.style.display = 'none';
                        if (deleteReason) deleteReason.value = '';
                    }

                    async function loadCleanupLogs() {
                        try {
                            // FIXED: Get current server ID
                            const serverId = detectCurrentServerId();
                            if (!serverId) {
                                console.warn('No server ID available for loading logs');
                                return;
                            }
                            
                            const response = await fetch(\`/api/plugins/cleanup/logs/\${serverId}?limit=50\`);
                            const logs = await response.json();
                            const container = document.getElementById('logsContainer');
                            
                            if (!container) return;
                            if (logs.length === 0) {
                                container.innerHTML = '<div class="empty-state"><p>No cleanup logs yet</p></div>';
                                return;
                            }
                            
                            container.innerHTML = logs.map(log => \`
                                <div class="log-item" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                        <span>\${new Date(log.timestamp).toLocaleString()}</span>
                                        <span class="method-badge">\${log.method.includes('command') ? '🔧 Command' : '🖥️ Dashboard'}</span>
                                    </div>
                                    <div style="font-size: 0.9em; opacity: 0.8;">
                                        Channel: <#\${log.channelId}> | Target: <@\${log.targetUserId}>
                                        \${log.reason ? \`<br>Reason: \${log.reason}\` : ''}
                                    </div>
                                </div>
                            \`).join('');
                        } catch (error) {
                            console.error('Error loading logs:', error);
                        }
                    }

                    function showNotification(message, type = 'info') {
                        document.querySelectorAll('.notification').forEach(n => n.remove());
                        const notification = document.createElement('div');
                        notification.className = 'notification';
                        notification.style.cssText = \`
                            position: fixed; top: 20px; right: 20px; padding: 15px 20px; border-radius: 10px;
                            color: white; font-weight: 500; z-index: 10000; max-width: 400px;
                            background: \${type === 'error' ? '#ff4757' : type === 'success' ? '#2ed573' : '#5352ed'};
                        \`;
                        notification.innerHTML = \`\${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'} \${message}\`;
                        document.body.appendChild(notification);
                        setTimeout(() => notification.remove(), 3000);
                    }

                    // Initialize when ready
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', initializePlugin);
                    } else {
                        initializePlugin();
                    }
                })();
            `
        };
    }
}

module.exports = MessageCleanupPlugin;