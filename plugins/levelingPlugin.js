const fs = require('fs').promises;
const path = require('path');

class LevelingPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Leveling System';
        this.description = 'XP and leveling system with multiple XP sources and leaderboards';
        this.version = '1.0.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        this.dataFile = path.join(__dirname, '../data/levelingData.json');
        this.settingsFile = path.join(__dirname, '../data/levelingSettings.json');
        
        // XP calculation constants
        this.XP_RATES = {
            MESSAGE: { min: 15, max: 25 },
            VOICE_PER_MINUTE: 10,
            REACTION_GIVEN: 5,
            REACTION_RECEIVED: 3
        };
        
        // Rate limiting (prevent XP farming)
        this.MESSAGE_COOLDOWN = 60000; // 1 minute between XP gains from messages
        this.VOICE_UPDATE_INTERVAL = 60000; // Update voice XP every minute
        
        this.userCooldowns = new Map();
        this.voiceTracker = new Map(); // Track voice session start times
        
        this.initializeData();
        this.setupRoutes();
        this.setupDiscordListeners();
        this.setupSlashCommands();
        
        // Start voice tracking interval
        setInterval(() => this.updateVoiceXP(), this.VOICE_UPDATE_INTERVAL);
    }

    async initializeData() {
        try {
            // Initialize leveling data file
            try {
                await fs.access(this.dataFile);
            } catch {
                const initialData = {
                    users: {}, // userId: { guildId: { xp, level, lastMessageTime, voiceTime, reactionsGiven, reactionsReceived } }
                    leaderboards: {} // guildId: { overall: [], voice: [], reactions: [], weekly: [], monthly: [] }
                };
                await fs.writeFile(this.dataFile, JSON.stringify(initialData, null, 2));
            }
            
            // Initialize settings file
            try {
                await fs.access(this.settingsFile);
            } catch {
                const initialSettings = {
                    // guildId: { xpSources: { messages, voice, reactions }, levelUpChannel, xpMultiplier }
                };
                await fs.writeFile(this.settingsFile, JSON.stringify(initialSettings, null, 2));
            }
        } catch (error) {
            console.error('Error initializing leveling data:', error);
        }
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading leveling data:', error);
            return { users: {}, leaderboards: {} };
        }
    }

    async saveData(data) {
        try {
            await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving leveling data:', error);
        }
    }

    async loadSettings() {
        try {
            const settings = await fs.readFile(this.settingsFile, 'utf8');
            return JSON.parse(settings);
        } catch (error) {
            console.error('Error loading leveling settings:', error);
            return {};
        }
    }

    async saveSettings(settings) {
        try {
            await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
        } catch (error) {
            console.error('Error saving leveling settings:', error);
        }
    }

    calculateLevel(xp) {
        // Level formula: level = floor(sqrt(xp / 100))
        // XP needed for level n: n^2 * 100
        return Math.floor(Math.sqrt(xp / 100));
    }

    getXPForLevel(level) {
        return level * level * 100;
    }

    getXPNeededForNextLevel(currentXP) {
        const currentLevel = this.calculateLevel(currentXP);
        const nextLevelXP = this.getXPForLevel(currentLevel + 1);
        return nextLevelXP - currentXP;
    }

    async addXP(userId, guildId, amount, source = 'manual') {
        const data = await this.loadData();
        
        if (!data.users[userId]) {
            data.users[userId] = {};
        }
        
        if (!data.users[userId][guildId]) {
            data.users[userId][guildId] = {
                xp: 0,
                level: 0,
                lastMessageTime: 0,
                voiceTime: 0,
                reactionsGiven: 0,
                reactionsReceived: 0
            };
        }
        
        const userGuildData = data.users[userId][guildId];
        const oldLevel = userGuildData.level;
        
        userGuildData.xp += amount;
        userGuildData.level = this.calculateLevel(userGuildData.xp);
        
        // Track source-specific stats
        if (source === 'reaction_given') userGuildData.reactionsGiven++;
        if (source === 'reaction_received') userGuildData.reactionsReceived++;
        
        await this.saveData(data);
        
        // Check for level up
if (userGuildData.level > oldLevel) {
    await this.handleLevelUp(userId, guildId, userGuildData.level, oldLevel);
}
        
        return userGuildData;
    }

    async handleLevelUp(userId, guildId, newLevel, oldLevel) {
    try {
        const settings = await this.loadSettings();
        const guildSettings = settings[guildId];
        
        if (guildSettings && guildSettings.levelUpChannel) {
            const channel = this.client.channels.cache.get(guildSettings.levelUpChannel);
            const user = await this.client.users.fetch(userId);
            
            if (channel && user) {
                const embed = {
                    color: 0x00ff00,
                    title: '🎉 Level Up!',
                    description: `**${user.username}** leveled up from **${oldLevel}** to **${newLevel}**!`,
                    thumbnail: { url: user.displayAvatarURL() },
                    timestamp: new Date().toISOString()
                };
                
                await channel.send({ embeds: [embed] });
            }
        }
        
        // Emit level up event for other plugins (like auto-role) to listen to
        this.client.emit('levelUp', userId, guildId, newLevel, oldLevel);
        
    } catch (error) {
        console.error('Error handling level up:', error);
    }
}

    setupDiscordListeners() {
        // Message XP
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.guild) return;
            
            const settings = await this.loadSettings();
            const guildSettings = settings[message.guild.id];
            
            if (!guildSettings || !guildSettings.xpSources?.messages) return;
            
            const userId = message.author.id;
            const guildId = message.guild.id;
            const now = Date.now();
            const cooldownKey = `${userId}-${guildId}`;
            
            // Check cooldown
            if (this.userCooldowns.has(cooldownKey)) {
                const lastXP = this.userCooldowns.get(cooldownKey);
                if (now - lastXP < this.MESSAGE_COOLDOWN) return;
            }
            
            const xpGain = Math.floor(Math.random() * (this.XP_RATES.MESSAGE.max - this.XP_RATES.MESSAGE.min + 1)) + this.XP_RATES.MESSAGE.min;
            const multiplier = guildSettings.xpMultiplier || 1;
            
            this.userCooldowns.set(cooldownKey, now);
            await this.addXP(userId, guildId, Math.floor(xpGain * multiplier), 'message');
        });

        // Voice XP tracking
        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            const userId = newState.member?.id;
            if (!userId) return;
            
            const settings = await this.loadSettings();
            
            // User joined voice channel
            if (!oldState.channel && newState.channel) {
                const guildSettings = settings[newState.guild.id];
                if (guildSettings?.xpSources?.voice) {
                    this.voiceTracker.set(`${userId}-${newState.guild.id}`, Date.now());
                }
            }
            
            // User left voice channel
            if (oldState.channel && !newState.channel) {
                const trackingKey = `${userId}-${oldState.guild.id}`;
                if (this.voiceTracker.has(trackingKey)) {
                    const startTime = this.voiceTracker.get(trackingKey);
                    const sessionTime = Date.now() - startTime;
                    const minutes = Math.floor(sessionTime / 60000);
                    
                    if (minutes > 0) {
                        const guildSettings = settings[oldState.guild.id];
                        const multiplier = guildSettings?.xpMultiplier || 1;
                        const xpGain = Math.floor(minutes * this.XP_RATES.VOICE_PER_MINUTE * multiplier);
                        
                        await this.addXP(userId, oldState.guild.id, xpGain, 'voice');
                        
                        // Update voice time
                        const data = await this.loadData();
                        if (data.users[userId]?.[oldState.guild.id]) {
                            data.users[userId][oldState.guild.id].voiceTime += minutes;
                            await this.saveData(data);
                        }
                    }
                    
                    this.voiceTracker.delete(trackingKey);
                }
            }
        });

        // Reaction XP
        this.client.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot || !reaction.message.guild) return;
            
            const settings = await this.loadSettings();
            const guildSettings = settings[reaction.message.guild.id];
            
            if (!guildSettings?.xpSources?.reactions) return;
            
            const multiplier = guildSettings.xpMultiplier || 1;
            
            // XP for giving reaction
            await this.addXP(user.id, reaction.message.guild.id, 
                Math.floor(this.XP_RATES.REACTION_GIVEN * multiplier), 'reaction_given');
            
            // XP for receiving reaction (message author)
            if (!reaction.message.author.bot) {
                await this.addXP(reaction.message.author.id, reaction.message.guild.id, 
                    Math.floor(this.XP_RATES.REACTION_RECEIVED * multiplier), 'reaction_received');
            }
        });
    }

    setupSlashCommands() {
        // Register slash commands when bot is ready
        this.client.once('ready', async () => {
            try {
                const commands = [
                    {
                        name: 'level',
                        description: 'Check your current level and XP',
                        options: [
                            {
                                name: 'user',
                                description: 'User to check (optional, defaults to yourself)',
                                type: 6, // USER type
                                required: false
                            }
                        ]
                    },
                    {
                        name: 'leaderboard',
                        description: 'View the server leaderboard',
                        options: [
                            {
                                name: 'type',
                                description: 'Type of leaderboard to view',
                                type: 3, // STRING type
                                required: false,
                                choices: [
                                    { name: 'Overall XP', value: 'overall' },
                                    { name: 'Voice Time', value: 'voice' },
                                    { name: 'Reactions', value: 'reactions' }
                                ]
                            },
                            {
                                name: 'limit',
                                description: 'Number of users to show (default: 10, max: 25)',
                                type: 4, // INTEGER type
                                required: false,
                                min_value: 1,
                                max_value: 25
                            }
                        ]
                    }
                ];

                // Register commands globally (you can also register per guild for faster updates during development)
                await this.client.application.commands.set(commands);
                console.log('✓ Leveling slash commands registered');
            } catch (error) {
                console.error('Error registering leveling slash commands:', error);
            }
        });

        // Handle slash command interactions
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName, guildId, user } = interaction;

            if (commandName === 'level') {
                await this.handleLevelCommand(interaction);
            } else if (commandName === 'leaderboard') {
                await this.handleLeaderboardCommand(interaction);
            }
        });
    }

    async handleLevelCommand(interaction) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const guildId = interaction.guildId;

            if (!guildId) {
                return await interaction.editReply('This command can only be used in a server!');
            }

            // Check if leveling is enabled for this server
            const settings = await this.loadSettings();
            const guildSettings = settings[guildId];
            
            if (!guildSettings || (!guildSettings.xpSources?.messages && !guildSettings.xpSources?.voice && !guildSettings.xpSources?.reactions)) {
                return await interaction.editReply('❌ Leveling system is not enabled on this server.');
            }

            const data = await this.loadData();
            const userData = data.users[targetUser.id]?.[guildId] || {
                xp: 0, level: 0, voiceTime: 0, reactionsGiven: 0, reactionsReceived: 0
            };

            const xpNeeded = this.getXPNeededForNextLevel(userData.xp);
            const xpForCurrentLevel = this.getXPForLevel(userData.level);
            const xpProgress = userData.xp - xpForCurrentLevel;
            const xpForNextLevel = this.getXPForLevel(userData.level + 1) - xpForCurrentLevel;
            const progressPercentage = Math.floor((xpProgress / xpForNextLevel) * 100);

            // Generate a simple progress bar
            const progressBarLength = 20;
            const filledBars = Math.floor((progressPercentage / 100) * progressBarLength);
            const emptyBars = progressBarLength - filledBars;
            const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

            // Get user's rank in the server
            const leaderboard = await this.generateLeaderboard(guildId, 'overall', 1000);
            const userRank = leaderboard.findIndex(entry => entry.userId === targetUser.id) + 1;

            const isOwnProfile = targetUser.id === interaction.user.id;
            const displayName = targetUser.displayName || targetUser.username;

            const embed = {
                color: 0x7289da,
                title: `📈 ${isOwnProfile ? 'Your Level' : `${displayName}'s Level`}`,
                thumbnail: { url: targetUser.displayAvatarURL() },
                fields: [
                    {
                        name: '📊 Current Stats',
                        value: `**Level:** ${userData.level}\n**XP:** ${userData.xp.toLocaleString()}\n**Rank:** ${userRank > 0 ? `#${userRank}` : 'Unranked'}`,
                        inline: true
                    },
                    {
                        name: '🎯 Progress to Next Level',
                        value: `**Need:** ${xpNeeded.toLocaleString()} XP\n**Progress:** ${xpProgress.toLocaleString()}/${xpForNextLevel.toLocaleString()}\n**Percentage:** ${progressPercentage}%`,
                        inline: true
                    },
                    {
                        name: '\u200b',
                        value: '\u200b',
                        inline: true
                    },
                    {
                        name: '📈 Progress Bar',
                        value: `\`${progressBar}\` ${progressPercentage}%`,
                        inline: false
                    }
                ],
                footer: {
                    text: `Voice: ${userData.voiceTime} min • Reactions: ${userData.reactionsGiven + userData.reactionsReceived}`,
                    icon_url: interaction.client.user.displayAvatarURL()
                },
                timestamp: new Date().toISOString()
            };

            // Add additional stats if they have any
            if (userData.voiceTime > 0 || userData.reactionsGiven > 0 || userData.reactionsReceived > 0) {
                embed.fields.push({
                    name: '📋 Additional Stats',
                    value: `**Voice Time:** ${userData.voiceTime} minutes\n**Reactions Given:** ${userData.reactionsGiven}\n**Reactions Received:** ${userData.reactionsReceived}`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error handling level command:', error);
            await interaction.editReply('❌ An error occurred while fetching level information.');
        }
    }

    async handleLeaderboardCommand(interaction) {
        try {
            await interaction.deferReply();

            const type = interaction.options.getString('type') || 'overall';
            const limit = interaction.options.getInteger('limit') || 10;
            const guildId = interaction.guildId;

            if (!guildId) {
                return await interaction.editReply('This command can only be used in a server!');
            }

            // Check if leveling is enabled for this server
            const settings = await this.loadSettings();
            const guildSettings = settings[guildId];
            
            if (!guildSettings || (!guildSettings.xpSources?.messages && !guildSettings.xpSources?.voice && !guildSettings.xpSources?.reactions)) {
                return await interaction.editReply('❌ Leveling system is not enabled on this server.');
            }

            const leaderboard = await this.generateLeaderboard(guildId, type, limit);

            if (leaderboard.length === 0) {
                return await interaction.editReply('📊 No leaderboard data available yet. Start chatting to gain XP!');
            }

            const typeEmojis = {
                overall: '🏆',
                voice: '🎤',
                reactions: '⭐'
            };

            const typeNames = {
                overall: 'Overall XP',
                voice: 'Voice Time',
                reactions: 'Reactions'
            };

            let description = '';
            const promises = leaderboard.map(async (entry, index) => {
                try {
                    const user = await this.client.users.fetch(entry.userId);
                    const username = user.displayName || user.username;
                    let valueText;

                    switch (type) {
                        case 'voice':
                            valueText = `${entry.value} minutes`;
                            break;
                        case 'reactions':
                            valueText = `${entry.value} reactions`;
                            break;
                        default:
                            valueText = `${entry.value.toLocaleString()} XP (Level ${entry.level})`;
                    }

                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
                    return `${medal} **${username}** - ${valueText}`;
                } catch {
                    return `**${index + 1}.** Unknown User - ${entry.value} ${type === 'voice' ? 'minutes' : type === 'reactions' ? 'reactions' : 'XP'}`;
                }
            });

            const leaderboardLines = await Promise.all(promises);
            description = leaderboardLines.join('\n');

            const embed = {
                color: 0x7289da,
                title: `${typeEmojis[type]} ${typeNames[type]} Leaderboard`,
                description: description,
                footer: {
                    text: `${interaction.guild.name} • Showing top ${leaderboard.length}`,
                    icon_url: interaction.guild.iconURL() || interaction.client.user.displayAvatarURL()
                },
                timestamp: new Date().toISOString()
            };

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error handling leaderboard command:', error);
            await interaction.editReply('❌ An error occurred while fetching the leaderboard.');
        }
    }

    async updateVoiceXP() {
        const settings = await this.loadSettings();
        const now = Date.now();
        
        for (const [trackingKey, startTime] of this.voiceTracker.entries()) {
            const [userId, guildId] = trackingKey.split('-');
            const guildSettings = settings[guildId];
            
            if (!guildSettings?.xpSources?.voice) continue;
            
            const sessionTime = now - startTime;
            const minutes = Math.floor(sessionTime / 60000);
            
            if (minutes >= 1) {
                const multiplier = guildSettings.xpMultiplier || 1;
                const xpGain = Math.floor(this.XP_RATES.VOICE_PER_MINUTE * multiplier);
                
                await this.addXP(userId, guildId, xpGain, 'voice');
                
                // Update voice time
                const data = await this.loadData();
                if (data.users[userId]?.[guildId]) {
                    data.users[userId][guildId].voiceTime += 1;
                    await this.saveData(data);
                }
                
                // Reset tracking time
                this.voiceTracker.set(trackingKey, now);
            }
        }
    }

    async generateLeaderboard(guildId, type = 'overall', limit = 10) {
        const data = await this.loadData();
        const leaderboard = [];
        
        for (const [userId, guilds] of Object.entries(data.users)) {
            if (guilds[guildId]) {
                const userData = guilds[guildId];
                let value;
                
                switch (type) {
                    case 'voice':
                        value = userData.voiceTime;
                        break;
                    case 'reactions':
                        value = userData.reactionsGiven + userData.reactionsReceived;
                        break;
                    default:
                        value = userData.xp;
                }
                
                leaderboard.push({
                    userId,
                    value,
                    level: userData.level,
                    xp: userData.xp
                });
            }
        }
        
        return leaderboard
            .sort((a, b) => b.value - a.value)
            .slice(0, limit);
    }

    setupRoutes() {
        // Get leveling settings
        this.app.get('/api/plugins/leveling/settings/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const settings = await this.loadSettings();
                const guildSettings = settings[guildId] || {
                    xpSources: { messages: true, voice: true, reactions: true },
                    levelUpChannel: null,
                    xpMultiplier: 1.0
                };
                
                res.json(guildSettings);
            } catch (error) {
                console.error('Error getting leveling settings:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Update leveling settings
        this.app.post('/api/plugins/leveling/settings/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const settings = await this.loadSettings();
                settings[guildId] = req.body;
                await this.saveSettings(settings);
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error updating leveling settings:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Get user level/XP
        this.app.get('/api/plugins/leveling/user/:guildId/:userId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId, userId } = req.params;
                
                const data = await this.loadData();
                const userData = data.users[userId]?.[guildId] || {
                    xp: 0, level: 0, voiceTime: 0, reactionsGiven: 0, reactionsReceived: 0
                };
                
                const xpNeeded = this.getXPNeededForNextLevel(userData.xp);
                const xpForCurrentLevel = this.getXPForLevel(userData.level);
                const xpProgress = userData.xp - xpForCurrentLevel;
                const xpForNextLevel = this.getXPForLevel(userData.level + 1) - xpForCurrentLevel;
                
                res.json({
                    ...userData,
                    xpNeeded,
                    xpProgress,
                    xpForNextLevel,
                    progressPercentage: Math.floor((xpProgress / xpForNextLevel) * 100)
                });
            } catch (error) {
                console.error('Error getting user data:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Get leaderboard
        this.app.get('/api/plugins/leveling/leaderboard/:guildId/:type?', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId, type = 'overall' } = req.params;
                const limit = parseInt(req.query.limit) || 10;
                
                const leaderboard = await this.generateLeaderboard(guildId, type, limit);
                
                // Fetch user info for leaderboard
                const enrichedLeaderboard = await Promise.all(
                    leaderboard.map(async (entry, index) => {
                        try {
                            const user = await this.client.users.fetch(entry.userId);
                            return {
                                rank: index + 1,
                                userId: entry.userId,
                                username: user.username,
                                displayName: user.displayName || user.username,
                                avatar: user.displayAvatarURL(),
                                value: entry.value,
                                level: entry.level,
                                xp: entry.xp
                            };
                        } catch {
                            return {
                                rank: index + 1,
                                userId: entry.userId,
                                username: 'Unknown User',
                                displayName: 'Unknown User',
                                avatar: null,
                                value: entry.value,
                                level: entry.level,
                                xp: entry.xp
                            };
                        }
                    })
                );
                
                res.json(enrichedLeaderboard);
            } catch (error) {
                console.error('Error getting leaderboard:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Add XP manually (admin only)
        this.app.post('/api/plugins/leveling/addxp', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId, userId, amount } = req.body;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const userData = await this.addXP(userId, guildId, parseInt(amount), 'manual');
                res.json(userData);
            } catch (error) {
                console.error('Error adding XP:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }

    getFrontendComponent() {
        return {
            id: 'leveling-plugin',
            name: 'Leveling System',
            description: 'Manage XP, levels, and leaderboards',
            icon: '📈',
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
                console.log('Loading leveling plugin...');
                
                let currentGuildId = null;
                let currentLeaderboardType = 'overall';

                // Load servers into the dropdown
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

                    // Leaderboard type buttons
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
                            headers: { 'Content-Type': 'application/json' },
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
                            headers: { 'Content-Type': 'application/json' },
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
                            loadLeaderboard(); // Refresh leaderboard
                        } else {
                            throw new Error('Failed to add XP');
                        }
                    } catch (error) {
                        console.error('Error adding XP:', error);
                        showNotification('Error adding XP', 'error');
                    }
                }

                // Initialize when plugin loads
                initializeLevelingPage();
            `
        };
    }
}

module.exports = LevelingPlugin;