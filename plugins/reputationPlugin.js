// plugins/reputationPlugin.js
const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

class ReputationPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Reputation System';
        this.description = 'Advanced reputation system with categories, reasons, decay, and anti-abuse features';
        this.version = '2.0.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        // File paths
        this.dataFile = path.join(__dirname, '../data/reputationData.json');
        this.settingsFile = path.join(__dirname, '../data/reputationSettings.json');
        this.auditFile = path.join(__dirname, '../data/reputationAudit.json');
        
        // Constants
        this.REP_CATEGORIES = ['helpfulness', 'creativity', 'reliability', 'community', 'legacy'];
        this.DEFAULT_COOLDOWN = 3600000; // 1 hour
        this.DEFAULT_DAILY_LIMIT = 10;
        this.DEFAULT_WEEKLY_LIMIT = 50;
        this.DECAY_INTERVAL = 86400000; // 24 hours
        this.DECAY_RATE = 0.995; // 0.5% decay per day
        
        // Maps for tracking cooldowns and limits
        this.userCooldowns = new Map();
        this.dailyLimits = new Map();
        this.weeklyLimits = new Map();
        
        // Thanks patterns
        this.THANKS_PATTERNS = [
            /\b(thanks?|ty|thx|thank\s+you|tysm|thks)\b/i,
            /\bgrateful\b/i,
            /\bappreciat/i,
            /\bmuch\s+appreciated\b/i,
            /\bthanks?\s+(so\s+)?much\b/i
        ];
        
        this.initializeData();
        this.setupRoutes();
        this.setupDiscordListeners();
        
        // Start decay interval
        this.decayInterval = setInterval(() => this.processDecay(), this.DECAY_INTERVAL);
        
        // Reset daily/weekly limits
        this.resetLimitsDaily();
        this.resetLimitsWeekly();
    }

    // --- CENTRALIZED SLASH COMMANDS ---
    getSlashCommands() {
        return [
            {
                name: 'rep',
                description: 'View or give reputation to a user',
                options: [
                    {
                        name: 'view',
                        description: 'View a users reputation',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'user',
                                description: 'User to view reputation for',
                                type: 6, // USER
                                required: false
                            }
                        ]
                    },
                    {
                        name: 'give',
                        description: 'Give reputation to a user',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'user',
                                description: 'User to give reputation to',
                                type: 6, // USER
                                required: true
                            },
                            {
                                name: 'category',
                                description: 'Category of reputation',
                                type: 3, // STRING
                                required: true,
                                choices: [
                                    { name: 'Helpfulness', value: 'helpfulness' },
                                    { name: 'Creativity', value: 'creativity' },
                                    { name: 'Reliability', value: 'reliability' },
                                    { name: 'Community Spirit', value: 'community' }
                                ]
                            },
                            {
                                name: 'reason',
                                description: 'Reason for giving reputation',
                                type: 3, // STRING
                                required: true
                            }
                        ]
                    },
                    {
                        name: 'leaderboard',
                        description: 'View reputation leaderboard',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'type',
                                description: 'Type of leaderboard',
                                type: 3, // STRING
                                required: false,
                                choices: [
                                    { name: 'Overall', value: 'overall' },
                                    { name: 'Helpfulness', value: 'helpfulness' },
                                    { name: 'Creativity', value: 'creativity' },
                                    { name: 'Reliability', value: 'reliability' },
                                    { name: 'Community Spirit', value: 'community' },
                                    { name: 'Weekly', value: 'weekly' },
                                    { name: 'Monthly', value: 'monthly' },
                                    { name: 'Legacy', value: 'legacy' }
                                ]
                            }
                        ]
                    },
                    {
                        name: 'history',
                        description: 'View your reputation history',
                        type: 1 // SUB_COMMAND
                    }
                ]
            },
            {
                name: 'thanks',
                description: 'Thank a user and give them reputation',
                options: [
                    {
                        name: 'user',
                        description: 'User to thank',
                        type: 6, // USER
                        required: true
                    },
                    {
                        name: 'reason',
                        description: 'Reason for thanking',
                        type: 3, // STRING
                        required: false
                    }
                ]
            }
        ];
    }

    getCommandPermissions() {
        return {
            'rep': {
                // No special permissions - everyone can use
            },
            'thanks': {
                // No special permissions - everyone can use
            }
        };
    }

    // --- CENTRALIZED COMMAND HANDLER ---
    async handleSlashCommand(interaction) {
        const { commandName } = interaction;
        
        try {
            if (commandName === 'rep') {
                await this.handleRepCommand(interaction);
            } else if (commandName === 'thanks') {
                await this.handleThanksCommand(interaction);
            } else {
                console.warn(`Unknown command ${commandName} routed to reputation plugin`);
                await interaction.reply({ 
                    content: '❌ Unknown command.', 
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.error(`Error in reputation command ${commandName}:`, error);
            throw error; // Let the centralized handler deal with it
        }
    }

    async initializeData() {
        try {
            const dataDir = path.dirname(this.dataFile);
            await fs.mkdir(dataDir, { recursive: true });
            
            // Initialize data files if they don't exist
            try {
                await fs.access(this.dataFile);
            } catch {
                await this.saveData({ users: {}, history: {} });
            }
            
            try {
                await fs.access(this.settingsFile);
            } catch {
                await this.saveSettings({});
            }
            
            try {
                await fs.access(this.auditFile);
            } catch {
                await fs.writeFile(this.auditFile, JSON.stringify({ events: [] }, null, 2));
            }
        } catch (error) {
            console.error('Error initializing reputation data:', error);
        }
    }

    // --- DATA MANAGEMENT ---
    async loadData() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading reputation data:', error);
            return { users: {}, history: {} };
        }
    }

    async saveData(data) {
        try {
            await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving reputation data:', error);
        }
    }

    async loadSettings() {
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }

    async saveSettings(settings) {
        try {
            await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
        } catch (error) {
            console.error('Error saving reputation settings:', error);
        }
    }

    getDefaultSettings() {
        return {
            enabled: false,
            autoThanks: true,
            reactionRep: false,
            repEmoji: '👍',
            customName: 'Reputation',
            cooldownTime: 60,
            dailyLimit: 10,
            weeklyLimit: 50,
            decayEnabled: false,
            logChannel: null,
            roles: {}
        };
    }

    getDefaultUserRep() {
        return {
            total: 0,
            categories: {
                helpfulness: 0,
                creativity: 0,
                reliability: 0,
                community: 0,
                legacy: 0
            },
            streaks: {
                current: 0,
                longest: 0,
                lastGiven: null
            },
            lastDecay: Date.now(),
            given: 0,
            received: 0
        };
    }

    // --- REPUTATION LOGIC ---
    async giveReputation(guildId, fromUserId, toUserId, category, amount, reason, type = 'command', channelId = null) {
        if (fromUserId === toUserId) {
            return { success: false, error: 'Cannot give reputation to yourself' };
        }

        const cooldownKey = `${guildId}-${fromUserId}-${toUserId}`;
        const lastGiven = this.userCooldowns.get(cooldownKey);
        const settings = await this.loadSettings();
        const guildSettings = settings[guildId] || this.getDefaultSettings();
        const cooldown = guildSettings.cooldownTime * 60000;

        if (lastGiven && Date.now() - lastGiven < cooldown) {
            const timeLeft = Math.ceil((cooldown - (Date.now() - lastGiven)) / 60000);
            return { success: false, error: `Please wait ${timeLeft} more minutes before giving reputation to this user again` };
        }

        const limitsCheck = this.checkLimits(guildId, fromUserId, amount);
        if (!limitsCheck.success) {
            return { success: false, error: limitsCheck.error };
        }

        const multiplier = await this.getReputationMultiplier(guildId, fromUserId);
        const finalAmount = Math.floor(amount * multiplier);

        await this.adjustReputation(guildId, toUserId, fromUserId, category, finalAmount, reason, type);
        this.userCooldowns.set(cooldownKey, Date.now());
        this.updateLimits(guildId, fromUserId, finalAmount);
        await this.logAuditEvent(guildId, 'rep_given', fromUserId, toUserId, { category, amount: finalAmount, reason, type, multiplier });
		await this.sendPublicReputationAnnouncement(guildId, fromUserId, toUserId, category, finalAmount, reason, channelId);


        return { success: true, amount: finalAmount };
    }

    async adjustReputation(guildId, userId, fromUserId, category, amount, reason, type) {
        const data = await this.loadData();
        const defaultRep = this.getDefaultUserRep();

        if (!data.users[userId]) data.users[userId] = {};
        
        data.users[userId][guildId] = {
            ...defaultRep,
            ...(data.users[userId][guildId] || {}),
            categories: { ...defaultRep.categories, ...((data.users[userId][guildId]?.categories) || {}) },
            streaks: { ...defaultRep.streaks, ...((data.users[userId][guildId]?.streaks) || {}) }
        };
        
        if (!data.history[guildId]) data.history[guildId] = {};
        if (!data.history[guildId][userId]) data.history[guildId][userId] = [];

        const userRep = data.users[userId][guildId];
        userRep.categories[category] += amount;
        userRep.total += amount;
        userRep.received += amount;

        if (fromUserId) {
            if (!data.users[fromUserId]) data.users[fromUserId] = {};
            if (!data.users[fromUserId][guildId]) {
                data.users[fromUserId][guildId] = { ...defaultRep };
            }
            data.users[fromUserId][guildId].given += amount;
        }

        data.history[guildId][userId].push({
            timestamp: Date.now(),
            fromUserId,
            category,
            amount,
            reason,
            type
        });

        await this.saveData(data);
        await this.checkRoleRewards(guildId, userId, userRep);
        await this.sendLogMessage(guildId, fromUserId, userId, category, amount, reason, type);
    }

    async getReputationMultiplier(guildId, userId) {
        const data = await this.loadData();
        const userRep = data.users[userId]?.[guildId] || this.getDefaultUserRep();
        
        let multiplier = 1.0;
        
        // Streak bonus
        if (userRep.streaks.current >= 7) multiplier += 0.1;
        if (userRep.streaks.current >= 30) multiplier += 0.2;
        
        // High reputation bonus
        if (userRep.total >= 100) multiplier += 0.05;
        if (userRep.total >= 500) multiplier += 0.1;
        
        return multiplier;
    }

    checkLimits(guildId, userId, amount) {
        const settings = this.loadSettings();
        const guildSettings = settings[guildId] || this.getDefaultSettings();
        
        const dailyKey = `${guildId}-${userId}-daily`;
        const weeklyKey = `${guildId}-${userId}-weekly`;
        
        const dailyUsed = this.dailyLimits.get(dailyKey) || 0;
        const weeklyUsed = this.weeklyLimits.get(weeklyKey) || 0;
        
        if (dailyUsed + amount > guildSettings.dailyLimit) {
            return { success: false, error: `Daily limit reached (${guildSettings.dailyLimit})` };
        }
        
        if (weeklyUsed + amount > guildSettings.weeklyLimit) {
            return { success: false, error: `Weekly limit reached (${guildSettings.weeklyLimit})` };
        }
        
        return { success: true };
    }

    updateLimits(guildId, userId, amount) {
        const dailyKey = `${guildId}-${userId}-daily`;
        const weeklyKey = `${guildId}-${userId}-weekly`;
        
        const dailyUsed = this.dailyLimits.get(dailyKey) || 0;
        const weeklyUsed = this.weeklyLimits.get(weeklyKey) || 0;
        
        this.dailyLimits.set(dailyKey, dailyUsed + amount);
        this.weeklyLimits.set(weeklyKey, weeklyUsed + amount);
    }

    resetLimitsDaily() {
        setInterval(() => {
            this.dailyLimits.clear();
        }, 86400000); // 24 hours
    }

    resetLimitsWeekly() {
        setInterval(() => {
            this.weeklyLimits.clear();
        }, 604800000); // 7 days
    }

    // --- COMMAND HANDLERS ---
    async handleRepCommand(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'view') await this.handleRepView(interaction);
        else if (subcommand === 'give') await this.handleRepGive(interaction);
        else if (subcommand === 'leaderboard') await this.handleRepLeaderboard(interaction);
        else if (subcommand === 'history') await this.handleRepHistory(interaction);
    }

    async handleRepView(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const data = await this.loadData();
        
        const getUserData = (guildData) => {
            const defaults = this.getDefaultUserRep();
            return {
                ...defaults,
                ...(guildData || {}),
                categories: { ...defaults.categories, ...(guildData?.categories || {}) },
                streaks: { ...defaults.streaks, ...(guildData?.streaks || {}) }
            };
        };

        const userRep = getUserData(data.users[targetUser.id]?.[interaction.guildId]);
        const settings = await this.loadSettings();
        const guildSettings = settings[interaction.guildId] || this.getDefaultSettings();
        
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(`${guildSettings.customName} for ${targetUser.displayName}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: '📊 Total', value: userRep.total.toString(), inline: true },
                { name: '🤝 Helpfulness', value: userRep.categories.helpfulness.toString(), inline: true },
                { name: '🎨 Creativity', value: userRep.categories.creativity.toString(), inline: true },
                { name: '⭐ Reliability', value: userRep.categories.reliability.toString(), inline: true },
                { name: '💝 Community', value: userRep.categories.community.toString(), inline: true },
                { name: '🏛️ Legacy', value: userRep.categories.legacy.toString(), inline: true },
                { name: '📈 Given', value: userRep.given.toString(), inline: true },
                { name: '📥 Received', value: userRep.received.toString(), inline: true },
                { name: '🔥 Current Streak', value: userRep.streaks.current.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async handleRepGive(interaction) {
        const targetUser = interaction.options.getUser('user');
        const category = interaction.options.getString('category');
        const reason = interaction.options.getString('reason');

        const settings = await this.loadSettings();
        const guildSettings = settings[interaction.guildId];
        
        if (!guildSettings?.enabled) {
            return await interaction.reply({ content: '❌ Reputation system is not enabled on this server.', ephemeral: true });
        }

        const result = await this.giveReputation(
            interaction.guildId,
            interaction.user.id,
            targetUser.id,
            category,
            1,
            reason,
            'slash_command',
            interaction.channelId
        );

        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Reputation Given!')
                .setDescription(`You gave **${result.amount}** ${category} reputation to ${targetUser}`)
                .addFields(
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        }
    }

    async handleRepLeaderboard(interaction) {
        const type = interaction.options.getString('type') || 'overall';
        const leaderboard = await this.generateLeaderboard(interaction.guildId, type, 10);

        if (leaderboard.length === 0) {
            return await interaction.reply({ content: '📊 No reputation data found for this server.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle(`🏆 ${type.charAt(0).toUpperCase() + type.slice(1)} Reputation Leaderboard`)
            .setDescription(leaderboard.map((entry, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                return `${medal} <@${entry.userId}> - **${entry.reputation}** ${this.getCategoryEmoji(type)}`;
            }).join('\n'))
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async handleRepHistory(interaction) {
        const data = await this.loadData();
        const history = data.history[interaction.guildId]?.[interaction.user.id] || [];

        if (history.length === 0) {
            return await interaction.reply({ content: '📊 No reputation history found.', ephemeral: true });
        }

        const recentHistory = history.slice(-10).reverse();
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📜 Your Reputation History')
            .setDescription(recentHistory.map(entry => {
                const date = new Date(entry.timestamp).toLocaleDateString();
                const fromUser = entry.fromUserId ? `<@${entry.fromUserId}>` : 'System';
                const sign = entry.amount > 0 ? '+' : '';
                return `${date}: ${sign}${entry.amount} ${this.getCategoryEmoji(entry.category)} from ${fromUser}`;
            }).join('\n'))
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleThanksCommand(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Being helpful';

        const settings = await this.loadSettings();
        const guildSettings = settings[interaction.guildId];
        
        if (!guildSettings?.enabled) {
            return await interaction.reply({ content: '❌ Reputation system is not enabled on this server.', ephemeral: true });
        }

        const result = await this.giveReputation(
            interaction.guildId,
            interaction.user.id,
            targetUser.id,
            'helpfulness',
            1,
            reason,
            'thanks_command',
            interaction.channelId
        );

        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🙏 Thanks Given!')
                .setDescription(`You thanked ${targetUser} and gave them **${result.amount}** helpfulness reputation!`)
                .addFields(
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        }
    }

    // --- DISCORD LISTENERS ---
    setupDiscordListeners() {
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.guild) return;
            const settings = await this.loadSettings();
            const guildSettings = settings[message.guild.id];
            if (!guildSettings?.enabled || !guildSettings?.autoThanks) return;
            await this.handleThanksMessage(message, guildSettings);
        });

        this.client.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot || !reaction.message.guild) return;
            const settings = await this.loadSettings();
            const guildSettings = settings[reaction.message.guild.id];
            if (!guildSettings?.enabled || !guildSettings?.reactionRep) return;
            if (guildSettings.repEmoji === reaction.emoji.name || guildSettings.repEmoji === reaction.emoji.id) {
                await this.giveReputation(
                    reaction.message.guild.id, 
                    user.id, 
                    reaction.message.author.id, 
                    'helpfulness', 
                    1, 
                    'Helpful reaction', 
                    'reaction',
                    reaction.message.channel.id
                );
            }
        });

        // Keep button and modal handlers
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton() || !interaction.customId.startsWith('rep_')) return;
            await this.handleReputationInteraction(interaction);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isModalSubmit() || !interaction.customId.startsWith('rep_reason_')) return;
            await this.handleReasonModal(interaction);
        });
    }

    // --- HELPER METHODS ---
    async generateLeaderboard(guildId, type, limit) {
        const data = await this.loadData();
        const users = [];

        for (const [userId, userData] of Object.entries(data.users)) {
            if (!userData[guildId]) continue;
            
            const userRep = userData[guildId];
            let reputation = 0;

            if (type === 'overall') {
                reputation = userRep.total;
            } else if (this.REP_CATEGORIES.includes(type)) {
                reputation = userRep.categories[type];
            } else if (type === 'weekly' || type === 'monthly') {
                const history = data.history[guildId]?.[userId] || [];
                const timeFrame = type === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
                const cutoff = Date.now() - timeFrame;
                reputation = history
                    .filter(entry => entry.timestamp > cutoff)
                    .reduce((sum, entry) => sum + entry.amount, 0);
            }

            if (reputation > 0) {
                users.push({ userId, reputation });
            }
        }

        return users
            .sort((a, b) => b.reputation - a.reputation)
            .slice(0, limit);
    }

    getCategoryEmoji(category) {
        const emojis = { 
            helpfulness: '🤝', 
            creativity: '🎨', 
            reliability: '⭐', 
            community: '💝', 
            legacy: '🏛️',
            overall: '📊'
        };
        return emojis[category] || '📊';
    }

    async handleThanksMessage(message, guildSettings) {
		const content = message.content.toLowerCase();
		const mentions = message.mentions.users;
		
		if (mentions.size === 0) return;
		
		const hasThanks = this.THANKS_PATTERNS.some(pattern => pattern.test(content));
		if (!hasThanks) return;

		const targetUser = mentions.first();
		if (targetUser.id === message.author.id || targetUser.bot) return;

		// Automatically give reputation without button
		const result = await this.giveReputation(
			message.guild.id,
			message.author.id,
			targetUser.id,
			'helpfulness',
			1,
			'Thanked in chat',
			'auto_thanks',
			message.channel.id
		);

		if (result.success) {
			// Send a simple confirmation embed without any buttons
			const embed = new EmbedBuilder()
				.setColor(0x00ff00)
				.setDescription(`✅ ${message.author} thanked ${targetUser} and gave them **${result.amount}** helpfulness reputation!`)
				.setTimestamp();

			await message.reply({ embeds: [embed] });
		} else {
			// Send error message if reputation couldn't be given (e.g., cooldown)
			const embed = new EmbedBuilder()
				.setColor(0xffaa00)
				.setDescription(`⏱️ ${message.author} thanked ${targetUser}\n${result.error}`)
				.setTimestamp();

			await message.reply({ embeds: [embed] });
		}
	}


    async sendPublicReputationAnnouncement(guildId, fromUserId, toUserId, category, amount, reason, channelId) {
		try {
			// HARDCODED: Always send to this specific channel
			const REPUTATION_CHANNEL_ID = '1390335452439121920';
			const ERROR_CHANNEL_ID = '1257813127794397327';
			
			// Always use the hardcoded channel, ignore the channelId parameter
			const channel = this.client.channels.cache.get(REPUTATION_CHANNEL_ID);
			
			if (!channel) {
				console.error(`Could not find hardcoded reputation channel ${REPUTATION_CHANNEL_ID}`);
				
				// Send error to the error channel
				const errorChannel = this.client.channels.cache.get(ERROR_CHANNEL_ID);
				if (errorChannel) {
					const errorEmbed = new EmbedBuilder()
						.setColor(0xff0000)
						.setTitle('❌ Reputation Channel Error')
						.setDescription(`Could not find reputation channel ${REPUTATION_CHANNEL_ID}`)
						.addFields(
							{ name: 'Attempted Action', value: 'Send reputation announcement', inline: false },
							{ name: 'From User', value: `<@${fromUserId}>`, inline: true },
							{ name: 'To User', value: `<@${toUserId}>`, inline: true },
							{ name: 'Category', value: category, inline: true },
							{ name: 'Amount', value: amount.toString(), inline: true },
							{ name: 'Reason', value: reason || 'No reason provided', inline: false }
						)
						.setTimestamp();
					
					await errorChannel.send({ embeds: [errorEmbed] });
				}
				return;
			}

			const embed = new EmbedBuilder()
				.setColor(0x00ff00)
				.setTitle('🏆 Reputation Given!')
				.setDescription(`<@${fromUserId}> gave **${amount}** ${category} reputation to <@${toUserId}>`)
				.addFields(
					{ name: 'Category', value: `${this.getCategoryEmoji(category)} ${category.charAt(0).toUpperCase() + category.slice(1)}`, inline: true },
					{ name: 'Reason', value: reason || 'No reason provided', inline: false }
				)
				.setTimestamp();

			await channel.send({ embeds: [embed] });
			console.log(`Successfully sent reputation announcement to channel ${REPUTATION_CHANNEL_ID}`);
		} catch (error) {
			console.error('Error sending reputation announcement:', error);
			
			// Send error to the error channel
			const ERROR_CHANNEL_ID = '1257813127794397327';
			const errorChannel = this.client.channels.cache.get(ERROR_CHANNEL_ID);
			if (errorChannel) {
				const errorEmbed = new EmbedBuilder()
					.setColor(0xff0000)
					.setTitle('❌ Reputation System Error')
					.setDescription('An error occurred while sending reputation announcement')
					.addFields(
						{ name: 'Error Message', value: error.message || 'Unknown error', inline: false },
						{ name: 'From User', value: `<@${fromUserId}>`, inline: true },
						{ name: 'To User', value: `<@${toUserId}>`, inline: true },
						{ name: 'Category', value: category, inline: true },
						{ name: 'Stack Trace', value: `\`\`\`${error.stack?.substring(0, 500) || 'No stack trace'}\`\`\``, inline: false }
					)
					.setTimestamp();
				
				await errorChannel.send({ embeds: [errorEmbed] });
			}
		}
	}

    async checkRoleRewards(guildId, userId, userRep) {
        const settings = await this.loadSettings();
        const guildSettings = settings[guildId];
        if (!guildSettings?.roles) return;

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return;

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;

        for (const [threshold, roleId] of Object.entries(guildSettings.roles)) {
            const requiredRep = parseInt(threshold);
            if (userRep.total >= requiredRep) {
                const role = guild.roles.cache.get(roleId);
                if (role && !member.roles.cache.has(roleId)) {
                    await member.roles.add(role).catch(console.error);
                    await this.logAuditEvent(guildId, 'role_reward', userId, null, { 
                        roleId, 
                        threshold: requiredRep, 
                        currentRep: userRep.total 
                    }, 'system');
                }
            }
        }
    }

    async sendLogMessage(guildId, fromUserId, toUserId, category, amount, reason, type) {
        const settings = await this.loadSettings();
        const guildSettings = settings[guildId];
        if (!guildSettings?.logChannel) return;

        const channel = this.client.channels.cache.get(guildSettings.logChannel);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(amount > 0 ? 0x00ff00 : 0xff0000)
            .setTitle((amount > 0 ? '📈' : '📉') + ' Reputation ' + (amount > 0 ? 'Given' : 'Removed'))
            .addFields(
                { name: 'From', value: fromUserId ? `<@${fromUserId}>` : 'System', inline: true },
                { name: 'To', value: `<@${toUserId}>`, inline: true },
                { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
                { name: 'Amount', value: amount.toString(), inline: true },
                { name: 'Type', value: type, inline: true },
                { name: 'Reason', value: reason || 'No reason provided', inline: false }
            )
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    }

    async logAuditEvent(guildId, action, userId, targetId, details, source) {
        try {
            const auditData = JSON.parse(await fs.readFile(this.auditFile, 'utf8').catch(() => '{"events":[]}'));
            
            auditData.events.push({
                timestamp: Date.now(),
                guildId,
                action,
                userId,
                targetId,
                details,
                source
            });

            // Keep only last 1000 events
            if (auditData.events.length > 1000) {
                auditData.events = auditData.events.slice(-1000);
            }

            await fs.writeFile(this.auditFile, JSON.stringify(auditData, null, 2));
        } catch (error) {
            console.error('Error logging audit event:', error);
        }
    }

    async processDecay() {
        try {
            const settings = await this.loadSettings();
            const data = await this.loadData();
            let decayCount = 0;

            for (const [userId, userData] of Object.entries(data.users)) {
                for (const [guildId, userRep] of Object.entries(userData)) {
                    const guildSettings = settings[guildId];
                    if (!guildSettings?.decayEnabled) continue;

                    const timeSinceDecay = Date.now() - (userRep.lastDecay || 0);
                    if (timeSinceDecay >= this.DECAY_INTERVAL) {
                        // Apply decay to each category
                        for (const category of this.REP_CATEGORIES) {
                            if (userRep.categories[category] > 0) {
                                const oldValue = userRep.categories[category];
                                const newValue = Math.floor(oldValue * this.DECAY_RATE);
                                const decayAmount = oldValue - newValue;
                                
                                userRep.categories[category] = newValue;
                                userRep.total -= decayAmount;
                                decayCount++;
                            }
                        }

                        userRep.lastDecay = Date.now();
                    }
                }
            }

            if (decayCount > 0) {
                await this.saveData(data);
                console.log(`🍂 Processed reputation decay for ${decayCount} users`);
            }
        } catch (error) {
            console.error('Error processing reputation decay:', error);
        }
    }

    // --- WEB ROUTES ---
    setupRoutes() {
        this.app.get('/api/plugins/reputation/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                const settings = await this.loadSettings();
                res.json(settings[serverId] || this.getDefaultSettings());
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch settings' });
            }
        });

        this.app.post('/api/plugins/reputation/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                const settings = await this.loadSettings();
                settings[serverId] = { ...this.getDefaultSettings(), ...req.body };
                await this.saveSettings(settings);
                res.json({ success: true, settings: settings[serverId] });
            } catch (error) {
                res.status(500).json({ error: 'Failed to update settings' });
            }
        });

        this.app.get('/api/plugins/reputation/leaderboard/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { type = 'overall', limit = 10 } = req.query;
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                const leaderboard = await this.generateLeaderboard(serverId, type, parseInt(limit));
                res.json(leaderboard);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch leaderboard' });
            }
        });

        this.app.post('/api/plugins/reputation/adjust/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { userId, category, amount, reason } = req.body;
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                await this.adjustReputation(serverId, userId, req.user.id, category, parseInt(amount), reason, 'admin_adjust');
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Failed to adjust reputation' });
            }
        });

        this.app.get('/api/plugins/reputation/user/:serverId/:userId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, userId } = req.params;
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                const data = await this.loadData();
                const userRep = data.users[userId]?.[serverId] || this.getDefaultUserRep();
                const history = data.history[serverId]?.[userId] || [];
                res.json({ reputation: userRep, history });
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch user reputation' });
            }
        });

        this.app.get('/api/plugins/reputation/audit/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { limit = 100 } = req.query;
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                const auditData = JSON.parse(await fs.readFile(this.auditFile, 'utf8').catch(() => '{"events":[]}'));
                const serverEvents = auditData.events.filter(e => e.guildId === serverId).slice(0, parseInt(limit));
                res.json(serverEvents);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch audit logs' });
            }
        });

        this.app.post('/api/plugins/reputation/repair/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                const result = await this.repairReputationData(serverId);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: 'Failed to repair data' });
            }
        });

        this.app.get('/api/plugins/reputation/stats/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                const stats = await this.getServerStats(serverId);
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch stats' });
            }
        });
    }

    async repairReputationData(guildId) {
        try {
            const data = await this.loadData();
            let repairsCount = 0;

            console.log('🔧 Starting reputation data repair...');

            for (const [userId, userData] of Object.entries(data.users)) {
                if (!userData[guildId]) continue;

                const userRep = userData[guildId];
                
                const categoryTotal = Object.values(userRep.categories || {}).reduce((sum, val) => sum + (val || 0), 0);
                const storedTotal = userRep.total || 0;
                const difference = storedTotal - categoryTotal;

                if (difference > 0) {
                    console.log(`User ${userId}: Total=${storedTotal}, Categories=${categoryTotal}, Missing=${difference}`);
                    
                    if (!userRep.categories) userRep.categories = {};
                    userRep.categories.legacy = (userRep.categories.legacy || 0) + difference;
                    
                    console.log(`✓ Added ${difference} to legacy category for user ${userId}`);
                    repairsCount++;
                }
            }

            if (repairsCount > 0) {
                await this.saveData(data);
                console.log(`🎉 Repair complete! Fixed ${repairsCount} users.`);
                
                await this.logAuditEvent(guildId, 'data_repair', 'system', null, {
                    repairsCount,
                    timestamp: Date.now()
                }, 'system');
            } else {
                console.log('✅ No data issues found.');
            }

            return { success: true, repairsCount };
        } catch (error) {
            console.error('Error repairing reputation data:', error);
            return { success: false, error: error.message };
        }
    }

    async getServerStats(guildId) {
        const data = await this.loadData();
        const users = [];
        
        for (const [userId, userData] of Object.entries(data.users)) {
            if (userData[guildId]) {
                users.push(userData[guildId]);
            }
        }

        if (users.length === 0) {
            return { totalUsers: 0, totalRep: 0, averageRep: 0 };
        }

        const totalRep = users.reduce((sum, user) => sum + (user.total || 0), 0);
        return { 
            totalUsers: users.length, 
            totalRep, 
            averageRep: users.length > 0 ? Math.round(totalRep / users.length) : 0 
        };
    }

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        return minutes > 0 ? `${minutes}m` : 'Just now';
    }

    // --- FRONTEND COMPONENT ---
    getFrontendComponent() {
        return {
            id: 'reputation-plugin',
            name: 'Reputation System',
            description: 'Advanced reputation system with categories, reasons, decay, and anti-abuse features',
            icon: '🏆',
            version: '2.0.0',
            containerId: 'reputationPluginContainer',
            pageId: 'reputation',
            navIcon: '🏆',
            
            html: `
                <div class="plugin-container">
                    <div class="plugin-header">
                        <h3><span class="plugin-icon">🏆</span> Reputation System</h3>
                        <p>Advanced reputation system with categories, reasons, decay, and anti-abuse features</p>
                    </div>
                    <div class="settings-section">
                        <h3>Settings</h3>
                        <div class="form-group">
                            <label for="repServerSelect">Server</label>
                            <select id="repServerSelect" required>
                                <option value="">Select a server...</option>
                            </select>
                        </div>
                        <div id="repSettingsContainer" style="display: none;">
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="repEnabled"> Enable Reputation System
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="autoThanks"> Auto-detect Thanks Messages
                                </label>
                                <small>Automatically prompt for reputation when users thank each other</small>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="reactionRep"> Reaction-based Reputation
                                </label>
                                <div style="margin-top: 8px;">
                                    <label for="repEmoji">Reputation Emoji</label>
                                    <input type="text" id="repEmoji" placeholder="👍" style="width: 60px;">
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="customName">Custom Name</label>
                                <input type="text" id="customName" placeholder="Reputation">
                                <small>Customize what reputation is called in your server</small>
                            </div>
                            <div class="form-group">
                                <label for="cooldownTime">Cooldown (minutes)</label>
                                <input type="number" id="cooldownTime" min="1" max="1440" value="60">
                                <small>Time between giving reputation to the same user</small>
                            </div>
                            <div class="form-group">
                                <label for="dailyLimit">Daily Limit</label>
                                <input type="number" id="dailyLimit" min="1" max="100" value="10">
                                <small>Maximum reputation a user can give per day</small>
                            </div>
                            <div class="form-group">
                                <label for="weeklyLimit">Weekly Limit</label>
                                <input type="number" id="weeklyLimit" min="1" max="500" value="50">
                                <small>Maximum reputation a user can give per week</small>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="decayEnabled"> Enable Reputation Decay
                                </label>
                                <small>Gradually reduce reputation over time to keep system fresh</small>
                            </div>
                            <div class="form-group">
                                <label for="logChannel">Log Channel</label>
                                <select id="logChannel">
                                    <option value="">No logging</option>
                                </select>
                                <small>Channel to log reputation changes</small>
                            </div>
                            <button type="button" id="saveRepSettings" class="btn-primary">Save Settings</button>
                        </div>
                    </div>
                </div>
            `,

            script: `(function() {
                console.log("🏆 Reputation Plugin: Initializing frontend component...");
                
                // Initialize the plugin when DOM is ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', initializeReputationPlugin);
                } else {
                    initializeReputationPlugin();
                }
                
                function initializeReputationPlugin() {
                    console.log("🏆 Setting up reputation plugin...");
                    
                    const serverSelect = document.getElementById('repServerSelect');
                    const settingsContainer = document.getElementById('repSettingsContainer');
                    const saveButton = document.getElementById('saveRepSettings');
                    
                    if (serverSelect) {
                        loadServerList();
                        serverSelect.addEventListener('change', handleServerChange);
                    }
                    
                    if (saveButton) {
                        saveButton.addEventListener('click', saveSettings);
                    }
                }
                
                async function loadServerList() {
                    try {
                        const response = await fetch('/api/servers');
                        if (!response.ok) throw new Error('Failed to fetch guilds');
                        
                        const guilds = await response.json();
                        const serverSelect = document.getElementById('repServerSelect');
                        
                        serverSelect.innerHTML = '<option value="">Select a server...</option>';
                        guilds.forEach(guild => {
                            const option = document.createElement('option');
                            option.value = guild.id;
                            option.textContent = guild.name;
                            serverSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading servers:', error);
                        showNotification('Failed to load servers', 'error');
                    }
                }
                
                async function handleServerChange() {
                    const serverSelect = document.getElementById('repServerSelect');
                    const settingsContainer = document.getElementById('repSettingsContainer');
                    const serverId = serverSelect.value;
                    
                    if (!serverId) {
                        settingsContainer.style.display = 'none';
                        return;
                    }
                    
                    try {
                        const response = await fetch(\`/api/plugins/reputation/settings/\${serverId}\`);
                        if (!response.ok) throw new Error('Failed to fetch settings');
                        
                        const settings = await response.json();
                        populateSettings(settings);
                        await loadChannels(serverId);
                        settingsContainer.style.display = 'block';
                    } catch (error) {
                        console.error('Error loading settings:', error);
                        showNotification('Failed to load settings', 'error');
                    }
                }
                
                function populateSettings(settings) {
                    document.getElementById('repEnabled').checked = settings.enabled || false;
                    document.getElementById('autoThanks').checked = settings.autoThanks || false;
                    document.getElementById('reactionRep').checked = settings.reactionRep || false;
                    document.getElementById('repEmoji').value = settings.repEmoji || '👍';
                    document.getElementById('customName').value = settings.customName || 'Reputation';
                    document.getElementById('cooldownTime').value = settings.cooldownTime || 60;
                    document.getElementById('dailyLimit').value = settings.dailyLimit || 10;
                    document.getElementById('weeklyLimit').value = settings.weeklyLimit || 50;
                    document.getElementById('decayEnabled').checked = settings.decayEnabled || false;
                }
                
                async function loadChannels(serverId) {
                    try {
                        const response = await fetch(\`/api/channels/\${serverId}\`);
                        if (!response.ok) throw new Error('Failed to fetch channels');
                        
                        const channels = await response.json();
                        const logChannelSelect = document.getElementById('logChannel');
                        
                        logChannelSelect.innerHTML = '<option value="">No logging</option>';
                        channels.forEach(channel => {
                            if (channel.type === 0) { // Text channel
                                const option = document.createElement('option');
                                option.value = channel.id;
                                option.textContent = '#' + channel.name;
                                logChannelSelect.appendChild(option);
                            }
                        });
                    } catch (error) {
                        console.error('Error loading channels:', error);
                    }
                }
                
                async function saveSettings() {
                    const serverSelect = document.getElementById('repServerSelect');
                    const serverId = serverSelect.value;
                    
                    if (!serverId) {
                        showNotification('Please select a server first', 'error');
                        return;
                    }
                    
                    const settings = {
                        enabled: document.getElementById('repEnabled').checked,
                        autoThanks: document.getElementById('autoThanks').checked,
                        reactionRep: document.getElementById('reactionRep').checked,
                        repEmoji: document.getElementById('repEmoji').value,
                        customName: document.getElementById('customName').value,
                        cooldownTime: parseInt(document.getElementById('cooldownTime').value),
                        dailyLimit: parseInt(document.getElementById('dailyLimit').value),
                        weeklyLimit: parseInt(document.getElementById('weeklyLimit').value),
                        decayEnabled: document.getElementById('decayEnabled').checked,
                        logChannel: document.getElementById('logChannel').value || null
                    };
                    
                    try {
                        const response = await fetch(\`/api/plugins/reputation/settings/\${serverId}\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(settings)
                        });
                        
                        if (!response.ok) throw new Error('Failed to save settings');
                        
                        showNotification('Settings saved successfully!', 'success');
                    } catch (error) {
                        console.error('Error saving settings:', error);
                        showNotification('Failed to save settings', 'error');
                    }
                }
            })();`
        };
    }

    // --- CLEANUP ---
    destroy() {
        if (this.decayInterval) {
            clearInterval(this.decayInterval);
        }
    }
}

module.exports = ReputationPlugin;