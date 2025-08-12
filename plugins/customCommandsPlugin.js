const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

class CustomCommandsPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Custom Commands';
        this.description = 'Advanced custom command system with visual flow editor, AI triggers, and templating';
        this.version = '2.0.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        // File paths
        this.dataDir = path.join(__dirname, '..', 'data');
        this.commandsFile = path.join(this.dataDir, 'customCommands.json');
        this.variablesFile = path.join(this.dataDir, 'customVariables.json');
        this.templatesFile = path.join(this.dataDir, 'commandTemplates.json');
        
        // Rate limiting and cooldowns
        this.cooldowns = new Map();
        this.rateLimits = new Map();
        
        this.setupRoutes();
        this.setupDiscordEvents();
        this.initializeFiles();
    }

    async initializeFiles() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            
            // Initialize commands file
            try {
                await fs.access(this.commandsFile);
            } catch {
                await fs.writeFile(this.commandsFile, JSON.stringify({}, null, 2));
            }
            
            // Initialize variables file
            try {
                await fs.access(this.variablesFile);
            } catch {
                await fs.writeFile(this.variablesFile, JSON.stringify({}, null, 2));
            }
            
            // Initialize templates file with default templates
            try {
                await fs.access(this.templatesFile);
            } catch {
                const defaultTemplates = {
                    'welcome-basic': {
                        name: 'Basic Welcome Message',
                        description: 'Simple welcome message for new members',
                        category: 'welcome',
                        trigger: { type: 'event', event: 'guildMemberAdd' },
                        response: {
                            type: 'message',
                            content: 'Welcome to **{server.name}**, {user.mention}!',
                            description: 'We hope you enjoy your time here!',
                            color: '#00ff00',
                            thumbnail: '{user.avatar}'
                        },
                        variables: [],
                        permissions: { roles: [], users: [] }
                    },
                    'level-up': {
                        name: 'Level Up Notification',
                        description: 'Congratulations message when users level up',
                        category: 'leveling',
                        trigger: { type: 'event', event: 'levelUp' },
                        response: {
                            type: 'message',
                            content: 'Congratulations {user.mention}! You reached level {level}!',
                            description: 'Congratulations {user.mention}! You reached level {level}!',
                            color: '#00ff00',
                            thumbnail: '{user.avatar}'
                        },
                        variables: ['level'],
                        permissions: { roles: [], users: [] }
                    }
                };
                await fs.writeFile(this.templatesFile, JSON.stringify(defaultTemplates, null, 2));
            }
            
            console.log('✓ Custom Commands: Data files initialized');
        } catch (error) {
            console.error('Custom Commands: Error initializing files:', error);
        }
    }

    setupDiscordEvents() {
        // Message handler for command triggers
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            await this.handleMessageTriggers(message);
        });

        // Member join handler
        this.client.on('guildMemberAdd', async (member) => {
            await this.handleEventTriggers('guildMemberAdd', { member });
        });

        // Member leave handler
        this.client.on('guildMemberRemove', async (member) => {
            await this.handleEventTriggers('guildMemberRemove', { member });
        });

        // Reaction handler
        this.client.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot) return;
            await this.handleReactionTriggers(reaction, user, 'add');
        });

        this.client.on('messageReactionRemove', async (reaction, user) => {
            if (user.bot) return;
            await this.handleReactionTriggers(reaction, user, 'remove');
        });

        // Button, modal, and select menu handlers (keeping existing interaction handlers)
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton() || !interaction.customId.startsWith('cc_')) return;
            await this.handleButtonInteraction(interaction);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isModalSubmit() || !interaction.customId.startsWith('cc_modal_')) return;
            await this.handleModalSubmit(interaction);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('cc_select_')) return;
            await this.handleSelectMenu(interaction);
        });
    }

    // --- NEW: Centralized slash command system methods ---

    getSlashCommands() {
        return [
            {
                name: 'customcommand',
                description: 'Execute a custom command by name',
                options: [
                    {
                        name: 'name',
                        description: 'Name of the custom command to execute',
                        type: 3, // STRING
                        required: true
                    },
                    {
                        name: 'target',
                        description: 'Target user for the command (if applicable)',
                        type: 6, // USER
                        required: false
                    },
                    {
                        name: 'value',
                        description: 'Additional value for the command (if applicable)',
                        type: 3, // STRING
                        required: false
                    }
                ]
            },
            {
                name: 'listcommands',
                description: 'List all available custom commands in this server',
                options: [
                    {
                        name: 'category',
                        description: 'Filter by command category',
                        type: 3, // STRING
                        required: false,
                        choices: [
                            { name: 'Welcome', value: 'welcome' },
                            { name: 'Moderation', value: 'moderation' },
                            { name: 'Fun', value: 'fun' },
                            { name: 'Utility', value: 'utility' },
                            { name: 'Leveling', value: 'leveling' }
                        ]
                    }
                ]
            },
            {
                name: 'commandinfo',
                description: 'Get information about a specific custom command',
                options: [
                    {
                        name: 'command',
                        description: 'Name of the command to get info about',
                        type: 3, // STRING
                        required: true
                    }
                ]
            }
        ];
    }

    getCommandPermissions() {
        return {
            'customcommand': {
                defaultPermission: true,
                permissions: []
            },
            'listcommands': {
                defaultPermission: true,
                permissions: []
            },
            'commandinfo': {
                defaultPermission: true,
                permissions: []
            }
        };
    }

    async handleSlashCommand(interaction) {
        try {
            const { commandName } = interaction;

            switch (commandName) {
                case 'customcommand':
                    await this.handleCustomCommandSlash(interaction);
                    break;
                case 'listcommands':
                    await this.handleListCommandsSlash(interaction);
                    break;
                case 'commandinfo':
                    await this.handleCommandInfoSlash(interaction);
                    break;
                default:
                    await interaction.reply({ 
                        content: '❌ Unknown custom command.', 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            console.error('Custom Commands: Error handling slash command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while executing the custom command.')
                .setColor('#ff0000')
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }

    async handleCustomCommandSlash(interaction) {
        const commandName = interaction.options.getString('name');
        const targetUser = interaction.options.getUser('target');
        const value = interaction.options.getString('value');

        const commands = await this.loadCommands();
        const guildCommands = commands[interaction.guild.id] || {};
        
        const command = Object.values(guildCommands).find(cmd => 
            cmd.name.toLowerCase() === commandName.toLowerCase() && 
            cmd.trigger?.type === 'slash' && 
            cmd.enabled
        );

        if (!command) {
            return await interaction.reply({
                content: `❌ Custom command \`${commandName}\` not found or not configured as a slash command.`,
                ephemeral: true
            });
        }

        // Check permissions
        if (!await this.checkCommandPermissions(interaction.member, command)) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        // Check cooldown
        if (!this.checkCooldown(interaction.user.id, command.id, command.cooldown)) {
            const remaining = this.getRemainingCooldown(interaction.user.id, command.id);
            return await interaction.reply({
                content: `⏰ Please wait ${remaining} seconds before using this command again.`,
                ephemeral: true
            });
        }

        // Execute the command
        const context = {
            user: interaction.user,
            member: interaction.member,
            guild: interaction.guild,
            channel: interaction.channel,
            target: targetUser,
            value: value
        };

        await this.executeCustomCommand(command, interaction, context);
    }

    async handleListCommandsSlash(interaction) {
        const category = interaction.options.getString('category');
        
        const commands = await this.loadCommands();
        const guildCommands = commands[interaction.guild.id] || {};
        
        let availableCommands = Object.values(guildCommands).filter(cmd => 
            cmd.enabled && 
            cmd.trigger?.type === 'slash' &&
            this.checkCommandPermissions(interaction.member, cmd)
        );

        if (category) {
            availableCommands = availableCommands.filter(cmd => 
                cmd.category?.toLowerCase() === category.toLowerCase()
            );
        }

        if (availableCommands.length === 0) {
            const message = category 
                ? `No custom slash commands found in the **${category}** category.`
                : 'No custom slash commands available in this server.';
            
            return await interaction.reply({
                content: message,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚡ Custom Slash Commands${category ? ` - ${category}` : ''}`)
            .setDescription('Available custom commands you can use:')
            .setColor('#00ff99')
            .setTimestamp();

        const groupedCommands = availableCommands.reduce((acc, cmd) => {
            const cat = cmd.category || 'Uncategorized';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(cmd);
            return acc;
        }, {});

        for (const [cat, cmds] of Object.entries(groupedCommands)) {
            const commandList = cmds.map(cmd => 
                `\`/customcommand ${cmd.name}\` - ${cmd.description || 'No description'}`
            ).join('\n');
            
            embed.addFields({
                name: `📁 ${cat}`,
                value: commandList.length > 1024 ? commandList.substring(0, 1021) + '...' : commandList,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleCommandInfoSlash(interaction) {
        const commandName = interaction.options.getString('command');
        
        const commands = await this.loadCommands();
        const guildCommands = commands[interaction.guild.id] || {};
        
        const command = Object.values(guildCommands).find(cmd => 
            cmd.name.toLowerCase() === commandName.toLowerCase() && 
            cmd.enabled
        );

        if (!command) {
            return await interaction.reply({
                content: `❌ Custom command \`${commandName}\` not found.`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚡ Command: ${command.name}`)
            .setDescription(command.description || 'No description provided')
            .setColor('#00ff99')
            .setTimestamp();

        embed.addFields([
            {
                name: '🎯 Trigger Type',
                value: command.trigger?.type || 'Unknown',
                inline: true
            },
            {
                name: '📁 Category',
                value: command.category || 'Uncategorized',
                inline: true
            },
            {
                name: '⏰ Cooldown',
                value: command.cooldown ? `${command.cooldown} seconds` : 'None',
                inline: true
            }
        ]);

        if (command.trigger?.type === 'message') {
            embed.addFields({
                name: '💬 Message Trigger',
                value: `Match: ${command.trigger.matchType}\nPattern: \`${command.trigger.pattern}\``,
                inline: false
            });
        }

        if (command.variables && command.variables.length > 0) {
            embed.addFields({
                name: '🔢 Variables',
                value: command.variables.map(v => `\`{${v}}\``).join(', '),
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // --- END: New centralized slash command methods ---

    async handleMessageTriggers(message) {
        try {
            const commands = await this.loadCommands();
            const guildCommands = commands[message.guild.id] || {};

            for (const [commandId, command] of Object.entries(guildCommands)) {
                if (!command.enabled || !command.trigger || command.trigger.type !== 'message') continue;

                let triggered = false;
                const content = message.content.toLowerCase();

                switch (command.trigger.matchType) {
                    case 'exact':
                        triggered = content === command.trigger.pattern.toLowerCase();
                        break;
                    case 'startsWith':
                        triggered = content.startsWith(command.trigger.pattern.toLowerCase());
                        break;
                    case 'contains':
                        triggered = content.includes(command.trigger.pattern.toLowerCase());
                        break;
                    case 'regex':
                        try {
                            const regex = new RegExp(command.trigger.pattern, 'i');
                            triggered = regex.test(content);
                        } catch (error) {
                            console.error('Invalid regex pattern:', command.trigger.pattern);
                        }
                        break;
                }

                if (triggered) {
                    // Check permissions
                    if (!await this.checkCommandPermissions(message.member, command)) continue;

                    // Check cooldown
                    if (!this.checkCooldown(message.author.id, commandId, command.cooldown)) continue;

                    const context = {
                        user: message.author,
                        member: message.member,
                        guild: message.guild,
                        channel: message.channel,
                        message: message
                    };

                    await this.executeCustomCommand(command, message, context);
                }
            }
        } catch (error) {
            console.error('Custom Commands: Error handling message triggers:', error);
        }
    }

    async handleEventTriggers(eventType, data) {
        try {
            const commands = await this.loadCommands();
            const guildId = data.member?.guild?.id;
            if (!guildId) return;

            const guildCommands = commands[guildId] || {};

            for (const [commandId, command] of Object.entries(guildCommands)) {
                if (!command.enabled || !command.trigger || command.trigger.type !== 'event') continue;
                if (command.trigger.event !== eventType) continue;

                const context = {
                    user: data.member.user,
                    member: data.member,
                    guild: data.member.guild,
                    channel: null,
                    eventData: data
                };

                await this.executeCustomCommand(command, null, context);
            }
        } catch (error) {
            console.error('Custom Commands: Error handling event triggers:', error);
        }
    }

    async handleReactionTriggers(reaction, user, action) {
        try {
            const commands = await this.loadCommands();
            const guildCommands = commands[reaction.message.guild.id] || {};

            for (const [commandId, command] of Object.entries(guildCommands)) {
                if (!command.enabled || !command.trigger || command.trigger.type !== 'reaction') continue;
                if (command.trigger.action !== action) continue;
                if (command.trigger.emoji && command.trigger.emoji !== reaction.emoji.name) continue;

                const context = {
                    user: user,
                    member: reaction.message.guild.members.cache.get(user.id),
                    guild: reaction.message.guild,
                    channel: reaction.message.channel,
                    reaction: reaction,
                    message: reaction.message
                };

                await this.executeCustomCommand(command, null, context);
            }
        } catch (error) {
            console.error('Custom Commands: Error handling reaction triggers:', error);
        }
    }

    async executeCustomCommand(command, source, context) {
        try {
            const response = command.response;
            
            if (response.type === 'message') {
                const content = this.replaceVariables(response.content || '', context);
                
                let messageOptions = { content };

                if (response.embed) {
                    const embed = new EmbedBuilder();
                    
                    if (response.title) embed.setTitle(this.replaceVariables(response.title, context));
                    if (response.description) embed.setDescription(this.replaceVariables(response.description, context));
                    if (response.color) embed.setColor(response.color);
                    if (response.thumbnail) embed.setThumbnail(this.replaceVariables(response.thumbnail, context));
                    if (response.image) embed.setImage(this.replaceVariables(response.image, context));
                    if (response.footer) embed.setFooter({ text: this.replaceVariables(response.footer, context) });
                    
                    messageOptions.embeds = [embed];
                }

                if (response.buttons && response.buttons.length > 0) {
                    const row = new ActionRowBuilder();
                    for (const btn of response.buttons.slice(0, 5)) {
                        const button = new ButtonBuilder()
                            .setCustomId(`cc_${btn.id}`)
                            .setLabel(this.replaceVariables(btn.label, context))
                            .setStyle(ButtonStyle[btn.style] || ButtonStyle.Primary);
                        
                        if (btn.emoji) button.setEmoji(btn.emoji);
                        row.addComponents(button);
                    }
                    messageOptions.components = [row];
                }

                // Send the message
                const targetChannel = response.channel ? 
                    context.guild.channels.cache.get(response.channel) : 
                    context.channel;

                if (targetChannel) {
                    if (source && source.reply && !response.channel) {
                        await source.reply(messageOptions);
                    } else {
                        await targetChannel.send(messageOptions);
                    }
                }
            }

            // Handle other response types (roles, etc.)
            if (response.actions) {
                for (const action of response.actions) {
                    await this.executeAction(action, context);
                }
            }

        } catch (error) {
            console.error('Custom Commands: Error executing command:', error);
        }
    }

    async executeAction(action, context) {
        try {
            switch (action.type) {
                case 'addRole':
                    if (action.role && context.member) {
                        const role = context.guild.roles.cache.get(action.role);
                        if (role) await context.member.roles.add(role);
                    }
                    break;
                case 'removeRole':
                    if (action.role && context.member) {
                        const role = context.guild.roles.cache.get(action.role);
                        if (role) await context.member.roles.remove(role);
                    }
                    break;
                case 'timeout':
                    if (action.duration && context.member) {
                        await context.member.timeout(action.duration * 1000, action.reason);
                    }
                    break;
                case 'kick':
                    if (context.member) {
                        await context.member.kick(action.reason);
                    }
                    break;
                case 'ban':
                    if (context.member) {
                        await context.member.ban({ reason: action.reason });
                    }
                    break;
            }
        } catch (error) {
            console.error('Custom Commands: Error executing action:', error);
        }
    }

    async checkCommandPermissions(member, command) {
        if (!command.permissions) return true;
        
        // Check if member has required roles
        if (command.permissions.roles && command.permissions.roles.length > 0) {
            const hasRole = member.roles.cache.some(role => 
                command.permissions.roles.includes(role.id)
            );
            if (!hasRole) return false;
        }
        
        // Check if member is in allowed users list
        if (command.permissions.users && command.permissions.users.length > 0) {
            if (!command.permissions.users.includes(member.id)) return false;
        }
        
        return true;
    }

    checkCooldown(userId, commandId, cooldownSeconds) {
        if (!cooldownSeconds || cooldownSeconds <= 0) return true;
        
        const key = `${userId}-${commandId}`;
        const now = Date.now();
        const cooldownEnd = this.cooldowns.get(key);
        
        if (cooldownEnd && now < cooldownEnd) {
            return false;
        }
        
        this.cooldowns.set(key, now + (cooldownSeconds * 1000));
        return true;
    }

    getRemainingCooldown(userId, commandId) {
        const key = `${userId}-${commandId}`;
        const cooldownEnd = this.cooldowns.get(key);
        if (!cooldownEnd) return 0;
        
        const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
        return Math.max(0, remaining);
    }

    replaceVariables(text, context) {
        if (!text) return '';
        
        return text
            .replace(/{user\.mention}/g, context.user ? `<@${context.user.id}>` : '{user.mention}')
            .replace(/{user\.name}/g, context.user?.username || '{user.name}')
            .replace(/{user\.displayName}/g, context.member?.displayName || context.user?.username || '{user.displayName}')
            .replace(/{user\.id}/g, context.user?.id || '{user.id}')
            .replace(/{user\.avatar}/g, context.user?.displayAvatarURL() || '{user.avatar}')
            .replace(/{server\.name}/g, context.guild?.name || '{server.name}')
            .replace(/{server\.id}/g, context.guild?.id || '{server.id}')
            .replace(/{server\.memberCount}/g, context.guild?.memberCount?.toString() || '{server.memberCount}')
            .replace(/{channel\.name}/g, context.channel?.name || '{channel.name}')
            .replace(/{channel\.mention}/g, context.channel ? `<#${context.channel.id}>` : '{channel.mention}')
            .replace(/{target\.mention}/g, context.target ? `<@${context.target.id}>` : '{target.mention}')
            .replace(/{target\.name}/g, context.target?.username || '{target.name}')
            .replace(/{value}/g, context.value || '{value}')
            .replace(/{date}/g, new Date().toLocaleDateString())
            .replace(/{time}/g, new Date().toLocaleTimeString());
    }

    async handleButtonInteraction(interaction) {
        // Handle custom command button interactions
        await interaction.deferUpdate();
        // Add your button handling logic here
    }

    async handleModalSubmit(interaction) {
        // Handle custom command modal submissions
        await interaction.deferReply({ ephemeral: true });
        // Add your modal handling logic here
    }

    async handleSelectMenu(interaction) {
        // Handle custom command select menu interactions
        await interaction.deferUpdate();
        // Add your select menu handling logic here
    }

    // Data loading methods
    async loadCommands() {
        try {
            const data = await fs.readFile(this.commandsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading commands:', error);
            return {};
        }
    }

    async saveCommands(commands) {
        try {
            await fs.writeFile(this.commandsFile, JSON.stringify(commands, null, 2));
        } catch (error) {
            console.error('Error saving commands:', error);
        }
    }

    async loadVariables() {
        try {
            const data = await fs.readFile(this.variablesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading variables:', error);
            return {};
        }
    }

    async loadTemplates() {
        try {
            const data = await fs.readFile(this.templatesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading templates:', error);
            return {};
        }
    }

    setupRoutes() {
        // Commands API routes
        this.app.get('/api/plugins/customcommands/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const commands = await this.loadCommands();
                res.json(commands[guildId] || {});
            } catch (error) {
                console.error('Error fetching commands:', error);
                res.status(500).json({ error: 'Failed to fetch commands' });
            }
        });

        this.app.post('/api/plugins/customcommands/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                const { command } = req.body;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const commands = await this.loadCommands();
                if (!commands[guildId]) commands[guildId] = {};
                
                const commandId = command.id || Date.now().toString();
                command.id = commandId;
                command.createdAt = command.createdAt || new Date().toISOString();
                command.updatedAt = new Date().toISOString();
                
                commands[guildId][commandId] = command;
                await this.saveCommands(commands);
                
                res.json({ success: true, command });
            } catch (error) {
                console.error('Error saving command:', error);
                res.status(500).json({ error: 'Failed to save command' });
            }
        });

        this.app.put('/api/plugins/customcommands/:guildId/:commandId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId, commandId } = req.params;
                const { command } = req.body;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const commands = await this.loadCommands();
                if (!commands[guildId] || !commands[guildId][commandId]) {
                    return res.status(404).json({ error: 'Command not found' });
                }
                
                command.id = commandId;
                command.updatedAt = new Date().toISOString();
                commands[guildId][commandId] = command;
                await this.saveCommands(commands);
                
                res.json({ success: true, command });
            } catch (error) {
                console.error('Error updating command:', error);
                res.status(500).json({ error: 'Failed to update command' });
            }
        });

        this.app.delete('/api/plugins/customcommands/:guildId/:commandId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId, commandId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const commands = await this.loadCommands();
                if (!commands[guildId] || !commands[guildId][commandId]) {
                    return res.status(404).json({ error: 'Command not found' });
                }
                
                delete commands[guildId][commandId];
                await this.saveCommands(commands);
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting command:', error);
                res.status(500).json({ error: 'Failed to delete command' });
            }
        });

        // Templates API routes
        this.app.get('/api/plugins/customcommands/templates', this.ensureAuthenticated, async (req, res) => {
            try {
                const data = await fs.readFile(this.templatesFile, 'utf8');
                const templates = JSON.parse(data);
                res.json(templates);
            } catch (error) {
                console.error('Error fetching templates:', error);
                res.status(500).json({ error: 'Failed to fetch templates' });
            }
        });

        this.app.get('/api/plugins/customcommands/variables/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const variables = await this.loadVariables();
                res.json(variables[guildId] || { users: {}, server: {} });
            } catch (error) {
                console.error('Error fetching variables:', error);
                res.status(500).json({ error: 'Failed to fetch variables' });
            }
        });

        this.app.post('/api/plugins/customcommands/test/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                const { command, testContext } = req.body;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const result = {
                    valid: true,
                    preview: this.replaceVariables(command.response.content || '', testContext),
                    warnings: []
                };
                
                res.json(result);
            } catch (error) {
                console.error('Error testing command:', error);
                res.status(500).json({ error: 'Failed to test command' });
            }
        });
    }

    getFrontendComponent() {
        return {
            id: 'custom-commands-plugin',
            name: 'Custom Commands',
            description: 'Advanced custom command system with visual flow editor, AI triggers, and templating',
            icon: '⚡',
            version: '2.0.0',
            containerId: 'customCommandsPluginContainer',
            pageId: 'custom-commands',
            navIcon: '⚡',
            
            html: `
                <div class="plugin-container">
                    <div class="plugin-header">
                        <h3><span class="plugin-icon">⚡</span> Custom Commands</h3>
                        <p>Create powerful custom commands with triggers, responses, and advanced templating</p>
                    </div>
                    
                    <!-- Server Selection -->
                    <div class="form-group">
                        <label for="ccServerSelect">Server</label>
                        <select id="ccServerSelect" required>
                            <option value="">Select a server...</option>
                        </select>
                    </div>
                    
                    <div id="ccMainContent" style="display: none;">
                        <!-- Tab Navigation -->
                        <div class="tab-nav" style="display: flex; margin-bottom: 20px; border-bottom: 2px solid rgba(255,255,255,0.1);">
                            <button class="tab-btn active" data-tab="commands">📝 Commands</button>
                            <button class="tab-btn" data-tab="templates">📚 Templates</button>
                            <button class="tab-btn" data-tab="variables">💾 Variables</button>
                            <button class="tab-btn" data-tab="analytics">📊 Analytics</button>
                        </div>
                        
                        <!-- Commands Tab -->
                        <div id="commands-tab" class="tab-content active">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h4>Commands</h4>
                                <div>
                                    <button id="importTemplateBtn" class="btn-secondary" style="margin-right: 10px;">📥 Import Template</button>
                                    <button id="createCommandBtn" class="btn-primary">➕ Create Command</button>
                                </div>
                            </div>
                            
                            <div id="commandsList" class="commands-list">
                                <div class="loading-state">
                                    <p>Select a server to view commands</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Templates Tab -->
                        <div id="templates-tab" class="tab-content">
                            <h4>Command Templates</h4>
                            <p>Pre-built command templates you can import and customize</p>
                            <div id="templatesList" class="templates-grid">
                                <div class="loading-state">
                                    <p>Loading templates...</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Variables Tab -->
                        <div id="variables-tab" class="tab-content">
                            <h4>Custom Variables</h4>
                            <p>Manage server and user variables for your commands</p>
                            <div id="variablesList">
                                <div class="loading-state">
                                    <p>Select a server to view variables</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Analytics Tab -->
                        <div id="analytics-tab" class="tab-content">
                            <h4>Command Analytics</h4>
                            <p>View usage statistics and performance metrics</p>
                            <div id="analyticsContent">
                                <div class="loading-state">
                                    <p>Select a server to view analytics</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Command Editor Modal -->
                <div id="commandEditorModal" class="modal">
                    <div class="modal-content large">
                        <div class="modal-header">
                            <h3 id="commandEditorTitle">Create Command</h3>
                            <button class="modal-close">&times;</button>
                        </div>
                        <div class="modal-body">
                            <form id="commandForm">
                                <!-- Basic Information -->
                                <div class="form-section">
                                    <h4>📝 Basic Information</h4>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label for="commandName">Command Name</label>
                                            <input type="text" id="commandName" required placeholder="e.g., welcome, help, info">
                                        </div>
                                        <div class="form-group">
                                            <label for="commandCategory">Category</label>
                                            <select id="commandCategory">
                                                <option value="utility">🔧 Utility</option>
                                                <option value="fun">🎉 Fun</option>
                                                <option value="moderation">🛡️ Moderation</option>
                                                <option value="welcome">👋 Welcome</option>
                                                <option value="leveling">📈 Leveling</option>
                                                <option value="custom">⚙️ Custom</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label for="commandDescription">Description</label>
                                        <textarea id="commandDescription" placeholder="Describe what this command does"></textarea>
                                    </div>
                                </div>
                                
                                <!-- Trigger Configuration -->
                                <div class="form-section">
                                    <h4>🎯 Trigger Configuration</h4>
                                    <div class="form-group">
                                        <label for="triggerType">Trigger Type</label>
                                        <select id="triggerType" required>
                                            <option value="">Select trigger type...</option>
                                            <option value="message">💬 Message</option>
                                            <option value="event">📅 Event</option>
                                            <option value="reaction">😀 Reaction</option>
                                            <option value="slash">⚡ Slash Command</option>
                                            <option value="schedule">⏰ Scheduled</option>
                                        </select>
                                    </div>
                                    
                                    <!-- Message Trigger Options -->
                                    <div id="messageTriggerOptions" class="trigger-options" style="display: none;">
                                        <div class="form-group">
                                            <label for="messageMatchType">Match Type</label>
                                            <select id="messageMatchType">
                                                <option value="exact">Exact Match</option>
                                                <option value="startsWith">Starts With</option>
                                                <option value="contains">Contains</option>
                                                <option value="regex">Regex Pattern</option>
                                                <option value="ai">AI Intent Detection</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label for="messagePattern">Pattern</label>
                                            <input type="text" id="messagePattern" placeholder="Enter trigger pattern">
                                        </div>
                                    </div>
                                    
                                    <!-- Event Trigger Options -->
                                    <div id="eventTriggerOptions" class="trigger-options" style="display: none;">
                                        <div class="form-group">
                                            <label for="eventType">Event Type</label>
                                            <select id="eventType">
                                                <option value="guildMemberAdd">Member Join</option>
                                                <option value="guildMemberRemove">Member Leave</option>
                                                <option value="messageCreate">Message Sent</option>
                                                <option value="levelUp">Level Up</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <!-- Reaction Trigger Options -->
                                    <div id="reactionTriggerOptions" class="trigger-options" style="display: none;">
                                        <div class="form-group">
                                            <label for="reactionAction">Action</label>
                                            <select id="reactionAction">
                                                <option value="add">Reaction Added</option>
                                                <option value="remove">Reaction Removed</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label for="reactionEmoji">Emoji (optional)</label>
                                            <input type="text" id="reactionEmoji" placeholder="e.g., 👍, 🎉">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Response Configuration -->
                                <div class="form-section">
                                    <h4>💬 Response Configuration</h4>
                                    <div class="form-group">
                                        <label for="responseType">Response Type</label>
                                        <select id="responseType">
                                            <option value="message">💬 Message</option>
                                            <option value="embed">📋 Embed</option>
                                            <option value="dm">📩 Direct Message</option>
                                            <option value="action">⚡ Actions Only</option>
                                        </select>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="responseContent">Message Content</label>
                                        <textarea id="responseContent" placeholder="Enter your response message..."></textarea>
                                        <small>Available variables: {user.mention}, {user.name}, {server.name}, {channel.name}, {target.mention}, {value}</small>
                                    </div>
                                    
                                    <!-- Embed Options -->
                                    <div id="embedOptions" style="display: none;">
                                        <div class="form-row">
                                            <div class="form-group">
                                                <label for="embedTitle">Embed Title</label>
                                                <input type="text" id="embedTitle" placeholder="Optional embed title">
                                            </div>
                                            <div class="form-group">
                                                <label for="embedColor">Color</label>
                                                <input type="color" id="embedColor" value="#00ff99">
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label for="embedDescription">Embed Description</label>
                                            <textarea id="embedDescription" placeholder="Main embed content"></textarea>
                                        </div>
                                        <div class="form-row">
                                            <div class="form-group">
                                                <label for="embedThumbnail">Thumbnail URL</label>
                                                <input type="url" id="embedThumbnail" placeholder="Optional thumbnail URL">
                                            </div>
                                            <div class="form-group">
                                                <label for="embedImage">Image URL</label>
                                                <input type="url" id="embedImage" placeholder="Optional image URL">
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Channel Selection -->
                                    <div class="form-group">
                                        <label for="responseChannel">Response Channel (optional)</label>
                                        <select id="responseChannel">
                                            <option value="">Same channel as trigger</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <!-- Advanced Settings -->
                                <div class="form-section">
                                    <h4>⚙️ Advanced Settings</h4>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label for="commandCooldown">Cooldown (seconds)</label>
                                            <input type="number" id="commandCooldown" min="0" value="0">
                                        </div>
                                        <div class="form-group">
                                            <label>
                                                <input type="checkbox" id="commandEnabled" checked>
                                                Enabled
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Permissions -->
                                <div class="form-section">
                                    <h4>🔒 Permissions</h4>
                                    <div class="form-group">
                                        <label for="allowedRoles">Allowed Roles (optional)</label>
                                        <select id="allowedRoles" multiple>
                                            <!-- Populated dynamically -->
                                        </select>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" id="testCommandBtn" class="btn-secondary">🧪 Test</button>
                            <button type="button" id="saveCommandBtn" class="btn-primary">💾 Save Command</button>
                        </div>
                    </div>
                </div>
            `,
            
            script: `
                (async function() {
                    console.log("🔄 Custom Commands Plugin: Initializing frontend...");
                    
                    let currentGuildId = null;
                    let currentCommands = {};
                    let currentTemplates = {};
                    let editingCommandId = null;
                    
                    // Initialize the plugin
                    await initializeCustomCommandsPlugin();
                    
                    async function initializeCustomCommandsPlugin() {
                        try {
                            await loadServers();
                            await loadTemplates();
                            setupEventListeners();
                            setupTabNavigation();
                            console.log("✅ Custom Commands Plugin: Initialization complete");
                        } catch (error) {
                            console.error("❌ Custom Commands Plugin: Initialization failed:", error);
                        }
                    }
                    
                    async function loadServers() {
                        try {
                            const response = await fetch('/api/servers');
                            const servers = await response.json();
                            
                            const serverSelect = document.getElementById('ccServerSelect');
                            serverSelect.innerHTML = '<option value="">Select a server...</option>';
                            
                            servers.forEach(server => {
                                const option = document.createElement('option');
                                option.value = server.id;
                                option.textContent = server.name;
                                serverSelect.appendChild(option);
                            });
                        } catch (error) {
                            console.error('Error loading servers:', error);
                        }
                    }
                    
                    async function loadTemplates() {
                        try {
                            const response = await fetch('/api/plugins/customcommands/templates');
                            currentTemplates = await response.json();
                            displayTemplates();
                        } catch (error) {
                            console.error('Error loading templates:', error);
                        }
                    }
                    
                    function displayTemplates() {
                        const templatesList = document.getElementById('templatesList');
                        
                        if (Object.keys(currentTemplates).length === 0) {
                            templatesList.innerHTML = '<p>No templates available</p>';
                            return;
                        }
                        
                        templatesList.innerHTML = Object.entries(currentTemplates).map(([id, template]) => \`
                            <div class="template-card">
                                <h5>\${template.name}</h5>
                                <p>\${template.description}</p>
                                <div class="template-meta">
                                    <span class="badge">\${template.category}</span>
                                    <span class="badge">\${template.trigger?.type || 'Unknown'}</span>
                                </div>
                                <div class="template-actions">
                                    <button onclick="previewTemplate('\${id}')" class="btn-secondary">👁️ Preview</button>
                                    <button onclick="importTemplate('\${id}')" class="btn-primary">📥 Import</button>
                                </div>
                            </div>
                        \`).join('');
                    }
                    
                    async function loadCommands(guildId) {
                        try {
                            const response = await fetch(\`/api/plugins/customcommands/\${guildId}\`);
                            currentCommands = await response.json();
                            displayCommands();
                        } catch (error) {
                            console.error('Error loading commands:', error);
                            document.getElementById('commandsList').innerHTML = '<p class="error">Error loading commands</p>';
                        }
                    }
                    
                    function displayCommands() {
                        const commandsList = document.getElementById('commandsList');
                        
                        if (Object.keys(currentCommands).length === 0) {
                            commandsList.innerHTML = '<p>No commands created yet. Click "Create Command" to get started!</p>';
                            return;
                        }
                        
                        commandsList.innerHTML = Object.entries(currentCommands).map(([id, command]) => \`
                            <div class="command-card">
                                <div class="command-header">
                                    <div>
                                        <h5>\${command.name}</h5>
                                        <p>\${command.description || 'No description'}</p>
                                    </div>
                                    <div class="command-status">
                                        <span class="badge \${command.enabled ? 'badge-success' : 'badge-error'}">
                                            \${command.enabled ? '✅ Enabled' : '❌ Disabled'}
                                        </span>
                                    </div>
                                </div>
                                <div class="command-meta">
                                    <span class="badge">\${command.category || 'Uncategorized'}</span>
                                    <span class="badge">\${command.trigger?.type || 'Unknown'}</span>
                                    \${command.cooldown ? \`<span class="badge">⏰ \${command.cooldown}s</span>\` : ''}
                                </div>
                                <div class="command-actions">
                                    <button onclick="testCommand('\${id}')" class="btn-secondary">🧪 Test</button>
                                    <button onclick="editCommand('\${id}')" class="btn-secondary">✏️ Edit</button>
                                    <button onclick="duplicateCommand('\${id}')" class="btn-secondary">📋 Copy</button>
                                    <button onclick="deleteCommand('\${id}')" class="btn-danger">🗑️ Delete</button>
                                </div>
                            </div>
                        \`).join('');
                    }
                    
                    function setupEventListeners() {
                        // Server selection
                        document.getElementById('ccServerSelect').addEventListener('change', async (e) => {
                            currentGuildId = e.target.value;
                            if (currentGuildId) {
                                document.getElementById('ccMainContent').style.display = 'block';
                                await loadCommands(currentGuildId);
                                await loadChannels(currentGuildId);
                                await loadRoles(currentGuildId);
                            } else {
                                document.getElementById('ccMainContent').style.display = 'none';
                            }
                        });
                        
                        // Create command button
                        document.getElementById('createCommandBtn').addEventListener('click', () => {
                            openCommandEditor();
                        });
                        
                        // Import template button
                        document.getElementById('importTemplateBtn').addEventListener('click', () => {
                            document.querySelector('[data-tab="templates"]').click();
                        });
                        
                        // Modal close
                        document.querySelector('#commandEditorModal .modal-close').addEventListener('click', () => {
                            closeModals();
                        });
                        
                        // Save command
                        document.getElementById('saveCommandBtn').addEventListener('click', () => {
                            saveCommand();
                        });
                        
                        // Test command
                        document.getElementById('testCommandBtn').addEventListener('click', () => {
                            testCurrentCommand();
                        });
                        
                        // Trigger type change
                        document.getElementById('triggerType').addEventListener('change', (e) => {
                            showTriggerOptions(e.target.value);
                        });
                        
                        // Response type change
                        document.getElementById('responseType').addEventListener('change', (e) => {
                            showResponseOptions(e.target.value);
                        });
                    }
                    
                    function setupTabNavigation() {
                        document.querySelectorAll('.tab-btn').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const tabName = btn.dataset.tab;
                                
                                // Update active tab button
                                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                                btn.classList.add('active');
                                
                                // Update active tab content
                                document.querySelectorAll('.tab-content').forEach(content => {
                                    content.classList.remove('active');
                                });
                                document.getElementById(\`\${tabName}-tab\`).classList.add('active');
                            });
                        });
                    }
                    
                    async function loadChannels(guildId) {
                        try {
                            const response = await fetch(\`/api/guilds/\${guildId}/channels\`);
                            const channels = await response.json();
                            
                            const channelSelect = document.getElementById('responseChannel');
                            channelSelect.innerHTML = '<option value="">Same channel as trigger</option>';
                            
                            channels.forEach(channel => {
                                if (channel.type === 0) {
                                    const option = document.createElement('option');
                                    option.value = channel.id;
                                    option.textContent = \`#\${channel.name}\`;
                                    channelSelect.appendChild(option);
                                }
                            });
                        } catch (error) {
                            console.error('Error loading channels:', error);
                        }
                    }
                    
                    async function loadRoles(guildId) {
                        try {
                            const response = await fetch(\`/api/guilds/\${guildId}/roles\`);
                            const roles = await response.json();
                            
                            const roleSelect = document.getElementById('allowedRoles');
                            roleSelect.innerHTML = '';
                            
                            roles.forEach(role => {
                                if (role.name !== '@everyone') {
                                    const option = document.createElement('option');
                                    option.value = role.id;
                                    option.textContent = role.name;
                                    roleSelect.appendChild(option);
                                }
                            });
                        } catch (error) {
                            console.error('Error loading roles:', error);
                        }
                    }
                    
                    function openCommandEditor(commandId = null) {
                        editingCommandId = commandId;
                        const modal = document.getElementById('commandEditorModal');
                        const title = document.getElementById('commandEditorTitle');
                        
                        if (commandId) {
                            title.textContent = 'Edit Command';
                            populateCommandForm(currentCommands[commandId]);
                        } else {
                            title.textContent = 'Create Command';
                            resetCommandForm();
                        }
                        
                        modal.style.display = 'flex';
                    }
                    
                    function populateCommandForm(command) {
                        document.getElementById('commandName').value = command.name || '';
                        document.getElementById('commandCategory').value = command.category || 'utility';
                        document.getElementById('commandDescription').value = command.description || '';
                        document.getElementById('triggerType').value = command.trigger?.type || '';
                        document.getElementById('responseContent').value = command.response?.content || '';
                        document.getElementById('commandCooldown').value = command.cooldown || 0;
                        document.getElementById('commandEnabled').checked = command.enabled !== false;
                        
                        if (command.trigger?.type) {
                            showTriggerOptions(command.trigger.type);
                            
                            if (command.trigger.type === 'message') {
                                document.getElementById('messageMatchType').value = command.trigger.matchType || 'exact';
                                document.getElementById('messagePattern').value = command.trigger.pattern || '';
                            } else if (command.trigger.type === 'event') {
                                document.getElementById('eventType').value = command.trigger.event || '';
                            } else if (command.trigger.type === 'reaction') {
                                document.getElementById('reactionAction').value = command.trigger.action || 'add';
                                document.getElementById('reactionEmoji').value = command.trigger.emoji || '';
                            }
                        }
                        
                        if (command.response) {
                            document.getElementById('responseType').value = command.response.type || 'message';
                            showResponseOptions(command.response.type || 'message');
                            
                            if (command.response.embed) {
                                document.getElementById('embedTitle').value = command.response.title || '';
                                document.getElementById('embedDescription').value = command.response.description || '';
                                document.getElementById('embedColor').value = command.response.color || '#00ff99';
                                document.getElementById('embedThumbnail').value = command.response.thumbnail || '';
                                document.getElementById('embedImage').value = command.response.image || '';
                            }
                            
                            if (command.response.channel) {
                                document.getElementById('responseChannel').value = command.response.channel;
                            }
                        }
                    }
                    
                    function resetCommandForm() {
                        document.getElementById('commandForm').reset();
                        document.querySelectorAll('.trigger-options').forEach(el => el.style.display = 'none');
                        document.getElementById('embedOptions').style.display = 'none';
                    }
                    
                    function showTriggerOptions(triggerType) {
                        document.querySelectorAll('.trigger-options').forEach(el => el.style.display = 'none');
                        
                        if (triggerType) {
                            const optionsEl = document.getElementById(\`\${triggerType}TriggerOptions\`);
                            if (optionsEl) {
                                optionsEl.style.display = 'block';
                            }
                        }
                    }
                    
                    function showResponseOptions(responseType) {
                        const embedOptions = document.getElementById('embedOptions');
                        if (responseType === 'embed') {
                            embedOptions.style.display = 'block';
                        } else {
                            embedOptions.style.display = 'none';
                        }
                    }
                    
                    async function saveCommand() {
                        try {
                            const commandData = gatherCommandData();
                            if (!commandData) return;
                            
                            const url = editingCommandId 
                                ? \`/api/plugins/customcommands/\${currentGuildId}/\${editingCommandId}\`
                                : \`/api/plugins/customcommands/\${currentGuildId}\`;
                            
                            const method = editingCommandId ? 'PUT' : 'POST';
                            
                            const response = await fetch(url, {
                                method: method,
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ command: commandData })
                            });
                            
                            if (response.ok) {
                                await loadCommands(currentGuildId);
                                closeModals();
                                showNotification('Command saved successfully!', 'success');
                            } else {
                                const error = await response.json();
                                showNotification(error.error || 'Failed to save command', 'error');
                            }
                        } catch (error) {
                            console.error('Error saving command:', error);
                            showNotification('Error saving command', 'error');
                        }
                    }
                    
                    function gatherCommandData() {
                        const triggerType = document.getElementById('triggerType').value;
                        if (!triggerType) {
                            showNotification('Please select a trigger type', 'error');
                            return null;
                        }
                        
                        const commandData = {
                            name: document.getElementById('commandName').value.trim(),
                            category: document.getElementById('commandCategory').value,
                            description: document.getElementById('commandDescription').value.trim(),
                            enabled: document.getElementById('commandEnabled').checked,
                            cooldown: parseInt(document.getElementById('commandCooldown').value) || 0,
                            trigger: {
                                type: triggerType
                            },
                            response: {
                                type: document.getElementById('responseType').value,
                                content: document.getElementById('responseContent').value
                            },
                            permissions: {
                                roles: Array.from(document.getElementById('allowedRoles').selectedOptions).map(o => o.value),
                                users: []
                            }
                        };
                        
                        }
                        
                        // Gather trigger-specific data
                        if (triggerType === 'message') {
                            commandData.trigger.matchType = document.getElementById('messageMatchType').value;
                            commandData.trigger.pattern = document.getElementById('messagePattern').value;
                            if (!commandData.trigger.pattern) {
                                showNotification('Please enter a message pattern', 'error');
                                return null;
                            }
                        } else if (triggerType === 'event') {
                            commandData.trigger.event = document.getElementById('eventType').value;
                        } else if (triggerType === 'reaction') {
                            commandData.trigger.action = document.getElementById('reactionAction').value;
                            commandData.trigger.emoji = document.getElementById('reactionEmoji').value;
                        }
                        
                        // Gather response data
                        const responseChannel = document.getElementById('responseChannel').value;
                        if (responseChannel) {
                            commandData.response.channel = responseChannel;
                        }
                        
                        if (commandData.response.type === 'embed') {
                            commandData.response.embed = true;
                            commandData.response.title = document.getElementById('embedTitle').value;
                            commandData.response.description = document.getElementById('embedDescription').value;
                            commandData.response.color = document.getElementById('embedColor').value;
                            commandData.response.thumbnail = document.getElementById('embedThumbnail').value;
                            commandData.response.image = document.getElementById('embedImage').value;
                        }
                        
                        return commandData;
                    }
                    
                    async function testCurrentCommand() {
                        try {
                            const commandData = gatherCommandData();
                            if (!commandData) return;
                            
                            const testContext = {
                                user: { mention: '@TestUser', name: 'TestUser' },
                                server: { name: 'Test Server' },
                                channel: { name: 'test-channel' },
                                target: { mention: '@TargetUser', name: 'TargetUser' },
                                value: 'test-value'
                            };
                            
                            const response = await fetch(\`/api/plugins/customcommands/test/\${currentGuildId}\`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ command: commandData, testContext })
                            });
                            
                            if (response.ok) {
                                const result = await response.json();
                                showNotification(\`Preview: \${result.preview}\`, 'info');
                            } else {
                                showNotification('Error testing command', 'error');
                            }
                        } catch (error) {
                            console.error('Error testing command:', error);
                            showNotification('Error testing command', 'error');
                        }
                    }
                    
                    async function deleteCommand(commandId) {
                        if (!confirm('Are you sure you want to delete this command?')) return;
                        
                        try {
                            const response = await fetch(\`/api/plugins/customcommands/\${currentGuildId}/\${commandId}\`, {
                                method: 'DELETE'
                            });
                            
                            if (response.ok) {
                                await loadCommands(currentGuildId);
                                showNotification('Command deleted successfully!', 'success');
                            } else {
                                showNotification('Failed to delete command', 'error');
                            }
                        } catch (error) {
                            console.error('Error deleting command:', error);
                            showNotification('Error deleting command', 'error');
                        }
                    }
                    
                    function duplicateCommand(commandId) {
                        const command = currentCommands[commandId];
                        if (!command) return;
                        
                        const duplicatedCommand = {
                            ...command,
                            name: \`\${command.name} (Copy)\`,
                            id: undefined
                        };
                        
                        editingCommandId = null;
                        populateCommandForm(duplicatedCommand);
                        document.getElementById('commandEditorModal').style.display = 'flex';
                    }
                    
                    function testCommand(commandId) {
                        const command = currentCommands[commandId];
                        if (!command) return;
                        
                        showNotification(\`Testing command: \${command.name}\`, 'info');
                    }
                    
                    async function importTemplate(templateId) {
                        const template = currentTemplates[templateId];
                        if (!template) return;
                        
                        editingCommandId = null;
                        populateCommandForm(template);
                        document.getElementById('commandEditorModal').style.display = 'flex';
                        
                        document.querySelector('[data-tab="commands"]').click();
                    }
                    
                    function previewTemplate(templateId) {
                        const template = currentTemplates[templateId];
                        if (!template) return;
                        
                        const preview = \`
                            Name: \${template.name}
                            Description: \${template.description}
                            Category: \${template.category}
                            Trigger: \${template.trigger?.type} - \${template.trigger?.pattern || template.trigger?.event || 'N/A'}
                            Response: \${template.response?.content || 'N/A'}
                        \`;
                        
                        alert(preview);
                    }
                    
                    function closeModals() {
                        document.querySelectorAll('.modal').forEach(modal => {
                            modal.style.display = 'none';
                        });
                    }
                    
                    function showNotification(message, type = 'info') {
                        const notification = document.createElement('div');
                        notification.className = \`notification notification-\${type}\`;
                        notification.textContent = message;
                        notification.style.cssText = \`
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            padding: 15px 20px;
                            border-radius: 8px;
                            color: white;
                            font-weight: 500;
                            z-index: 10000;
                            max-width: 400px;
                            background: \${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
                            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                            transform: translateX(100%);
                            transition: transform 0.3s ease;
                        \`;
                        
                        document.body.appendChild(notification);
                        
                        setTimeout(() => {
                            notification.style.transform = 'translateX(0)';
                        }, 100);
                        
                        setTimeout(() => {
                            notification.style.transform = 'translateX(100%)';
                            setTimeout(() => {
                                if (notification.parentNode) {
                                    notification.parentNode.removeChild(notification);
                                }
                            }, 300);
                        }, 3000);
                    }
                    
                    // Global functions for button clicks
                    window.editCommand = (commandId) => openCommandEditor(commandId);
                    window.deleteCommand = deleteCommand;
                    window.duplicateCommand = duplicateCommand;
                    window.testCommand = testCommand;
                    window.importTemplate = importTemplate;
                    window.previewTemplate = previewTemplate;
                    
                    // Add CSS styles
                    const style = document.createElement('style');
                    style.textContent = \`
                        .tab-nav {
                            display: flex;
                            border-bottom: 2px solid rgba(255,255,255,0.1);
                            margin-bottom: 20px;
                        }
                        
                        .tab-btn {
                            background: none;
                            border: none;
                            color: rgba(255,255,255,0.7);
                            padding: 12px 20px;
                            cursor: pointer;
                            border-bottom: 2px solid transparent;
                            transition: all 0.3s ease;
                        }
                        
                        .tab-btn:hover {
                            color: white;
                            background: rgba(255,255,255,0.05);
                        }
                        
                        .tab-btn.active {
                            color: #00ff99;
                            border-bottom-color: #00ff99;
                        }
                        
                        .tab-content {
                            display: none;
                        }
                        
                        .tab-content.active {
                            display: block;
                        }
                        
                        .command-card, .template-card {
                            background: rgba(255,255,255,0.05);
                            border: 1px solid rgba(255,255,255,0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 15px;
                            transition: all 0.3s ease;
                        }
                        
                        .command-card:hover, .template-card:hover {
                            background: rgba(255,255,255,0.08);
                            border-color: rgba(255,255,255,0.2);
                            transform: translateY(-2px);
                        }
                        
                        .command-header, .template-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            margin-bottom: 15px;
                        }
                        
                        .command-meta, .template-meta {
                            display: flex;
                            gap: 8px;
                            margin-bottom: 15px;
                            flex-wrap: wrap;
                        }
                        
                        .command-actions, .template-actions {
                            display: flex;
                            gap: 8px;
                            flex-wrap: wrap;
                        }
                        
                        .badge {
                            background: rgba(255,255,255,0.1);
                            color: rgba(255,255,255,0.9);
                            padding: 4px 8px;
                            border-radius: 12px;
                            font-size: 12px;
                            font-weight: 500;
                        }
                        
                        .badge-success {
                            background: rgba(34, 197, 94, 0.2);
                            color: #22c55e;
                        }
                        
                        .badge-error {
                            background: rgba(239, 68, 68, 0.2);
                            color: #ef4444;
                        }
                        
                        .templates-grid {
                            display: grid;
                            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                            gap: 20px;
                        }
                        
                        .trigger-options {
                            background: rgba(255,255,255,0.02);
                            border: 1px solid rgba(255,255,255,0.1);
                            border-radius: 8px;
                            padding: 15px;
                            margin-top: 10px;
                        }
                        
                        .form-section {
                            background: rgba(255,255,255,0.02);
                            border: 1px solid rgba(255,255,255,0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 20px;
                        }
                        
                        .form-section h4 {
                            margin: 0 0 15px 0;
                            color: #00ff99;
                            font-size: 16px;
                        }
                        
                        .form-row {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 15px;
                        }
                        
                        .loading-state {
                            text-align: center;
                            padding: 40px 20px;
                            color: rgba(255,255,255,0.6);
                        }
                        
                        .modal.large .modal-content {
                            max-width: 800px;
                            max-height: 90vh;
                            overflow-y: auto;
                        }
                        
                        .btn-secondary {
                            background: rgba(255,255,255,0.1);
                            color: white;
                            border: 1px solid rgba(255,255,255,0.2);
                            padding: 8px 16px;
                            border-radius: 6px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            font-size: 14px;
                        }
                        
                        .btn-secondary:hover {
                            background: rgba(255,255,255,0.15);
                            border-color: rgba(255,255,255,0.3);
                        }
                        
                        .btn-primary {
                            background: linear-gradient(135deg, #00ff99, #00cc7a);
                            color: #000;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: 600;
                            transition: all 0.3s ease;
                            font-size: 14px;
                        }
                        
                        .btn-primary:hover {
                            transform: translateY(-1px);
                            box-shadow: 0 5px 15px rgba(0,255,153,0.3);
                        }
                        
                        .btn-danger {
                            background: rgba(239, 68, 68, 0.8);
                            color: white;
                            border: 1px solid #ef4444;
                            padding: 8px 16px;
                            border-radius: 6px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            font-size: 14px;
                        }
                        
                        .btn-danger:hover {
                            background: #ef4444;
                            transform: translateY(-1px);
                        }
                        
                        select[multiple] {
                            min-height: 100px;
                        }
                        
                        textarea {
                            min-height: 80px;
                            resize: vertical;
                        }
                        
                        .error {
                            color: #ef4444;
                            background: rgba(239, 68, 68, 0.1);
                            padding: 15px;
                            border-radius: 8px;
                            border: 1px solid rgba(239, 68, 68, 0.3);
                        }
                    \`;
                    document.head.appendChild(style);
                    
                    console.log("✅ Custom Commands Plugin: Frontend component initialized successfully!");
                })();
            `
        };
    }
}

module.exports = CustomCommandsPlugin;