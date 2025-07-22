const fs = require('fs').promises;
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

class ReputationPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Reputation System';
        this.description = 'Advanced reputation system with categories, reasons, decay, and anti-abuse features';
        this.version = '1.0.0';
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
        this.setupSlashCommands();
        
        // Start decay interval
        this.decayInterval = setInterval(() => this.processDecay(), this.DECAY_INTERVAL);
        
        // Reset daily/weekly limits
        this.resetLimitsDaily();
        this.resetLimitsWeekly();
    }

    async initializeData() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dataFile);
            await fs.mkdir(dataDir, { recursive: true });

            // Initialize reputation data
            try {
                await fs.access(this.dataFile);
            } catch {
                const initialData = {
                    users: {}, // userId: { guildId: { categories: {}, total: 0, given: 0, received: 0, streaks: {}, badges: [], lastActive: timestamp } }
                    history: {}, // guildId: { userId: [{ from, to, category, amount, reason, timestamp, type }] }
                    leaderboards: {} // guildId: { overall: [], categories: {}, weekly: [], monthly: [] }
                };
                await fs.writeFile(this.dataFile, JSON.stringify(initialData, null, 2));
            }

            // Initialize settings
            try {
                await fs.access(this.settingsFile);
            } catch {
                const initialSettings = {
                    // guildId: { enabled, autoThanks, cooldown, dailyLimit, weeklyLimit, decayEnabled, logChannel, categories, customName, badges, roles }
                };
                await fs.writeFile(this.settingsFile, JSON.stringify(initialSettings, null, 2));
            }

            // Initialize audit log
            try {
                await fs.access(this.auditFile);
            } catch {
                const initialAudit = {
                    events: [] // { timestamp, guildId, type, userId, targetId, details, moderator }
                };
                await fs.writeFile(this.auditFile, JSON.stringify(initialAudit, null, 2));
            }
        } catch (error) {
            console.error('Error initializing reputation data:', error);
        }
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading reputation data:', error);
            return { users: {}, history: {}, leaderboards: {} };
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
            console.error('Error loading reputation settings:', error);
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

    async logAuditEvent(guildId, type, userId, targetId = null, details = {}, moderator = null) {
        try {
            const auditData = JSON.parse(await fs.readFile(this.auditFile, 'utf8').catch(() => '{"events":[]}'));
            auditData.events.push({
                timestamp: Date.now(),
                guildId,
                type,
                userId,
                targetId,
                details,
                moderator
            });
            
            // Keep only last 10000 events to prevent file bloat
            if (auditData.events.length > 10000) {
                auditData.events = auditData.events.slice(-10000);
            }
            
            await fs.writeFile(this.auditFile, JSON.stringify(auditData, null, 2));
        } catch (error) {
            console.error('Error logging audit event:', error);
        }
    }

    setupRoutes() {
        // Get reputation data for a server
        this.app.get('/api/plugins/reputation/data/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }

                const data = await this.loadData();
                const settings = await this.loadSettings();
                
                res.json({
                    settings: settings[serverId] || this.getDefaultSettings(),
                    leaderboard: data.leaderboards[serverId] || {},
                    stats: this.getServerStats(data, serverId)
                });
            } catch (error) {
                console.error('Error fetching reputation data:', error);
                res.status(500).json({ error: 'Failed to fetch reputation data' });
            }
        });

        // Update reputation settings
        this.app.post('/api/plugins/reputation/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }

                const settings = await this.loadSettings();
                settings[serverId] = { ...this.getDefaultSettings(), ...req.body };
                await this.saveSettings(settings);
                
                res.json({ success: true, settings: settings[serverId] });
            } catch (error) {
                console.error('Error updating reputation settings:', error);
                res.status(500).json({ error: 'Failed to update settings' });
            }
        });

        // Get leaderboard data
        this.app.get('/api/plugins/reputation/leaderboard/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { type = 'overall', limit = 10 } = req.query;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }

                const leaderboard = await this.generateLeaderboard(serverId, type, parseInt(limit));
                res.json(leaderboard);
            } catch (error) {
                console.error('Error fetching leaderboard:', error);
                res.status(500).json({ error: 'Failed to fetch leaderboard' });
            }
        });

        // Manual reputation adjustment (admin only)
        this.app.post('/api/plugins/reputation/adjust/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { userId, category, amount, reason } = req.body;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }

                await this.adjustReputation(serverId, userId, req.user.id, category, amount, reason, 'admin_adjust');
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error adjusting reputation:', error);
                res.status(500).json({ error: 'Failed to adjust reputation' });
            }
        });

        // Get user reputation details
        this.app.get('/api/plugins/reputation/user/:serverId/:userId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, userId } = req.params;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }

                const data = await this.loadData();
                const userRep = data.users[userId]?.[serverId] || this.getDefaultUserRep();
                const history = data.history[serverId]?.[userId] || [];
                
                res.json({ reputation: userRep, history });
            } catch (error) {
                console.error('Error fetching user reputation:', error);
                res.status(500).json({ error: 'Failed to fetch user reputation' });
            }
        });

        // Get audit logs
        this.app.get('/api/plugins/reputation/audit/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { limit = 100 } = req.query;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }

                const auditData = JSON.parse(await fs.readFile(this.auditFile, 'utf8').catch(() => '{"events":[]}'));
                const serverEvents = auditData.events
                    .filter(event => event.guildId === serverId)
                    .slice(-parseInt(limit))
                    .reverse();
                
                res.json(serverEvents);
            } catch (error) {
                console.error('Error fetching audit logs:', error);
                res.status(500).json({ error: 'Failed to fetch audit logs' });
            }
        });
    }

    setupDiscordListeners() {
		// Listen for thanks messages
		this.client.on('messageCreate', async (message) => {
			if (message.author.bot || !message.guild) return;
			
			const settings = await this.loadSettings();
			const guildSettings = settings[message.guild.id];
			
			if (!guildSettings?.enabled || !guildSettings?.autoThanks) return;
			
			await this.handleThanksMessage(message, guildSettings);
		});

		// Listen for reaction-based reputation
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
					'reaction'
				);
			}
		});

		 // Button interactions for reputation
		this.client.on('interactionCreate', async (interaction) => {
			if (!interaction.isButton()) return;
			
			if (interaction.customId.startsWith('rep_')) {
				await this.handleReputationInteraction(interaction);
			}
		});

		// Modal submissions for reputation reasons
		this.client.on('interactionCreate', async (interaction) => {
			if (!interaction.isModalSubmit()) return;
			
			if (interaction.customId.startsWith('rep_reason_')) {
				await this.handleReasonModal(interaction);
			}
		});
	}

    setupSlashCommands() {
        this.client.once('ready', async () => {
            try {
                const commands = this.getSlashCommands();
                
                // Register commands on each guild for instant updates
                const guilds = this.client.guilds.cache;
                for (const guild of guilds.values()) {
                    try {
                        await guild.commands.set(commands); // Pass the raw command data
                        console.log(`✓ Registered Reputation commands for guild: ${guild.name}`);
                    } catch (err) {
                        console.error(`❌ Failed to register Reputation commands for guild ${guild.name}:`, err.rawError ? err.rawError.errors : err);
                    }
                }
                
            } catch (error) {
                console.error('Error registering Reputation slash commands:', error);
            }
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            // Check if the command belongs to this plugin before handling
            const commandNames = this.getSlashCommands().map(cmd => cmd.name);
            if (commandNames.includes(interaction.commandName)) {
                await this.handleSlashCommand(interaction);
            }
        });
    }

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
									{ name: 'Monthly', value: 'monthly' }
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

	async handleSlashCommand(interaction) {
		const { commandName } = interaction;
		
		if (commandName === 'rep') {
			await this.handleRepCommand(interaction);
			return true;
		} else if (commandName === 'thanks') {
			await this.handleThanksCommand(interaction);
			return true;
		}
		
		return false;
	}


    async handleThanksMessage(message, settings) {
        // Check for thanks patterns
        const hasThanks = this.THANKS_PATTERNS.some(pattern => pattern.test(message.content));
        if (!hasThanks) return;

        let targetUser = null;

        // Check for reply
        if (message.reference?.messageId) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.author.id !== message.author.id) {
                    targetUser = repliedMessage.author;
                }
            } catch (error) {
                console.error('Error fetching replied message:', error);
            }
        }

        // Check for mentions if no reply
        if (!targetUser && message.mentions.users.size === 1) {
            const mentionedUser = message.mentions.users.first();
            if (mentionedUser.id !== message.author.id) {
                targetUser = mentionedUser;
            }
        }

        if (targetUser) {
            // Show reputation modal
            await this.showReputationModal(message, targetUser);
        }
    }

    async showReputationModal(message, targetUser) {
        // Create buttons for quick reputation giving
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`rep_quick_${targetUser.id}_helpfulness`)
                    .setLabel('Helpful 👍')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`rep_quick_${targetUser.id}_creativity`)
                    .setLabel('Creative 🎨')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`rep_quick_${targetUser.id}_reliability`)
                    .setLabel('Reliable ⭐')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`rep_quick_${targetUser.id}_community`)
                    .setLabel('Community 🤝')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`rep_custom_${targetUser.id}`)
                    .setLabel('Custom 📝')
                    .setStyle(ButtonStyle.Secondary)
            );

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('💝 Give Reputation')
            .setDescription(`Give reputation to ${targetUser.displayName}!\nThis message is only visible to you.`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setFooter({ text: 'This prompt will disappear in 30 seconds' });

        try {
            const reply = await message.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });

            // Auto-delete after 30 seconds
            setTimeout(async () => {
                try {
                    await reply.delete();
                } catch (error) {
                    console.error('Error deleting reputation prompt:', error);
                }
            }, 30000);
        } catch (error) {
            console.error('Error showing reputation modal:', error);
        }
    }

    async handleReputationInteraction(interaction) {
		const [_, type, targetUserId, category] = interaction.customId.split('_');
		
		if (type === 'quick') {
			// Quick reputation without reason
			const result = await this.giveReputation(
				interaction.guild.id,
				interaction.user.id,
				targetUserId,
				category,
				1,
				'Quick thanks',
				'quick'
			);
			
			if (result.success) {
				await interaction.reply({
					content: `✅ Gave ${category} reputation to <@${targetUserId}>!`,
					ephemeral: true
				});
			} else {
				await interaction.reply({
					content: `❌ ${result.error}`,
					ephemeral: true
				});
			}
		} else if (type === 'custom') {
			// Show modal for custom reason (FIXED: removed amount input)
			const modal = new ModalBuilder()
				.setCustomId(`rep_reason_${targetUserId}`)
				.setTitle('Give Reputation');

			const categoryInput = new TextInputBuilder()
				.setCustomId('category')
				.setLabel('Category')
				.setStyle(TextInputStyle.Short)
				.setPlaceholder('helpfulness, creativity, reliability, or community')
				.setRequired(true)
				.setMaxLength(20);

			const reasonInput = new TextInputBuilder()
				.setCustomId('reason')
				.setLabel('Reason')
				.setStyle(TextInputStyle.Paragraph)
				.setPlaceholder('Why are you giving this reputation?')
				.setRequired(true)
				.setMaxLength(500);

			// REMOVED: Amount input to prevent abuse
			
			modal.addComponents(
				new ActionRowBuilder().addComponents(categoryInput),
				new ActionRowBuilder().addComponents(reasonInput)
			);

			await interaction.showModal(modal);
		}
	}

    async handleReasonModal(interaction) {
		const targetUserId = interaction.customId.split('_')[2];
		const category = interaction.fields.getTextInputValue('category').toLowerCase();
		const reason = interaction.fields.getTextInputValue('reason');
		
		// FIXED: Remove amount input to prevent abuse - always give 1 reputation
		const amount = 1; // Hardcoded to 1
		
		if (!this.REP_CATEGORIES.includes(category)) {
			return await interaction.reply({
				content: '❌ Invalid category. Use: helpfulness, creativity, reliability, or community',
				ephemeral: true
			});
		}

		const result = await this.giveReputation(
			interaction.guild.id,
			interaction.user.id,
			targetUserId,
			category,
			amount,
			reason,
			'manual'
		);

		if (result.success) {
			await interaction.reply({
				content: `✅ Gave ${amount} ${category} reputation to <@${targetUserId}>!\nReason: ${reason}`,
				ephemeral: true
			});
		} else {
			await interaction.reply({
				content: `❌ ${result.error}`,
				ephemeral: true
			});
		}
	}

    async giveReputation(guildId, fromUserId, toUserId, category, amount, reason, type = 'manual') {
        if (fromUserId === toUserId) {
            return { success: false, error: 'You cannot give reputation to yourself!' };
        }

        const settings = await this.loadSettings();
        const guildSettings = settings[guildId] || this.getDefaultSettings();

        if (!guildSettings.enabled) {
            return { success: false, error: 'Reputation system is disabled in this server!' };
        }

        // Check cooldown
        const cooldownKey = `${guildId}_${fromUserId}_${toUserId}`;
        const lastGiven = this.userCooldowns.get(cooldownKey) || 0;
        const cooldownTime = guildSettings.cooldown || this.DEFAULT_COOLDOWN;

        if (Date.now() - lastGiven < cooldownTime) {
            const remaining = Math.ceil((cooldownTime - (Date.now() - lastGiven)) / 60000);
            return { success: false, error: `You must wait ${remaining} more minutes before giving reputation to this user again!` };
        }

        // Check daily/weekly limits
        if (!this.checkLimits(guildId, fromUserId, guildSettings)) {
            return { success: false, error: 'You have reached your daily or weekly reputation limit!' };
        }

        // Apply reputation multiplier based on user's level/role
        const multiplier = await this.getReputationMultiplier(guildId, fromUserId);
        const finalAmount = Math.floor(amount * multiplier);

        // Update reputation
        await this.adjustReputation(guildId, toUserId, fromUserId, category, finalAmount, reason, type);

        // Update cooldowns and limits
        this.userCooldowns.set(cooldownKey, Date.now());
        this.updateLimits(guildId, fromUserId, finalAmount);

        // Log to audit
        await this.logAuditEvent(guildId, 'rep_given', fromUserId, toUserId, {
            category, amount: finalAmount, reason, type, multiplier
        });

        return { success: true, amount: finalAmount };
    }

    async adjustReputation(guildId, userId, fromUserId, category, amount, reason, type) {
        const data = await this.loadData();

        // Initialize user data if needed
        if (!data.users[userId]) data.users[userId] = {};
        if (!data.users[userId][guildId]) data.users[userId][guildId] = this.getDefaultUserRep();
        if (!data.history[guildId]) data.history[guildId] = {};
        if (!data.history[guildId][userId]) data.history[guildId][userId] = [];

        const userRep = data.users[userId][guildId];

        // Update category reputation
        if (!userRep.categories[category]) userRep.categories[category] = 0;
        userRep.categories[category] += amount;
        
        // Update total
        userRep.total += amount;
        userRep.lastActive = Date.now();

        // Update giver stats
        if (fromUserId && fromUserId !== 'system') {
            if (!data.users[fromUserId]) data.users[fromUserId] = {};
            if (!data.users[fromUserId][guildId]) data.users[fromUserId][guildId] = this.getDefaultUserRep();
            data.users[fromUserId][guildId].given += amount;
        }

        // Add to history
        data.history[guildId][userId].push({
            from: fromUserId,
            to: userId,
            category,
            amount,
            reason,
            timestamp: Date.now(),
            type
        });

        // Update streaks and badges
        await this.updateStreaksAndBadges(data, guildId, userId);

        // Update leaderboards
        await this.updateLeaderboards(data, guildId);

        await this.saveData(data);

        // Check for role rewards
        await this.checkRoleRewards(guildId, userId, userRep);

        // Send log message if configured
        await this.sendLogMessage(guildId, fromUserId, userId, category, amount, reason, type);
    }

    async updateStreaksAndBadges(data, guildId, userId) {
        const userRep = data.users[userId][guildId];
        const history = data.history[guildId][userId] || [];
        
        // Calculate streak (consecutive days with reputation activity)
        const today = new Date().toDateString();
        const recentActivity = history.filter(entry => {
            const entryDate = new Date(entry.timestamp).toDateString();
            return entryDate === today;
        });

        if (recentActivity.length > 0) {
            userRep.streaks = userRep.streaks || { current: 0, longest: 0 };
            userRep.streaks.current = (userRep.streaks.current || 0) + 1;
            userRep.streaks.longest = Math.max(userRep.streaks.longest || 0, userRep.streaks.current);
        }

        // Award badges based on milestones
        const badges = [];
        if (userRep.total >= 10) badges.push('🌟 First Steps');
        if (userRep.total >= 50) badges.push('⭐ Rising Star');
        if (userRep.total >= 100) badges.push('🏆 Respected Member');
        if (userRep.total >= 250) badges.push('💎 Community Pillar');
        if (userRep.total >= 500) badges.push('👑 Legend');
        
        if (userRep.streaks && userRep.streaks.longest >= 7) badges.push('🔥 Week Warrior');
        if (userRep.streaks && userRep.streaks.longest >= 30) badges.push('📅 Monthly Master');
        
        if (userRep.given >= 25) badges.push('🤝 Helper');
        if (userRep.given >= 100) badges.push('💝 Generous Soul');

        userRep.badges = [...new Set([...(userRep.badges || []), ...badges])];
    }

    async updateLeaderboards(data, guildId) {
        if (!data.leaderboards[guildId]) {
            data.leaderboards[guildId] = { overall: [], categories: {}, weekly: [], monthly: [] };
        }

        const guildUsers = Object.entries(data.users)
            .filter(([userId, userData]) => userData[guildId])
            .map(([userId, userData]) => ({
                userId,
                ...userData[guildId]
            }));

        // Overall leaderboard
        data.leaderboards[guildId].overall = guildUsers
            .sort((a, b) => b.total - a.total)
            .slice(0, 50);

        // Category leaderboards
        for (const category of this.REP_CATEGORIES) {
            if (!data.leaderboards[guildId].categories[category]) {
                data.leaderboards[guildId].categories[category] = [];
            }
            
            data.leaderboards[guildId].categories[category] = guildUsers
                .filter(user => user.categories[category] > 0)
                .sort((a, b) => (b.categories[category] || 0) - (a.categories[category] || 0))
                .slice(0, 25);
        }

        // Weekly/Monthly leaderboards (based on recent activity)
        const now = Date.now();
        const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
        const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

        const weeklyUsers = guildUsers.map(user => {
            const weeklyRep = (data.history[guildId][user.userId] || [])
                .filter(entry => entry.timestamp > weekAgo)
                .reduce((sum, entry) => sum + entry.amount, 0);
            return { ...user, weeklyRep };
        }).filter(user => user.weeklyRep > 0);

        const monthlyUsers = guildUsers.map(user => {
            const monthlyRep = (data.history[guildId][user.userId] || [])
                .filter(entry => entry.timestamp > monthAgo)
                .reduce((sum, entry) => sum + entry.amount, 0);
            return { ...user, monthlyRep };
        }).filter(user => user.monthlyRep > 0);

        data.leaderboards[guildId].weekly = weeklyUsers
            .sort((a, b) => b.weeklyRep - a.weeklyRep)
            .slice(0, 25);

        data.leaderboards[guildId].monthly = monthlyUsers
            .sort((a, b) => b.monthlyRep - a.monthlyRep)
            .slice(0, 25);
    }

    async getReputationMultiplier(guildId, userId) {
        try {
            // Try to get user's level from leveling plugin
            const levelingData = JSON.parse(await fs.readFile(
                path.join(__dirname, '../data/levelingData.json'), 'utf8'
            ).catch(() => '{"users":{}}'));

            const userLevel = levelingData.users[userId]?.[guildId]?.level || 0;
            
            // Apply multiplier based on level
            if (userLevel >= 50) return 2.0;      // Level 50+: 2x
            if (userLevel >= 30) return 1.5;      // Level 30+: 1.5x
            if (userLevel >= 15) return 1.25;     // Level 15+: 1.25x
            if (userLevel >= 5) return 1.1;       // Level 5+: 1.1x
            
            return 1.0; // Default multiplier
        } catch (error) {
            return 1.0; // Fallback if leveling plugin not available
        }
    }

    checkLimits(guildId, userId, settings) {
        const dailyKey = `${guildId}_${userId}_daily`;
        const weeklyKey = `${guildId}_${userId}_weekly`;
        
        const dailyUsed = this.dailyLimits.get(dailyKey) || 0;
        const weeklyUsed = this.weeklyLimits.get(weeklyKey) || 0;
        
        const dailyLimit = settings.dailyLimit || this.DEFAULT_DAILY_LIMIT;
        const weeklyLimit = settings.weeklyLimit || this.DEFAULT_WEEKLY_LIMIT;
        
        return dailyUsed < dailyLimit && weeklyUsed < weeklyLimit;
    }

    updateLimits(guildId, userId, amount) {
        const dailyKey = `${guildId}_${userId}_daily`;
        const weeklyKey = `${guildId}_${userId}_weekly`;
        
        this.dailyLimits.set(dailyKey, (this.dailyLimits.get(dailyKey) || 0) + amount);
        this.weeklyLimits.set(weeklyKey, (this.weeklyLimits.get(weeklyKey) || 0) + amount);
    }

    async processDecay() {
        try {
            const data = await this.loadData();
            const settings = await this.loadSettings();
            
            for (const [guildId, guildSettings] of Object.entries(settings)) {
                if (!guildSettings.decayEnabled) continue;
                
                for (const [userId, userData] of Object.entries(data.users)) {
                    if (!userData[guildId]) continue;
                    
                    const userRep = userData[guildId];
                    const lastActive = userRep.lastActive || 0;
                    const daysSinceActive = (Date.now() - lastActive) / (24 * 60 * 60 * 1000);
                    
                    // Apply decay only if inactive for more than 7 days
                    if (daysSinceActive > 7) {
                        const decayAmount = Math.floor(userRep.total * (1 - this.DECAY_RATE));
                        if (decayAmount > 0) {
                            userRep.total = Math.max(0, userRep.total - decayAmount);
                            
                            // Apply decay to categories proportionally
                            for (const category of this.REP_CATEGORIES) {
                                if (userRep.categories[category]) {
                                    const categoryDecay = Math.floor(userRep.categories[category] * (1 - this.DECAY_RATE));
                                    userRep.categories[category] = Math.max(0, userRep.categories[category] - categoryDecay);
                                }
                            }
                            
                            // Log decay event
                            await this.logAuditEvent(guildId, 'rep_decay', userId, null, {
                                decayAmount, daysSinceActive: Math.floor(daysSinceActive)
                            }, 'system');
                        }
                    }
                }
            }
            
            await this.saveData(data);
        } catch (error) {
            console.error('Error processing reputation decay:', error);
        }
    }

    resetLimitsDaily() {
        this.dailyResetInterval = setInterval(() => {
            this.dailyLimits.clear();
        }, 24 * 60 * 60 * 1000); // 24 hours
    }

    resetLimitsWeekly() {
        this.weeklyResetInterval = setInterval(() => {
            this.weeklyLimits.clear();
        }, 7 * 24 * 60 * 60 * 1000); // 7 days
    }

    async checkRoleRewards(guildId, userId, userRep) {
        try {
            const settings = await this.loadSettings();
            const guildSettings = settings[guildId];
            
            if (!guildSettings?.roles) return;
            
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) return;
            
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return;
            
            // Check each role threshold
            for (const [threshold, roleId] of Object.entries(guildSettings.roles)) {
                const requiredRep = parseInt(threshold);
                if (userRep.total >= requiredRep) {
                    const role = guild.roles.cache.get(roleId);
                    if (role && !member.roles.cache.has(roleId)) {
                        await member.roles.add(role).catch(console.error);
                        
                        // Log role reward
                        await this.logAuditEvent(guildId, 'role_reward', userId, null, {
                            roleId, threshold: requiredRep, currentRep: userRep.total
                        }, 'system');
                    }
                }
            }
        } catch (error) {
            console.error('Error checking role rewards:', error);
        }
    }

    async sendLogMessage(guildId, fromUserId, toUserId, category, amount, reason, type) {
        try {
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
        } catch (error) {
            console.error('Error sending log message:', error);
        }
    }

    async handleRepCommand(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'view') {
            await this.handleRepView(interaction);
        } else if (subcommand === 'give') {
            await this.handleRepGive(interaction);
        } else if (subcommand === 'leaderboard') {
            await this.handleRepLeaderboard(interaction);
        } else if (subcommand === 'history') {
            await this.handleRepHistory(interaction);
        }
    }

    async handleRepView(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const data = await this.loadData();
        const userRep = data.users[targetUser.id]?.[interaction.guild.id] || this.getDefaultUserRep();
        
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle(`${targetUser.displayName}'s Reputation`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: '🏆 Total Reputation', value: userRep.total.toString(), inline: true },
                { name: '💝 Given', value: userRep.given.toString(), inline: true },
                { name: '🔥 Current Streak', value: (userRep.streaks?.current || 0).toString(), inline: true }
            );

        // Add category breakdown
        let categoryText = '';
        for (const category of this.REP_CATEGORIES) {
            const amount = userRep.categories[category] || 0;
            const emoji = this.getCategoryEmoji(category);
            categoryText += `${emoji} ${category.charAt(0).toUpperCase() + category.slice(1)}: ${amount}\n`;
        }
        
        if (categoryText) {
            embed.addFields({ name: '📊 Category Breakdown', value: categoryText, inline: false });
        }

        // Add badges
        if (userRep.badges?.length > 0) {
            embed.addFields({ name: '🏅 Badges', value: userRep.badges.join(' '), inline: false });
        }

        await interaction.reply({ embeds: [embed] });
    }

    async handleRepGive(interaction) {
        const targetUser = interaction.options.getUser('user');
        const category = interaction.options.getString('category');
        const reason = interaction.options.getString('reason');
        
        const result = await this.giveReputation(
            interaction.guild.id,
            interaction.user.id,
            targetUser.id,
            category,
            1,
            reason,
            'command'
        );
        
        if (result.success) {
            await interaction.reply({
                content: `✅ Gave ${result.amount} ${category} reputation to ${targetUser.displayName}!\nReason: ${reason}`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `❌ ${result.error}`,
                ephemeral: true
            });
        }
    }

    async handleRepLeaderboard(interaction) {
        const type = interaction.options.getString('type') || 'overall';
        const leaderboard = await this.generateLeaderboard(interaction.guild.id, type, 10);
        
        if (!leaderboard.length) {
            return await interaction.reply('No reputation data found for this server.');
        }
        
        const embed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle(`🏆 ${type.charAt(0).toUpperCase() + type.slice(1)} Reputation Leaderboard`)
            .setDescription(leaderboard.map((entry, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                const amount = type === 'weekly' ? entry.weeklyRep : 
                              type === 'monthly' ? entry.monthlyRep :
                              type in entry.categories ? entry.categories[type] :
                              entry.total;
                return `${medal} <@${entry.userId}>: ${amount} rep`;
            }).join('\n'))
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }

    async handleRepHistory(interaction) {
        const data = await this.loadData();
        const history = data.history[interaction.guild.id]?.[interaction.user.id] || [];
        
        if (!history.length) {
            return await interaction.reply({ content: 'You have no reputation history in this server.', ephemeral: true });
        }
        
        const recentHistory = history.slice(-10).reverse(); // Last 10 entries
        
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📜 Your Reputation History')
            .setDescription(recentHistory.map(entry => {
                const date = new Date(entry.timestamp).toLocaleDateString();
                const fromText = entry.from ? `from <@${entry.from}>` : 'from system';
                const sign = entry.amount > 0 ? '+' : '';
                return `${sign}${entry.amount} ${entry.category} ${fromText} - ${entry.reason} (${date})`;
            }).join('\n'))
            .setFooter({ text: 'Showing last 10 entries' });
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleThanksCommand(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Thank you!';
        
        const result = await this.giveReputation(
            interaction.guild.id,
            interaction.user.id,
            targetUser.id,
            'helpfulness',
            1,
            reason,
            'thanks_command'
        );
        
        if (result.success) {
            await interaction.reply({
                content: `✅ Thanked ${targetUser.displayName} and gave them ${result.amount} helpfulness reputation!\nReason: ${reason}`
            });
        } else {
            await interaction.reply({
                content: `❌ ${result.error}`,
                ephemeral: true
            });
        }
    }

    async generateLeaderboard(guildId, type, limit) {
        const data = await this.loadData();
        const leaderboards = data.leaderboards[guildId];
        
        if (!leaderboards) return [];
        
        if (type === 'overall') return leaderboards.overall.slice(0, limit);
        if (type === 'weekly') return leaderboards.weekly.slice(0, limit);
        if (type === 'monthly') return leaderboards.monthly.slice(0, limit);
        if (this.REP_CATEGORIES.includes(type)) {
            return leaderboards.categories[type]?.slice(0, limit) || [];
        }
        
        return [];
    }

    getDefaultSettings() {
        return {
            enabled: true,
            autoThanks: true,
            reactionRep: true,
            repEmoji: '👍',
            cooldown: this.DEFAULT_COOLDOWN,
            dailyLimit: this.DEFAULT_DAILY_LIMIT,
            weeklyLimit: this.DEFAULT_WEEKLY_LIMIT,
            decayEnabled: false,
            logChannel: null,
            customName: 'Reputation',
            categories: this.REP_CATEGORIES,
            roles: {}, // threshold: roleId
            badges: true,
            anonymousRep: false
        };
    }

	getDefaultUserRep() {
		return {
			categories: {
				helpfulness: 0,
				creativity: 0,
				reliability: 0,
				community: 0,
				legacy: 0
			},
			total: 0,
			given: 0,
			received: 0,
			streaks: { current: 0, longest: 0 },
			badges: [],
			lastActive: Date.now()
		};
	}

    getServerStats(data, serverId) {
        const users = Object.values(data.users).filter(user => user[serverId]);
        const totalRep = users.reduce((sum, user) => sum + (user[serverId]?.total || 0), 0);
        const activeUsers = users.filter(user => {
            const lastActive = user[serverId]?.lastActive || 0;
            const daysSince = (Date.now() - lastActive) / (24 * 60 * 60 * 1000);
            return daysSince <= 30;
        });
        
        return {
            totalUsers: users.length,
            totalReputation: totalRep,
            activeUsers: activeUsers.length,
            averageRep: users.length ? Math.round(totalRep / users.length) : 0
        };
    }

    getCategoryEmoji(category) {
        const emojis = {
            helpfulness: '🤝',
            creativity: '🎨',
            reliability: '⭐',
            community: '💝',
			legacy: '🏛️'
        };
        return emojis[category] || '📊';
    }

    getFrontendComponent() {
        return {
            id: 'reputation-plugin',
            name: 'Reputation System',
            description: 'Advanced reputation system with categories, reasons, decay, and anti-abuse features',
            icon: '🏆',
            version: '1.0.0',
            containerId: 'reputationPluginContainer',
            pageId: 'reputation',
            navIcon: '🏆',
            
            html: [
                '<div class="plugin-container">',
                '    <div class="plugin-header">',
                '        <h3><span class="plugin-icon">🏆</span> Reputation System</h3>',
                '        <p>Advanced reputation system with categories, reasons, decay, and anti-abuse features</p>',
                '    </div>',
                '',
                '    <div class="settings-section">',
                '        <h3>Settings</h3>',
                '        <div class="form-group">',
                '            <label for="repServerSelect">Server</label>',
                '            <select id="repServerSelect" required>',
                '                <option value="">Select a server...</option>',
                '            </select>',
                '        </div>',
                '',
                '        <div id="repSettingsContainer" style="display: none;">',
                '            <div class="form-group">',
                '                <label>',
                '                    <input type="checkbox" id="repEnabled"> Enable Reputation System',
                '                </label>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label>',
                '                    <input type="checkbox" id="autoThanks"> Auto-detect Thanks Messages',
                '                </label>',
                '                <small>Automatically prompt for reputation when users thank each other</small>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label>',
                '                    <input type="checkbox" id="reactionRep"> Reaction-based Reputation',
                '                </label>',
                '                <div style="margin-top: 8px;">',
                '                    <label for="repEmoji">Reputation Emoji</label>',
                '                    <input type="text" id="repEmoji" placeholder="👍" style="width: 60px;">',
                '                </div>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label for="customName">Custom Name</label>',
                '                <input type="text" id="customName" placeholder="Reputation">',
                '                <small>Customize what reputation is called in your server</small>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label for="cooldownTime">Cooldown (minutes)</label>',
                '                <input type="number" id="cooldownTime" min="1" max="1440" value="60">',
                '                <small>Time between giving reputation to the same user</small>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label for="dailyLimit">Daily Limit</label>',
                '                <input type="number" id="dailyLimit" min="1" max="100" value="10">',
                '                <small>Maximum reputation a user can give per day</small>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label for="weeklyLimit">Weekly Limit</label>',
                '                <input type="number" id="weeklyLimit" min="1" max="500" value="50">',
                '                <small>Maximum reputation a user can give per week</small>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label>',
                '                    <input type="checkbox" id="decayEnabled"> Enable Reputation Decay',
                '                </label>',
                '                <small>Slowly reduce reputation for inactive users</small>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label for="logChannelSelect">Log Channel</label>',
                '                <select id="logChannelSelect">',
                '                    <option value="">No logging</option>',
                '                </select>',
                '                <small>Channel to log reputation events</small>',
                '            </div>',
                '',
                '            <div class="form-group">',
                '                <label>',
                '                    <input type="checkbox" id="anonymousRep"> Allow Anonymous Reputation',
                '                </label>',
                '                <small>Users can give reputation without revealing their identity</small>',
                '            </div>',
                '',
                '            <button type="button" id="saveRepSettings" class="btn-primary">',
                '                <span class="btn-text">Save Settings</span>',
                '                <span class="btn-loader" style="display: none;">Saving...</span>',
                '            </button>',
                '        </div>',
                '    </div>',
                '',
                '    <div id="repLeaderboardSection" style="display: none;" class="settings-section">',
                '        <h3>🏆 Leaderboards</h3>',
                '        ',
                '        <div class="form-group">',
                '            <label for="leaderboardType">Leaderboard Type</label>',
                '            <select id="leaderboardType">',
                '                <option value="overall">Overall</option>',
                '                <option value="helpfulness">Helpfulness</option>',
                '                <option value="creativity">Creativity</option>',
                '                <option value="reliability">Reliability</option>',
                '                <option value="community">Community Spirit</option>',
				'                <option value="legacy">Legacy</option>',
                '                <option value="weekly">Weekly</option>',
                '                <option value="monthly">Monthly</option>',
                '            </select>',
                '        </div>',
                '',
                '        <div id="leaderboardLoading" style="display: none; text-align: center; padding: 20px;">',
                '            <div class="spinner"></div>',
                '            <p>Loading leaderboard...</p>',
                '        </div>',
                '',
                '        <div id="leaderboardContent">',
                '            <div id="leaderboardList" class="leaderboard-list"></div>',
                '        </div>',
                '    </div>',
                '',
                '    <div id="repAdminSection" style="display: none;" class="settings-section">',
                '        <h3>⚙️ Admin Tools</h3>',
                '        ',
                '        <div style="display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">',
                '            <div class="admin-card">',
                '                <h4>Manual Reputation Adjustment</h4>',
                '                <div class="form-group">',
                '                    <label for="adminUserId">User ID</label>',
                '                    <input type="text" id="adminUserId" placeholder="User ID or mention">',
                '                </div>',
                '                <div class="form-group">',
                '                    <label for="adminCategory">Category</label>',
                '                    <select id="adminCategory">',
                '                        <option value="helpfulness">Helpfulness</option>',
                '                        <option value="creativity">Creativity</option>',
                '                        <option value="reliability">Reliability</option>',
                '                        <option value="community">Community Spirit</option>',
                '                        <option value="legacy">Legacy</option>',
                '                    </select>',
                '                </div>',
                '                <div class="form-group">',
                '                    <label for="adminAmount">Amount</label>',
                '                    <input type="number" id="adminAmount" value="1" min="-100" max="100">',
                '                </div>',
                '                <div class="form-group">',
                '                    <label for="adminReason">Reason</label>',
                '                    <textarea id="adminReason" placeholder="Reason for adjustment..." rows="3"></textarea>',
                '                </div>',
                '                <button type="button" id="adjustRepBtn" class="btn-primary">Adjust Reputation</button>',
                '            </div>',
                '',
                '            <div class="admin-card">',
                '                <h4>User Lookup</h4>',
                '                <div class="form-group">',
                '                    <label for="lookupUserId">User ID</label>',
                '                    <input type="text" id="lookupUserId" placeholder="User ID or mention">',
                '                </div>',
                '                <button type="button" id="lookupUserBtn" class="btn-secondary">Lookup User</button>',
                '                <div id="userLookupResult" style="margin-top: 1rem;"></div>',
                '            </div>',
                '        </div>',
                '    </div>',
                '',
                '    <div id="repStatsSection" style="display: none;" class="settings-section">',
                '        <h3>📊 Server Statistics</h3>',
                '        <div id="statsGrid" style="display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));"></div>',
                '    </div>',
                '',
                '    <div id="repAuditSection" style="display: none;" class="settings-section">',
                '        <h3>📋 Audit Log</h3>',
                '        <div id="auditLoading" style="display: none; text-align: center; padding: 20px;">',
                '            <div class="spinner"></div>',
                '            <p>Loading audit log...</p>',
                '        </div>',
                '        <div id="auditContent">',
                '            <div id="auditList" class="audit-list"></div>',
                '        </div>',
                '    </div>',
                '</div>'
            ].join('\n'),

            script: [
                '// Reputation Plugin Frontend Logic',
                '(function() {',
                '    // Get DOM elements',
                '    const repServerSelect = document.getElementById("repServerSelect");',
                '    const repSettingsContainer = document.getElementById("repSettingsContainer");',
                '    const repLeaderboardSection = document.getElementById("repLeaderboardSection");',
                '    const repAdminSection = document.getElementById("repAdminSection");',
                '    const repStatsSection = document.getElementById("repStatsSection");',
                '    const repAuditSection = document.getElementById("repAuditSection");',
                '    ',
                '    // Settings elements',
                '    const repEnabled = document.getElementById("repEnabled");',
                '    const autoThanks = document.getElementById("autoThanks");',
                '    const reactionRep = document.getElementById("reactionRep");',
                '    const repEmoji = document.getElementById("repEmoji");',
                '    const customName = document.getElementById("customName");',
                '    const cooldownTime = document.getElementById("cooldownTime");',
                '    const dailyLimit = document.getElementById("dailyLimit");',
                '    const weeklyLimit = document.getElementById("weeklyLimit");',
                '    const decayEnabled = document.getElementById("decayEnabled");',
                '    const logChannelSelect = document.getElementById("logChannelSelect");',
                '    const anonymousRep = document.getElementById("anonymousRep");',
                '    const saveRepSettings = document.getElementById("saveRepSettings");',
                '    ',
                '    // Leaderboard elements',
                '    const leaderboardType = document.getElementById("leaderboardType");',
                '    const leaderboardLoading = document.getElementById("leaderboardLoading");',
                '    const leaderboardContent = document.getElementById("leaderboardContent");',
                '    const leaderboardList = document.getElementById("leaderboardList");',
                '    ',
                '    // Admin elements',
                '    const adminUserId = document.getElementById("adminUserId");',
                '    const adminCategory = document.getElementById("adminCategory");',
                '    const adminAmount = document.getElementById("adminAmount");',
                '    const adminReason = document.getElementById("adminReason");',
                '    const adjustRepBtn = document.getElementById("adjustRepBtn");',
                '    const lookupUserId = document.getElementById("lookupUserId");',
                '    const lookupUserBtn = document.getElementById("lookupUserBtn");',
                '    const userLookupResult = document.getElementById("userLookupResult");',
                '    ',
                '    // Stats and audit elements',
                '    const statsGrid = document.getElementById("statsGrid");',
                '    const auditLoading = document.getElementById("auditLoading");',
                '    const auditContent = document.getElementById("auditContent");',
                '    const auditList = document.getElementById("auditList");',
                '    ',
                '    let currentServerId = null;',
                '    let servers = [];',
                '',
                '    // Load servers function',
                '    async function loadServers() {',
                '        try {',
                '            const response = await fetch("/api/servers");',
                '            const servers = await response.json();',
                '            ',
                '            repServerSelect.innerHTML = "<option value=\\"\\">Select a server...</option>";',
                '            servers.forEach(server => {',
                '                const option = document.createElement("option");',
                '                option.value = server.id;',
                '                option.textContent = server.name;',
                '                repServerSelect.appendChild(option);',
                '            });',
                '        } catch (error) {',
                '            console.error("Error loading servers:", error);',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Error loading servers", "error");',
                '            }',
                '        }',
                '    }',
                '',
                '    // Initialize servers immediately',
                '    loadServers();',
                '',
                '    // Server selection handler',
                '    repServerSelect.addEventListener("change", async (e) => {',
                '        currentServerId = e.target.value;',
                '        if (currentServerId) {',
                '            await loadServerData();',
                '            await loadChannels();',
                '            showSections();',
                '        } else {',
                '            hideSections();',
                '        }',
                '    });',
                '',
                '    function showSections() {',
                '        repSettingsContainer.style.display = "block";',
                '        repLeaderboardSection.style.display = "block";',
                '        repAdminSection.style.display = "block";',
                '        repStatsSection.style.display = "block";',
                '        repAuditSection.style.display = "block";',
                '    }',
                '',
                '    function hideSections() {',
                '        repSettingsContainer.style.display = "none";',
                '        repLeaderboardSection.style.display = "none";',
                '        repAdminSection.style.display = "none";',
                '        repStatsSection.style.display = "none";',
                '        repAuditSection.style.display = "none";',
                '    }',
                '',
                '    async function loadServerData() {',
                '        try {',
                '            const response = await fetch("/api/plugins/reputation/data/" + currentServerId);',
                '            const data = await response.json();',
                '            ',
                '            if (response.ok) {',
                '                populateSettings(data.settings);',
                '                populateStats(data.stats);',
                '                await loadLeaderboard();',
                '                await loadAuditLog();',
                '            } else {',
                '                if (typeof showNotification === "function") {',
                '                    showNotification(data.error || "Failed to load reputation data", "error");',
                '                } else {',
                '                    console.error(data.error || "Failed to load reputation data");',
                '                }',
                '            }',
                '        } catch (error) {',
                '            console.error("Error loading reputation data:", error);',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Failed to load reputation data", "error");',
                '            }',
                '        }',
                '    }',
                '',
                '    async function loadChannels() {',
                '        if (!currentServerId) return;',
                '        ',
                '        try {',
                '            const response = await fetch("/api/channels/" + currentServerId);',
                '            const channels = await response.json();',
                '            ',
                '            logChannelSelect.innerHTML = "<option value=\\"\\">No logging</option>";',
                '            channels.forEach(channel => {',
                '                const option = document.createElement("option");',
                '                option.value = channel.id;',
                '                option.textContent = "#" + channel.name;',
                '                logChannelSelect.appendChild(option);',
                '            });',
                '        } catch (error) {',
                '            console.error("Error loading channels:", error);',
                '            logChannelSelect.innerHTML = "<option value=\\"\\">Error loading channels</option>";',
                '        }',
                '    }',
                '',
                '    function populateSettings(settings) {',
                '        repEnabled.checked = settings.enabled || false;',
                '        autoThanks.checked = settings.autoThanks || false;',
                '        reactionRep.checked = settings.reactionRep || false;',
                '        repEmoji.value = settings.repEmoji || "👍";',
                '        customName.value = settings.customName || "Reputation";',
                '        cooldownTime.value = Math.floor((settings.cooldown || 3600000) / 60000);',
                '        dailyLimit.value = settings.dailyLimit || 10;',
                '        weeklyLimit.value = settings.weeklyLimit || 50;',
                '        decayEnabled.checked = settings.decayEnabled || false;',
                '        logChannelSelect.value = settings.logChannel || "";',
                '        anonymousRep.checked = settings.anonymousRep || false;',
                '    }',
                '',
                '    function populateStats(stats) {',
                '        statsGrid.innerHTML = [',
                '            "<div class=\\"stat-card\\">",',
                '                "<div class=\\"stat-number\\">" + (stats.totalUsers || 0) + "</div>",',
                '                "<div class=\\"stat-label\\">Total Users</div>",',
                '            "</div>",',
                '            "<div class=\\"stat-card\\">",',
                '                "<div class=\\"stat-number\\">" + (stats.totalReputation || 0) + "</div>",',
                '                "<div class=\\"stat-label\\">Total Reputation</div>",',
                '            "</div>",',
                '            "<div class=\\"stat-card\\">",',
                '                "<div class=\\"stat-number\\">" + (stats.activeUsers || 0) + "</div>",',
                '                "<div class=\\"stat-label\\">Active Users (30d)</div>",',
                '            "</div>",',
                '            "<div class=\\"stat-card\\">",',
                '                "<div class=\\"stat-number\\">" + (stats.averageRep || 0) + "</div>",',
                '                "<div class=\\"stat-label\\">Average Reputation</div>",',
                '            "</div>"',
                '        ].join("");',
                '    }',
                '',
                '    // Save settings handler',
                '    saveRepSettings.addEventListener("click", async () => {',
                '        if (!currentServerId) return;',
                '',
                '        const btnText = saveRepSettings.querySelector(".btn-text");',
                '        const btnLoader = saveRepSettings.querySelector(".btn-loader");',
                '        ',
                '        btnText.style.display = "none";',
                '        btnLoader.style.display = "inline";',
                '        saveRepSettings.disabled = true;',
                '',
                '        try {',
                '            const settings = {',
                '                enabled: repEnabled.checked,',
                '                autoThanks: autoThanks.checked,',
                '                reactionRep: reactionRep.checked,',
                '                repEmoji: repEmoji.value.trim() || "👍",',
                '                customName: customName.value.trim() || "Reputation",',
                '                cooldown: parseInt(cooldownTime.value) * 60000,',
                '                dailyLimit: parseInt(dailyLimit.value),',
                '                weeklyLimit: parseInt(weeklyLimit.value),',
                '                decayEnabled: decayEnabled.checked,',
                '                logChannel: logChannelSelect.value || null,',
                '                anonymousRep: anonymousRep.checked',
                '            };',
                '',
                '            const response = await fetch("/api/plugins/reputation/settings/" + currentServerId, {',
                '                method: "POST",',
                '                headers: { "Content-Type": "application/json" },',
                '                body: JSON.stringify(settings)',
                '            });',
                '',
                '            const result = await response.json();',
                '            ',
                '            if (response.ok) {',
                '                if (typeof showNotification === "function") {',
                '                    showNotification("Reputation settings saved successfully!", "success");',
                '                } else {',
                '                    console.log("Settings saved successfully");',
                '                }',
                '            } else {',
                '                if (typeof showNotification === "function") {',
                '                    showNotification(result.error || "Failed to save settings", "error");',
                '                } else {',
                '                    console.error(result.error || "Failed to save settings");',
                '                }',
                '            }',
                '        } catch (error) {',
                '            console.error("Error saving reputation settings:", error);',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Failed to save settings", "error");',
                '            }',
                '        } finally {',
                '            btnText.style.display = "inline";',
                '            btnLoader.style.display = "none";',
                '            saveRepSettings.disabled = false;',
                '        }',
                '    });',
                '',
                '    // Leaderboard functions',
                '    leaderboardType.addEventListener("change", loadLeaderboard);',
                '',
                '    async function loadLeaderboard() {',
                '        if (!currentServerId) return;',
                '',
                '        leaderboardLoading.style.display = "block";',
                '        leaderboardContent.style.display = "none";',
                '',
                '        try {',
                '            const type = leaderboardType.value || "overall";',
                '            const response = await fetch("/api/plugins/reputation/leaderboard/" + currentServerId + "?type=" + type + "&limit=15");',
                '            const leaderboard = await response.json();',
                '',
                '            if (response.ok) {',
                '                displayLeaderboard(leaderboard, type);',
                '            } else {',
                '                if (typeof showNotification === "function") {',
                '                    showNotification(leaderboard.error || "Failed to load leaderboard", "error");',
                '                }',
                '            }',
                '        } catch (error) {',
                '            console.error("Error loading leaderboard:", error);',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Failed to load leaderboard", "error");',
                '            }',
                '        } finally {',
                '            leaderboardLoading.style.display = "none";',
                '            leaderboardContent.style.display = "block";',
                '        }',
                '    }',
                '',
                '    function displayLeaderboard(leaderboard, type) {',
                '        if (!leaderboard.length) {',
                '            leaderboardList.innerHTML = "<p style=\\"text-align: center; opacity: 0.7;\\">No reputation data found.</p>";',
                '            return;',
                '        }',
                '',
                '        function getReputationValue(entry) {',
                '            switch (type) {',
                '                case "weekly": return entry.weeklyRep || 0;',
                '                case "monthly": return entry.monthlyRep || 0;',
                '                case "helpfulness":',
                '                case "creativity":',
                '                case "reliability":',
                '                case "community":',
                '                    return entry.categories[type] || 0;',
                '                default: return entry.total || 0;',
                '            }',
                '        }',
                '',
                '        leaderboardList.innerHTML = leaderboard.map((entry, index) => {',
                '            const position = index + 1;',
                '            const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : position + ".";',
                '            const reputation = getReputationValue(entry);',
                '            const badges = entry.badges ? entry.badges.slice(0, 3).join(" ") : "";',
                '            ',
                '            return [',
                '                "<div class=\\"leaderboard-entry\\">",',
                '                    "<div class=\\"rank\\">" + medal + "</div>",',
                '                    "<div class=\\"user-info\\">",',
                '                        "<div class=\\"user-name\\">User " + entry.userId + "</div>",',
                '                        "<div class=\\"user-badges\\">" + badges + "</div>",',
                '                    "</div>",',
                '                    "<div class=\\"reputation\\">" + reputation + " rep</div>",',
                '                "</div>"',
                '            ].join("");',
                '        }).join("");',
                '    }',
                '',
                '    // Admin tools',
                '    adjustRepBtn.addEventListener("click", async () => {',
                '        if (!currentServerId) return;',
                '',
                '        const userId = adminUserId.value.trim().replace(/[<@!>]/g, "");',
                '        const category = adminCategory.value;',
                '        const amount = parseInt(adminAmount.value);',
                '        const reason = adminReason.value.trim();',
                '',
                '        if (!userId || !reason) {',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Please fill in all fields", "error");',
                '            }',
                '            return;',
                '        }',
                '',
                '        try {',
                '            const response = await fetch("/api/plugins/reputation/adjust/" + currentServerId, {',
                '                method: "POST",',
                '                headers: { "Content-Type": "application/json" },',
                '                body: JSON.stringify({ userId, category, amount, reason })',
                '            });',
                '',
                '            const result = await response.json();',
                '            ',
                '            if (response.ok) {',
                '                if (typeof showNotification === "function") {',
                '                    showNotification("Successfully adjusted reputation for user " + userId, "success");',
                '                }',
                '                adminUserId.value = "";',
                '                adminAmount.value = "1";',
                '                adminReason.value = "";',
                '                await loadLeaderboard();',
                '                await loadAuditLog();',
                '            } else {',
                '                if (typeof showNotification === "function") {',
                '                    showNotification(result.error || "Failed to adjust reputation", "error");',
                '                }',
                '            }',
                '        } catch (error) {',
                '            console.error("Error adjusting reputation:", error);',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Failed to adjust reputation", "error");',
                '            }',
                '        }',
                '    });',
                '',
                '    lookupUserBtn.addEventListener("click", async () => {',
                '        if (!currentServerId) return;',
                '',
                '        const userId = lookupUserId.value.trim().replace(/[<@!>]/g, "");',
                '        if (!userId) {',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Please enter a user ID", "error");',
                '            }',
                '            return;',
                '        }',
                '',
                '        try {',
                '            const response = await fetch("/api/plugins/reputation/user/" + currentServerId + "/" + userId);',
                '            const data = await response.json();',
                '',
                '            if (response.ok) {',
                '                displayUserLookup(data, userId);',
                '            } else {',
                '                if (typeof showNotification === "function") {',
                '                    showNotification(data.error || "Failed to lookup user", "error");',
                '                }',
                '            }',
                '        } catch (error) {',
                '            console.error("Error looking up user:", error);',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Failed to lookup user", "error");',
                '            }',
                '        }',
                '    });',
                '',
                '    function displayUserLookup(data, userId) {',
                '        const reputation = data.reputation;',
                '        const history = data.history;',
                '        const recentHistory = history.slice(-5).reverse();',
                '',
                '        userLookupResult.innerHTML = [',
                '            "<div class=\\"user-lookup-card\\">",',
                '                "<h5>User " + userId + "</h5>",',
                '                "<div class=\\"rep-breakdown\\">",',
                '                    "<div><strong>Total:</strong> " + reputation.total + "</div>",',
                '                    "<div><strong>Given:</strong> " + reputation.given + "</div>",',
                '                    "<div><strong>Helpfulness:</strong> " + (reputation.categories.helpfulness || 0) + "</div>",',
                '                    "<div><strong>Creativity:</strong> " + (reputation.categories.creativity || 0) + "</div>",',
                '                    "<div><strong>Reliability:</strong> " + (reputation.categories.reliability || 0) + "</div>",',
                '                    "<div><strong>Community:</strong> " + (reputation.categories.community || 0) + "</div>",',
                '                "</div>",',
                '                (reputation.badges && reputation.badges.length ? "<div class=\\"badges\\">" + reputation.badges.join(" ") + "</div>" : ""),',
                '                "<div class=\\"recent-history\\">",',
                '                    "<h6>Recent History:</h6>",',
                '                    (recentHistory.length ? recentHistory.map(entry => [',
                '                        "<div class=\\"history-entry\\">",',
                '                            (entry.amount > 0 ? "+" : "") + entry.amount + " " + entry.category + " - " + entry.reason,',
                '                            "<small>(" + new Date(entry.timestamp).toLocaleDateString() + ")</small>",',
                '                        "</div>"',
                '                    ].join("")).join("") : "<p>No recent history</p>"),',
                '                "</div>",',
                '            "</div>"',
                '        ].join("");',
                '    }',
                '',
                '    async function loadAuditLog() {',
                '        if (!currentServerId) return;',
                '',
                '        auditLoading.style.display = "block";',
                '        auditContent.style.display = "none";',
                '',
                '        try {',
                '            const response = await fetch("/api/plugins/reputation/audit/" + currentServerId + "?limit=50");',
                '            const auditEvents = await response.json();',
                '',
                '            if (response.ok) {',
                '                displayAuditLog(auditEvents);',
                '            } else {',
                '                if (typeof showNotification === "function") {',
                '                    showNotification(auditEvents.error || "Failed to load audit log", "error");',
                '                }',
                '            }',
                '        } catch (error) {',
                '            console.error("Error loading audit log:", error);',
                '            if (typeof showNotification === "function") {',
                '                showNotification("Failed to load audit log", "error");',
                '            }',
                '        } finally {',
                '            auditLoading.style.display = "none";',
                '            auditContent.style.display = "block";',
                '        }',
                '    }',
                '',
                '    function displayAuditLog(events) {',
                '        if (!events.length) {',
                '            auditList.innerHTML = "<p style=\\"text-align: center; opacity: 0.7;\\">No audit events found.</p>";',
                '            return;',
                '        }',
                '',
                '        const typeEmoji = {',
                '            "rep_given": "➕",',
                '            "rep_decay": "📉",',
                '            "admin_adjust": "⚙️",',
                '            "role_reward": "🏅"',
                '        };',
                '',
                '        auditList.innerHTML = events.map(event => {',
                '            const date = new Date(event.timestamp).toLocaleString();',
                '            ',
                '            return [',
                '                "<div class=\\"audit-entry\\">",',
                '                    "<div class=\\"audit-icon\\">" + (typeEmoji[event.type] || "📝") + "</div>",',
                '                    "<div class=\\"audit-details\\">",',
                '                        "<div class=\\"audit-type\\">" + event.type.replace("_", " ").toUpperCase() + "</div>",',
                '                        "<div class=\\"audit-description\\">",',
                '                            "User " + event.userId + (event.targetId ? " → " + event.targetId : "") + " ",',
                '                            (event.details ? Object.entries(event.details).map(function(kv) { return kv[0] + ": " + kv[1]; }).join(", ") : ""),',
                '                        "</div>",',
                '                        "<div class=\\"audit-timestamp\\">" + date + "</div>",',
                '                    "</div>",',
                '                "</div>"',
                '            ].join("");',
                '        }).join("");',
                '    }',
                '',
                '    console.log("🏆 Reputation Plugin initialized successfully");',
                '})();'
            ].join('\n')
        };
    }

    // Helper methods
    validateUserId(userId) {
        return /^\d{17,19}$/.test(userId.replace(/[<@!>]/g, ''));
    }

    sanitizeInput(input) {
        return input.replace(/[<>]/g, '').trim();
    }

    formatReputation(amount) {
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(1) + 'M';
        } else if (amount >= 1000) {
            return (amount / 1000).toFixed(1) + 'K';
        }
        return amount.toString();
    }

    getTimeUntilNext(lastGiven, cooldown) {
        const timeLeft = cooldown - (Date.now() - lastGiven);
        if (timeLeft <= 0) return null;
        
        const hours = Math.floor(timeLeft / 3600000);
        const minutes = Math.floor((timeLeft % 3600000) / 60000);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    // Cleanup method
    cleanup() {
        console.log('🏆 Reputation Plugin cleaning up...');
        
        if (this.decayInterval) {
            clearInterval(this.decayInterval);
        }
        if (this.dailyResetInterval) {
            clearInterval(this.dailyResetInterval);
        }
        if (this.weeklyResetInterval) {
            clearInterval(this.weeklyResetInterval);
        }
        
        this.userCooldowns.clear();
        this.dailyLimits.clear();
        this.weeklyLimits.clear();
        
        console.log('✓ Reputation Plugin cleanup complete');
    }

    // Export/Import methods
    async exportData(guildId) {
        try {
            const data = await this.loadData();
            const settings = await this.loadSettings();
            const auditData = JSON.parse(await fs.readFile(this.auditFile, 'utf8').catch(() => '{"events":[]}'));
            
            return {
                guildId,
                exportDate: new Date().toISOString(),
                data: {
                    users: Object.fromEntries(
                        Object.entries(data.users).filter(([userId, userData]) => userData[guildId])
                    ),
                    history: data.history[guildId] || {},
                    leaderboards: data.leaderboards[guildId] || {}
                },
                settings: settings[guildId] || this.getDefaultSettings(),
                audit: auditData.events.filter(event => event.guildId === guildId)
            };
        } catch (error) {
            console.error('Error exporting reputation data:', error);
            throw error;
        }
    }

    async importData(guildId, importData) {
        try {
            const data = await this.loadData();
            const settings = await this.loadSettings();
            
            for (const [userId, userData] of Object.entries(importData.data.users)) {
                if (!data.users[userId]) data.users[userId] = {};
                data.users[userId][guildId] = userData[guildId];
            }
            
            data.history[guildId] = importData.data.history;
            data.leaderboards[guildId] = importData.data.leaderboards;
            settings[guildId] = importData.settings;
            
            await this.saveData(data);
            await this.saveSettings(settings);
            
            await this.logAuditEvent(guildId, 'data_import', 'system', null, {
                importDate: importData.exportDate,
                userCount: Object.keys(importData.data.users).length
            }, 'system');
            
            return true;
        } catch (error) {
            console.error('Error importing reputation data:', error);
            throw error;
        }
    }
}

module.exports = ReputationPlugin;