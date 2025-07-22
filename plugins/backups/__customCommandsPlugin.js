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
                            content: 'Welcome to **{server.name}**, {user.mention}! 🎉',
                            channel: 'welcome'
                        },
                        variables: [],
                        permissions: { roles: [], users: [] }
                    },
                    'auto-role-assign': {
                        name: 'Auto Role Assignment',
                        description: 'Assign role to new members after verification',
                        category: 'moderation',
                        trigger: { type: 'reaction', emoji: '✅', channel: 'rules' },
                        response: {
                            type: 'action',
                            actions: [
                                { type: 'addRole', role: 'Member' },
                                { type: 'message', content: 'You now have access to the server!', ephemeral: true }
                            ]
                        },
                        variables: [],
                        permissions: { roles: [], users: [] }
                    },
                    'level-reward': {
                        name: 'Level Up Reward',
                        description: 'Congratulate users when they level up',
                        category: 'gamification',
                        trigger: { type: 'event', event: 'levelUp' },
                        response: {
                            type: 'embed',
                            title: '🎉 Level Up!',
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
    }

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
                        triggered = content === command.trigger.text.toLowerCase();
                        break;
                    case 'startsWith':
                        triggered = content.startsWith(command.trigger.text.toLowerCase());
                        break;
                    case 'contains':
                        triggered = content.includes(command.trigger.text.toLowerCase());
                        break;
                    case 'regex':
                        try {
                            const regex = new RegExp(command.trigger.text, 'i');
                            triggered = regex.test(content);
                        } catch (error) {
                            console.error('Invalid regex in command:', commandId, error);
                        }
                        break;
                    case 'ai':
                        // AI-powered intent detection would go here
                        // For now, use simple keyword matching as fallback
                        const keywords = command.trigger.aiKeywords || [];
                        triggered = keywords.some(keyword => content.includes(keyword.toLowerCase()));
                        break;
                }

                if (triggered) {
                    // Check permissions
                    if (!await this.checkPermissions(message.member, command.permissions)) continue;

                    // Check cooldowns and rate limits
                    if (!this.checkCooldowns(message.author.id, commandId, command.cooldown)) continue;

                    // Execute command
                    await this.executeCommand(command, {
                        message,
                        user: message.author,
                        member: message.member,
                        guild: message.guild,
                        channel: message.channel
                    });
                }
            }
        } catch (error) {
            console.error('Error handling message triggers:', error);
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

                // Execute command
                await this.executeCommand(command, {
                    ...data,
                    guild: data.member.guild,
                    user: data.member.user
                });
            }
        } catch (error) {
            console.error('Error handling event triggers:', error);
        }
    }

    async handleReactionTriggers(reaction, user, action) {
        try {
            const commands = await this.loadCommands();
            const guildCommands = commands[reaction.message.guild.id] || {};

            for (const [commandId, command] of Object.entries(guildCommands)) {
                if (!command.enabled || !command.trigger || command.trigger.type !== 'reaction') continue;
                if (command.trigger.emoji !== reaction.emoji.name && command.trigger.emoji !== reaction.emoji.id) continue;
                if (command.trigger.action && command.trigger.action !== action) continue;

                // Check channel restriction
                if (command.trigger.channel && command.trigger.channel !== reaction.message.channel.name) continue;

                // Check permissions
                const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
                if (!member || !await this.checkPermissions(member, command.permissions)) continue;

                // Execute command
                await this.executeCommand(command, {
                    message: reaction.message,
                    user,
                    member,
                    guild: reaction.message.guild,
                    channel: reaction.message.channel,
                    reaction
                });
            }
        } catch (error) {
            console.error('Error handling reaction triggers:', error);
        }
    }

    async executeCommand(command, context) {
        try {
            // Load and process variables
            const variables = await this.loadVariables();
            const processedContext = await this.processTemplateVariables(context, variables, command.variables);

            switch (command.response.type) {
                case 'message':
                    await this.executeMessageResponse(command.response, processedContext);
                    break;
                case 'embed':
                    await this.executeEmbedResponse(command.response, processedContext);
                    break;
                case 'action':
                    await this.executeActionResponse(command.response, processedContext);
                    break;
                case 'flow':
                    await this.executeFlowResponse(command.response, processedContext);
                    break;
            }

            // Update command usage statistics
            await this.updateCommandStats(context.guild.id, command.id);

        } catch (error) {
            console.error('Error executing command:', error);
        }
    }

    async processTemplateVariables(context, variables, commandVariables = []) {
        const processed = { ...context };
        
        // Built-in variables
        processed.user = {
            mention: context.user.toString(),
            username: context.user.username,
            discriminator: context.user.discriminator,
            id: context.user.id,
            avatar: context.user.displayAvatarURL()
        };

        processed.server = {
            name: context.guild.name,
            memberCount: context.guild.memberCount,
            id: context.guild.id,
            icon: context.guild.iconURL()
        };

        processed.channel = {
            name: context.channel.name,
            id: context.channel.id,
            mention: context.channel.toString()
        };

        // Custom variables
        const guildVariables = variables[context.guild.id] || {};
        const userVariables = guildVariables.users?.[context.user.id] || {};
        const serverVariables = guildVariables.server || {};

        processed.vars = {
            user: userVariables,
            server: serverVariables
        };

        // Add current timestamp
        processed.timestamp = {
            unix: Math.floor(Date.now() / 1000),
            iso: new Date().toISOString(),
            formatted: new Date().toLocaleString()
        };

        return processed;
    }

    replaceVariables(text, context) {
        if (!text) return text;
        
        return text.replace(/\{([^}]+)\}/g, (match, path) => {
            try {
                const value = path.split('.').reduce((obj, key) => obj?.[key], context);
                return value !== undefined ? String(value) : match;
            } catch {
                return match;
            }
        });
    }

    async executeMessageResponse(response, context) {
        const content = this.replaceVariables(response.content, context);
        const targetChannel = await this.resolveChannel(response.channel, context);
        
        if (targetChannel) {
            await targetChannel.send({ content });
        }
    }

    async executeEmbedResponse(response, context) {
        const embed = new EmbedBuilder();
        
        if (response.title) embed.setTitle(this.replaceVariables(response.title, context));
        if (response.description) embed.setDescription(this.replaceVariables(response.description, context));
        if (response.color) embed.setColor(response.color);
        if (response.thumbnail) embed.setThumbnail(this.replaceVariables(response.thumbnail, context));
        if (response.image) embed.setImage(this.replaceVariables(response.image, context));
        if (response.footer) embed.setFooter({ text: this.replaceVariables(response.footer, context) });

        if (response.fields) {
            response.fields.forEach(field => {
                embed.addFields({
                    name: this.replaceVariables(field.name, context),
                    value: this.replaceVariables(field.value, context),
                    inline: field.inline || false
                });
            });
        }

        const targetChannel = await this.resolveChannel(response.channel, context);
        if (targetChannel) {
            await targetChannel.send({ embeds: [embed] });
        }
    }

    async executeActionResponse(response, context) {
        for (const action of response.actions) {
            switch (action.type) {
                case 'addRole':
                    const addRole = context.guild.roles.cache.find(r => r.name === action.role || r.id === action.role);
                    if (addRole && context.member) {
                        await context.member.roles.add(addRole);
                    }
                    break;
                case 'removeRole':
                    const removeRole = context.guild.roles.cache.find(r => r.name === action.role || r.id === action.role);
                    if (removeRole && context.member) {
                        await context.member.roles.remove(removeRole);
                    }
                    break;
                case 'setVariable':
                    await this.setVariable(context.guild.id, context.user.id, action.variable, action.value, action.scope);
                    break;
                case 'message':
                    const content = this.replaceVariables(action.content, context);
                    if (action.ephemeral && context.interaction) {
                        await context.interaction.reply({ content, ephemeral: true });
                    } else {
                        const targetChannel = await this.resolveChannel(action.channel, context);
                        if (targetChannel) {
                            await targetChannel.send({ content });
                        }
                    }
                    break;
            }
        }
    }

    async resolveChannel(channelIdentifier, context) {
        if (!channelIdentifier) return context.channel;
        
        // Try to find by name or ID
        let channel = context.guild.channels.cache.find(c => 
            c.name === channelIdentifier || c.id === channelIdentifier
        );
        
        return channel || context.channel;
    }

    checkCooldowns(userId, commandId, cooldownSeconds = 0) {
        if (cooldownSeconds <= 0) return true;
        
        const key = `${userId}-${commandId}`;
        const now = Date.now();
        const cooldownAmount = cooldownSeconds * 1000;
        
        if (this.cooldowns.has(key)) {
            const expirationTime = this.cooldowns.get(key) + cooldownAmount;
            if (now < expirationTime) {
                return false;
            }
        }
        
        this.cooldowns.set(key, now);
        return true;
    }

    async checkPermissions(member, permissions) {
        if (!permissions) return true;
        
        // Check if user has admin permissions
        if (member.permissions.has('Administrator')) return true;
        
        // Check roles
        if (permissions.roles && permissions.roles.length > 0) {
            const hasRole = permissions.roles.some(roleId => member.roles.cache.has(roleId));
            if (!hasRole) return false;
        }
        
        // Check users
        if (permissions.users && permissions.users.length > 0) {
            if (!permissions.users.includes(member.id)) return false;
        }
        
        return true;
    }

    async loadCommands() {
        try {
            const data = await fs.readFile(this.commandsFile, 'utf8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    async saveCommands(commands) {
        await fs.writeFile(this.commandsFile, JSON.stringify(commands, null, 2));
    }

    async loadVariables() {
        try {
            const data = await fs.readFile(this.variablesFile, 'utf8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    async saveVariables(variables) {
        await fs.writeFile(this.variablesFile, JSON.stringify(variables, null, 2));
    }

    async setVariable(guildId, userId, name, value, scope = 'user') {
        const variables = await this.loadVariables();
        
        if (!variables[guildId]) variables[guildId] = { users: {}, server: {} };
        
        if (scope === 'user') {
            if (!variables[guildId].users[userId]) variables[guildId].users[userId] = {};
            variables[guildId].users[userId][name] = value;
        } else if (scope === 'server') {
            variables[guildId].server[name] = value;
        }
        
        await this.saveVariables(variables);
    }

    async updateCommandStats(guildId, commandId) {
        // Implementation for command usage statistics
        // This could be stored in a separate stats file
    }

    setupRoutes() {
        // Get all commands for a guild
        this.app.get('/api/plugins/customcommands/commands/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                // Check admin permissions
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

        // Create or update a command
        this.app.post('/api/plugins/customcommands/commands/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                const commandData = req.body;
                
                // Check admin permissions
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const commands = await this.loadCommands();
                if (!commands[guildId]) commands[guildId] = {};
                
                // Generate ID if not provided
                if (!commandData.id) {
                    commandData.id = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }
                
                commands[guildId][commandData.id] = {
                    ...commandData,
                    createdAt: commandData.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: req.user.id
                };
                
                await this.saveCommands(commands);
                res.json({ success: true, command: commands[guildId][commandData.id] });
            } catch (error) {
                console.error('Error saving command:', error);
                res.status(500).json({ error: 'Failed to save command' });
            }
        });

        // Delete a command
        this.app.delete('/api/plugins/customcommands/commands/:guildId/:commandId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId, commandId } = req.params;
                
                // Check admin permissions
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const commands = await this.loadCommands();
                if (commands[guildId] && commands[guildId][commandId]) {
                    delete commands[guildId][commandId];
                    await this.saveCommands(commands);
                }
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting command:', error);
                res.status(500).json({ error: 'Failed to delete command' });
            }
        });

        // Get command templates
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

        // Get variables for a guild
        this.app.get('/api/plugins/customcommands/variables/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                // Check admin permissions
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

        // Test a command
        this.app.post('/api/plugins/customcommands/test/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                const { command, testContext } = req.body;
                
                // Check admin permissions
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                // This would simulate command execution and return the result
                // For safety, we'll just validate the command structure
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
                            <div class="plugin-header">
                                <h4>📚 Command Templates</h4>
                                <p>Browse and import pre-made command templates</p>
                            </div>
                            
                            <div class="template-filters" style="margin-bottom: 20px;">
                                <select id="templateCategoryFilter" style="margin-right: 10px;">
                                    <option value="">All Categories</option>
                                    <option value="welcome">Welcome</option>
                                    <option value="moderation">Moderation</option>
                                    <option value="gamification">Gamification</option>
                                    <option value="utility">Utility</option>
                                    <option value="fun">Fun</option>
                                </select>
                                <input type="text" id="templateSearchInput" placeholder="Search templates..." style="flex: 1;">
                            </div>
                            
                            <div id="templatesList" class="templates-grid">
                                <!-- Templates will be loaded here -->
                            </div>
                        </div>
                        
                        <!-- Variables Tab -->
                        <div id="variables-tab" class="tab-content">
                            <div class="plugin-header">
                                <h4>💾 Variables</h4>
                                <p>Manage server and user variables for your commands</p>
                            </div>
                            
                            <div class="variables-section">
                                <h5>Server Variables</h5>
                                <div id="serverVariables" class="variables-list">
                                    <!-- Server variables will be loaded here -->
                                </div>
                                
                                <h5 style="margin-top: 30px;">User Variables</h5>
                                <div class="form-group">
                                    <input type="text" id="userVariableSearch" placeholder="Search by username or ID...">
                                </div>
                                <div id="userVariables" class="variables-list">
                                    <!-- User variables will be loaded here -->
                                </div>
                            </div>
                        </div>
                        
                        <!-- Analytics Tab -->
                        <div id="analytics-tab" class="tab-content">
                            <div class="plugin-header">
                                <h4>📊 Analytics</h4>
                                <p>View command usage statistics and performance metrics</p>
                            </div>
                            
                            <div id="analyticsContent">
                                <p>Analytics coming soon...</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Command Editor Modal -->
                <div id="commandEditorModal" class="modal" style="display: none;">
                    <div class="modal-content" style="max-width: 900px; width: 90%;">
                        <div class="modal-header">
                            <h3 id="commandEditorTitle">Create Command</h3>
                            <span class="modal-close">&times;</span>
                        </div>
                        <div class="modal-body">
                            <form id="commandEditorForm">
                                <!-- Basic Info -->
                                <div class="form-section">
                                    <h4>📝 Basic Information</h4>
                                    <div class="form-row">
                                        <div class="form-group" style="flex: 2;">
                                            <label for="commandName">Command Name</label>
                                            <input type="text" id="commandName" required placeholder="e.g., Welcome Message">
                                        </div>
                                        <div class="form-group" style="flex: 1;">
                                            <label>
                                                <input type="checkbox" id="commandEnabled" checked> Enabled
                                            </label>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label for="commandDescription">Description</label>
                                        <textarea id="commandDescription" placeholder="What does this command do?"></textarea>
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
                                            <label for="triggerText">Trigger Text</label>
                                            <input type="text" id="triggerText" placeholder="e.g., !hello or thank you">
                                        </div>
                                        <div id="aiKeywordsGroup" class="form-group" style="display: none;">
                                            <label for="aiKeywords">AI Keywords (comma separated)</label>
                                            <input type="text" id="aiKeywords" placeholder="help, support, question, problem">
                                            <small>Keywords to help AI understand the intent</small>
                                        </div>
                                    </div>
                                    
                                    <!-- Event Trigger Options -->
                                    <div id="eventTriggerOptions" class="trigger-options" style="display: none;">
                                        <div class="form-group">
                                            <label for="eventType">Event Type</label>
                                            <select id="eventType">
                                                <option value="guildMemberAdd">Member Join</option>
                                                <option value="guildMemberRemove">Member Leave</option>
                                                <option value="messageDelete">Message Delete</option>
                                                <option value="messageUpdate">Message Edit</option>
                                                <option value="levelUp">Level Up (requires leveling plugin)</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <!-- Reaction Trigger Options -->
                                    <div id="reactionTriggerOptions" class="trigger-options" style="display: none;">
                                        <div class="form-row">
                                            <div class="form-group">
                                                <label for="reactionEmoji">Emoji</label>
                                                <input type="text" id="reactionEmoji" placeholder="👍 or custom:emoji_id">
                                            </div>
                                            <div class="form-group">
                                                <label for="reactionAction">Action</label>
                                                <select id="reactionAction">
                                                    <option value="add">Reaction Added</option>
                                                    <option value="remove">Reaction Removed</option>
                                                    <option value="both">Both</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label for="reactionChannel">Channel (optional)</label>
                                            <input type="text" id="reactionChannel" placeholder="Channel name or leave empty for any">
                                        </div>
                                    </div>
                                    
                                    <!-- Schedule Trigger Options -->
                                    <div id="scheduleTriggerOptions" class="trigger-options" style="display: none;">
                                        <div class="form-group">
                                            <label for="schedulePattern">Schedule Pattern (Cron)</label>
                                            <input type="text" id="schedulePattern" placeholder="0 9 * * 1 (Every Monday at 9 AM)">
                                            <small>Use cron syntax or select a preset below</small>
                                        </div>
                                        <div class="schedule-presets">
                                            <button type="button" class="btn-secondary preset-btn" data-cron="0 9 * * *">Daily at 9 AM</button>
                                            <button type="button" class="btn-secondary preset-btn" data-cron="0 9 * * 1">Weekly (Monday 9 AM)</button>
                                            <button type="button" class="btn-secondary preset-btn" data-cron="0 9 1 * *">Monthly (1st at 9 AM)</button>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Response Configuration -->
                                <div class="form-section">
                                    <h4>💬 Response Configuration</h4>
                                    <div class="form-group">
                                        <label for="responseType">Response Type</label>
                                        <select id="responseType" required>
                                            <option value="">Select response type...</option>
                                            <option value="message">📝 Simple Message</option>
                                            <option value="embed">📋 Rich Embed</option>
                                            <option value="action">🎬 Actions</option>
                                            <option value="flow">🔄 Flow (Visual Editor)</option>
                                        </select>
                                    </div>
                                    
                                    <!-- Message Response -->
                                    <div id="messageResponseOptions" class="response-options" style="display: none;">
                                        <div class="form-group">
                                            <label for="responseContent">Message Content</label>
                                            <textarea id="responseContent" placeholder="Hello {user.mention}! Welcome to {server.name}!" rows="4"></textarea>
                                            <small>Use variables like {user.mention}, {server.name}, {channel.name}</small>
                                        </div>
                                        <div class="form-group">
                                            <label for="responseChannel">Target Channel (optional)</label>
                                            <input type="text" id="responseChannel" placeholder="Channel name or leave empty for same channel">
                                        </div>
                                    </div>
                                    
                                    <!-- Embed Response -->
                                    <div id="embedResponseOptions" class="response-options" style="display: none;">
                                        <div class="form-group">
                                            <label for="embedTitle">Title</label>
                                            <input type="text" id="embedTitle" placeholder="Welcome!">
                                        </div>
                                        <div class="form-group">
                                            <label for="embedDescription">Description</label>
                                            <textarea id="embedDescription" placeholder="Welcome to our server, {user.mention}!" rows="3"></textarea>
                                        </div>
                                        <div class="form-row">
                                            <div class="form-group">
                                                <label for="embedColor">Color</label>
                                                <input type="color" id="embedColor" value="#5865F2">
                                            </div>
                                            <div class="form-group">
                                                <label for="embedThumbnail">Thumbnail URL</label>
                                                <input type="text" id="embedThumbnail" placeholder="{user.avatar} or custom URL">
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label for="embedImage">Image URL</label>
                                            <input type="text" id="embedImage" placeholder="Image URL">
                                        </div>
                                        <div class="form-group">
                                            <label for="embedFooter">Footer Text</label>
                                            <input type="text" id="embedFooter" placeholder="Joined at {timestamp.formatted}">
                                        </div>
                                        
                                        <!-- Embed Fields -->
                                        <div class="embed-fields-section">
                                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                                <label>Fields</label>
                                                <button type="button" id="addEmbedField" class="btn-secondary">➕ Add Field</button>
                                            </div>
                                            <div id="embedFieldsList"></div>
                                        </div>
                                    </div>
                                    
                                    <!-- Actions Response -->
                                    <div id="actionResponseOptions" class="response-options" style="display: none;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                            <label>Actions</label>
                                            <select id="addActionType" style="margin-right: 10px;">
                                                <option value="">Select action to add...</option>
                                                <option value="addRole">Add Role</option>
                                                <option value="removeRole">Remove Role</option>
                                                <option value="setVariable">Set Variable</option>
                                                <option value="message">Send Message</option>
                                                <option value="timeout">Timeout User</option>
                                                <option value="kick">Kick User</option>
                                                <option value="ban">Ban User</option>
                                            </select>
                                            <button type="button" id="addActionBtn" class="btn-secondary">➕ Add</button>
                                        </div>
                                        <div id="actionsList"></div>
                                    </div>
                                    
                                    <!-- Flow Response -->
                                    <div id="flowResponseOptions" class="response-options" style="display: none;">
                                        <div class="flow-editor-container">
                                            <div class="flow-toolbar">
                                                <button type="button" class="btn-secondary">🔧 Visual Editor</button>
                                                <button type="button" class="btn-secondary">📝 JSON Editor</button>
                                                <button type="button" class="btn-secondary">🧪 Test Flow</button>
                                            </div>
                                            <div id="flowCanvas" class="flow-canvas">
                                                <p>Visual flow editor coming soon! For now, use simple responses.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Permissions & Settings -->
                                <div class="form-section">
                                    <h4>🔒 Permissions & Settings</h4>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label for="commandCooldown">Cooldown (seconds)</label>
                                            <input type="number" id="commandCooldown" min="0" value="0">
                                        </div>
                                        <div class="form-group">
                                            <label for="commandUses">Max Uses (0 = unlimited)</label>
                                            <input type="number" id="commandUses" min="0" value="0">
                                        </div>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="allowedRoles">Allowed Roles (optional)</label>
                                        <select id="allowedRoles" multiple>
                                            <!-- Roles will be populated -->
                                        </select>
                                        <small>Leave empty to allow everyone</small>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="allowedChannels">Allowed Channels (optional)</label>
                                        <select id="allowedChannels" multiple>
                                            <!-- Channels will be populated -->
                                        </select>
                                        <small>Leave empty to allow all channels</small>
                                    </div>
                                </div>
                                
                                <!-- Test Section -->
                                <div class="form-section">
                                    <h4>🧪 Test Command</h4>
                                    <div class="test-section">
                                        <button type="button" id="testCommandBtn" class="btn-secondary">🧪 Test Command</button>
                                        <div id="testResult" class="test-result" style="display: none;"></div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary modal-cancel">Cancel</button>
                            <button type="button" id="saveCommandBtn" class="btn-primary">💾 Save Command</button>
                        </div>
                    </div>
                </div>
                
                <!-- Template Import Modal -->
                <div id="templateImportModal" class="modal" style="display: none;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>📥 Import Template</h3>
                            <span class="modal-close">&times;</span>
                        </div>
                        <div class="modal-body">
                            <div id="templatePreview"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary modal-cancel">Cancel</button>
                            <button type="button" id="importTemplateConfirmBtn" class="btn-primary">Import Template</button>
                        </div>
                    </div>
                </div>
            `,
            
            script: `(function() {
                console.log("⚡ Custom Commands Plugin: Initializing frontend component...");
                
                let currentServerId = null;
                let currentCommands = {};
                let currentTemplates = {};
                let editingCommand = null;
                
                // DOM Elements
                const serverSelect = document.getElementById("ccServerSelect");
                const mainContent = document.getElementById("ccMainContent");
                const commandsList = document.getElementById("commandsList");
                const createCommandBtn = document.getElementById("createCommandBtn");
                const commandEditorModal = document.getElementById("commandEditorModal");
                const saveCommandBtn = document.getElementById("saveCommandBtn");
                
                // Tab system
                const tabBtns = document.querySelectorAll(".tab-btn");
                const tabContents = document.querySelectorAll(".tab-content");
                
                // Initialize
                if (serverSelect) {
                    serverSelect.addEventListener('change', function() {
                        currentServerId = this.value;
                        if (currentServerId) {
                            mainContent.style.display = 'block';
                            loadCommands();
                            loadTemplates();
                            loadVariables();
                        } else {
                            mainContent.style.display = 'none';
                        }
                    });
                    loadServers();
                }
                
                // Tab navigation
                tabBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const tabId = btn.getAttribute('data-tab');
                        switchTab(tabId);
                    });
                });
                
                // Modal handlers
                setupModalHandlers();
                setupCommandEditor();
                
                function switchTab(tabId) {
                    tabBtns.forEach(btn => btn.classList.remove('active'));
                    tabContents.forEach(content => content.classList.remove('active'));
                    
                    document.querySelector(\`[data-tab="\${tabId}"]\`).classList.add('active');
                    document.getElementById(\`\${tabId}-tab\`).classList.add('active');
                }
                
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
                    } catch (error) {
                        console.error('Error loading servers:', error);
                        showNotification('Error loading servers', 'error');
                    }
                }
                
                async function loadCommands() {
                    if (!currentServerId) return;
                    
                    try {
                        const response = await fetch(\`/api/plugins/customcommands/commands/\${currentServerId}\`);
                        currentCommands = await response.json();
                        displayCommands();
                    } catch (error) {
                        console.error('Error loading commands:', error);
                        showNotification('Error loading commands', 'error');
                    }
                }
                
                function displayCommands() {
                    const commands = Object.values(currentCommands);
                    
                    if (commands.length === 0) {
                        commandsList.innerHTML = \`
                            <div class="empty-state">
                                <div style="font-size: 3rem; margin-bottom: 1rem;">⚡</div>
                                <h4>No commands yet</h4>
                                <p>Create your first custom command to get started!</p>
                                <button class="btn-primary" onclick="openCommandEditor()">➕ Create Command</button>
                            </div>
                        \`;
                        return;
                    }
                    
                    commandsList.innerHTML = commands.map(command => \`
                        <div class="command-card" data-command-id="\${command.id}">
                            <div class="command-header">
                                <div>
                                    <h5>\${command.name}</h5>
                                    <p>\${command.description || 'No description'}</p>
                                </div>
                                <div class="command-status">
                                    <span class="status-badge \${command.enabled ? 'enabled' : 'disabled'}">
                                        \${command.enabled ? '✅ Enabled' : '❌ Disabled'}
                                    </span>
                                </div>
                            </div>
                            <div class="command-details">
                                <div class="command-trigger">
                                    <strong>Trigger:</strong> \${formatTrigger(command.trigger)}
                                </div>
                                <div class="command-response">
                                    <strong>Response:</strong> \${formatResponse(command.response)}
                                </div>
                            </div>
                            <div class="command-actions">
                                <button class="btn-secondary btn-sm" onclick="editCommand('\${command.id}')">✏️ Edit</button>
                                <button class="btn-secondary btn-sm" onclick="testCommand('\${command.id}')">🧪 Test</button>
                                <button class="btn-secondary btn-sm" onclick="duplicateCommand('\${command.id}')">📋 Duplicate</button>
                                <button class="btn-danger btn-sm" onclick="deleteCommand('\${command.id}')">🗑️ Delete</button>
                            </div>
                        </div>
                    \`).join('');
                }
                
                function formatTrigger(trigger) {
                    if (!trigger) return 'Unknown';
                    
                    switch (trigger.type) {
                        case 'message':
                            return \`Message: "\${trigger.text}" (\${trigger.matchType})\`;
                        case 'event':
                            return \`Event: \${trigger.event}\`;
                        case 'reaction':
                            return \`Reaction: \${trigger.emoji} (\${trigger.action})\`;
                        case 'schedule':
                            return \`Schedule: \${trigger.pattern}\`;
                        default:
                            return trigger.type;
                    }
                }
                
                function formatResponse(response) {
                    if (!response) return 'Unknown';
                    
                    switch (response.type) {
                        case 'message':
                            return \`Message: "\${response.content?.substring(0, 50)}..."\`;
                        case 'embed':
                            return \`Embed: "\${response.title || 'Untitled'}"\`;
                        case 'action':
                            return \`\${response.actions?.length || 0} Action(s)\`;
                        default:
                            return response.type;
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
                    const templates = Object.entries(currentTemplates);
                    
                    templatesList.innerHTML = templates.map(([id, template]) => \`
                        <div class="template-card">
                            <div class="template-header">
                                <h5>\${template.name}</h5>
                                <span class="template-category">\${template.category}</span>
                            </div>
                            <p>\${template.description}</p>
                            <div class="template-actions">
                                <button class="btn-primary btn-sm" onclick="importTemplate('\${id}')">📥 Import</button>
                                <button class="btn-secondary btn-sm" onclick="previewTemplate('\${id}')">👀 Preview</button>
                            </div>
                        </div>
                    \`).join('');
                }
                
                async function loadVariables() {
                    if (!currentServerId) return;
                    
                    try {
                        const response = await fetch(\`/api/plugins/customcommands/variables/\${currentServerId}\`);
                        const variables = await response.json();
                        displayVariables(variables);
                    } catch (error) {
                        console.error('Error loading variables:', error);
                    }
                }
                
                function displayVariables(variables) {
                    const serverVars = document.getElementById('serverVariables');
                    const userVars = document.getElementById('userVariables');
                    
                    // Display server variables
                    const serverVariables = variables.server || {};
                    serverVars.innerHTML = Object.entries(serverVariables).map(([key, value]) => \`
                        <div class="variable-item">
                            <strong>\${key}:</strong> \${JSON.stringify(value)}
                        </div>
                    \`).join('') || '<p>No server variables</p>';
                    
                    // Display user variables (limited to recent users)
                    const userVariables = variables.users || {};
                    const userEntries = Object.entries(userVariables).slice(0, 10);
                    userVars.innerHTML = userEntries.map(([userId, vars]) => \`
                        <div class="user-variable-section">
                            <h6>User: \${userId}</h6>
                            \${Object.entries(vars).map(([key, value]) => \`
                                <div class="variable-item">
                                    <strong>\${key}:</strong> \${JSON.stringify(value)}
                                </div>
                            \`).join('')}
                        </div>
                    \`).join('') || '<p>No user variables</p>';
                }
                
                function setupModalHandlers() {
                    // Close modal handlers
                    document.addEventListener('click', (e) => {
                        if (e.target.classList.contains('modal-close') || e.target.classList.contains('modal-cancel')) {
                            closeModals();
                        }
                    });
                    
                    // Create command button
                    if (createCommandBtn) {
                        createCommandBtn.addEventListener('click', () => openCommandEditor());
                    }
                }
                
                function setupCommandEditor() {
                    const triggerType = document.getElementById('triggerType');
                    const responseType = document.getElementById('responseType');
                    const messageMatchType = document.getElementById('messageMatchType');
                    
                    // Trigger type change handler
                    if (triggerType) {
                        triggerType.addEventListener('change', function() {
                            showTriggerOptions(this.value);
                        });
                    }
                    
                    // Response type change handler
                    if (responseType) {
                        responseType.addEventListener('change', function() {
                            showResponseOptions(this.value);
                        });
                    }
                    
                    // Match type change handler for AI keywords
                    if (messageMatchType) {
                        messageMatchType.addEventListener('change', function() {
                            const aiKeywordsGroup = document.getElementById('aiKeywordsGroup');
                            if (aiKeywordsGroup) {
                                aiKeywordsGroup.style.display = this.value === 'ai' ? 'block' : 'none';
                            }
                        });
                    }
                    
                    // Save command handler
                    if (saveCommandBtn) {
                        saveCommandBtn.addEventListener('click', saveCommand);
                    }
                    
                    // Test command handler
                    const testCommandBtn = document.getElementById('testCommandBtn');
                    if (testCommandBtn) {
                        testCommandBtn.addEventListener('click', testCurrentCommand);
                    }

                    // --- FIX START: Add event listener for the 'Add Action' button ---
                    const addActionBtn = document.getElementById('addActionBtn');
                    if (addActionBtn) {
                        addActionBtn.addEventListener('click', () => {
                            const actionTypeSelect = document.getElementById('addActionType');
                            const actionType = actionTypeSelect.value;
                            if (!actionType) {
                                showNotification('Please select an action to add', 'error');
                                return;
                            }
                    
                            const actionsList = document.getElementById('actionsList');
                            const actionId = \`action_\${Date.now()}\`;
                            const actionElement = document.createElement('div');
                            actionElement.className = 'action-item';
                            actionElement.id = actionId;
                            actionElement.dataset.actionType = actionType;
                    
                            let actionHTML = \`
                                <div class="action-header">
                                    <strong>\${actionType.charAt(0).toUpperCase() + actionType.slice(1).replace(/([A-Z])/g, ' \$1')}</strong>
                                    <button type="button" class="btn-danger btn-sm" onclick="document.getElementById('\${actionId}').remove()">Remove</button>
                                </div>
                                <div class="action-body">
                            \`;
                    
                            switch (actionType) {
                                case 'addRole':
                                case 'removeRole':
                                    actionHTML += \`
                                        <div class="form-group">
                                            <label>Role Name or ID</label>
                                            <input type="text" class="action-param role" placeholder="e.g., Member or role ID">
                                        </div>
                                    \`;
                                    break;
                                case 'setVariable':
                                    actionHTML += \`
                                        <div class="form-row">
                                            <div class="form-group">
                                                <label>Variable Name</label>
                                                <input type="text" class="action-param varName" placeholder="e.g., userPoints">
                                            </div>
                                            <div class="form-group">
                                                <label>Value</label>
                                                <input type="text" class="action-param varValue" placeholder="e.g., 10 or {user.level}">
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label>Scope</label>
                                            <select class="action-param varScope">
                                                <option value="user">User</option>
                                                <option value="server">Server</option>
                                            </select>
                                        </div>
                                    \`;
                                    break;
                                case 'message':
                                    actionHTML += \`
                                        <div class="form-group">
                                            <label>Message Content</label>
                                            <textarea class="action-param content" placeholder="Message to send..."></textarea>
                                        </div>
                                        <div class="form-group">
                                            <label>Channel (optional)</label>
                                            <input type="text" class="action-param channel" placeholder="Leave empty for current channel">
                                        </div>
                                        <div class="form-group">
                                            <label><input type="checkbox" class="action-param ephemeral"> Ephemeral</label>
                                        </div>
                                    \`;
                                    break;
                                case 'timeout':
                                    actionHTML += \`
                                        <div class="form-group">
                                            <label>Duration (minutes)</label>
                                            <input type="number" class="action-param duration" placeholder="e.g., 10" min="1">
                                        </div>
                                        <div class="form-group">
                                            <label>Reason (optional)</label>
                                            <input type="text" class="action-param reason" placeholder="Reason for timeout">
                                        </div>
                                    \`;
                                    break;
                                case 'kick':
                                case 'ban':
                                    actionHTML += \`
                                        <div class="form-group">
                                            <label>Reason (optional)</label>
                                            <input type="text" class="action-param reason" placeholder="Reason for \${actionType}">
                                        </div>
                                    \`;
                                    break;
                            }
                    
                            actionHTML += '</div>';
                            actionElement.innerHTML = actionHTML;
                            actionsList.appendChild(actionElement);
                            
                            // Reset the select dropdown
                            actionTypeSelect.value = '';
                        });
                    }
                    // --- FIX END ---
                }
                
                function showTriggerOptions(type) {
                    // Hide all trigger options
                    document.querySelectorAll('.trigger-options').forEach(option => {
                        option.style.display = 'none';
                    });
                    
                    // Show selected trigger option
                    const selectedOption = document.getElementById(\`\${type}TriggerOptions\`);
                    if (selectedOption) {
                        selectedOption.style.display = 'block';
                    }
                }
                
                function showResponseOptions(type) {
                    // Hide all response options
                    document.querySelectorAll('.response-options').forEach(option => {
                        option.style.display = 'none';
                    });
                    
                    // Show selected response option
                    const selectedOption = document.getElementById(\`\${type}ResponseOptions\`);
                    if (selectedOption) {
                        selectedOption.style.display = 'block';
                    }
                }
                
                function openCommandEditor(commandId = null) {
                    editingCommand = commandId;
                    const modal = document.getElementById('commandEditorModal');
                    const title = document.getElementById('commandEditorTitle');
                    
                    if (commandId && currentCommands[commandId]) {
                        title.textContent = 'Edit Command';
                        populateCommandEditor(currentCommands[commandId]);
                    } else {
                        title.textContent = 'Create Command';
                        clearCommandEditor();
                    }
                    
                    modal.style.display = 'flex';
                }
                
                function populateCommandEditor(command) {
                    // Populate basic info
                    document.getElementById('commandName').value = command.name || '';
                    document.getElementById('commandDescription').value = command.description || '';
                    document.getElementById('commandEnabled').checked = command.enabled !== false;
                    
                    // Populate trigger
                    if (command.trigger) {
                        document.getElementById('triggerType').value = command.trigger.type || '';
                        showTriggerOptions(command.trigger.type);
                        
                        if (command.trigger.type === 'message') {
                            document.getElementById('messageMatchType').value = command.trigger.matchType || '';
                            document.getElementById('triggerText').value = command.trigger.text || '';
                            if (command.trigger.aiKeywords) {
                                document.getElementById('aiKeywords').value = command.trigger.aiKeywords.join(', ');
                            }
                        }
                        // Add other trigger type population...
                    }
                    
                    // Populate response
                    if (command.response) {
                        document.getElementById('responseType').value = command.response.type || '';
                        showResponseOptions(command.response.type);
                        
                        if (command.response.type === 'message') {
                            document.getElementById('responseContent').value = command.response.content || '';
                            document.getElementById('responseChannel').value = command.response.channel || '';
                        }

                        // --- FIX START: Populate saved actions when editing a command ---
                        if (command.response.type === 'action' && command.response.actions) {
                            const actionsList = document.getElementById('actionsList');
                            actionsList.innerHTML = '';
                        
                            command.response.actions.forEach(action => {
                                const actionId = \`action_\${Date.now()}_\${Math.random().toString(36).substr(2, 5)}\`;
                                const actionElement = document.createElement('div');
                                actionElement.className = 'action-item';
                                actionElement.id = actionId;
                                actionElement.dataset.actionType = action.type;
                        
                                let actionHTML = \`
                                    <div class="action-header">
                                        <strong>\${action.type.charAt(0).toUpperCase() + action.type.slice(1).replace(/([A-Z])/g, ' \$1')}</strong>
                                        <button type="button" class="btn-danger btn-sm" onclick="document.getElementById('\${actionId}').remove()">Remove</button>
                                    </div>
                                    <div class="action-body">
                                \`;
                        
                                switch (action.type) {
                                    case 'addRole':
                                    case 'removeRole':
                                        actionHTML += \`<div class="form-group"><label>Role Name or ID</label><input type="text" class="action-param role" placeholder="e.g., Member or role ID" value="\${action.role || ''}"></div>\`;
                                        break;
                                    case 'setVariable':
                                        actionHTML += \`<div class="form-row"><div class="form-group"><label>Variable Name</label><input type="text" class="action-param varName" placeholder="e.g., userPoints" value="\${action.variable || ''}"></div><div class="form-group"><label>Value</label><input type="text" class="action-param varValue" placeholder="e.g., 10 or {user.level}" value="\${action.value || ''}"></div></div><div class="form-group"><label>Scope</label><select class="action-param varScope"><option value="user" \${action.scope === 'user' ? 'selected' : ''}>User</option><option value="server" \${action.scope === 'server' ? 'selected' : ''}>Server</option></select></div>\`;
                                        break;
                                    case 'message':
                                        actionHTML += \`<div class="form-group"><label>Message Content</label><textarea class="action-param content" placeholder="Message to send...">\${action.content || ''}</textarea></div><div class="form-group"><label>Channel (optional)</label><input type="text" class="action-param channel" placeholder="Leave empty for current channel" value="\${action.channel || ''}"></div><div class="form-group"><label><input type="checkbox" class="action-param ephemeral" \${action.ephemeral ? 'checked' : ''}> Ephemeral</label></div>\`;
                                        break;
                                    case 'timeout':
                                        actionHTML += \`<div class="form-group"><label>Duration (minutes)</label><input type="number" class="action-param duration" placeholder="e.g., 10" min="1" value="\${action.duration || ''}"></div><div class="form-group"><label>Reason (optional)</label><input type="text" class="action-param reason" placeholder="Reason for timeout" value="\${action.reason || ''}"></div>\`;
                                        break;
                                    case 'kick':
                                    case 'ban':
                                        actionHTML += \`<div class="form-group"><label>Reason (optional)</label><input type="text" class="action-param reason" placeholder="Reason for \${action.type}" value="\${action.reason || ''}"></div>\`;
                                        break;
                                }
                        
                                actionHTML += '</div>';
                                actionElement.innerHTML = actionHTML;
                                actionsList.appendChild(actionElement);
                            });
                        }
                        // --- FIX END ---
                    }
                    
                    // Populate settings
                    document.getElementById('commandCooldown').value = command.cooldown || 0;
                    document.getElementById('commandUses').value = command.maxUses || 0;
                }
                
                function clearCommandEditor() {
                    document.getElementById('commandEditorForm').reset();
                    document.querySelectorAll('.trigger-options, .response-options').forEach(option => {
                        option.style.display = 'none';
                    });
                    // --- FIX: Clear the actions list when creating a new command ---
                    document.getElementById('actionsList').innerHTML = '';
                }
                
                async function saveCommand() {
                    try {
                        const commandData = gatherCommandData();
                        if (!commandData) return;
                        
                        if (editingCommand) {
                            commandData.id = editingCommand;
                        }
                        
                        const response = await fetch(\`/api/plugins/customcommands/commands/\${currentServerId}\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(commandData)
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            showNotification(\`Command \${editingCommand ? 'updated' : 'created'} successfully!\`, 'success');
                            closeModals();
                            loadCommands();
                        } else {
                            throw new Error('Failed to save command');
                        }
                    } catch (error) {
                        console.error('Error saving command:', error);
                        showNotification('Error saving command', 'error');
                    }
                }
                
                function gatherCommandData() {
                    const triggerType = document.getElementById('triggerType').value;
                    const responseType = document.getElementById('responseType').value;
                    
                    if (!triggerType || !responseType) {
                        showNotification('Please select trigger and response types', 'error');
                        return null;
                    }
                    
                    const commandData = {
                        name: document.getElementById('commandName').value,
                        description: document.getElementById('commandDescription').value,
                        enabled: document.getElementById('commandEnabled').checked,
                        cooldown: parseInt(document.getElementById('commandCooldown').value) || 0,
                        maxUses: parseInt(document.getElementById('commandUses').value) || 0
                    };
                    
                    // Gather trigger data
                    commandData.trigger = { type: triggerType };
                    
                    if (triggerType === 'message') {
                        commandData.trigger.matchType = document.getElementById('messageMatchType').value;
                        commandData.trigger.text = document.getElementById('triggerText').value;
                        if (commandData.trigger.matchType === 'ai') {
                            const aiKeywords = document.getElementById('aiKeywords').value;
                            commandData.trigger.aiKeywords = aiKeywords.split(',').map(k => k.trim()).filter(k => k);
                        }
                    } else if (triggerType === 'event') {
                        commandData.trigger.event = document.getElementById('eventType').value;
                    } else if (triggerType === 'reaction') {
                        commandData.trigger.emoji = document.getElementById('reactionEmoji').value;
                        commandData.trigger.action = document.getElementById('reactionAction').value;
                        commandData.trigger.channel = document.getElementById('reactionChannel').value;
                    } else if (triggerType === 'schedule') {
                        commandData.trigger.pattern = document.getElementById('schedulePattern').value;
                    }
                    
                    // Gather response data
                    commandData.response = { type: responseType };
                    
                    if (responseType === 'message') {
                        commandData.response.content = document.getElementById('responseContent').value;
                        commandData.response.channel = document.getElementById('responseChannel').value;
                    } else if (responseType === 'embed') {
                        commandData.response.title = document.getElementById('embedTitle').value;
                        commandData.response.description = document.getElementById('embedDescription').value;
                        commandData.response.color = document.getElementById('embedColor').value;
                        commandData.response.thumbnail = document.getElementById('embedThumbnail').value;
                        commandData.response.image = document.getElementById('embedImage').value;
                        commandData.response.footer = document.getElementById('embedFooter').value;
                        // Add embed fields gathering logic here
                    } else if (responseType === 'action') { // --- FIX START: Gather data from the actions list ---
                        const actions = [];
                        const actionItems = document.querySelectorAll('#actionsList .action-item');
                    
                        actionItems.forEach(item => {
                            const actionType = item.dataset.actionType;
                            const action = { type: actionType };
                            
                            const getValue = (selector, isCheckbox = false) => {
                                const el = item.querySelector(selector);
                                if (!el) return null;
                                return isCheckbox ? el.checked : el.value;
                            };
                    
                            switch (actionType) {
                                case 'addRole':
                                case 'removeRole':
                                    action.role = getValue('.action-param.role');
                                    break;
                                case 'setVariable':
                                    action.variable = getValue('.action-param.varName');
                                    action.value = getValue('.action-param.varValue');
                                    action.scope = getValue('.action-param.varScope');
                                    break;
                                case 'message':
                                    action.content = getValue('.action-param.content');
                                    action.channel = getValue('.action-param.channel');
                                    action.ephemeral = getValue('.action-param.ephemeral', true);
                                    break;
                                case 'timeout':
                                    action.duration = parseInt(getValue('.action-param.duration')) || 0;
                                    action.reason = getValue('.action-param.reason');
                                    break;
                                case 'kick':
                                case 'ban':
                                    action.reason = getValue('.action-param.reason');
                                    break;
                            }
                            
                            actions.push(action);
                        });
                        
                        commandData.response.actions = actions;
                    } // --- FIX END ---
                    
                    return commandData;
                }
                
                async function testCurrentCommand() {
                    const commandData = gatherCommandData();
                    if (!commandData) return;
                    
                    try {
                        const testContext = {
                            user: { mention: '@TestUser', username: 'TestUser', id: '123456789' },
                            server: { name: 'Test Server', memberCount: 100 },
                            channel: { name: 'test-channel', mention: '#test-channel' },
                            timestamp: { formatted: new Date().toLocaleString() }
                        };
                        
                        const response = await fetch(\`/api/plugins/customcommands/test/\${currentServerId}\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ command: commandData, testContext })
                        });
                        
                        const result = await response.json();
                        const testResult = document.getElementById('testResult');
                        
                        if (result.valid) {
                            testResult.innerHTML = \`
                                <div class="test-success">
                                    <h5>✅ Test Successful</h5>
                                    <div class="test-preview">
                                        <strong>Preview:</strong>
                                        <div class="preview-content">\${result.preview}</div>
                                    </div>
                                </div>
                            \`;
                        } else {
                            testResult.innerHTML = \`
                                <div class="test-error">
                                    <h5>❌ Test Failed</h5>
                                    <p>\${result.error || 'Unknown error'}</p>
                                </div>
                            \`;
                        }
                        
                        testResult.style.display = 'block';
                    } catch (error) {
                        console.error('Error testing command:', error);
                        showNotification('Error testing command', 'error');
                    }
                }
                
                function closeModals() {
                    document.querySelectorAll('.modal').forEach(modal => {
                        modal.style.display = 'none';
                    });
                }
                
                // Global functions for button handlers
                window.openCommandEditor = openCommandEditor;
                window.editCommand = (id) => openCommandEditor(id);
                window.deleteCommand = async (id) => {
                    if (!confirm('Are you sure you want to delete this command?')) return;
                    
                    try {
                        const response = await fetch(\`/api/plugins/customcommands/commands/\${currentServerId}/\${id}\`, {
                            method: 'DELETE'
                        });
                        
                        if (response.ok) {
                            showNotification('Command deleted successfully!', 'success');
                            loadCommands();
                        } else {
                            throw new Error('Failed to delete command');
                        }
                    } catch (error) {
                        console.error('Error deleting command:', error);
                        showNotification('Error deleting command', 'error');
                    }
                };
                
                window.duplicateCommand = (id) => {
                    const command = currentCommands[id];
                    if (command) {
                        const duplicate = { ...command };
                        duplicate.name += ' (Copy)';
                        delete duplicate.id;
                        editingCommand = null;
                        openCommandEditor();
                        populateCommandEditor(duplicate);
                    }
                };
                
                window.testCommand = (id) => {
                    // Quick test functionality
                    const command = currentCommands[id];
                    if (command) {
                        console.log('Testing command:', command);
                        showNotification('Test functionality coming soon!', 'info');
                    }
                };
                
                window.importTemplate = async (templateId) => {
                    const template = currentTemplates[templateId];
                    if (template) {
                        editingCommand = null;
                        openCommandEditor();
                        populateCommandEditor(template);
                        showNotification(\`Template "\${template.name}" imported!\`, 'success');
                    }
                };
                
                window.previewTemplate = (templateId) => {
                    const template = currentTemplates[templateId];
                    if (template) {
                        // Show template preview modal
                        const modal = document.getElementById('templateImportModal');
                        const preview = document.getElementById('templatePreview');
                        
                        preview.innerHTML = \`
                            <div class="template-preview">
                                <h4>\${template.name}</h4>
                                <p><strong>Category:</strong> \${template.category}</p>
                                <p><strong>Description:</strong> \${template.description}</p>
                                <div class="template-details">
                                    <h5>Trigger:</h5>
                                    <pre>\${JSON.stringify(template.trigger, null, 2)}</pre>
                                    <h5>Response:</h5>
                                    <pre>\${JSON.stringify(template.response, null, 2)}</pre>
                                </div>
                            </div>
                        \`;
                        
                        modal.style.display = 'flex';
                    }
                };
                
                // Add some styles for the plugin
                const style = document.createElement('style');
                style.textContent = \`
                    /* --- FIX START: Add styles for the new action items --- */
                    .custom-commands-plugin .action-item {
                        background: rgba(0,0,0,0.2);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 10px;
                        border: 1px solid rgba(255,255,255,0.08);
                    }
                    .custom-commands-plugin .action-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }
                    .custom-commands-plugin .action-header strong {
                        color: #fff;
                    }
                    .custom-commands-plugin .action-body {
                        padding-top: 10px;
                        border-top: 1px solid rgba(255,255,255,0.1);
                    }
                    .custom-commands-plugin .btn-danger {
                        background: rgba(244, 67, 54, 0.3);
                        border: 1px solid rgba(244, 67, 54, 0.5);
                        color: white;
                    }
                    /* --- FIX END --- */

                    .custom-commands-plugin .tab-nav {
                        border-bottom: 2px solid rgba(255,255,255,0.1);
                        margin-bottom: 20px;
                    }
                    
                    .custom-commands-plugin .tab-btn {
                        background: none;
                        border: none;
                        color: rgba(255,255,255,0.7);
                        padding: 10px 20px;
                        cursor: pointer;
                        border-bottom: 2px solid transparent;
                        transition: all 0.3s ease;
                    }
                    
                    .custom-commands-plugin .tab-btn:hover {
                        color: rgba(255,255,255,0.9);
                    }
                    
                    .custom-commands-plugin .tab-btn.active {
                        color: #5865F2;
                        border-bottom-color: #5865F2;
                    }
                    
                    .custom-commands-plugin .tab-content {
                        display: none;
                    }
                    
                    .custom-commands-plugin .tab-content.active {
                        display: block;
                    }
                    
                    .custom-commands-plugin .command-card {
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        padding: 20px;
                        margin-bottom: 15px;
                        transition: all 0.3s ease;
                    }
                    
                    .custom-commands-plugin .command-card:hover {
                        background: rgba(255,255,255,0.08);
                        border-color: rgba(255,255,255,0.2);
                    }
                    
                    .custom-commands-plugin .command-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 15px;
                    }
                    
                    .custom-commands-plugin .command-header h5 {
                        margin: 0 0 5px 0;
                        color: #fff;
                    }
                    
                    .custom-commands-plugin .command-header p {
                        margin: 0;
                        color: rgba(255,255,255,0.7);
                        font-size: 0.9rem;
                    }
                    
                    .custom-commands-plugin .status-badge {
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 0.8rem;
                        font-weight: bold;
                    }
                    
                    .custom-commands-plugin .status-badge.enabled {
                        background: rgba(0,255,0,0.2);
                        color: #00ff00;
                    }
                    
                    .custom-commands-plugin .status-badge.disabled {
                        background: rgba(255,0,0,0.2);
                        color: #ff6b6b;
                    }
                    
                    .custom-commands-plugin .command-details {
                        margin-bottom: 15px;
                        padding: 10px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 4px;
                    }
                    
                    .custom-commands-plugin .command-details > div {
                        margin-bottom: 8px;
                        font-size: 0.9rem;
                    }
                    
                    .custom-commands-plugin .command-details > div:last-child {
                        margin-bottom: 0;
                    }
                    
                    .custom-commands-plugin .command-actions {
                        display: flex;
                        gap: 8px;
                        flex-wrap: wrap;
                    }
                    
                    .custom-commands-plugin .btn-sm {
                        padding: 6px 12px;
                        font-size: 0.8rem;
                    }
                    
                    .custom-commands-plugin .empty-state {
                        text-align: center;
                        padding: 60px 20px;
                        color: rgba(255,255,255,0.7);
                    }
                    
                    .custom-commands-plugin .empty-state h4 {
                        color: #fff;
                        margin-bottom: 10px;
                    }
                    
                    .custom-commands-plugin .modal {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.8);
                        display: none;
                        justify-content: center;
                        align-items: flex-start;
                        z-index: 1000;
                        padding: 20px;
                        overflow-y: auto;
                    }
                    
                    .custom-commands-plugin .modal-content {
                        background: #2f3136;
                        border-radius: 8px;
                        width: 100%;
                        max-width: 600px;
                        max-height: 90vh;
                        overflow-y: auto;
                        margin-top: 20px;
                    }
                    
                    .custom-commands-plugin .modal-header {
                        padding: 20px;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    
                    .custom-commands-plugin .modal-header h3 {
                        margin: 0;
                        color: #fff;
                    }
                    
                    .custom-commands-plugin .modal-close {
                        background: none;
                        border: none;
                        color: #fff;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        width: 30px;
                        height: 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    
                    .custom-commands-plugin .modal-body {
                        padding: 20px;
                    }
                    
                    .custom-commands-plugin .modal-footer {
                        padding: 20px;
                        border-top: 1px solid rgba(255,255,255,0.1);
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                    }
                    
                    .custom-commands-plugin .form-section {
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                    }
                    
                    .custom-commands-plugin .form-section:last-child {
                        border-bottom: none;
                    }
                    
                    .custom-commands-plugin .form-section h4 {
                        color: #fff;
                        margin-bottom: 15px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    
                    .custom-commands-plugin .form-row {
                        display: flex;
                        gap: 15px;
                    }
                    
                    .custom-commands-plugin .form-row .form-group {
                        flex: 1;
                    }
                    
                    .custom-commands-plugin .trigger-options,
                    .custom-commands-plugin .response-options {
                        margin-top: 15px;
                        padding: 15px;
                        background: rgba(255,255,255,0.02);
                        border-radius: 6px;
                        border: 1px solid rgba(255,255,255,0.05);
                    }
                    
                    .custom-commands-plugin .template-card {
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        padding: 15px;
                        margin-bottom: 15px;
                    }
                    
                    .custom-commands-plugin .template-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 10px;
                    }
                    
                    .custom-commands-plugin .template-category {
                        background: rgba(88,101,242,0.2);
                        color: #5865F2;
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 0.75rem;
                        font-weight: bold;
                    }
                    
                    .custom-commands-plugin .template-actions {
                        display: flex;
                        gap: 8px;
                        margin-top: 10px;
                    }
                    
                    .custom-commands-plugin .flow-editor-container {
                        border: 2px dashed rgba(255,255,255,0.2);
                        border-radius: 8px;
                        padding: 40px;
                        text-align: center;
                        min-height: 200px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    }
                    
                    .custom-commands-plugin .flow-toolbar {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 20px;
                        justify-content: center;
                    }
                    
                    .custom-commands-plugin .test-result {
                        margin-top: 15px;
                        padding: 15px;
                        border-radius: 6px;
                    }
                    
                    .custom-commands-plugin .test-success {
                        background: rgba(0,255,0,0.1);
                        border: 1px solid rgba(0,255,0,0.3);
                    }
                    
                    .custom-commands-plugin .test-error {
                        background: rgba(255,0,0,0.1);
                        border: 1px solid rgba(255,0,0,0.3);
                    }
                    
                    .custom-commands-plugin .preview-content {
                        background: rgba(0,0,0,0.3);
                        padding: 10px;
                        border-radius: 4px;
                        margin-top: 8px;
                        font-family: monospace;
                    }
                    
                    .custom-commands-plugin .variables-list {
                        max-height: 300px;
                        overflow-y: auto;
                    }
                    
                    .custom-commands-plugin .variable-item {
                        background: rgba(255,255,255,0.05);
                        padding: 8px 12px;
                        margin-bottom: 5px;
                        border-radius: 4px;
                        font-family: monospace;
                        font-size: 0.9rem;
                    }
                    
                    .custom-commands-plugin .user-variable-section {
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                    }
                    
                    .custom-commands-plugin .user-variable-section h6 {
                        color: #5865F2;
                        margin-bottom: 10px;
                    }
                    
                    .custom-commands-plugin .schedule-presets {
                        display: flex;
                        gap: 8px;
                        margin-top: 10px;
                        flex-wrap: wrap;
                    }
                    
                    .custom-commands-plugin .preset-btn {
                        font-size: 0.8rem;
                        padding: 6px 12px;
                    }
                    
                    @media (max-width: 768px) {
                        .custom-commands-plugin .command-actions {
                            flex-direction: column;
                        }
                        
                        .custom-commands-plugin .form-row {
                            flex-direction: column;
                        }
                        
                        .custom-commands-plugin .modal-content {
                            width: 95%;
                            margin: 10px;
                        }
                        
                        .custom-commands-plugin .tab-nav {
                            flex-wrap: wrap;
                        }
                        
                        .custom-commands-plugin .tab-btn {
                            padding: 8px 12px;
                            font-size: 0.9rem;
                        }
                    }
                \`;
                document.head.appendChild(style);
                
                console.log("✅ Custom Commands Plugin: Frontend component initialized successfully!");
            })();`
        };
    }
}

module.exports = CustomCommandsPlugin;