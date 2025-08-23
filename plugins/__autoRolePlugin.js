const fs = require('fs');
const path = require('path');

class AutoRolePlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'AutoRole';
        this.description = 'Automatic role assignment system';
        this.version = '1.0.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        // File-based storage (NOT database)
        this.dataDir = './data';
        this.settingsFile = './data/autoRoleSettings.json';
        
        this.initializeDataFiles();
        this.setupRoutes();
        this.setupEventListeners();
    }

    initializeDataFiles() {
		try {
			// Ensure data directory exists
			if (!fs.existsSync(this.dataDir)) {
				fs.mkdirSync(this.dataDir, { recursive: true });
			}
			
			// Initialize settings file if it doesn't exist
			if (!fs.existsSync(this.settingsFile)) {
				fs.writeFileSync(this.settingsFile, JSON.stringify({}, null, 2));
			}
		} catch (error) {
			console.error('Error initializing AutoRole data files:', error);
		}
	}
	
	loadSettings() {
		try {
			if (fs.existsSync(this.settingsFile)) {
				return JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
			}
		} catch (error) {
			console.error('Error loading AutoRole settings:', error);
		}
		return {};
	}

	saveSettings(settings) {
		try {
			fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
		} catch (error) {
			console.error('Error saving AutoRole settings:', error);
		}
	}
	
	setupRoutes() {
    // Get auto role settings for a server
		this.app.get('/api/plugins/autorole/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
			try {
				const { serverId } = req.params;
				
				const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
				if (!hasAdmin) {
					return res.status(403).json({ error: 'No admin permissions' });
				}
				
				const settings = this.loadSettings();
				res.json(settings[serverId] || {});
			} catch (error) {
				console.error('Error getting autorole settings:', error);
				res.status(500).json({ error: 'Failed to get settings' });
			}
		});

		// Save auto role settings for a server
		this.app.post('/api/plugins/autorole/settings/:serverId', this.ensureAuthenticated, async (req, res) => {
			try {
				const { serverId } = req.params;
				
				const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
				if (!hasAdmin) {
					return res.status(403).json({ error: 'No admin permissions' });
				}
				
				const settings = this.loadSettings();
				settings[serverId] = req.body;
				this.saveSettings(settings);
				
				res.json({ success: true });
			} catch (error) {
				console.error('Error saving autorole settings:', error);
				res.status(500).json({ error: 'Failed to save settings' });
			}
		});

		// Sync level roles endpoint
		this.app.post('/api/plugins/autorole/sync-level-roles/:serverId', this.ensureAuthenticated, async (req, res) => {
			try {
				const { serverId } = req.params;
				
				const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
				if (!hasAdmin) {
					return res.status(403).json({ error: 'No admin permissions' });
				}
				
				// TODO: Implement level role sync logic
				res.json({ success: true, syncCount: 0 });
			} catch (error) {
				console.error('Error syncing level roles:', error);
				res.status(500).json({ error: 'Failed to sync level roles' });
			}
		});
	}
	
	setupEventListeners() {
		// Member join event for join roles
		this.client.on('guildMemberAdd', async (member) => {
			await this.handleMemberJoin(member);
		});

		// Reaction events for reaction roles
		this.client.on('messageReactionAdd', async (reaction, user) => {
			if (user.bot) return;
			await this.handleReactionAdd(reaction, user);
		});

		this.client.on('messageReactionRemove', async (reaction, user) => {
			if (user.bot) return;
			await this.handleReactionRemove(reaction, user);
		});
	}
	
	

    registerEvents() {
        // Member join event for join roles
        this.client.on('guildMemberAdd', async (member) => {
            await this.handleMemberJoin(member);
        });

        // Reaction events for reaction roles
        this.client.on('messageReactionAdd', async (reaction, user) => {
            await this.handleReactionAdd(reaction, user);
        });

        this.client.on('messageReactionRemove', async (reaction, user) => {
            await this.handleReactionRemove(reaction, user);
        });
    }

    getCommands() {
        return [
            new SlashCommandBuilder()
                .setName('autorole')
                .setDescription('Manage automatic role assignments')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
                .setDMPermission(false)
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('View current auto-role settings')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('sync-levels')
                        .setDescription('Sync level roles for all members')
                ),

            new SlashCommandBuilder()
                .setName('reactionrole')
                .setDescription('Manage reaction role messages')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
                .setDMPermission(false)
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('create')
                        .setDescription('Create a new reaction role message')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add a reaction role to an existing message')
                        .addStringOption(option =>
                            option
                                .setName('message_id')
                                .setDescription('The message ID to add reaction role to')
                                .setRequired(true)
                        )
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('The role to assign')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('emoji')
                                .setDescription('The emoji to react with')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a reaction role from a message')
                        .addStringOption(option =>
                            option
                                .setName('message_id')
                                .setDescription('The message ID to remove reaction role from')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('emoji')
                                .setDescription('The emoji to remove')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all reaction role messages in this server')
                )
        ];
    }

    async handleCommand(interaction) {
        const { commandName, options } = interaction;

        if (commandName === 'autorole') {
            const subcommand = options.getSubcommand();
            
            switch (subcommand) {
                case 'status':
                    await this.handleStatusCommand(interaction);
                    break;
                case 'sync-levels':
                    await this.handleSyncLevelsCommand(interaction);
                    break;
            }
        } else if (commandName === 'reactionrole') {
            const subcommand = options.getSubcommand();
            
            switch (subcommand) {
                case 'create':
                    await this.handleCreateReactionRoleCommand(interaction);
                    break;
                case 'add':
                    await this.handleAddReactionRoleCommand(interaction);
                    break;
                case 'remove':
                    await this.handleRemoveReactionRoleCommand(interaction);
                    break;
                case 'list':
                    await this.handleListReactionRolesCommand(interaction);
                    break;
            }
        }
    }

    async handleMemberJoin(member) {
        try {
            const settings = await this.getAutoRoleSettings(member.guild.id);
            
            if (!settings || !settings.join_roles_enabled) return;

            const joinRoles = JSON.parse(settings.join_roles || '[]');
            if (joinRoles.length === 0) return;

            const delay = settings.join_roles_delay || 0;

            setTimeout(async () => {
                try {
                    for (const roleId of joinRoles) {
                        const role = member.guild.roles.cache.get(roleId);
                        if (role && member.manageable) {
                            await member.roles.add(role);
                            console.log(`Added join role ${role.name} to ${member.user.tag} in ${member.guild.name}`);
                        }
                    }
                } catch (error) {
                    console.error('Error assigning join roles:', error);
                }
            }, delay * 1000);

        } catch (error) {
            console.error('Error in handleMemberJoin:', error);
        }
    }

    async handleReactionAdd(reaction, user) {
        if (user.bot) return;

        try {
            const reactionRoleData = await this.getReactionRoleData(reaction.message.guild.id, reaction.message.id);
            if (!reactionRoleData) return;

            const roles = JSON.parse(reactionRoleData.roles || '[]');
            const roleData = roles.find(r => r.emoji === reaction.emoji.toString() || r.emoji === reaction.emoji.name);
            
            if (!roleData) return;

            const guild = reaction.message.guild;
            const member = await guild.members.fetch(user.id);
            const role = guild.roles.cache.get(roleData.roleId);

            if (!role || !member) return;

            if (!member.roles.cache.has(role.id)) {
                await member.roles.add(role);
                console.log(`Added reaction role ${role.name} to ${user.tag} in ${guild.name}`);
            }
        } catch (error) {
            console.error('Error adding reaction role:', error);
        }
    }

    async handleReactionRemove(reaction, user) {
        if (user.bot) return;

        try {
            const reactionRoleData = await this.getReactionRoleData(reaction.message.guild.id, reaction.message.id);
            if (!reactionRoleData) return;

            const roles = JSON.parse(reactionRoleData.roles || '[]');
            const roleData = roles.find(r => r.emoji === reaction.emoji.toString() || r.emoji === reaction.emoji.name);
            
            if (!roleData) return;

            const guild = reaction.message.guild;
            const member = await guild.members.fetch(user.id);
            const role = guild.roles.cache.get(roleData.roleId);

            if (!role || !member) return;

            if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                console.log(`Removed reaction role ${role.name} from ${user.tag} in ${guild.name}`);
            }
        } catch (error) {
            console.error('Error removing reaction role:', error);
        }
    }

    async getAutoRoleSettings(guildId) {
        try {
            const row = await this.db.get(
                'SELECT * FROM autorole_settings WHERE guild_id = ?',
                [guildId]
            );
            return row;
        } catch (error) {
            console.error('Error getting auto role settings:', error);
            return null;
        }
    }

    async getReactionRoleData(guildId, messageId) {
        try {
            const row = await this.db.get(
                'SELECT * FROM reaction_role_messages WHERE guild_id = ? AND message_id = ?',
                [guildId, messageId]
            );
            return row;
        } catch (error) {
            console.error('Error getting reaction role data:', error);
            return null;
        }
    }

    async handleStatusCommand(interaction) {
        const settings = await this.getAutoRoleSettings(interaction.guild.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🎭 Auto-Role Status')
            .setColor('#3498db')
            .setTimestamp();

        if (!settings) {
            embed.setDescription('No auto-role settings configured for this server.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const joinRoles = JSON.parse(settings.join_roles || '[]');
        const levelRoles = JSON.parse(settings.level_roles || '[]');

        embed.addFields(
            {
                name: '🚪 Join Roles',
                value: settings.join_roles_enabled 
                    ? `**Enabled** (${joinRoles.length} roles, ${settings.join_roles_delay}s delay)`
                    : 'Disabled',
                inline: true
            },
            {
                name: '📈 Level Roles', 
                value: settings.level_roles_enabled
                    ? `**Enabled** (${levelRoles.length} roles configured)`
                    : 'Disabled',
                inline: true
            }
        );

        if (joinRoles.length > 0) {
            const roleNames = joinRoles.map(roleId => {
                const role = interaction.guild.roles.cache.get(roleId);
                return role ? role.name : 'Unknown Role';
            });
            embed.addFields({
                name: '📝 Join Roles List',
                value: roleNames.length > 0 ? roleNames.join(', ') : 'None',
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleSyncLevelsCommand(interaction) {
        await interaction.reply({ content: 'Level role sync not yet implemented.', ephemeral: true });
    }

    async handleCreateReactionRoleCommand(interaction) {
        await interaction.reply({ content: 'Reaction role creation not yet implemented.', ephemeral: true });
    }

    async handleAddReactionRoleCommand(interaction) {
        await interaction.reply({ content: 'Adding reaction roles not yet implemented.', ephemeral: true });
    }

    async handleRemoveReactionRoleCommand(interaction) {
        await interaction.reply({ content: 'Removing reaction roles not yet implemented.', ephemeral: true });
    }

    async handleListReactionRolesCommand(interaction) {
        await interaction.reply({ content: 'Listing reaction roles not yet implemented.', ephemeral: true });
    }

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

    // Frontend Component
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
                        <h2>🎭 Auto-Role System</h2>
                        <p>Manage automatic role assignment, reaction roles, and level-based roles</p>
                    </div>
                    
                    <div id="autorole-config" style="display: none;">
                        <!-- Join Roles Section -->
                        <div class="config-section" id="join-roles-section">
                            <h3>🚪 Join Roles</h3>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="join-roles-enabled"> Enable join roles
                                </label>
                            </div>
                            <div id="join-roles-config" style="display: none;">
                                <div class="form-group">
                                    <label for="join-roles-delay">Delay (seconds):</label>
                                    <input type="number" id="join-roles-delay" class="form-control" min="0" value="0">
                                </div>
                                <div class="form-group">
                                    <label for="join-roles-list">Roles to assign:</label>
                                    <select id="join-roles-list" class="form-control role-select" multiple size="5">
                                        <!-- Roles will be populated here -->
                                    </select>
                                    <small class="form-text">Hold Ctrl/Cmd to select multiple roles</small>
                                </div>
                            </div>
                        </div>

                        <!-- Level Roles Section -->
                        <div class="config-section" id="level-roles-section">
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
                                    
                                    <button type="button" id="add-level-role-btn" class="btn btn-secondary" style="width: 100%;">
                                        + Add Level Role
                                    </button>
                                </div>
                                
                                <div class="form-group">
                                    <button type="button" id="sync-level-roles-btn" class="btn btn-info">
                                        🔄 Sync All Level Roles
                                    </button>
                                    <small style="opacity: 0.7; display: block; margin-top: 4px;">
                                        Apply level roles to all existing members
                                    </small>
                                </div>
                            </div>
                        </div>

                        <!-- Reaction Roles Section -->
                        <div class="config-section" id="reaction-roles-section">
                            <h3>⭐ Reaction Roles</h3>
                            
                            <div class="form-group">
                                <label>Existing Reaction Role Messages:</label>
                                <div id="reaction-roles-list" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                                    <div id="no-reaction-roles" style="opacity: 0.6; text-align: center; padding: 20px;">
                                        No reaction role messages configured
                                    </div>
                                </div>
                                
                                <button type="button" id="create-reaction-role-btn" class="btn btn-secondary" style="width: 100%;">
                                    + Create Reaction Role Message
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="plugin-actions">
                        <button id="save-autorole-settings" class="btn btn-primary">Save Settings</button>
                        <button id="download-autorole-settings" class="btn btn-secondary">Download Settings</button>
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
                                <textarea id="rr-description" class="form-control" placeholder="React with the emojis below to get your roles!" rows="3" maxlength="2048"></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label>Reaction Roles:</label>
                                <div id="rr-roles-list" style="min-height: 80px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                                    <div id="no-rr-roles" style="opacity: 0.6; text-align: center; padding: 20px;">
                                        No reaction roles added
                                    </div>
                                </div>
                                
                                <button type="button" id="add-rr-role" class="glass-btn" style="width: 100%;">
                                    + Add Reaction Role
                                </button>
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
                (function() {
                    // Initialize variables
                    let currentGuildId = null;
                    let serverRoles = [];
                    let levelRoles = [];
                    let reactionRoleRoles = [];
                    let editingLevelRoleIndex = -1;

                    // Initialize the plugin
                    async function initializeAutoRolePlugin() {
                        try {
                            setupEventListeners();
                            
                            // Register for global server changes
                            if (window.onServerChange) {
                                window.onServerChange(handleGlobalServerChange);
                                console.log('✓ Registered for global server changes');
                            }
                            
                            // Check if there's already a selected server
                            const currentServerId = window.getCurrentServerId ? window.getCurrentServerId() : null;
                            if (currentServerId) {
                                console.log('✓ Using existing global server selection:', currentServerId);
                                handleGlobalServerChange(currentServerId);
                            }
                            
                            console.log('✓ Auto Role plugin initialized successfully');
                        } catch (error) {
                            console.error('Error initializing Auto Role plugin:', error);
                        }
                    }

                    function setupEventListeners() {
                        const joinRolesEnabled = document.getElementById('join-roles-enabled');
                        if (joinRolesEnabled) {
                            joinRolesEnabled.addEventListener('change', toggleJoinRolesConfig);
                        }

                        const levelRolesEnabled = document.getElementById('level-roles-enabled');
                        if (levelRolesEnabled) {
                            levelRolesEnabled.addEventListener('change', toggleLevelRolesConfig);
                        }

                        const saveBtn = document.getElementById('save-autorole-settings');
                        if (saveBtn) {
                            saveBtn.addEventListener('click', saveAutoRoleSettings);
                        }

                        const downloadBtn = document.getElementById('download-autorole-settings');
                        if (downloadBtn) {
                            downloadBtn.addEventListener('click', downloadAutoRoleSettings);
                        }

                        const addLevelRoleBtn = document.getElementById('add-level-role-btn');
                        if (addLevelRoleBtn) {
                            addLevelRoleBtn.addEventListener('click', openLevelRoleModal);
                        }

                        const syncLevelRolesBtn = document.getElementById('sync-level-roles-btn');
                        if (syncLevelRolesBtn) {
                            syncLevelRolesBtn.addEventListener('click', syncLevelRoles);
                        }

                        const createReactionRoleBtn = document.getElementById('create-reaction-role-btn');
                        if (createReactionRoleBtn) {
                            createReactionRoleBtn.addEventListener('click', openReactionRoleModal);
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

                    // Handle global server changes
                    async function handleGlobalServerChange(serverId) {
                        console.log('🌐 Auto Role: Global server changed to:', serverId);
                        
                        if (!serverId) {
                            currentGuildId = null;
                            hideAllConfigs();
                            return;
                        }
                        
                        currentGuildId = serverId;
                        await loadServerData(serverId);
                        showConfigs();
                    }

                    function hideAllConfigs() {
                        const autoRoleConfig = document.getElementById('autorole-config');
                        if (autoRoleConfig) {
                            autoRoleConfig.style.display = 'none';
                        }
                    }

                    function showConfigs() {
                        const autoRoleConfig = document.getElementById('autorole-config');
                        if (autoRoleConfig) {
                            autoRoleConfig.style.display = 'block';
                        }
                    }

                    async function loadServerData(serverId) {
                        try {
                            // Load server roles
                            const rolesResponse = await fetch(\`/api/servers/\${serverId}/roles\`);
                            if (rolesResponse.ok) {
                                serverRoles = await rolesResponse.json();
                                populateRoleSelects();
                            }

                            // Load existing auto role settings
                            const settingsResponse = await fetch(\`/api/plugins/autorole/settings/\${serverId}\`);
                            if (settingsResponse.ok) {
                                const settings = await settingsResponse.json();
                                populateSettings(settings);
                            }

                        } catch (error) {
                            console.error('Error loading server data:', error);
                        }
                    }

                    function populateRoleSelects() {
                        const joinRolesList = document.getElementById('join-roles-list');
                        const levelRoleSelect = document.getElementById('level-role-role');
                        
                        if (joinRolesList) {
                            joinRolesList.innerHTML = '';
                            serverRoles.forEach(role => {
                                if (role.name !== '@everyone') {
                                    const option = document.createElement('option');
                                    option.value = role.id;
                                    option.textContent = role.name;
                                    joinRolesList.appendChild(option);
                                }
                            });
                        }

                        if (levelRoleSelect) {
                            levelRoleSelect.innerHTML = '<option value="">Select a role...</option>';
                            serverRoles.forEach(role => {
                                if (role.name !== '@everyone') {
                                    const option = document.createElement('option');
                                    option.value = role.id;
                                    option.textContent = role.name;
                                    levelRoleSelect.appendChild(option);
                                }
                            });
                        }
                    }

                    function populateSettings(settings) {
                        if (!settings) return;

                        // Join roles
                        const joinRolesEnabled = document.getElementById('join-roles-enabled');
                        const joinRolesDelay = document.getElementById('join-roles-delay');
                        const joinRolesList = document.getElementById('join-roles-list');

                        if (joinRolesEnabled) {
                            joinRolesEnabled.checked = settings.join_roles_enabled || false;
                            toggleJoinRolesConfig();
                        }

                        if (joinRolesDelay) {
                            joinRolesDelay.value = settings.join_roles_delay || 0;
                        }

                        if (joinRolesList && settings.join_roles) {
                            const joinRoles = JSON.parse(settings.join_roles || '[]');
                            Array.from(joinRolesList.options).forEach(option => {
                                option.selected = joinRoles.includes(option.value);
                            });
                        }

                        // Level roles
                        const levelRolesEnabled = document.getElementById('level-roles-enabled');
                        if (levelRolesEnabled) {
                            levelRolesEnabled.checked = settings.level_roles_enabled || false;
                            toggleLevelRolesConfig();
                        }

                        if (settings.level_roles) {
                            levelRoles = JSON.parse(settings.level_roles || '[]');
                            updateLevelRolesList();
                        }
                    }

                    function toggleJoinRolesConfig() {
                        const enabled = document.getElementById('join-roles-enabled')?.checked;
                        const config = document.getElementById('join-roles-config');
                        
                        if (config) {
                            config.style.display = enabled ? 'block' : 'none';
                        }
                    }

                    function toggleLevelRolesConfig() {
                        const enabled = document.getElementById('level-roles-enabled')?.checked;
                        const config = document.getElementById('level-roles-config');
                        
                        if (config) {
                            config.style.display = enabled ? 'block' : 'none';
                        }
                    }

                    // IMPLEMENTED: Level Role Modal Functions
                    function openLevelRoleModal(levelRoleIndex = -1) {
                        const modal = document.getElementById('level-role-modal');
                        const title = document.getElementById('level-role-modal-title');
                        const levelInput = document.getElementById('level-role-level');
                        const roleSelect = document.getElementById('level-role-role');
                        const removeOldCheckbox = document.getElementById('level-role-remove-old');
                        const saveBtn = document.getElementById('save-level-role');

                        if (!modal) return;

                        editingLevelRoleIndex = levelRoleIndex;

                        if (levelRoleIndex >= 0 && levelRoles[levelRoleIndex]) {
                            // Editing existing level role
                            const levelRole = levelRoles[levelRoleIndex];
                            title.textContent = 'Edit Level Role';
                            levelInput.value = levelRole.level;
                            roleSelect.value = levelRole.roleId;
                            removeOldCheckbox.checked = levelRole.removeOld || false;
                            saveBtn.textContent = 'Update Role';
                        } else {
                            // Adding new level role
                            title.textContent = 'Add Level Role';
                            levelInput.value = '';
                            roleSelect.value = '';
                            removeOldCheckbox.checked = false;
                            saveBtn.textContent = 'Add Role';
                        }

                        modal.style.display = 'block';
                    }

                    window.closeLevelRoleModal = function() {
                        const modal = document.getElementById('level-role-modal');
                        if (modal) {
                            modal.style.display = 'none';
                        }
                        editingLevelRoleIndex = -1;
                    }

                    function saveLevelRole() {
                        const levelInput = document.getElementById('level-role-level');
                        const roleSelect = document.getElementById('level-role-role');
                        const removeOldCheckbox = document.getElementById('level-role-remove-old');

                        if (!levelInput || !roleSelect) return;

                        const level = parseInt(levelInput.value);
                        const roleId = roleSelect.value;
                        const removeOld = removeOldCheckbox.checked;

                        // Validation
                        if (!level || level < 1 || level > 1000) {
                            if (window.showNotification) {
                                window.showNotification('Please enter a valid level (1-1000)', 'error');
                            }
                            return;
                        }

                        if (!roleId) {
                            if (window.showNotification) {
                                window.showNotification('Please select a role', 'error');
                            }
                            return;
                        }

                        // Check for duplicate level (except when editing)
                        const existingIndex = levelRoles.findIndex(lr => lr.level === level);
                        if (existingIndex >= 0 && existingIndex !== editingLevelRoleIndex) {
                            if (window.showNotification) {
                                window.showNotification('A role is already configured for this level', 'error');
                            }
                            return;
                        }

                        const role = serverRoles.find(r => r.id === roleId);
                        if (!role) {
                            if (window.showNotification) {
                                window.showNotification('Selected role not found', 'error');
                            }
                            return;
                        }

                        const levelRoleData = {
                            level: level,
                            roleId: roleId,
                            roleName: role.name,
                            removeOld: removeOld
                        };

                        if (editingLevelRoleIndex >= 0) {
                            // Update existing level role
                            levelRoles[editingLevelRoleIndex] = levelRoleData;
                        } else {
                            // Add new level role
                            levelRoles.push(levelRoleData);
                        }

                        // Sort by level
                        levelRoles.sort((a, b) => a.level - b.level);

                        updateLevelRolesList();
                        closeLevelRoleModal();

                        if (window.showNotification) {
                            window.showNotification('Level role saved successfully', 'success');
                        }
                    }

                    function updateLevelRolesList() {
                        const list = document.getElementById('level-roles-list');
                        const noRoles = document.getElementById('no-level-roles');

                        if (!list) return;

                        if (levelRoles.length === 0) {
                            if (noRoles) noRoles.style.display = 'block';
                            return;
                        }

                        if (noRoles) noRoles.style.display = 'none';

                        const itemsHtml = levelRoles.map((levelRole, index) => \`
                            <div class="level-role-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin: 4px 0; background: rgba(255,255,255,0.1); border-radius: 4px;">
                                <span>
                                    <strong>Level \${levelRole.level}</strong> → \${levelRole.roleName}
                                    \${levelRole.removeOld ? '<small>(removes lower roles)</small>' : ''}
                                </span>
                                <div>
                                    <button onclick="editLevelRole(\${index})" class="btn btn-sm btn-info" style="margin-right: 4px;">Edit</button>
                                    <button onclick="removeLevelRole(\${index})" class="btn btn-sm btn-danger">Remove</button>
                                </div>
                            </div>
                        \`).join('');

                        list.innerHTML = itemsHtml;
                    }

                    window.editLevelRole = function(index) {
                        openLevelRoleModal(index);
                    }

                    window.removeLevelRole = function(index) {
                        if (confirm('Are you sure you want to remove this level role?')) {
                            levelRoles.splice(index, 1);
                            updateLevelRolesList();
                            
                            if (window.showNotification) {
                                window.showNotification('Level role removed', 'success');
                            }
                        }
                    }

                    async function syncLevelRoles() {
                        if (!currentGuildId) {
                            if (window.showNotification) {
                                window.showNotification('Please select a server first', 'error');
                            }
                            return;
                        }

                        try {
                            const response = await fetch(\`/api/plugins/autorole/sync-level-roles/\${currentGuildId}\`, {
                                method: 'POST'
                            });

                            const result = await response.json();

                            if (response.ok) {
                                if (window.showNotification) {
                                    window.showNotification(\`Successfully synced level roles! \${result.syncCount} members updated.\`, 'success');
                                }
                            } else {
                                throw new Error(result.error || 'Failed to sync level roles');
                            }
                        } catch (error) {
                            console.error('Error syncing level roles:', error);
                            if (window.showNotification) {
                                window.showNotification('Failed to sync level roles', 'error');
                            }
                        }
                    }

                    function openReactionRoleModal() {
                        console.log('Opening reaction role modal...');
                        if (window.showNotification) {
                            window.showNotification('Reaction role modal not yet implemented', 'info');
                        }
                    }

                    window.closeReactionRoleModal = function() {
                        const modal = document.getElementById('reaction-role-modal');
                        if (modal) {
                            modal.style.display = 'none';
                        }
                    }

                    async function saveAutoRoleSettings() {
                        if (!currentGuildId) {
                            if (window.showNotification) {
                                window.showNotification('Please select a server first', 'error');
                            }
                            return;
                        }

                        try {
                            const joinRolesEnabled = document.getElementById('join-roles-enabled')?.checked || false;
                            const joinRolesDelay = parseInt(document.getElementById('join-roles-delay')?.value) || 0;
                            const joinRolesList = document.getElementById('join-roles-list');
                            const selectedRoles = joinRolesList ? 
                                Array.from(joinRolesList.selectedOptions).map(option => option.value) : [];

                            const levelRolesEnabled = document.getElementById('level-roles-enabled')?.checked || false;

                            const settings = {
                                join_roles_enabled: joinRolesEnabled,
                                join_roles: JSON.stringify(selectedRoles),
                                join_roles_delay: joinRolesDelay,
                                level_roles_enabled: levelRolesEnabled,
                                level_roles: JSON.stringify(levelRoles)
                            };

                            const response = await fetch(\`/api/plugins/autorole/settings/\${currentGuildId}\`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(settings)
                            });

                            if (!response.ok) throw new Error('Failed to save settings');

                            if (window.showNotification) {
                                window.showNotification('Auto role settings saved successfully', 'success');
                            }

                        } catch (error) {
                            console.error('Error saving auto role settings:', error);
                            if (window.showNotification) {
                                window.showNotification('Failed to save settings', 'error');
                            }
                        }
                    }

                    function downloadAutoRoleSettings() {
                        if (!currentGuildId) {
                            if (window.showNotification) {
                                window.showNotification('Please select a server first', 'error');
                            }
                            return;
                        }

                        const settings = {
                            serverId: currentGuildId,
                            joinRoles: {
                                enabled: document.getElementById('join-roles-enabled')?.checked || false,
                                delay: parseInt(document.getElementById('join-roles-delay')?.value) || 0,
                                roles: Array.from(document.getElementById('join-roles-list')?.selectedOptions || [])
                                    .map(option => ({ id: option.value, name: option.textContent }))
                            },
                            levelRoles: {
                                enabled: document.getElementById('level-roles-enabled')?.checked || false,
                                roles: levelRoles
                            },
                            exportedAt: new Date().toISOString()
                        };

                        const dataStr = JSON.stringify(settings, null, 2);
                        const dataBlob = new Blob([dataStr], { type: 'application/json' });
                        const url = URL.createObjectURL(dataBlob);
                        
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = \`autorole-settings-\${currentGuildId}-\${new Date().toISOString().split('T')[0]}.json\`;
                        link.click();
                        
                        URL.revokeObjectURL(url);

                        if (window.showNotification) {
                            window.showNotification('Settings exported successfully', 'success');
                        }
                    }

                    function addReactionRoleItem() {
                        console.log('Adding reaction role item...');
                        // Implementation for adding reaction role item
                    }

                    function submitReactionRoleMessage() {
                        console.log('Submitting reaction role message...');
                        // Implementation for submitting reaction role message
                    }

                    // Close modals when clicking outside
                    window.addEventListener('click', function(event) {
                        const levelModal = document.getElementById('level-role-modal');
                        const reactionModal = document.getElementById('reaction-role-modal');
                        
                        if (event.target === levelModal) {
                            closeLevelRoleModal();
                        }
                        if (event.target === reactionModal) {
                            closeReactionRoleModal();
                        }
                    });

                    // Initialize when the script loads
                    initializeAutoRolePlugin();

                })();
            `
        };
    }
}

module.exports = AutoRolePlugin;