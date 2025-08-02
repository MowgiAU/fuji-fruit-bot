const fs = require('fs').promises;
const path = require('path');
const { ChannelType, PermissionFlagsBits, Collection } = require('discord.js');

class MessageCleanupPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Message Cleanup';
        this.description = 'Clean up user messages with slash commands and dashboard management';
        this.version = '1.2.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        // Role-based permissions
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
            this.cleanupData = { logs: [], stats: {} };
            await this.saveData();
        }
    }

    async saveData() {
        try {
            await fs.writeFile(this.dataFile, JSON.stringify(this.cleanupData, null, 2));
        } catch (error) {
            console.error('Error saving message cleanup data:', error);
        }
    }

    setupRoutes() {
        // Dashboard routes for cleanup logs and statistics
        this.app.get('/api/plugins/message-cleanup/logs/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                const serverLogs = this.cleanupData.logs.filter(log => log.serverId === serverId);
                const recentLogs = serverLogs.slice(-100); // Last 100 logs

                res.json({ logs: recentLogs });
            } catch (error) {
                console.error('Error fetching cleanup logs:', error);
                res.status(500).json({ error: 'Failed to fetch cleanup logs' });
            }
        });

        this.app.get('/api/plugins/message-cleanup/stats/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                const serverLogs = this.cleanupData.logs.filter(log => log.serverId === serverId);
                
                const stats = {
                    totalCleanups: serverLogs.length,
                    totalMessagesDeleted: serverLogs.reduce((sum, log) => sum + (log.messagesDeleted || 0), 0),
                    moderators: [...new Set(serverLogs.map(log => log.moderatorId))].length,
                    lastCleanup: serverLogs.length > 0 ? serverLogs[serverLogs.length - 1].timestamp : null
                };

                res.json(stats);
            } catch (error) {
                console.error('Error fetching cleanup stats:', error);
                res.status(500).json({ error: 'Failed to fetch cleanup stats' });
            }
        });
    }

    setupDiscordListeners() {
        // Keep all non-slash-command interaction listeners
        // (buttons, modals, select menus, etc. would go here if needed)
    }

    // NEW: Required method for centralized slash command system
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
                    description: 'Number of messages to delete (1-100, default: 10)',
                    type: 4, // INTEGER
                    required: false,
                    min_value: 1,
                    max_value: 100
                },
                {
                    name: 'channel',
                    description: 'Channel to clean (leave empty for current channel)',
                    type: 7, // CHANNEL
                    required: false,
                    channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
                },
                {
                    name: 'reason',
                    description: 'Reason for cleanup',
                    type: 3, // STRING
                    required: false,
                    max_length: 200
                }
            ]
        }];
    }

    // NEW: Optional method for command permissions
    getCommandPermissions() {
        return {
            'clean': {
                requiredPermissions: this.REQUIRED_PERMISSIONS,
                allowedRoles: [this.MODERATOR_ROLE_ID]
            }
        };
    }

    // NEW: Required method for handling slash commands
    async handleSlashCommand(interaction) {
        try {
            if (interaction.commandName === 'clean') {
                await this.handleCleanCommand(interaction);
            }
        } catch (error) {
            console.error('Error handling slash command:', error);
            const errorMessage = '❌ An error occurred while processing the command. Please try again later.';
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }

    async handleCleanCommand(interaction) {
        // Check permissions
        if (!await this.hasPermission(interaction)) {
            return await interaction.reply({ 
                content: '❌ You do not have permission to use this command. Moderator role or Manage Messages permission required.', 
                ephemeral: true 
            });
        }

        // Check rate limits
        if (!await this.checkRateLimit(interaction)) {
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const count = interaction.options.getInteger('count') || 10;
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Validate channel type
        if (targetChannel.type !== ChannelType.GuildText && targetChannel.type !== ChannelType.GuildAnnouncement) {
            return await interaction.reply({ 
                content: '❌ Can only clean text channels.', 
                ephemeral: true 
            });
        }

        // Check bot permissions in target channel
        const botMember = interaction.guild.members.cache.get(this.client.user.id);
        if (!targetChannel.permissionsFor(botMember).has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory])) {
            return await interaction.reply({ 
                content: '❌ I don\'t have permission to manage messages in that channel.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply();

        try {
            // Determine which channels to clean
            const channelsToClean = targetChannel ? [targetChannel] : 
                interaction.guild.channels.cache.filter(channel => 
                    channel.type === ChannelType.GuildText && 
                    channel.permissionsFor(botMember).has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory])
                );

            const results = {
                deleted: 0,
                failed: 0,
                total: 0,
                channels: []
            };

            for (const channel of channelsToClean) {
                try {
                    const channelResult = { name: channel.name, deleted: 0, failed: 0 };

                    // Fetch messages
                    const messages = await channel.messages.fetch({ limit: count });
                    let messagesToDelete = targetUser ? 
                        messages.filter(msg => msg.author.id === targetUser.id) : 
                        messages;

                    // Convert to array and sort by age
                    messagesToDelete = Array.from(messagesToDelete.values());
                    
                    // Separate messages by age (Discord API limitation: bulk delete only works for messages < 14 days old)
                    const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
                    const newMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);
                    const oldMessages = messagesToDelete.filter(msg => msg.createdTimestamp <= twoWeeksAgo);

                    // Bulk delete new messages
                    if (newMessages.length > 0) {
                        try {
                            if (newMessages.length === 1) {
                                await newMessages[0].delete();
                                channelResult.deleted++;
                                results.deleted++;
                            } else {
                                await channel.bulkDelete(newMessages, true);
                                channelResult.deleted += newMessages.length;
                                results.deleted += newMessages.length;
                            }

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

    // Helper method for checking permissions
    async hasPermission(interaction) {
        const member = interaction.member;
        
        // Check if user has required permissions
        if (member.permissions.has(this.REQUIRED_PERMISSIONS)) {
            return true;
        }
        
        // Check if user has moderator role
        if (member.roles.cache.has(this.MODERATOR_ROLE_ID)) {
            return true;
        }
        
        return false;
    }

    // Helper method for rate limiting
    async checkRateLimit(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const now = Date.now();

        // Check user cooldown
        if (this.userCooldowns.has(userId)) {
            const userLastUse = this.userCooldowns.get(userId);
            if (now - userLastUse < this.USER_RATE_LIMIT) {
                const timeLeft = Math.ceil((this.USER_RATE_LIMIT - (now - userLastUse)) / 1000);
                await interaction.reply({ 
                    content: `❌ You're using this command too frequently. Please wait ${timeLeft} seconds.`, 
                    ephemeral: true 
                });
                return false;
            }
        }

        // Check guild cooldown
        if (this.guildCooldowns.has(guildId)) {
            const guildLastUse = this.guildCooldowns.get(guildId);
            if (now - guildLastUse < this.GUILD_RATE_LIMIT) {
                const timeLeft = Math.ceil((this.GUILD_RATE_LIMIT - (now - guildLastUse)) / 1000);
                await interaction.reply({ 
                    content: `❌ This server is using cleanup commands too frequently. Please wait ${timeLeft} seconds.`, 
                    ephemeral: true 
                });
                return false;
            }
        }

        // Set cooldowns
        this.userCooldowns.set(userId, now);
        this.guildCooldowns.set(guildId, now);
        
        return true;
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

    // Frontend component for dashboard
    getFrontendComponent() {
        return {
            id: 'message-cleanup',
            name: 'Message Cleanup',
            description: 'View cleanup logs and statistics',
            icon: '🧹',
            html: `
                <div class="plugin-container">
                    <div class="plugin-header">
                        <h3>🧹 Message Cleanup</h3>
                        <p>Monitor and manage message cleanup activities</p>
                    </div>
                    
                    <div class="cleanup-stats">
                        <div class="stat-card">
                            <h4>Total Cleanups</h4>
                            <div id="total-cleanups">Loading...</div>
                        </div>
                        <div class="stat-card">
                            <h4>Messages Deleted</h4>
                            <div id="total-messages">Loading...</div>
                        </div>
                        <div class="stat-card">
                            <h4>Active Moderators</h4>
                            <div id="active-moderators">Loading...</div>
                        </div>
                    </div>
                    
                    <div class="cleanup-logs">
                        <h4>Recent Cleanup Logs</h4>
                        <div id="cleanup-log-list">Loading...</div>
                    </div>
                </div>
                
                <style>
                    .cleanup-stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 25px;
                    }
                    
                    .stat-card {
                        background: rgba(255, 255, 255, 0.1);
                        padding: 15px;
                        border-radius: 10px;
                        text-align: center;
                    }
                    
                    .stat-card h4 {
                        margin: 0 0 10px 0;
                        color: #ffffff;
                        font-size: 14px;
                    }
                    
                    .stat-card div {
                        font-size: 24px;
                        font-weight: bold;
                        color: #4CAF50;
                    }
                    
                    .cleanup-logs {
                        background: rgba(255, 255, 255, 0.1);
                        padding: 20px;
                        border-radius: 10px;
                    }
                    
                    .log-entry {
                        background: rgba(255, 255, 255, 0.05);
                        padding: 10px;
                        margin: 5px 0;
                        border-radius: 5px;
                        border-left: 3px solid #4CAF50;
                    }
                    
                    .log-entry small {
                        color: #cccccc;
                    }
                </style>
            `,
            script: `
                async function loadCleanupData() {
                    try {
                        const serverId = getCurrentServerId();
                        
                        // Load stats
                        const statsResponse = await fetch('/api/plugins/message-cleanup/stats/' + serverId);
                        const stats = await statsResponse.json();
                        
                        document.getElementById('total-cleanups').textContent = stats.totalCleanups || 0;
                        document.getElementById('total-messages').textContent = stats.totalMessagesDeleted || 0;
                        document.getElementById('active-moderators').textContent = stats.moderators || 0;
                        
                        // Load logs
                        const logsResponse = await fetch('/api/plugins/message-cleanup/logs/' + serverId);
                        const logsData = await logsResponse.json();
                        
                        const logList = document.getElementById('cleanup-log-list');
                        if (logsData.logs && logsData.logs.length > 0) {
                            logList.innerHTML = logsData.logs.slice(-10).reverse().map(log => 
                                '<div class="log-entry">' +
                                '<strong>Cleanup by ' + (log.moderatorId || 'Unknown') + '</strong><br>' +
                                'Channel: ' + (log.channelId || 'Unknown') + '<br>' +
                                'Reason: ' + (log.reason || 'No reason provided') + '<br>' +
                                '<small>' + new Date(log.timestamp).toLocaleString() + '</small>' +
                                '</div>'
                            ).join('');
                        } else {
                            logList.innerHTML = '<p>No cleanup logs found.</p>';
                        }
                    } catch (error) {
                        console.error('Error loading cleanup data:', error);
                        document.getElementById('total-cleanups').textContent = 'Error';
                        document.getElementById('total-messages').textContent = 'Error';
                        document.getElementById('active-moderators').textContent = 'Error';
                        document.getElementById('cleanup-log-list').innerHTML = '<p>Error loading logs.</p>';
                    }
                }
                
                // Load data when component is displayed
                loadCleanupData();
            `
        };
    }
}

module.exports = MessageCleanupPlugin;