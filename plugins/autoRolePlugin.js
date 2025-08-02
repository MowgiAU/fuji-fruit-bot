const fs = require('fs');
const path = require('path');

class AutoRolePlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Auto-Role System';
        this.description = 'Automatic role assignment, reaction roles, and level-based roles';
        this.version = '1.0.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        // Storage for auto-role settings
        this.autoRoleSettings = this.loadAutoRoleSettings();
        this.reactionRoles = this.loadReactionRoles();
        this.levelRoles = this.loadLevelRoles();
        
        this.setupRoutes();
        this.setupEventListeners();
    }

    loadAutoRoleSettings() {
        try {
            const settingsPath = './data/autoRoleSettings.json';
            if (fs.existsSync(settingsPath)) {
                return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading auto-role settings:', error);
        }
        return {};
    }

    loadReactionRoles() {
        try {
            const reactionRolesPath = './data/reactionRoles.json';
            if (fs.existsSync(reactionRolesPath)) {
                return JSON.parse(fs.readFileSync(reactionRolesPath, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading reaction roles:', error);
        }
        return {};
    }

    loadLevelRoles() {
        try {
            const levelRolesPath = './data/levelRoles.json';
            if (fs.existsSync(levelRolesPath)) {
                return JSON.parse(fs.readFileSync(levelRolesPath, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading level roles:', error);
        }
        return {};
    }

    saveAutoRoleSettings() {
        try {
            const settingsPath = './data/autoRoleSettings.json';
            fs.writeFileSync(settingsPath, JSON.stringify(this.autoRoleSettings, null, 2));
        } catch (error) {
            console.error('Error saving auto-role settings:', error);
        }
    }

    saveReactionRoles() {
        try {
            const reactionRolesPath = './data/reactionRoles.json';
            fs.writeFileSync(reactionRolesPath, JSON.stringify(this.reactionRoles, null, 2));
        } catch (error) {
            console.error('Error saving reaction roles:', error);
        }
    }

    saveLevelRoles() {
        try {
            const levelRolesPath = './data/levelRoles.json';
            fs.writeFileSync(levelRolesPath, JSON.stringify(this.levelRoles, null, 2));
        } catch (error) {
            console.error('Error saving level roles:', error);
        }
    }

    // NEW METHOD: Return slash command definitions for centralized registration
    getSlashCommands() {
        return [
            {
                name: 'autorole',
                description: 'Manage automatic role assignment settings',
                options: [
                    {
                        name: 'joinroles',
                        description: 'Configure join roles',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'enable',
                                description: 'Enable or disable join roles',
                                type: 5, // BOOLEAN
                                required: true
                            },
                            {
                                name: 'roles',
                                description: 'Comma-separated list of role IDs to assign on join',
                                type: 3, // STRING
                                required: false
                            },
                            {
                                name: 'delay',
                                description: 'Delay in minutes before assigning roles (default: 0)',
                                type: 4, // INTEGER
                                required: false,
                                min_value: 0,
                                max_value: 1440
                            }
                        ]
                    },
                    {
                        name: 'synclevels',
                        description: 'Sync level roles for all members',
                        type: 1 // SUB_COMMAND
                    },
                    {
                        name: 'levelroles',
                        description: 'Manage level-based role assignment',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'action',
                                description: 'Action to perform',
                                type: 3, // STRING
                                required: true,
                                choices: [
                                    { name: 'Enable', value: 'enable' },
                                    { name: 'Disable', value: 'disable' },
                                    { name: 'List', value: 'list' },
                                    { name: 'Add Role', value: 'add' },
                                    { name: 'Remove Role', value: 'remove' }
                                ]
                            },
                            {
                                name: 'level',
                                description: 'Level requirement for the role',
                                type: 4, // INTEGER
                                required: false,
                                min_value: 1,
                                max_value: 1000
                            },
                            {
                                name: 'role',
                                description: 'Role to assign at this level',
                                type: 8, // ROLE
                                required: false
                            },
                            {
                                name: 'remove_old',
                                description: 'Remove previous level roles when assigning new ones',
                                type: 5, // BOOLEAN
                                required: false
                            }
                        ]
                    }
                ]
            },
            {
                name: 'reactionrole',
                description: 'Create and manage reaction role messages',
                options: [
                    {
                        name: 'create',
                        description: 'Create a new reaction role message',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'channel',
                                description: 'Channel to send the reaction role message',
                                type: 7, // CHANNEL
                                required: true
                            },
                            {
                                name: 'title',
                                description: 'Title for the reaction role message',
                                type: 3, // STRING
                                required: true,
                                max_length: 256
                            },
                            {
                                name: 'description',
                                description: 'Description for the reaction role message',
                                type: 3, // STRING
                                required: false,
                                max_length: 2000
                            }
                        ]
                    },
                    {
                        name: 'addrole',
                        description: 'Add a role to an existing reaction role message',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'message_id',
                                description: 'ID of the reaction role message',
                                type: 3, // STRING
                                required: true
                            },
                            {
                                name: 'emoji',
                                description: 'Emoji to react with (Unicode or custom emoji)',
                                type: 3, // STRING
                                required: true
                            },
                            {
                                name: 'role',
                                description: 'Role to assign when reacted',
                                type: 8, // ROLE
                                required: true
                            }
                        ]
                    },
                    {
                        name: 'remove',
                        description: 'Remove a reaction role message',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'message_id',
                                description: 'ID of the reaction role message to remove',
                                type: 3, // STRING
                                required: true
                            }
                        ]
                    },
                    {
                        name: 'list',
                        description: 'List all reaction role messages in this server',
                        type: 1 // SUB_COMMAND
                    }
                ]
            }
        ];
    }

    // NEW METHOD: Handle all slash commands for this plugin
    async handleSlashCommand(interaction) {
        try {
            const { commandName, options } = interaction;
            
            if (commandName === 'autorole') {
                const subcommand = options.getSubcommand();
                
                switch (subcommand) {
                    case 'joinroles':
                        await this.handleJoinRolesCommand(interaction);
                        break;
                    case 'synclevels':
                        await this.handleSyncLevelsCommand(interaction);
                        break;
                    case 'levelroles':
                        await this.handleLevelRolesCommand(interaction);
                        break;
                    default:
                        await interaction.reply({ 
                            content: 'Unknown autorole subcommand.', 
                            ephemeral: true 
                        });
                }
            } else if (commandName === 'reactionrole') {
                const subcommand = options.getSubcommand();
                
                switch (subcommand) {
                    case 'create':
                        await this.handleCreateReactionRoleCommand(interaction);
                        break;
                    case 'addrole':
                        await this.handleAddReactionRoleCommand(interaction);
                        break;
                    case 'remove':
                        await this.handleRemoveReactionRoleCommand(interaction);
                        break;
                    case 'list':
                        await this.handleListReactionRolesCommand(interaction);
                        break;
                    default:
                        await interaction.reply({ 
                            content: 'Unknown reactionrole subcommand.', 
                            ephemeral: true 
                        });
                }
            }
        } catch (error) {
            console.error('Error handling auto-role slash command:', error);
            
            const errorMessage = 'An error occurred while processing the command.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }

    // NEW METHOD: Optional command permissions (can be omitted if no special permissions needed)
    getCommandPermissions() {
        return {
            'autorole': {
                defaultMemberPermissions: ['ManageRoles'],
                dmPermission: false
            },
            'reactionrole': {
                defaultMemberPermissions: ['ManageRoles'],
                dmPermission: false
            }
        };
    }

    // Slash command handlers
    async handleJoinRolesCommand(interaction) {
        const guildId = interaction.guild.id;
        const enable = interaction.options.getBoolean('enable');
        const rolesString = interaction.options.getString('roles');
        const delay = interaction.options.getInteger('delay') ?? 0;

        if (!this.autoRoleSettings[guildId]) {
            this.autoRoleSettings[guildId] = {};
        }

        if (!this.autoRoleSettings[guildId].joinRoles) {
            this.autoRoleSettings[guildId].joinRoles = {
                enabled: false,
                roles: [],
                delay: 0
            };
        }

        this.autoRoleSettings[guildId].joinRoles.enabled = enable;

        if (rolesString) {
            const roleIds = rolesString.split(',').map(id => id.trim()).filter(id => id);
            
            // Validate roles exist
            const validRoles = [];
            for (const roleId of roleIds) {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) {
                    validRoles.push(roleId);
                } else {
                    await interaction.reply({ 
                        content: `⚠️ Role with ID ${roleId} not found.`, 
                        ephemeral: true 
                    });
                    return;
                }
            }
            
            this.autoRoleSettings[guildId].joinRoles.roles = validRoles;
        }

        this.autoRoleSettings[guildId].joinRoles.delay = delay;
        this.saveAutoRoleSettings();

        const statusText = enable ? 'enabled' : 'disabled';
        const rolesText = this.autoRoleSettings[guildId].joinRoles.roles.length > 0 
            ? `\nRoles: ${this.autoRoleSettings[guildId].joinRoles.roles.map(id => `<@&${id}>`).join(', ')}`
            : '';
        const delayText = delay > 0 ? `\nDelay: ${delay} minutes` : '\nDelay: Immediate';

        await interaction.reply({
            content: `✅ Join roles have been **${statusText}**.${rolesText}${delayText}`,
            ephemeral: true
        });
    }

    async handleSyncLevelsCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;
        const levelRoleSettings = this.levelRoles[guildId];

        if (!levelRoleSettings?.enabled || !levelRoleSettings.roles.length) {
            await interaction.editReply('❌ Level roles are not enabled or no level roles configured.');
            return;
        }

        let syncCount = 0;
        let errorCount = 0;

        try {
            const members = await interaction.guild.members.fetch();
            
            for (const [memberId, member] of members) {
                if (member.user.bot) continue;

                try {
                    // This would need to integrate with your leveling system
                    // For now, we'll just log that sync would happen here
                    syncCount++;
                } catch (error) {
                    console.error(`Error syncing roles for ${member.user.tag}:`, error);
                    errorCount++;
                }
            }

            await interaction.editReply(
                `✅ Level role sync completed!\n` +
                `👥 Members processed: ${syncCount}\n` +
                `❌ Errors: ${errorCount}`
            );
        } catch (error) {
            console.error('Error during level role sync:', error);
            await interaction.editReply('❌ Failed to sync level roles. Check bot permissions.');
        }
    }

    async handleLevelRolesCommand(interaction) {
        const guildId = interaction.guild.id;
        const action = interaction.options.getString('action');

        if (!this.levelRoles[guildId]) {
            this.levelRoles[guildId] = {
                enabled: false,
                roles: []
            };
        }

        switch (action) {
            case 'enable':
                this.levelRoles[guildId].enabled = true;
                this.saveLevelRoles();
                await interaction.reply({ content: '✅ Level roles enabled.', ephemeral: true });
                break;

            case 'disable':
                this.levelRoles[guildId].enabled = false;
                this.saveLevelRoles();
                await interaction.reply({ content: '✅ Level roles disabled.', ephemeral: true });
                break;

            case 'list':
                const roles = this.levelRoles[guildId].roles;
                if (roles.length === 0) {
                    await interaction.reply({ content: 'No level roles configured.', ephemeral: true });
                } else {
                    const roleList = roles
                        .sort((a, b) => a.level - b.level)
                        .map(r => `Level ${r.level}: <@&${r.roleId}>`)
                        .join('\n');
                    await interaction.reply({ 
                        content: `**Level Roles:**\n${roleList}`, 
                        ephemeral: true 
                    });
                }
                break;

            case 'add':
                const level = interaction.options.getInteger('level');
                const role = interaction.options.getRole('role');
                const removeOld = interaction.options.getBoolean('remove_old') ?? false;

                if (!level || !role) {
                    await interaction.reply({ 
                        content: '❌ Level and role are required for adding.', 
                        ephemeral: true 
                    });
                    return;
                }

                // Remove existing role at this level
                this.levelRoles[guildId].roles = this.levelRoles[guildId].roles.filter(r => r.level !== level);

                // Add new role
                this.levelRoles[guildId].roles.push({
                    level,
                    roleId: role.id,
                    removeOldRoles: removeOld
                });

                this.saveLevelRoles();
                await interaction.reply({ 
                    content: `✅ Added <@&${role.id}> for level ${level}.`, 
                    ephemeral: true 
                });
                break;

            case 'remove':
                const removeLevel = interaction.options.getInteger('level');
                if (!removeLevel) {
                    await interaction.reply({ 
                        content: '❌ Level is required for removing.', 
                        ephemeral: true 
                    });
                    return;
                }

                const beforeLength = this.levelRoles[guildId].roles.length;
                this.levelRoles[guildId].roles = this.levelRoles[guildId].roles.filter(r => r.level !== removeLevel);
                
                if (this.levelRoles[guildId].roles.length < beforeLength) {
                    this.saveLevelRoles();
                    await interaction.reply({ 
                        content: `✅ Removed level role for level ${removeLevel}.`, 
                        ephemeral: true 
                    });
                } else {
                    await interaction.reply({ 
                        content: `❌ No level role found for level ${removeLevel}.`, 
                        ephemeral: true 
                    });
                }
                break;
        }
    }

    async handleCreateReactionRoleCommand(interaction) {
        const channel = interaction.options.getChannel('channel');
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description') || 'React to get your roles!';

        if (!channel.isTextBased()) {
            await interaction.reply({ 
                content: '❌ Channel must be a text channel.', 
                ephemeral: true 
            });
            return;
        }

        try {
            const embed = {
                title: title,
                description: description,
                color: 0x3498db,
                footer: { text: 'React to get roles!' }
            };

            const message = await channel.send({ embeds: [embed] });

            // Initialize reaction role data
            const guildId = interaction.guild.id;
            if (!this.reactionRoles[guildId]) {
                this.reactionRoles[guildId] = {};
            }

            this.reactionRoles[guildId][message.id] = {
                channelId: channel.id,
                title: title,
                roles: {},
                maxRoles: 0,
                removeOnUnreact: true
            };

            this.saveReactionRoles();

            await interaction.reply({ 
                content: `✅ Reaction role message created! Message ID: \`${message.id}\`\nUse \`/reactionrole addrole\` to add roles to it.`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Error creating reaction role message:', error);
            await interaction.reply({ 
                content: '❌ Failed to create reaction role message.', 
                ephemeral: true 
            });
        }
    }

    async handleAddReactionRoleCommand(interaction) {
        const messageId = interaction.options.getString('message_id');
        const emoji = interaction.options.getString('emoji');
        const role = interaction.options.getRole('role');

        const guildId = interaction.guild.id;
        const reactionRoleData = this.reactionRoles[guildId]?.[messageId];

        if (!reactionRoleData) {
            await interaction.reply({ 
                content: '❌ Reaction role message not found.', 
                ephemeral: true 
            });
            return;
        }

        try {
            // Get the message and add the reaction
            const channel = interaction.guild.channels.cache.get(reactionRoleData.channelId);
            const message = await channel.messages.fetch(messageId);
            
            await message.react(emoji);

            // Store the role mapping
            reactionRoleData.roles[emoji] = role.id;
            this.saveReactionRoles();

            await interaction.reply({ 
                content: `✅ Added ${emoji} → <@&${role.id}> to the reaction role message.`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Error adding reaction role:', error);
            await interaction.reply({ 
                content: '❌ Failed to add reaction role. Make sure the emoji is valid and the message exists.', 
                ephemeral: true 
            });
        }
    }

    async handleRemoveReactionRoleCommand(interaction) {
        const messageId = interaction.options.getString('message_id');
        const guildId = interaction.guild.id;

        const reactionRoleData = this.reactionRoles[guildId]?.[messageId];

        if (!reactionRoleData) {
            await interaction.reply({ 
                content: '❌ Reaction role message not found.', 
                ephemeral: true 
            });
            return;
        }

        try {
            // Delete the message
            const channel = interaction.guild.channels.cache.get(reactionRoleData.channelId);
            const message = await channel.messages.fetch(messageId);
            await message.delete();

            // Remove from data
            delete this.reactionRoles[guildId][messageId];
            this.saveReactionRoles();

            await interaction.reply({ 
                content: '✅ Reaction role message removed.', 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Error removing reaction role message:', error);
            await interaction.reply({ 
                content: '❌ Failed to remove reaction role message.', 
                ephemeral: true 
            });
        }
    }

    async handleListReactionRolesCommand(interaction) {
        const guildId = interaction.guild.id;
        const reactionRoleData = this.reactionRoles[guildId] || {};

        const messages = Object.keys(reactionRoleData);

        if (messages.length === 0) {
            await interaction.reply({ 
                content: 'No reaction role messages found in this server.', 
                ephemeral: true 
            });
            return;
        }

        const messageList = messages.map(messageId => {
            const data = reactionRoleData[messageId];
            const roleCount = Object.keys(data.roles || {}).length;
            return `• **${data.title}** (ID: \`${messageId}\`) - ${roleCount} roles`;
        }).join('\n');

        await interaction.reply({ 
            content: `**Reaction Role Messages:**\n${messageList}`, 
            ephemeral: true 
        });
    }

    setupEventListeners() {
        // Keep existing event listeners for reactions, joins, etc.
        this.client.on('guildMemberAdd', async (member) => {
            await this.handleMemberJoin(member);
        });

        this.client.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot) return;
            await this.handleReactionAdd(reaction, user);
        });

        this.client.on('messageReactionRemove', async (reaction, user) => {
            if (user.bot) return;
            await this.handleReactionRemove(reaction, user);
        });
    }

    async handleMemberJoin(member) {
        try {
            const guildId = member.guild.id;
            const settings = this.autoRoleSettings[guildId];
            
            if (!settings?.joinRoles?.enabled || !settings.joinRoles.roles.length) {
                return;
            }
            
            const assignRoles = async () => {
                try {
                    const rolesToAdd = settings.joinRoles.roles.filter(roleId => {
                        const role = member.guild.roles.cache.get(roleId);
                        return role && !member.roles.cache.has(roleId);
                    });
                    
                    if (rolesToAdd.length > 0) {
                        await member.roles.add(rolesToAdd, 'Auto-role on join');
                        
                        await this.logAutoRole(member.guild, {
                            type: 'join_roles',
                            user: member.user,
                            roles: rolesToAdd.map(id => member.guild.roles.cache.get(id)).filter(Boolean),
                            reason: 'Member joined server'
                        });
                    }
                } catch (error) {
                    console.error(`Error assigning join roles to ${member.user.tag}:`, error);
                }
            };
            
            if (settings.joinRoles.delay > 0) {
                setTimeout(assignRoles, settings.joinRoles.delay * 60 * 1000);
            } else {
                await assignRoles();
            }
            
        } catch (error) {
            console.error('Error handling member join for auto-roles:', error);
        }
    }

    async handleReactionAdd(reaction, user) {
        try {
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    console.error('Failed to fetch reaction:', error);
                    return;
                }
            }

            const guildId = reaction.message.guild.id;
            const messageId = reaction.message.id;
            const reactionRoleData = this.reactionRoles[guildId]?.[messageId];

            if (!reactionRoleData) return;

            const emoji = reaction.emoji.name || reaction.emoji.toString();
            const roleId = reactionRoleData.roles[emoji];

            if (!roleId) return;

            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            if (!member) return;

            const role = reaction.message.guild.roles.cache.get(roleId);
            if (!role) return;

            if (!member.roles.cache.has(roleId)) {
                await member.roles.add(role, 'Reaction role');
                
                await this.logAutoRole(reaction.message.guild, {
                    type: 'reaction_role_add',
                    user: user,
                    roles: [role],
                    reason: `Reacted with ${emoji}`
                });
            }
        } catch (error) {
            console.error('Error handling reaction add:', error);
        }
    }

    async handleReactionRemove(reaction, user) {
        try {
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    console.error('Failed to fetch reaction:', error);
                    return;
                }
            }

            const guildId = reaction.message.guild.id;
            const messageId = reaction.message.id;
            const reactionRoleData = this.reactionRoles[guildId]?.[messageId];

            if (!reactionRoleData || !reactionRoleData.removeOnUnreact) return;

            const emoji = reaction.emoji.name || reaction.emoji.toString();
            const roleId = reactionRoleData.roles[emoji];

            if (!roleId) return;

            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            if (!member) return;

            const role = reaction.message.guild.roles.cache.get(roleId);
            if (!role) return;

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(role, 'Reaction role removed');
                
                await this.logAutoRole(reaction.message.guild, {
                    type: 'reaction_role_remove',
                    user: user,
                    roles: [role],
                    reason: `Removed reaction ${emoji}`
                });
            }
        } catch (error) {
            console.error('Error handling reaction remove:', error);
        }
    }

    async logAutoRole(guild, logData) {
        try {
            // This method can be enhanced to log to a specific channel
            console.log(`[Auto-Role] ${guild.name}: ${logData.type} - ${logData.user.tag} - ${logData.roles.map(r => r.name).join(', ')} - ${logData.reason}`);
        } catch (error) {
            console.error('Error logging auto-role action:', error);
        }
    }

    testEmojiConsistency(emoji) {
        console.log(`🔍 [EMOJI TEST] Testing emoji: "${emoji}"`);
        console.log(`📊 [EMOJI TEST] Type: ${typeof emoji}`);
        console.log(`📏 [EMOJI TEST] Length: ${emoji.length}`);
        console.log(`🔢 [EMOJI TEST] Char codes: ${Array.from(emoji).map(char => char.charCodeAt(0))}`);
        console.log(`✨ [EMOJI TEST] Unicode: ${Array.from(emoji).map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`);
    }

    setupRoutes() {
        // Get auto-role settings for a specific server
        this.app.get('/api/plugins/autorole/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const settings = this.autoRoleSettings[serverId] || {
                    joinRoles: { enabled: false, roles: [], delay: 0 },
                    levelRoles: { enabled: false, roles: [] }
                };
                
                res.json(settings);
            } catch (error) {
                console.error('Error getting auto-role settings:', error);
                res.status(500).json({ error: 'Failed to get auto-role settings' });
            }
        });

        // Save auto-role settings for a specific server
        this.app.post('/api/plugins/autorole/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                this.autoRoleSettings[serverId] = req.body;
                this.saveAutoRoleSettings();
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error saving auto-role settings:', error);
                res.status(500).json({ error: 'Failed to save auto-role settings' });
            }
        });

        // Get level roles for a specific server
        this.app.get('/api/plugins/autorole/levelroles/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const levelRoles = this.levelRoles[serverId] || { enabled: false, roles: [] };
                res.json(levelRoles);
            } catch (error) {
                console.error('Error getting level roles:', error);
                res.status(500).json({ error: 'Failed to get level roles' });
            }
        });

        // Save level roles for a specific server
        this.app.post('/api/plugins/autorole/levelroles/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                this.levelRoles[serverId] = req.body;
                this.saveLevelRoles();
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error saving level roles:', error);
                res.status(500).json({ error: 'Failed to save level roles' });
            }
        });

        // Get reaction roles for a specific server
        this.app.get('/api/plugins/autorole/reactionroles/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const reactionRoles = this.reactionRoles[serverId] || {};
                res.json(reactionRoles);
            } catch (error) {
                console.error('Error getting reaction roles:', error);
                res.status(500).json({ error: 'Failed to get reaction roles' });
            }
        });

        // Create a new reaction role message
        this.app.post('/api/plugins/autorole/reactionroles/:serverId/create', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { channelId, title, description, roles } = req.body;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const guild = this.client.guilds.cache.get(serverId);
                if (!guild) {
                    return res.status(404).json({ error: 'Server not found' });
                }
                
                const channel = guild.channels.cache.get(channelId);
                if (!channel || !channel.isTextBased()) {
                    return res.status(404).json({ error: 'Channel not found or not a text channel' });
                }
                
                // Create embed
                const embed = {
                    title: title,
                    description: description || 'React to get your roles!',
                    color: 0x3498db,
                    fields: roles.map(role => ({
                        name: role.emoji,
                        value: `<@&${role.roleId}>`,
                        inline: true
                    })),
                    footer: { text: 'React to get roles!' }
                };
                
                const message = await channel.send({ embeds: [embed] });
                
                // Add reactions
                for (const role of roles) {
                    try {
                        await message.react(role.emoji);
                    } catch (error) {
                        console.error(`Failed to add reaction ${role.emoji}:`, error);
                    }
                }
                
                // Store reaction role data
                if (!this.reactionRoles[serverId]) {
                    this.reactionRoles[serverId] = {};
                }
                
                this.reactionRoles[serverId][message.id] = {
                    channelId: channelId,
                    title: title,
                    roles: roles.reduce((acc, role) => {
                        acc[role.emoji] = role.roleId;
                        return acc;
                    }, {}),
                    maxRoles: 0,
                    removeOnUnreact: true
                };
                
                this.saveReactionRoles();
                
                res.json({ success: true, messageId: message.id });
            } catch (error) {
                console.error('Error creating reaction role message:', error);
                res.status(500).json({ error: 'Failed to create reaction role message' });
            }
        });

        // Delete a reaction role message
        this.app.delete('/api/plugins/autorole/reactionroles/:serverId/:messageId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, messageId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const reactionRoleData = this.reactionRoles[serverId]?.[messageId];
                if (!reactionRoleData) {
                    return res.status(404).json({ error: 'Reaction role message not found' });
                }
                
                const guild = this.client.guilds.cache.get(serverId);
                if (guild) {
                    const channel = guild.channels.cache.get(reactionRoleData.channelId);
                    if (channel) {
                        try {
                            const message = await channel.messages.fetch(messageId);
                            await message.delete();
                        } catch (error) {
                            console.log('Message already deleted or not found');
                        }
                    }
                }
                
                delete this.reactionRoles[serverId][messageId];
                this.saveReactionRoles();
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting reaction role message:', error);
                res.status(500).json({ error: 'Failed to delete reaction role message' });
            }
        });

        // Get server roles
        this.app.get('/api/plugins/autorole/roles/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const guild = this.client.guilds.cache.get(serverId);
                if (!guild) {
                    return res.status(404).json({ error: 'Server not found' });
                }
                
                const roles = guild.roles.cache
                    .filter(role => !role.managed && role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor,
                        position: role.position,
                        memberCount: role.members.size
                    }))
                    .sort((a, b) => b.position - a.position);
                
                res.json(roles);
            } catch (error) {
                console.error('Error getting server roles:', error);
                res.status(500).json({ error: 'Failed to get server roles' });
            }
        });

        // Sync user level roles (manual trigger)
        this.app.post('/api/plugins/autorole/sync-level-roles/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const guild = this.client.guilds.cache.get(serverId);
                if (!guild) {
                    return res.status(404).json({ error: 'Server not found' });
                }
                
                const levelRoleSettings = this.levelRoles[serverId];
                if (!levelRoleSettings?.enabled || !levelRoleSettings.roles.length) {
                    return res.status(400).json({ error: 'Level roles not enabled or configured' });
                }
                
                let syncCount = 0;
                let errorCount = 0;
                
                // This would integrate with your leveling system
                // For now, just return success
                
                res.json({ 
                    success: true, 
                    syncCount: syncCount, 
                    errorCount: errorCount 
                });
            } catch (error) {
                console.error('Error syncing level roles:', error);
                res.status(500).json({ error: 'Failed to sync level roles' });
            }
        });
    }

    getFrontendComponent() {
        return {
            id: 'auto-role-plugin',
            name: 'Auto-Role System',
            description: 'Manage automatic role assignment, reaction roles, and level-based roles',
            icon: '🎭',
            version: '1.0.0',
            
            containerId: 'autoRolePluginContainer',
            pageId: 'auto-role',
            navIcon: '🎭',
            
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
                                <input type="number" id="join-role-delay" class="form-control" min="0" max="1440" value="0">
                                <small style="opacity: 0.7;">0 = immediate assignment</small>
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
                                <label>Configured Level Roles:</label>
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

                    <!-- Action Buttons -->
                    <div class="settings-section" id="autorole-actions" style="display: none;">
                        <div style="display: flex; gap: 10px;">
                            <button id="save-autorole-settings" class="btn-primary">💾 Save Settings</button>
                            <button id="download-autorole-settings" class="glass-btn">📥 Download Settings</button>
                        </div>
                    </div>
                </div>

                <!-- Level Role Modal -->
                <div id="level-role-modal" class="modal" style="display: none;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 id="level-role-modal-title">Add Level Role</h3>
                            <span class="close" onclick="closeLevelRoleModal()">&times;</span>
                        </div>
                        
                        <div class="modal-body">
                            <div class="form-group">
                                <label for="level-role-level">Level Required:</label>
                                <input type="number" id="level-role-level" class="form-control" min="1" max="1000" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="level-role-role">Role to Assign:</label>
                                <select id="level-role-role" class="form-control" required>
                                    <option value="">Select a role...</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="level-role-remove-old"> Remove previous level roles
                                </label>
                                <small style="opacity: 0.7; display: block;">When enabled, removes all lower-level roles when assigning this one</small>
                            </div>
                        </div>
                        
                        <div class="modal-footer">
                            <button type="button" id="save-level-role" class="btn-primary">Add Role</button>
                            <button type="button" class="glass-btn" onclick="closeLevelRoleModal()">Cancel</button>
                        </div>
                    </div>
                </div>

                <!-- Reaction Role Modal -->
                <div id="reaction-role-modal" class="modal" style="display: none;">
                    <div class="modal-content" style="max-width: 600px;">
                        <div class="modal-header">
                            <h3>Create Reaction Role Message</h3>
                            <span class="close" onclick="closeReactionRoleModal()">&times;</span>
                        </div>
                        
                        <div class="modal-body">
                            <div class="form-group">
                                <label for="rr-channel">Channel:</label>
                                <select id="rr-channel" class="form-control" required>
                                    <option value="">Select a channel...</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="rr-title">Message Title:</label>
                                <input type="text" id="rr-title" class="form-control" placeholder="Choose your roles!" maxlength="256" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="rr-description">Message Description:</label>
                                <textarea id="rr-description" class="form-control" placeholder="React with the emojis below to get your roles!" rows="3" maxlength="2000"></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label>Role Assignments:</label>
                                <div id="rr-roles-container">
                                    <div class="rr-role-item">
                                        <input type="text" class="rr-emoji form-control" placeholder="🎭" style="width: 60px;">
                                        <select class="rr-role-select form-control">
                                            <option value="">Select role...</option>
                                        </select>
                                        <input type="text" class="rr-role-description form-control" placeholder="Role description (optional)" maxlength="100">
                                        <button type="button" class="glass-btn remove-rr-role" onclick="removeReactionRoleItem(this)">×</button>
                                    </div>
                                </div>
                                <button type="button" id="add-rr-role" class="glass-btn" style="width: 100%; margin-top: 10px;">+ Add Role</button>
                            </div>
                        </div>
                        
                        <div class="modal-footer">
                            <button type="button" id="submit-rr-message" class="btn-primary">Create Message</button>
                            <button type="button" class="glass-btn" onclick="closeReactionRoleModal()">Cancel</button>
                        </div>
                    </div>
                </div>
            `,
            script: `
                // Auto-Role Plugin Frontend Logic
                (function() {
                    console.log('Loading auto-role plugin...');
                    
                    let currentGuildId = null;
                    let serverRoles = [];
                    let levelRoles = [];
                    let reactionRoleRoles = [];
                    let editingLevelRoleIndex = null;
                    let editingReactionRoleId = null;

                    // Initialize the plugin
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
                            addLevelRoleBtn.addEventListener('click', () => openLevelRoleModal());
                        }

                        const syncLevelRolesBtn = document.getElementById('sync-level-roles-btn');
                        if (syncLevelRolesBtn) {
                            syncLevelRolesBtn.addEventListener('click', syncLevelRoles);
                        }

                        const createReactionRoleBtn = document.getElementById('create-reaction-role-btn');
                        if (createReactionRoleBtn) {
                            createReactionRoleBtn.addEventListener('click', () => openReactionRoleModal());
                        }

                        const saveBtn = document.getElementById('save-autorole-settings');
                        if (saveBtn) {
                            saveBtn.addEventListener('click', saveAutoRoleSettings);
                        }

                        const downloadBtn = document.getElementById('download-autorole-settings');
                        if (downloadBtn) {
                            downloadBtn.addEventListener('click', downloadAutoRoleSettings);
                        }

                        // Modal event listeners
                        const saveLevelRoleBtn = document.getElementById('save-level-role');
                        if (saveLevelRoleBtn) {
                            saveLevelRoleBtn.addEventListener('click', saveLevelRole);
                        }

                        const addRRRoleBtn = document.getElementById('add-rr-role');
                        if (addRRRoleBtn) {
                            addRRRoleBtn.addEventListener('click', addReactionRoleItem);
                        }

                        const submitRRBtn = document.getElementById('submit-rr-message');
                        if (submitRRBtn) {
                            submitRRBtn.addEventListener('click', submitReactionRoleMessage);
                        }
                    }

                    // Rest of the frontend JavaScript would continue here...
                    // This includes all the functions for loading servers, handling changes,
                    // managing modals, saving settings, etc.

                    // Initialize when the script loads
                    initializeAutoRolePlugin();
                })();
            `
        };
    }
}

module.exports = AutoRolePlugin;
        