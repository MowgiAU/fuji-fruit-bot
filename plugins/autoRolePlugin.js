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
            const dataDir = './data';
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }
            fs.writeFileSync('./data/autoRoleSettings.json', JSON.stringify(this.autoRoleSettings, null, 2));
        } catch (error) {
            console.error('Error saving auto-role settings:', error);
        }
    }

    saveReactionRoles() {
        try {
            const dataDir = './data';
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }
            fs.writeFileSync('./data/reactionRoles.json', JSON.stringify(this.reactionRoles, null, 2));
        } catch (error) {
            console.error('Error saving reaction roles:', error);
        }
    }

    saveLevelRoles() {
        try {
            const dataDir = './data';
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }
            fs.writeFileSync('./data/levelRoles.json', JSON.stringify(this.levelRoles, null, 2));
        } catch (error) {
            console.error('Error saving level roles:', error);
        }
    }

    setupRoutes() {
        // Get all auto-role settings for a server
        this.app.get('/api/plugins/autorole/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const settings = this.autoRoleSettings[serverId] || {
                    joinRoles: {
                        enabled: false,
                        roles: [],
                        delay: 0,
                        excludeBots: true,
                        minAccountAge: 0
                    },
                    logChannelId: null
                };
                
                res.json(settings);
            } catch (error) {
                console.error('Error getting auto-role settings:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Update auto-role settings
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
                console.error('Error updating auto-role settings:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Get level roles for a server
        this.app.get('/api/plugins/autorole/levelroles/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const levelRoles = this.levelRoles[serverId] || {
                    enabled: false,
                    roles: [], // { level: number, roleId: string, removeOldRoles: boolean }
                    logChannelId: null
                };
                
                res.json(levelRoles);
            } catch (error) {
                console.error('Error getting level roles:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Update level roles
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
                console.error('Error updating level roles:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Get reaction roles for a server
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
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Create reaction role message
        this.app.post('/api/plugins/autorole/reactionroles/:serverId/create', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                const { channelId, title, description, roles, maxRoles, removeOnUnreact } = req.body;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                const guild = this.client.guilds.cache.get(serverId);
                const channel = guild.channels.cache.get(channelId);
                
                if (!channel) {
                    return res.status(404).json({ error: 'Channel not found' });
                }
                
                // Create embed
                const embed = {
                    color: 0x7289da,
                    title: title || 'Role Selection',
                    description: description || 'React to get roles!',
                    fields: [],
                    footer: {
                        text: maxRoles > 0 ? `Maximum ${maxRoles} role(s) allowed` : 'No role limit'
                    },
                    timestamp: new Date().toISOString()
                };
                
                // Add role fields and collect emojis
                const emojiMap = {};
                for (const roleData of roles) {
                    const role = guild.roles.cache.get(roleData.roleId);
                    if (role) {
                        embed.fields.push({
                            name: roleData.emoji,
                            value: `${role.name}${roleData.description ? '\n' + roleData.description : ''}`,
                            inline: true
                        });
                        emojiMap[roleData.emoji] = roleData.roleId;
                    }
                }
                
                // Send message
                const message = await channel.send({ embeds: [embed] });
                
                // Add reactions
                for (const emoji of Object.keys(emojiMap)) {
                    try {
                        await message.react(emoji);
                    } catch (error) {
                        console.error(`Error adding reaction ${emoji}:`, error);
                    }
                }
                
                // Store reaction role data
                if (!this.reactionRoles[serverId]) {
                    this.reactionRoles[serverId] = {};
                }
                
                this.reactionRoles[serverId][message.id] = {
                    channelId: channelId,
                    messageId: message.id,
                    title: title,
                    description: description,
                    roles: emojiMap,
                    maxRoles: maxRoles || 0,
                    removeOnUnreact: removeOnUnreact !== false,
                    createdAt: new Date().toISOString()
                };
                
                this.saveReactionRoles();
                
                res.json({ 
                    success: true, 
                    messageId: message.id,
                    message: 'Reaction role message created successfully'
                });
                
            } catch (error) {
                console.error('Error creating reaction role message:', error);
                res.status(500).json({ error: 'Failed to create reaction role message' });
            }
        });

        // Delete reaction role message
        this.app.delete('/api/plugins/autorole/reactionroles/:serverId/:messageId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, messageId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                if (this.reactionRoles[serverId] && this.reactionRoles[serverId][messageId]) {
                    const reactionRole = this.reactionRoles[serverId][messageId];
                    
                    // Try to delete the message
                    try {
                        const guild = this.client.guilds.cache.get(serverId);
                        const channel = guild.channels.cache.get(reactionRole.channelId);
                        if (channel) {
                            const message = await channel.messages.fetch(messageId);
                            if (message) {
                                await message.delete();
                            }
                        }
                    } catch (error) {
                        console.log('Could not delete message (may already be deleted):', error.message);
                    }
                    
                    delete this.reactionRoles[serverId][messageId];
                    this.saveReactionRoles();
                }
                
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
                
                const result = await this.syncAllLevelRoles(serverId);
                res.json(result);
            } catch (error) {
                console.error('Error syncing level roles:', error);
                res.status(500).json({ error: 'Failed to sync level roles' });
            }
        });
    }

    setupEventListeners() {
        // Member join event
        this.client.on('guildMemberAdd', async (member) => {
            await this.handleMemberJoin(member);
        });

        // Reaction add event
        this.client.on('messageReactionAdd', async (reaction, user) => {
            await this.handleReactionAdd(reaction, user);
        });

        // Reaction remove event
        this.client.on('messageReactionRemove', async (reaction, user) => {
            await this.handleReactionRemove(reaction, user);
        });

        // Listen for level ups from the leveling plugin
        this.client.on('levelUp', async (userId, guildId, newLevel, oldLevel) => {
            await this.handleLevelUp(userId, guildId, newLevel, oldLevel);
        });
    }

    async handleMemberJoin(member) {
        try {
            const guildId = member.guild.id;
            const settings = this.autoRoleSettings[guildId];
            
            if (!settings || !settings.joinRoles.enabled || !settings.joinRoles.roles.length) {
                return;
            }
            
            // Check if member is a bot and should be excluded
            if (member.user.bot && settings.joinRoles.excludeBots) {
                return;
            }
            
            // Check account age
            if (settings.joinRoles.minAccountAge > 0) {
                const accountAge = Date.now() - member.user.createdTimestamp;
                const minAge = settings.joinRoles.minAccountAge * 24 * 60 * 60 * 1000; // Convert days to ms
                
                if (accountAge < minAge) {
                    console.log(`Member ${member.user.tag} account too new for auto-roles`);
                    return;
                }
            }
            
            const assignRoles = async () => {
                try {
                    const rolesToAdd = settings.joinRoles.roles.filter(roleId => {
                        const role = member.guild.roles.cache.get(roleId);
                        return role && !member.roles.cache.has(roleId);
                    });
                    
                    if (rolesToAdd.length > 0) {
                        await member.roles.add(rolesToAdd, 'Auto-role on join');
                        
                        // Log to channel if configured
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
            
            // Apply delay if configured
            if (settings.joinRoles.delay > 0) {
                setTimeout(assignRoles, settings.joinRoles.delay * 60 * 1000); // Convert minutes to ms
            } else {
                await assignRoles();
            }
            
        } catch (error) {
            console.error('Error handling member join for auto-roles:', error);
        }
    }

    async handleReactionAdd(reaction, user) {
        try {
            // Ignore bot reactions
            if (user.bot) return;
            
            // Handle partial reactions
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
            
            // Check if this is a reaction role message
            const reactionRoleData = this.reactionRoles[guildId]?.[messageId];
            if (!reactionRoleData) return;
            
            const emoji = reaction.emoji.name || reaction.emoji.toString();
            const roleId = reactionRoleData.roles[emoji];
            
            if (!roleId) return;
            
            const member = reaction.message.guild.members.cache.get(user.id);
            if (!member) return;
            
            const role = reaction.message.guild.roles.cache.get(roleId);
            if (!role) return;
            
            // Check if member already has the role
            if (member.roles.cache.has(roleId)) {
                return;
            }
            
            // Check max roles limit
            if (reactionRoleData.maxRoles > 0) {
                const currentReactionRoles = Object.values(reactionRoleData.roles);
                const memberReactionRoles = member.roles.cache.filter(role => 
                    currentReactionRoles.includes(role.id)
                );
                
                if (memberReactionRoles.size >= reactionRoleData.maxRoles) {
                    // Remove user's reaction
                    try {
                        await reaction.users.remove(user.id);
                    } catch (error) {
                        console.error('Could not remove reaction:', error);
                    }
                    
                    // Send temporary message
                    try {
                        const msg = await reaction.message.channel.send(
                            `${user}, you can only have ${reactionRoleData.maxRoles} role(s) from this message.`
                        );
                        setTimeout(() => msg.delete().catch(() => {}), 5000);
                    } catch (error) {
                        console.error('Could not send max roles message:', error);
                    }
                    
                    return;
                }
            }
            
            // Add the role
            try {
                await member.roles.add(roleId, 'Reaction role');
                
                // Log the role assignment
                await this.logAutoRole(reaction.message.guild, {
                    type: 'reaction_role_add',
                    user: user,
                    roles: [role],
                    reason: `Reacted with ${emoji}`,
                    messageId: messageId
                });
                
            } catch (error) {
                console.error(`Error adding reaction role to ${user.tag}:`, error);
            }
            
        } catch (error) {
            console.error('Error handling reaction add:', error);
        }
    }

    async handleReactionRemove(reaction, user) {
        try {
            // Ignore bot reactions
            if (user.bot) return;
            
            // Handle partial reactions
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
            
            // Check if this is a reaction role message
            const reactionRoleData = this.reactionRoles[guildId]?.[messageId];
            if (!reactionRoleData || !reactionRoleData.removeOnUnreact) return;
            
            const emoji = reaction.emoji.name || reaction.emoji.toString();
            const roleId = reactionRoleData.roles[emoji];
            
            if (!roleId) return;
            
            const member = reaction.message.guild.members.cache.get(user.id);
            if (!member) return;
            
            const role = reaction.message.guild.roles.cache.get(roleId);
            if (!role) return;
            
            // Check if member has the role
            if (!member.roles.cache.has(roleId)) {
                return;
            }
            
            // Remove the role
            try {
                await member.roles.remove(roleId, 'Reaction role removed');
                
                // Log the role removal
                await this.logAutoRole(reaction.message.guild, {
                    type: 'reaction_role_remove',
                    user: user,
                    roles: [role],
                    reason: `Removed reaction ${emoji}`,
                    messageId: messageId
                });
                
            } catch (error) {
                console.error(`Error removing reaction role from ${user.tag}:`, error);
            }
            
        } catch (error) {
            console.error('Error handling reaction remove:', error);
        }
    }

    async handleLevelUp(userId, guildId, newLevel, oldLevel) {
        try {
            const settings = this.levelRoles[guildId];
            if (!settings || !settings.enabled || !settings.roles.length) {
                return;
            }
            
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) return;
            
            const member = guild.members.cache.get(userId);
            if (!member) return;
            
            // Find roles that should be assigned for this level
            const rolesToAdd = settings.roles.filter(levelRole => 
                levelRole.level === newLevel && 
                !member.roles.cache.has(levelRole.roleId)
            );
            
            // Find roles that should be removed (if user leveled past them and removeOldRoles is true)
            const rolesToRemove = settings.roles.filter(levelRole => 
                levelRole.level < newLevel && 
                levelRole.removeOldRoles &&
                member.roles.cache.has(levelRole.roleId)
            );
            
            // Add new roles
            for (const levelRole of rolesToAdd) {
                const role = guild.roles.cache.get(levelRole.roleId);
                if (role) {
                    try {
                        await member.roles.add(levelRole.roleId, `Level ${newLevel} role`);
                        
                        // Log the role assignment
                        await this.logAutoRole(guild, {
                            type: 'level_role_add',
                            user: member.user,
                            roles: [role],
                            reason: `Reached level ${newLevel}`,
                            level: newLevel
                        });
                    } catch (error) {
                        console.error(`Error adding level role to ${member.user.tag}:`, error);
                    }
                }
            }
            
            // Remove old roles
            for (const levelRole of rolesToRemove) {
                const role = guild.roles.cache.get(levelRole.roleId);
                if (role) {
                    try {
                        await member.roles.remove(levelRole.roleId, `Level ${newLevel} role upgrade`);
                        
                        // Log the role removal
                        await this.logAutoRole(guild, {
                            type: 'level_role_remove',
                            user: member.user,
                            roles: [role],
                            reason: `Upgraded from level ${levelRole.level} to ${newLevel}`,
                            level: newLevel
                        });
                    } catch (error) {
                        console.error(`Error removing old level role from ${member.user.tag}:`, error);
                    }
                }
            }
            
        } catch (error) {
            console.error('Error handling level up for auto-roles:', error);
        }
    }

    async syncAllLevelRoles(guildId) {
        try {
            const settings = this.levelRoles[guildId];
            if (!settings || !settings.enabled || !settings.roles.length) {
                return { success: false, message: 'Level roles not configured' };
            }
            
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                return { success: false, message: 'Guild not found' };
            }
            
            // Load leveling data
            const levelingDataPath = './data/levelingData.json';
            if (!fs.existsSync(levelingDataPath)) {
                return { success: false, message: 'Leveling data not found' };
            }
            
            const levelingData = JSON.parse(fs.readFileSync(levelingDataPath, 'utf8'));
            
            let syncCount = 0;
            let errorCount = 0;
            
            // Process each user in the guild who has leveling data
            for (const [userId, guilds] of Object.entries(levelingData.users || {})) {
                if (!guilds[guildId]) continue;
                
                const userLevel = guilds[guildId].level || 0;
                const member = guild.members.cache.get(userId);
                
                if (!member) continue;
                
                try {
                    // Find roles that should be assigned for this user's level
                    const shouldHaveRoles = settings.roles.filter(levelRole => 
                        levelRole.level <= userLevel
                    );
                    
                    // Sort by level descending to handle removeOldRoles properly
                    shouldHaveRoles.sort((a, b) => b.level - a.level);
                    
                    const rolesToAdd = [];
                    const rolesToRemove = [];
                    
                    for (const levelRole of shouldHaveRoles) {
                        const hasRole = member.roles.cache.has(levelRole.roleId);
                        const role = guild.roles.cache.get(levelRole.roleId);
                        
                        if (!role) continue;
                        
                        // If this is the highest level role they should have, add it
                        if (levelRole.level === Math.max(...shouldHaveRoles.map(r => r.level))) {
                            if (!hasRole) {
                                rolesToAdd.push(levelRole.roleId);
                            }
                        } else if (levelRole.removeOldRoles && hasRole) {
                            // Remove lower level roles if removeOldRoles is true
                            rolesToRemove.push(levelRole.roleId);
                        }
                    }
                    
                    // Apply role changes
                    if (rolesToAdd.length > 0) {
                        await member.roles.add(rolesToAdd, 'Level role sync');
                    }
                    
                    if (rolesToRemove.length > 0) {
                        await member.roles.remove(rolesToRemove, 'Level role sync - remove old');
                    }
                    
                    if (rolesToAdd.length > 0 || rolesToRemove.length > 0) {
                        syncCount++;
                    }
                    
                } catch (error) {
                    console.error(`Error syncing level roles for ${member.user.tag}:`, error);
                    errorCount++;
                }
            }
            
            return {
                success: true,
                message: `Synced roles for ${syncCount} members`,
                syncCount,
                errorCount
            };
            
        } catch (error) {
            console.error('Error syncing all level roles:', error);
            return { success: false, message: 'Internal error during sync' };
        }
    }

    async logAutoRole(guild, data) {
        try {
            const guildId = guild.id;
            const settings = this.autoRoleSettings[guildId];
            
            if (!settings || !settings.logChannelId) return;
            
            const logChannel = guild.channels.cache.get(settings.logChannelId);
            if (!logChannel) return;
            
            const typeEmojis = {
                'join_roles': '👋',
                'reaction_role_add': '➕',
                'reaction_role_remove': '➖',
                'level_role_add': '📈',
                'level_role_remove': '📉'
            };
            
            const typeNames = {
                'join_roles': 'Join Roles',
                'reaction_role_add': 'Reaction Role Added',
                'reaction_role_remove': 'Reaction Role Removed',
                'level_role_add': 'Level Role Added',
                'level_role_remove': 'Level Role Removed'
            };
            
            const embed = {
                color: data.type.includes('remove') ? 0xff6b6b : 0x4CAF50,
                title: `${typeEmojis[data.type]} ${typeNames[data.type]}`,
                fields: [
                    {
                        name: 'User',
                        value: `${data.user} (${data.user.tag})`,
                        inline: true
                    },
                    {
                        name: 'Roles',
                        value: data.roles.map(role => `<@&${role.id}>`).join(', '),
                        inline: true
                    },
                    {
                        name: 'Reason',
                        value: data.reason,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `User ID: ${data.user.id}`
                }
            };
            
            if (data.level) {
                embed.fields.push({
                    name: 'Level',
                    value: data.level.toString(),
                    inline: true
                });
            }
            
            if (data.messageId) {
                embed.fields.push({
                    name: 'Message',
                    value: `[Jump to Message](https://discord.com/channels/${guild.id}/${logChannel.id}/${data.messageId})`,
                    inline: true
                });
            }
            
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error logging auto-role action:', error);
        }
    }

    getFrontendComponent() {
        return {
            id: 'auto-role-plugin',
            name: 'Auto-Role System',
            description: 'Manage automatic role assignment, reaction roles, and level-based roles',
            icon: '🎭',
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
                                <input type="number" id="join-roles-delay" class="form-control" min="0" max="1440" value="0">
                                <small style="opacity: 0.7;">0 = assign immediately</small>
                            </div>
                            
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="join-roles-exclude-bots" checked> Exclude Bots
                                </label>
                            </div>
                            
                            <div class="form-group">
                                <label>Minimum Account Age (days):</label>
                                <input type="number" id="join-roles-min-age" class="form-control" min="0" max="365" value="0">
                                <small style="opacity: 0.7;">0 = no age requirement</small>
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
                                <label>Level Roles:</label>
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

                    <!-- Log Channel Section -->
                    <div class="settings-section" id="log-channel-section" style="display: none;">
                        <h3>📝 Logging</h3>
                        <div class="form-group">
                            <label>Log Channel:</label>
                            <select id="log-channel-select" class="form-control">
                                <option value="">No logging</option>
                            </select>
                        </div>
                    </div>

                    <!-- Save Button -->
                    <div class="settings-section" id="save-section" style="display: none;">
                        <button id="save-autorole-settings" class="btn-primary">
                            <span class="btn-text">Save Settings</span>
                            <span class="btn-loader" style="display: none;">Saving...</span>
                        </button>
                    </div>
                </div>

                <!-- Level Role Modal -->
                <div id="level-role-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center;">
                    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 15px; padding: 2rem; max-width: 500px; width: 90%; border: 1px solid rgba(255,255,255,0.2);">
                        <h3 style="margin-bottom: 1rem; color: white;">Add Level Role</h3>
                        
                        <div class="form-group">
                            <label for="level-role-level">Level:</label>
                            <input type="number" id="level-role-level" class="form-control" min="1" max="999" placeholder="Level required">
                        </div>
                        
                        <div class="form-group">
                            <label for="level-role-role">Role:</label>
                            <select id="level-role-role" class="form-control">
                                <option value="">Select a role...</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="level-role-remove-old"> Remove Lower Level Roles
                            </label>
                            <small style="opacity: 0.7; display: block; margin-top: 4px;">
                                Automatically remove roles from lower levels when this role is assigned
                            </small>
                        </div>
                        
                        <div style="display: flex; gap: 10px; margin-top: 1.5rem;">
                            <button type="button" id="save-level-role" class="btn-primary">Add Role</button>
                            <button type="button" id="cancel-level-role" class="glass-btn">Cancel</button>
                        </div>
                    </div>
                </div>

                <!-- Reaction Role Modal -->
                <div id="reaction-role-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center; overflow-y: auto;">
                    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 15px; padding: 2rem; max-width: 700px; width: 90%; max-height: 90vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.2); margin: 20px;">
                        <h3 style="margin-bottom: 1rem; color: white;">Create Reaction Role Message</h3>
                        
                        <div class="form-group">
                            <label for="rr-channel">Channel:</label>
                            <select id="rr-channel" class="form-control">
                                <option value="">Select a channel...</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="rr-title">Title:</label>
                            <input type="text" id="rr-title" class="form-control" placeholder="Role Selection" maxlength="256">
                        </div>
                        
                        <div class="form-group">
                            <label for="rr-description">Description:</label>
                            <textarea id="rr-description" class="form-control" rows="3" placeholder="React to get roles!" maxlength="2048"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="rr-max-roles">Maximum Roles (0 = unlimited):</label>
                            <input type="number" id="rr-max-roles" class="form-control" min="0" max="20" value="0">
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="rr-remove-on-unreact" checked> Remove Role When Unreacted
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label>Roles:</label>
                            <div id="rr-roles-list" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                                <div id="no-rr-roles" style="opacity: 0.6; text-align: center; padding: 20px;">
                                    No roles added yet
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <input type="text" id="rr-emoji" class="form-control" placeholder="Emoji (e.g., 🎮)" maxlength="2" style="max-width: 80px;">
                                <select id="rr-role" class="form-control" style="flex: 1;">
                                    <option value="">Select role...</option>
                                </select>
                                <button type="button" id="add-rr-role" class="glass-btn">Add</button>
                            </div>
                            
                            <div class="form-group">
                                <label for="rr-role-description">Role Description (optional):</label>
                                <input type="text" id="rr-role-description" class="form-control" placeholder="Additional description for this role" maxlength="100">
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; margin-top: 1.5rem;">
                            <button type="button" id="create-rr-message" class="btn-primary">Create Message</button>
                            <button type="button" id="cancel-rr-message" class="glass-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            `,
            script: `
                console.log('Loading auto-role plugin...');
                
                (function() {
                    let currentGuildId = null;
                    let serverRoles = [];
                    let levelRoles = [];
                    let reactionRoleRoles = [];

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

                        // Join roles
                        const joinRolesEnabled = document.getElementById('join-roles-enabled');
                        if (joinRolesEnabled) {
                            joinRolesEnabled.addEventListener('change', toggleJoinRolesConfig);
                        }

                        // Level roles
                        const levelRolesEnabled = document.getElementById('level-roles-enabled');
                        if (levelRolesEnabled) {
                            levelRolesEnabled.addEventListener('change', toggleLevelRolesConfig);
                        }

                        const addLevelRoleBtn = document.getElementById('add-level-role-btn');
                        if (addLevelRoleBtn) {
                            addLevelRoleBtn.addEventListener('click', openLevelRoleModal);
                        }

                        const syncLevelRolesBtn = document.getElementById('sync-level-roles-btn');
                        if (syncLevelRolesBtn) {
                            syncLevelRolesBtn.addEventListener('click', syncLevelRoles);
                        }

                        // Reaction roles
                        const createReactionRoleBtn = document.getElementById('create-reaction-role-btn');
                        if (createReactionRoleBtn) {
                            createReactionRoleBtn.addEventListener('click', openReactionRoleModal);
                        }

                        // Save button
                        const saveBtn = document.getElementById('save-autorole-settings');
                        if (saveBtn) {
                            saveBtn.addEventListener('click', saveAutoRoleSettings);
                        }

                        // Modal event listeners
                        setupModalEventListeners();
                    }

                    function setupModalEventListeners() {
                        // Level role modal
                        const saveLevelRole = document.getElementById('save-level-role');
                        if (saveLevelRole) {
                            saveLevelRole.addEventListener('click', saveLevelRole_handler);
                        }

                        const cancelLevelRole = document.getElementById('cancel-level-role');
                        if (cancelLevelRole) {
                            cancelLevelRole.addEventListener('click', closeLevelRoleModal);
                        }

                        // Reaction role modal
                        const addRRRole = document.getElementById('add-rr-role');
                        if (addRRRole) {
                            addRRRole.addEventListener('click', addReactionRoleRole);
                        }

                        const createRRMessage = document.getElementById('create-rr-message');
                        if (createRRMessage) {
                            createRRMessage.addEventListener('click', createReactionRoleMessage);
                        }

                        const cancelRRMessage = document.getElementById('cancel-rr-message');
                        if (cancelRRMessage) {
                            cancelRRMessage.addEventListener('click', closeReactionRoleModal);
                        }

                        // Close modals when clicking outside
                        const levelRoleModal = document.getElementById('level-role-modal');
                        if (levelRoleModal) {
                            levelRoleModal.addEventListener('click', function(e) {
                                if (e.target === levelRoleModal) closeLevelRoleModal();
                            });
                        }

                        const reactionRoleModal = document.getElementById('reaction-role-modal');
                        if (reactionRoleModal) {
                            reactionRoleModal.addEventListener('click', function(e) {
                                if (e.target === reactionRoleModal) closeReactionRoleModal();
                            });
                        }
                    }

                    async function loadAutoRoleServers() {
                        try {
                            const response = await fetch('/api/servers');
                            const servers = await response.json();
                            
                            const select = document.getElementById('autorole-server-select');
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

                    async function handleServerChange() {
                        const serverSelect = document.getElementById('autorole-server-select');
                        currentGuildId = serverSelect ? serverSelect.value : null;
                        
                        if (currentGuildId) {
                            await Promise.all([
                                loadServerRoles(),
                                loadChannels(),
                                loadAutoRoleSettings(),
                                loadLevelRoles(),
                                loadReactionRoles()
                            ]);
                            showSections();
                        } else {
                            hideSections();
                        }
                    }

                    function showSections() {
                        const sections = [
                            'join-roles-section',
                            'level-roles-section', 
                            'reaction-roles-section',
                            'log-channel-section',
                            'save-section'
                        ];
                        
                        sections.forEach(sectionId => {
                            const section = document.getElementById(sectionId);
                            if (section) section.style.display = 'block';
                        });
                    }

                    function hideSections() {
                        const sections = [
                            'join-roles-section',
                            'level-roles-section',
                            'reaction-roles-section', 
                            'log-channel-section',
                            'save-section'
                        ];
                        
                        sections.forEach(sectionId => {
                            const section = document.getElementById(sectionId);
                            if (section) section.style.display = 'none';
                        });
                    }

                    async function loadServerRoles() {
                        try {
                            const response = await fetch(\`/api/plugins/autorole/roles/\${currentGuildId}\`);
                            serverRoles = await response.json();
                            
                            populateRoleSelects();
                        } catch (error) {
                            console.error('Error loading server roles:', error);
                        }
                    }

                    function populateRoleSelects() {
                        const selects = [
                            'join-roles-select',
                            'level-role-role',
                            'rr-role'
                        ];
                        
                        selects.forEach(selectId => {
                            const select = document.getElementById(selectId);
                            if (select) {
                                const isMultiple = select.hasAttribute('multiple');
                                select.innerHTML = isMultiple ? '' : '<option value="">Select a role...</option>';
                                
                                serverRoles.forEach(role => {
                                    const option = document.createElement('option');
                                    option.value = role.id;
                                    option.textContent = \`\${role.name} (\${role.memberCount} members)\`;
                                    option.style.color = role.color || '#ffffff';
                                    select.appendChild(option);
                                });
                            }
                        });
                    }

                    async function loadChannels() {
                        try {
                            const response = await fetch(\`/api/channels/\${currentGuildId}\`);
                            const channels = await response.json();
                            
                            const selects = ['log-channel-select', 'rr-channel'];
                            
                            selects.forEach(selectId => {
                                const select = document.getElementById(selectId);
                                if (select) {
                                    const hasNoOption = selectId === 'log-channel-select';
                                    select.innerHTML = hasNoOption ? '<option value="">No logging</option>' : '<option value="">Select a channel...</option>';
                                    
                                    channels.forEach(channel => {
                                        const option = document.createElement('option');
                                        option.value = channel.id;
                                        option.textContent = \`# \${channel.name}\`;
                                        select.appendChild(option);
                                    });
                                }
                            });
                        } catch (error) {
                            console.error('Error loading channels:', error);
                        }
                    }

                    async function loadAutoRoleSettings() {
                        try {
                            const response = await fetch(\`/api/plugins/autorole/settings/\${currentGuildId}\`);
                            const settings = await response.json();
                            
                            // Join roles
                            const joinRolesEnabled = document.getElementById('join-roles-enabled');
                            if (joinRolesEnabled) {
                                joinRolesEnabled.checked = settings.joinRoles?.enabled || false;
                                toggleJoinRolesConfig();
                            }
                            
                            const joinRolesSelect = document.getElementById('join-roles-select');
                            if (joinRolesSelect && settings.joinRoles?.roles) {
                                Array.from(joinRolesSelect.options).forEach(option => {
                                    option.selected = settings.joinRoles.roles.includes(option.value);
                                });
                            }
                            
                            const joinRolesDelay = document.getElementById('join-roles-delay');
                            if (joinRolesDelay) {
                                joinRolesDelay.value = settings.joinRoles?.delay || 0;
                            }
                            
                            const joinRolesExcludeBots = document.getElementById('join-roles-exclude-bots');
                            if (joinRolesExcludeBots) {
                                joinRolesExcludeBots.checked = settings.joinRoles?.excludeBots !== false;
                            }
                            
                            const joinRolesMinAge = document.getElementById('join-roles-min-age');
                            if (joinRolesMinAge) {
                                joinRolesMinAge.value = settings.joinRoles?.minAccountAge || 0;
                            }
                            
                            // Log channel
                            const logChannelSelect = document.getElementById('log-channel-select');
                            if (logChannelSelect) {
                                logChannelSelect.value = settings.logChannelId || '';
                            }
                            
                        } catch (error) {
                            console.error('Error loading auto-role settings:', error);
                        }
                    }

                    async function loadLevelRoles() {
                        try {
                            const response = await fetch(\`/api/plugins/autorole/levelroles/\${currentGuildId}\`);
                            const settings = await response.json();
                            
                            const levelRolesEnabled = document.getElementById('level-roles-enabled');
                            if (levelRolesEnabled) {
                                levelRolesEnabled.checked = settings.enabled || false;
                                toggleLevelRolesConfig();
                            }
                            
                            levelRoles = settings.roles || [];
                            displayLevelRoles();
                            
                        } catch (error) {
                            console.error('Error loading level roles:', error);
                        }
                    }

                    function displayLevelRoles() {
                        const list = document.getElementById('level-roles-list');
                        if (!list) return;
                        
                        if (levelRoles.length === 0) {
                            list.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No level roles configured</div>';
                            return;
                        }
                        
                        list.innerHTML = '';
                        
                        levelRoles
                            .sort((a, b) => a.level - b.level)
                            .forEach((levelRole, index) => {
                                const role = serverRoles.find(r => r.id === levelRole.roleId);
                                const roleElement = document.createElement('div');
                                roleElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.1); border-radius: 8px; border-left: 4px solid #7289da;';
                                
                                roleElement.innerHTML = \`
                                    <div>
                                        <div style="font-weight: 600; margin-bottom: 4px;">Level \${levelRole.level}</div>
                                        <div style="font-size: 0.9rem; opacity: 0.8;">\${role ? role.name : 'Unknown Role'}</div>
                                        <div style="font-size: 0.8rem; opacity: 0.6; margin-top: 2px;">
                                            \${levelRole.removeOldRoles ? 'Removes lower level roles' : 'Keeps lower level roles'}
                                        </div>
                                    </div>
                                    <button type="button" onclick="window.removeLevelRole(\${index})" class="glass-btn-small">Remove</button>
                                \`;
                                list.appendChild(roleElement);
                            });
                    }

                    window.removeLevelRole = function(index) {
                        if (confirm('Remove this level role?')) {
                            levelRoles.splice(index, 1);
                            displayLevelRoles();
                        }
                    };

                    async function loadReactionRoles() {
                        try {
                            const response = await fetch(\`/api/plugins/autorole/reactionroles/\${currentGuildId}\`);
                            const reactionRoles = await response.json();
                            
                            displayReactionRoles(reactionRoles);
                            
                        } catch (error) {
                            console.error('Error loading reaction roles:', error);
                        }
                    }

                    function displayReactionRoles(reactionRoles) {
                        const list = document.getElementById('reaction-roles-list');
                        if (!list) return;
                        
                        const messages = Object.values(reactionRoles);
                        
                        if (messages.length === 0) {
                            list.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No reaction role messages</div>';
                            return;
                        }
                        
                        list.innerHTML = '';
                        
                        messages.forEach(message => {
                            const messageElement = document.createElement('div');
                            messageElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.1); border-radius: 8px; border-left: 4px solid #7289da;';
                            
                            const roleCount = Object.keys(message.roles).length;
                            const createdAt = new Date(message.createdAt).toLocaleDateString();
                            
                            messageElement.innerHTML = \`
                                <div>
                                    <div style="font-weight: 600; margin-bottom: 4px;">\${message.title || 'Reaction Role Message'}</div>
                                    <div style="font-size: 0.9rem; opacity: 0.8;">\${roleCount} role(s) • Created \${createdAt}</div>
                                    <div style="font-size: 0.8rem; opacity: 0.6; margin-top: 2px;">
                                        Max roles: \${message.maxRoles || 'Unlimited'} • Remove on unreact: \${message.removeOnUnreact ? 'Yes' : 'No'}
                                    </div>
                                </div>
                                <button type="button" onclick="window.deleteReactionRole('\${message.messageId}')" class="glass-btn-small">Delete</button>
                            \`;
                            list.appendChild(messageElement);
                        });
                    }

                    window.deleteReactionRole = async function(messageId) {
                        if (!confirm('Delete this reaction role message? This cannot be undone.')) return;
                        
                        try {
                            const response = await fetch(\`/api/plugins/autorole/reactionroles/\${currentGuildId}/\${messageId}\`, {
                                method: 'DELETE'
                            });
                            
                            if (response.ok) {
                                showNotification('Reaction role message deleted', 'success');
                                await loadReactionRoles();
                            } else {
                                throw new Error('Failed to delete message');
                            }
                        } catch (error) {
                            console.error('Error deleting reaction role:', error);
                            showNotification('Error deleting reaction role message', 'error');
                        }
                    };

                    function toggleJoinRolesConfig() {
                        const enabled = document.getElementById('join-roles-enabled');
                        const config = document.getElementById('join-roles-config');
                        
                        if (enabled && config) {
                            config.style.display = enabled.checked ? 'block' : 'none';
                        }
                    }

                    function toggleLevelRolesConfig() {
                        const enabled = document.getElementById('level-roles-enabled');
                        const config = document.getElementById('level-roles-config');
                        
                        if (enabled && config) {
                            config.style.display = enabled.checked ? 'block' : 'none';
                        }
                    }

                    function openLevelRoleModal() {
                        const modal = document.getElementById('level-role-modal');
                        if (modal) {
                            // Reset form
                            const levelInput = document.getElementById('level-role-level');
                            const roleSelect = document.getElementById('level-role-role');
                            const removeOldCheckbox = document.getElementById('level-role-remove-old');
                            
                            if (levelInput) levelInput.value = '';
                            if (roleSelect) roleSelect.value = '';
                            if (removeOldCheckbox) removeOldCheckbox.checked = false;
                            
                            modal.style.display = 'flex';
                        }
                    }

                    function closeLevelRoleModal() {
                        const modal = document.getElementById('level-role-modal');
                        if (modal) {
                            modal.style.display = 'none';
                        }
                    }

                    function saveLevelRole_handler() {
                        const levelInput = document.getElementById('level-role-level');
                        const roleSelect = document.getElementById('level-role-role');
                        const removeOldCheckbox = document.getElementById('level-role-remove-old');
                        
                        const level = levelInput ? parseInt(levelInput.value) : 0;
                        const roleId = roleSelect ? roleSelect.value : '';
                        const removeOldRoles = removeOldCheckbox ? removeOldCheckbox.checked : false;
                        
                        if (!level || level < 1) {
                            showNotification('Please enter a valid level', 'error');
                            return;
                        }
                        
                        if (!roleId) {
                            showNotification('Please select a role', 'error');
                            return;
                        }
                        
                        // Check if level already exists
                        if (levelRoles.some(lr => lr.level === level)) {
                            showNotification('A role is already configured for this level', 'error');
                            return;
                        }
                        
                        // Check if role is already used
                        if (levelRoles.some(lr => lr.roleId === roleId)) {
                            showNotification('This role is already used for another level', 'error');
                            return;
                        }
                        
                        levelRoles.push({
                            level: level,
                            roleId: roleId,
                            removeOldRoles: removeOldRoles
                        });
                        
                        displayLevelRoles();
                        closeLevelRoleModal();
                        showNotification('Level role added successfully', 'success');
                    }

                    function openReactionRoleModal() {
                        const modal = document.getElementById('reaction-role-modal');
                        if (modal) {
                            // Reset form
                            const inputs = [
                                'rr-channel',
                                'rr-title', 
                                'rr-description',
                                'rr-max-roles',
                                'rr-emoji',
                                'rr-role',
                                'rr-role-description'
                            ];
                            
                            inputs.forEach(inputId => {
                                const input = document.getElementById(inputId);
                                if (input) {
                                    if (input.type === 'checkbox') {
                                        input.checked = inputId === 'rr-remove-on-unreact';
                                    } else {
                                        input.value = '';
                                    }
                                }
                            });
                            
                            reactionRoleRoles = [];
                            displayReactionRoleRoles();
                            
                            modal.style.display = 'flex';
                        }
                    }

                    function closeReactionRoleModal() {
                        const modal = document.getElementById('reaction-role-modal');
                        if (modal) {
                            modal.style.display = 'none';
                        }
                    }

                    function addReactionRoleRole() {
                        const emojiInput = document.getElementById('rr-emoji');
                        const roleSelect = document.getElementById('rr-role');
                        const descriptionInput = document.getElementById('rr-role-description');
                        
                        const emoji = emojiInput ? emojiInput.value.trim() : '';
                        const roleId = roleSelect ? roleSelect.value : '';
                        const description = descriptionInput ? descriptionInput.value.trim() : '';
                        
                        if (!emoji) {
                            showNotification('Please enter an emoji', 'error');
                            return;
                        }
                        
                        if (!roleId) {
                            showNotification('Please select a role', 'error');
                            return;
                        }
                        
                        // Check if emoji or role already used
                        if (reactionRoleRoles.some(rr => rr.emoji === emoji)) {
                            showNotification('This emoji is already used', 'error');
                            return;
                        }
                        
                        if (reactionRoleRoles.some(rr => rr.roleId === roleId)) {
                            showNotification('This role is already used', 'error');
                            return;
                        }
                        
                        const role = serverRoles.find(r => r.id === roleId);
                        if (!role) {
                            showNotification('Role not found', 'error');
                            return;
                        }
                        
                        reactionRoleRoles.push({
                            emoji: emoji,
                            roleId: roleId,
                            roleName: role.name,
                            description: description
                        });
                        
                        // Clear inputs
                        if (emojiInput) emojiInput.value = '';
                        if (roleSelect) roleSelect.value = '';
                        if (descriptionInput) descriptionInput.value = '';
                        
                        displayReactionRoleRoles();
                        showNotification('Role added to message', 'success');
                    }

                    function displayReactionRoleRoles() {
                        const list = document.getElementById('rr-roles-list');
                        if (!list) return;
                        
                        if (reactionRoleRoles.length === 0) {
                            list.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No roles added yet</div>';
                            return;
                        }
                        
                        list.innerHTML = '';
                        
                        reactionRoleRoles.forEach((roleData, index) => {
                            const roleElement = document.createElement('div');
                            roleElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 6px;';
                            
                            roleElement.innerHTML = \`
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 1.2em;">\${roleData.emoji}</span>
                                    <div>
                                        <div style="font-weight: 600;">\${roleData.roleName}</div>
                                        \${roleData.description ? \`<div style="font-size: 0.8rem; opacity: 0.7;">\${roleData.description}</div>\` : ''}
                                    </div>
                                </div>
                                <button type="button" onclick="window.removeReactionRoleRole(\${index})" class="glass-btn-small">Remove</button>
                            \`;
                            list.appendChild(roleElement);
                        });
                    }

                    window.removeReactionRoleRole = function(index) {
                        reactionRoleRoles.splice(index, 1);
                        displayReactionRoleRoles();
                    };

                    async function createReactionRoleMessage() {
                        const channelSelect = document.getElementById('rr-channel');
                        const titleInput = document.getElementById('rr-title');
                        const descriptionInput = document.getElementById('rr-description');
                        const maxRolesInput = document.getElementById('rr-max-roles');
                        const removeOnUnreactInput = document.getElementById('rr-remove-on-unreact');
                        
                        const channelId = channelSelect ? channelSelect.value : '';
                        const title = titleInput ? titleInput.value.trim() : '';
                        const description = descriptionInput ? descriptionInput.value.trim() : '';
                        const maxRoles = maxRolesInput ? parseInt(maxRolesInput.value) : 0;
                        const removeOnUnreact = removeOnUnreactInput ? removeOnUnreactInput.checked : true;
                        
                        if (!channelId) {
                            showNotification('Please select a channel', 'error');
                            return;
                        }
                        
                        if (reactionRoleRoles.length === 0) {
                            showNotification('Please add at least one role', 'error');
                            return;
                        }
                        
                        try {
                            const createBtn = document.getElementById('create-rr-message');
                            if (createBtn) {
                                createBtn.disabled = true;
                                createBtn.textContent = 'Creating...';
                            }
                            
                            const response = await fetch(\`/api/plugins/autorole/reactionroles/\${currentGuildId}/create\`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    channelId: channelId,
                                    title: title,
                                    description: description,
                                    roles: reactionRoleRoles,
                                    maxRoles: maxRoles,
                                    removeOnUnreact: removeOnUnreact
                                })
                            });
                            
                            const result = await response.json();
                            
                            if (response.ok) {
                                showNotification('Reaction role message created successfully!', 'success');
                                closeReactionRoleModal();
                                await loadReactionRoles();
                            } else {
                                throw new Error(result.error || 'Failed to create message');
                            }
                        } catch (error) {
                            console.error('Error creating reaction role message:', error);
                            showNotification(error.message, 'error');
                        } finally {
                            const createBtn = document.getElementById('create-rr-message');
                            if (createBtn) {
                                createBtn.disabled = false;
                                createBtn.textContent = 'Create Message';
                            }
                        }
                    }

                    async function syncLevelRoles() {
                        try {
                            const syncBtn = document.getElementById('sync-level-roles-btn');
                            if (syncBtn) {
                                syncBtn.disabled = true;
                                syncBtn.innerHTML = '🔄 Syncing...';
                            }
                            
                            const response = await fetch(\`/api/plugins/autorole/sync-level-roles/\${currentGuildId}\`, {
                                method: 'POST'
                            });
                            
                            const result = await response.json();
                            
                            if (response.ok) {
                                showNotification(result.message, 'success');
                            } else {
                                throw new Error(result.error || 'Failed to sync level roles');
                            }
                        } catch (error) {
                            console.error('Error syncing level roles:', error);
                            showNotification(error.message, 'error');
                        } finally {
                            const syncBtn = document.getElementById('sync-level-roles-btn');
                            if (syncBtn) {
                                syncBtn.disabled = false;
                                syncBtn.innerHTML = '🔄 Sync All Level Roles';
                            }
                        }
                    }

                    async function saveAutoRoleSettings() {
                        if (!currentGuildId) {
                            showNotification('Please select a server', 'error');
                            return;
                        }
                        
                        try {
                            const saveBtn = document.getElementById('save-autorole-settings');
                            const btnText = saveBtn ? saveBtn.querySelector('.btn-text') : null;
                            const btnLoader = saveBtn ? saveBtn.querySelector('.btn-loader') : null;
                            
                            if (saveBtn) saveBtn.disabled = true;
                            if (btnText) btnText.style.display = 'none';
                            if (btnLoader) btnLoader.style.display = 'inline';
                            
                            // Collect join roles data
                            const joinRolesEnabled = document.getElementById('join-roles-enabled');
                            const joinRolesSelect = document.getElementById('join-roles-select');
                            const joinRolesDelay = document.getElementById('join-roles-delay');
                            const joinRolesExcludeBots = document.getElementById('join-roles-exclude-bots');
                            const joinRolesMinAge = document.getElementById('join-roles-min-age');
                            const logChannelSelect = document.getElementById('log-channel-select');
                            
                            const selectedJoinRoles = joinRolesSelect ? 
                                Array.from(joinRolesSelect.selectedOptions).map(option => option.value) : [];
                            
                            const autoRoleSettings = {
                                joinRoles: {
                                    enabled: joinRolesEnabled ? joinRolesEnabled.checked : false,
                                    roles: selectedJoinRoles,
                                    delay: joinRolesDelay ? parseInt(joinRolesDelay.value) : 0,
                                    excludeBots: joinRolesExcludeBots ? joinRolesExcludeBots.checked : true,
                                    minAccountAge: joinRolesMinAge ? parseInt(joinRolesMinAge.value) : 0
                                },
                                logChannelId: logChannelSelect ? logChannelSelect.value || null : null
                            };
                            
                            // Save auto-role settings
                            const autoRoleResponse = await fetch(\`/api/plugins/autorole/settings/\${currentGuildId}\`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(autoRoleSettings)
                            });
                            
                            if (!autoRoleResponse.ok) {
                                throw new Error('Failed to save auto-role settings');
                            }
                            
                            // Save level roles
                            const levelRolesEnabled = document.getElementById('level-roles-enabled');
                            
                            const levelRoleSettings = {
                                enabled: levelRolesEnabled ? levelRolesEnabled.checked : false,
                                roles: levelRoles,
                                logChannelId: logChannelSelect ? logChannelSelect.value || null : null
                            };
                            
                            const levelRoleResponse = await fetch(\`/api/plugins/autorole/levelroles/\${currentGuildId}\`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(levelRoleSettings)
                            });
                            
                            if (!levelRoleResponse.ok) {
                                throw new Error('Failed to save level role settings');
                            }
                            
                            showNotification('Auto-role settings saved successfully!', 'success');
                            
                        } catch (error) {
                            console.error('Error saving auto-role settings:', error);
                            showNotification(error.message, 'error');
                        } finally {
                            const saveBtn = document.getElementById('save-autorole-settings');
                            const btnText = saveBtn ? saveBtn.querySelector('.btn-text') : null;
                            const btnLoader = saveBtn ? saveBtn.querySelector('.btn-loader') : null;
                            
                            if (saveBtn) saveBtn.disabled = false;
                            if (btnText) btnText.style.display = 'inline';
                            if (btnLoader) btnLoader.style.display = 'none';
                        }
                    }

                    // Initialize the plugin
                    initializeAutoRolePlugin();
                })();
            `
        };
    }
}

module.exports = AutoRolePlugin;
                
                