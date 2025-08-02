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
            if (!fs.existsSync('./data')) {
                fs.mkdirSync('./data', { recursive: true });
            }
            fs.writeFileSync(settingsPath, JSON.stringify(this.autoRoleSettings, null, 2));
        } catch (error) {
            console.error('Error saving auto-role settings:', error);
        }
    }

    saveReactionRoles() {
        try {
            const reactionRolesPath = './data/reactionRoles.json';
            if (!fs.existsSync('./data')) {
                fs.mkdirSync('./data', { recursive: true });
            }
            fs.writeFileSync(reactionRolesPath, JSON.stringify(this.reactionRoles, null, 2));
        } catch (error) {
            console.error('Error saving reaction roles:', error);
        }
    }

    saveLevelRoles() {
        try {
            const levelRolesPath = './data/levelRoles.json';
            if (!fs.existsSync('./data')) {
                fs.mkdirSync('./data', { recursive: true });
            }
            fs.writeFileSync(levelRolesPath, JSON.stringify(this.levelRoles, null, 2));
        } catch (error) {
            console.error('Error saving level roles:', error);
        }
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
                
                const reactionRoles = this.reactionRoles[serverId] || { messages: [] };
                res.json(reactionRoles);
            } catch (error) {
                console.error('Error getting reaction roles:', error);
                res.status(500).json({ error: 'Failed to get reaction roles' });
            }
        });

        // Save reaction roles for a specific server
        this.app.post('/api/plugins/autorole/reactionroles/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, serverId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                
                this.reactionRoles[serverId] = req.body;
                this.saveReactionRoles();
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error saving reaction roles:', error);
                res.status(500).json({ error: 'Failed to save reaction roles' });
            }
        });

        // Get server roles
        this.app.get('/api/roles/:serverId', this.ensureAuthenticated, async (req, res) => {
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
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor,
                        position: role.position,
                        managed: role.managed
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

    setupEventListeners() {
        // Listen for member join events
        this.client.on('guildMemberAdd', async (member) => {
            try {
                const settings = this.autoRoleSettings[member.guild.id];
                if (!settings?.joinRoles?.enabled || !settings.joinRoles.roles.length) {
                    return;
                }

                // Add delay if specified
                if (settings.joinRoles.delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, settings.joinRoles.delay * 1000));
                }

                // Add roles to member
                const rolesToAdd = settings.joinRoles.roles.filter(roleId => 
                    member.guild.roles.cache.has(roleId)
                );

                if (rolesToAdd.length > 0) {
                    await member.roles.add(rolesToAdd);
                    console.log(`Added ${rolesToAdd.length} auto-roles to ${member.user.tag} in ${member.guild.name}`);
                }
            } catch (error) {
                console.error('Error adding auto-roles on join:', error);
            }
        });

        // Listen for reaction events for reaction roles
        this.client.on('messageReactionAdd', async (reaction, user) => {
            try {
                if (user.bot) return;

                const message = reaction.message;
                const guild = message.guild;
                if (!guild) return;

                const reactionRoleSettings = this.reactionRoles[guild.id];
                if (!reactionRoleSettings?.messages) return;

                const messageConfig = reactionRoleSettings.messages.find(msg => msg.messageId === message.id);
                if (!messageConfig) return;

                const reactionConfig = messageConfig.reactions.find(r => r.emoji === reaction.emoji.name || r.emoji === reaction.emoji.toString());
                if (!reactionConfig) return;

                const member = guild.members.cache.get(user.id);
                if (!member) return;

                const role = guild.roles.cache.get(reactionConfig.roleId);
                if (!role) return;

                await member.roles.add(role);
                console.log(`Added reaction role ${role.name} to ${user.tag} in ${guild.name}`);
            } catch (error) {
                console.error('Error adding reaction role:', error);
            }
        });

        this.client.on('messageReactionRemove', async (reaction, user) => {
            try {
                if (user.bot) return;

                const message = reaction.message;
                const guild = message.guild;
                if (!guild) return;

                const reactionRoleSettings = this.reactionRoles[guild.id];
                if (!reactionRoleSettings?.messages) return;

                const messageConfig = reactionRoleSettings.messages.find(msg => msg.messageId === message.id);
                if (!messageConfig) return;

                const reactionConfig = messageConfig.reactions.find(r => r.emoji === reaction.emoji.name || r.emoji === reaction.emoji.toString());
                if (!reactionConfig) return;

                const member = guild.members.cache.get(user.id);
                if (!member) return;

                const role = guild.roles.cache.get(reactionConfig.roleId);
                if (!role) return;

                await member.roles.remove(role);
                console.log(`Removed reaction role ${role.name} from ${user.tag} in ${guild.name}`);
            } catch (error) {
                console.error('Error removing reaction role:', error);
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
                        <h2>🎭 Auto-Role System</h2>
                        <p>Manage automatic role assignment, reaction roles, and level-based roles</p>
                    </div>
                    
                    <div class="form-group">
                        <label for="autorole-server-select">Select Server:</label>
                        <select id="autorole-server-select" class="form-control">
                            <option value="">Select a server...</option>
                        </select>
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
                        <div class="config-section" id="reaction-roles-section">
                            <h3>⭐ Reaction Roles</h3>
                            
                            <div class="form-group">
                                <label>Existing Reaction Role Messages:</label>
                                <div id="reaction-roles-list" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                                    <div id="no-reaction-roles" style="opacity: 0.6; text-align: center; padding: 20px;">
                                        No reaction role messages configured
                                    </div>
                                </div>
                                
                                <button type="button" id="create-reaction-role-btn" class="glass-btn" style="width: 100%;">
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
                        <h3>Add Level Role</h3>
                        <div class="form-group">
                            <label for="level-role-level">Required Level:</label>
                            <input type="number" id="level-role-level" class="form-control" min="1" max="1000">
                        </div>
                        <div class="form-group">
                            <label for="level-role-role">Role:</label>
                            <select id="level-role-role" class="form-control role-select">
                                <option value="">Select a role...</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="level-role-remove-old"> Remove previous level roles
                            </label>
                        </div>
                        <div class="modal-actions">
                            <button id="save-level-role" class="btn btn-primary">Save</button>
                            <button id="cancel-level-role" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>

                <!-- Reaction Role Modal -->
                <div id="reaction-role-modal" class="modal" style="display: none;">
                    <div class="modal-content">
                        <h3>Create Reaction Role Message</h3>
                        <div class="form-group">
                            <label for="rr-channel">Channel:</label>
                            <select id="rr-channel" class="form-control">
                                <option value="">Select a channel...</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="rr-message-title">Message Title:</label>
                            <input type="text" id="rr-message-title" class="form-control" placeholder="Choose your roles!">
                        </div>
                        <div class="form-group">
                            <label for="rr-message-description">Message Description:</label>
                            <textarea id="rr-message-description" class="form-control" rows="3" placeholder="React to this message to get roles..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>Reaction Roles:</label>
                            <div id="rr-roles-list" style="min-height: 80px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                                <div id="no-rr-roles" style="opacity: 0.6; text-align: center; padding: 10px;">
                                    No reaction roles added
                                </div>
                            </div>
                            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <input type="text" id="rr-emoji" class="form-control" placeholder="🎉" style="width: 80px;">
                                <select id="rr-role" class="form-control role-select">
                                    <option value="">Select role...</option>
                                </select>
                                <button type="button" id="add-rr-role" class="btn btn-secondary">Add</button>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button id="submit-rr-message" class="btn btn-primary">Create Message</button>
                            <button id="cancel-rr-message" class="btn btn-secondary">Cancel</button>
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
                    let editingLevelRoleIndex = null;
                    let editingReactionRoleId = null;

                    // Initialize the plugin
                    async function initializeAutoRolePlugin() {
                        try {
                            await loadAutoRoleServers();
                            setupEventListeners();
                            console.log('✓ Auto Role plugin initialized successfully');
                        } catch (error) {
                            console.error('Error initializing Auto Role plugin:', error);
                        }
                    }

                    // FIXED: Implement the missing loadAutoRoleServers function
                    async function loadAutoRoleServers() {
                        try {
                            const response = await fetch('/api/servers');
                            if (!response.ok) throw new Error('Failed to fetch servers');
                            
                            const servers = await response.json();
                            const serverSelect = document.getElementById('autorole-server-select');
                            
                            if (serverSelect) {
                                serverSelect.innerHTML = '<option value="">Select a server...</option>';
                                servers.forEach(server => {
                                    const option = document.createElement('option');
                                    option.value = server.id;
                                    option.textContent = server.name;
                                    serverSelect.appendChild(option);
                                });
                                console.log('✓ Loaded servers for Auto Role plugin');
                            }
                            
                            return servers;
                        } catch (error) {
                            console.error('Error loading auto role servers:', error);
                            if (window.showNotification) {
                                window.showNotification('Failed to load servers', 'error');
                            }
                            throw error;
                        }
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

                        const cancelLevelRoleBtn = document.getElementById('cancel-level-role');
                        if (cancelLevelRoleBtn) {
                            cancelLevelRoleBtn.addEventListener('click', () => {
                                document.getElementById('level-role-modal').style.display = 'none';
                            });
                        }

                        const addRRRoleBtn = document.getElementById('add-rr-role');
                        if (addRRRoleBtn) {
                            addRRRoleBtn.addEventListener('click', addReactionRoleItem);
                        }

                        const submitRRBtn = document.getElementById('submit-rr-message');
                        if (submitRRBtn) {
                            submitRRBtn.addEventListener('click', submitReactionRoleMessage);
                        }

                        const cancelRRBtn = document.getElementById('cancel-rr-message');
                        if (cancelRRBtn) {
                            cancelRRBtn.addEventListener('click', () => {
                                document.getElementById('reaction-role-modal').style.display = 'none';
                            });
                        }
                    }

                    // FIXED: Implement missing functions
                    async function handleServerChange() {
                        const serverSelect = document.getElementById('autorole-server-select');
                        const serverId = serverSelect?.value;
                        
                        if (!serverId) {
                            currentGuildId = null;
                            hideAllConfigs();
                            return;
                        }
                        
                        currentGuildId = serverId;
                        
                        try {
                            // Load server roles
                            await loadServerRoles(serverId);
                            
                            // Load existing settings
                            await loadAutoRoleSettings(serverId);
                            
                            // Show configuration sections
                            showAllConfigs();
                            
                        } catch (error) {
                            console.error('Error handling server change:', error);
                            if (window.showNotification) {
                                window.showNotification('Error loading server data', 'error');
                            }
                        }
                    }

                    async function loadServerRoles(serverId) {
                        try {
                            const response = await fetch(\`/api/roles/\${serverId}\`);
                            if (!response.ok) throw new Error('Failed to fetch roles');
                            
                            serverRoles = await response.json();
                            console.log(\`✓ Loaded \${serverRoles.length} roles for server \${serverId}\`);
                            
                            // Update role dropdowns
                            updateRoleDropdowns();
                            
                        } catch (error) {
                            console.error('Error loading server roles:', error);
                            serverRoles = [];
                        }
                    }

                    async function loadAutoRoleSettings(serverId) {
                        try {
                            const response = await fetch(\`/api/plugins/autorole/settings/\${serverId}\`);
                            if (!response.ok) throw new Error('Failed to fetch auto role settings');
                            
                            const settings = await response.json();
                            
                            // Populate UI with settings
                            populateSettings(settings);
                            
                        } catch (error) {
                            console.error('Error loading auto role settings:', error);
                            // Use default settings
                            populateSettings({
                                joinRoles: { enabled: false, roles: [], delay: 0 },
                                levelRoles: { enabled: false, roles: [] }
                            });
                        }
                    }

                    function populateSettings(settings) {
                        // Join roles settings
                        const joinRolesEnabled = document.getElementById('join-roles-enabled');
                        if (joinRolesEnabled) {
                            joinRolesEnabled.checked = settings.joinRoles?.enabled || false;
                        }
                        
                        const joinRolesDelay = document.getElementById('join-roles-delay');
                        if (joinRolesDelay) {
                            joinRolesDelay.value = settings.joinRoles?.delay || 0;
                        }
                        
                        const joinRolesList = document.getElementById('join-roles-list');
                        if (joinRolesList && settings.joinRoles?.roles) {
                            Array.from(joinRolesList.options).forEach(option => {
                                option.selected = settings.joinRoles.roles.includes(option.value);
                            });
                        }
                        
                        // Level roles settings
                        const levelRolesEnabled = document.getElementById('level-roles-enabled');
                        if (levelRolesEnabled) {
                            levelRolesEnabled.checked = settings.levelRoles?.enabled || false;
                        }
                        
                        levelRoles = settings.levelRoles?.roles || [];
                        updateLevelRolesList();
                        
                        // Update visibility based on settings
                        toggleJoinRolesConfig();
                        toggleLevelRolesConfig();
                    }

                    function updateRoleDropdowns() {
                        // Update all role select elements
                        const roleSelects = document.querySelectorAll('.role-select');
                        
                        roleSelects.forEach(select => {
                            const currentValue = select.value;
                            select.innerHTML = '<option value="">Select a role...</option>';
                            
                            serverRoles.forEach(role => {
                                const option = document.createElement('option');
                                option.value = role.id;
                                option.textContent = role.name;
                                if (role.color) {
                                    option.style.color = role.color;
                                }
                                select.appendChild(option);
                            });
                            
                            // Restore previous selection if it still exists
                            if (currentValue) {
                                select.value = currentValue;
                            }
                        });
                    }

                    function hideAllConfigs() {
                        const configs = document.querySelectorAll('.config-section');
                        configs.forEach(config => {
                            config.style.display = 'none';
                        });
                    }

                    function showAllConfigs() {
                        const configs = document.querySelectorAll('.config-section');
                        configs.forEach(config => {
                            config.style.display = 'block';
                        });
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

                    function updateLevelRolesList() {
                        const container = document.getElementById('level-roles-list');
                        const noRoles = document.getElementById('no-level-roles');
                        
                        if (levelRoles.length === 0) {
                            if (noRoles) noRoles.style.display = 'block';
                            container.querySelectorAll('.level-role-item').forEach(item => item.remove());
                            return;
                        }
                        
                        if (noRoles) noRoles.style.display = 'none';
                        
                        // Clear existing items
                        container.querySelectorAll('.level-role-item').forEach(item => item.remove());
                        
                        // Add level role items
                        levelRoles.forEach((roleConfig, index) => {
                            const roleInfo = serverRoles.find(r => r.id === roleConfig.roleId);
                            const item = document.createElement('div');
                            item.className = 'level-role-item';
                            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.1); margin: 4px 0; border-radius: 4px;';
                            item.innerHTML = \`
                                <div>
                                    <strong>Level \${roleConfig.level}</strong> → 
                                    <span style="color: \${roleInfo?.color || '#ffffff'}">\${roleInfo?.name || 'Unknown Role'}</span>
                                    \${roleConfig.removeOld ? ' (removes previous)' : ''}
                                </div>
                                <button onclick="removeLevelRole(\${index})" style="background: #ff4444; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Remove</button>
                            \`;
                            container.appendChild(item);
                        });
                    }

                    // Placeholder functions for other features
                    function openLevelRoleModal() {
                        document.getElementById('level-role-modal').style.display = 'flex';
                        editingLevelRoleIndex = null;
                        
                        // Clear form
                        document.getElementById('level-role-level').value = '';
                        document.getElementById('level-role-role').value = '';
                        document.getElementById('level-role-remove-old').checked = false;
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
                        document.getElementById('reaction-role-modal').style.display = 'flex';
                        reactionRoleRoles = [];
                        updateReactionRolesList();
                        
                        // Clear form
                        document.getElementById('rr-channel').value = '';
                        document.getElementById('rr-message-title').value = '';
                        document.getElementById('rr-message-description').value = '';
                        document.getElementById('rr-emoji').value = '';
                        document.getElementById('rr-role').value = '';
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
                            const selectedRoles = joinRolesList ? Array.from(joinRolesList.selectedOptions).map(option => option.value) : [];

                            const levelRolesEnabled = document.getElementById('level-roles-enabled')?.checked || false;

                            const settings = {
                                joinRoles: {
                                    enabled: joinRolesEnabled,
                                    roles: selectedRoles,
                                    delay: joinRolesDelay
                                },
                                levelRoles: {
                                    enabled: levelRolesEnabled,
                                    roles: levelRoles
                                }
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

                        try {
                            const settings = {
                                serverId: currentGuildId,
                                joinRoles: {
                                    enabled: document.getElementById('join-roles-enabled')?.checked || false,
                                    roles: document.getElementById('join-roles-list') ? 
                                           Array.from(document.getElementById('join-roles-list').selectedOptions).map(option => ({
                                               id: option.value,
                                               name: option.textContent
                                           })) : [],
                                    delay: parseInt(document.getElementById('join-roles-delay')?.value) || 0
                                },
                                levelRoles: {
                                    enabled: document.getElementById('level-roles-enabled')?.checked || false,
                                    roles: levelRoles
                                },
                                exportDate: new Date().toISOString()
                            };

                            const dataStr = JSON.stringify(settings, null, 2);
                            const dataBlob = new Blob([dataStr], {type: 'application/json'});
                            
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(dataBlob);
                            link.download = \`autorole-settings-\${currentGuildId}-\${new Date().toISOString().split('T')[0]}.json\`;
                            link.click();

                            if (window.showNotification) {
                                window.showNotification('Auto role settings downloaded successfully', 'success');
                            }
                        } catch (error) {
                            console.error('Error downloading auto role settings:', error);
                            if (window.showNotification) {
                                window.showNotification('Failed to download settings', 'error');
                            }
                        }
                    }

                    function saveLevelRole() {
                        const level = parseInt(document.getElementById('level-role-level').value);
                        const roleId = document.getElementById('level-role-role').value;
                        const removeOld = document.getElementById('level-role-remove-old').checked;
                        
                        if (!level || !roleId) {
                            if (window.showNotification) {
                                window.showNotification('Please fill in all fields', 'error');
                            }
                            return;
                        }
                        
                        const roleConfig = {
                            level: level,
                            roleId: roleId,
                            removeOld: removeOld
                        };
                        
                        if (editingLevelRoleIndex !== null) {
                            levelRoles[editingLevelRoleIndex] = roleConfig;
                        } else {
                            levelRoles.push(roleConfig);
                        }
                        
                        // Sort by level
                        levelRoles.sort((a, b) => a.level - b.level);
                        
                        updateLevelRolesList();
                        document.getElementById('level-role-modal').style.display = 'none';
                        
                        if (window.showNotification) {
                            window.showNotification('Level role saved successfully', 'success');
                        }
                    }

                    function removeLevelRole(index) {
                        levelRoles.splice(index, 1);
                        updateLevelRolesList();
                        
                        if (window.showNotification) {
                            window.showNotification('Level role removed', 'success');
                        }
                    }

                    function addReactionRoleItem() {
                        const emoji = document.getElementById('rr-emoji').value.trim();
                        const roleId = document.getElementById('rr-role').value;
                        
                        if (!emoji || !roleId) {
                            if (window.showNotification) {
                                window.showNotification('Please enter an emoji and select a role', 'error');
                            }
                            return;
                        }
                        
                        const roleInfo = serverRoles.find(r => r.id === roleId);
                        if (!roleInfo) {
                            if (window.showNotification) {
                                window.showNotification('Invalid role selected', 'error');
                            }
                            return;
                        }
                        
                        reactionRoleRoles.push({
                            emoji: emoji,
                            roleId: roleId,
                            roleName: roleInfo.name,
                            roleColor: roleInfo.color
                        });
                        
                        updateReactionRolesList();
                        
                        // Clear inputs
                        document.getElementById('rr-emoji').value = '';
                        document.getElementById('rr-role').value = '';
                    }

                    function updateReactionRolesList() {
                        const container = document.getElementById('rr-roles-list');
                        const noRoles = document.getElementById('no-rr-roles');
                        
                        if (reactionRoleRoles.length === 0) {
                            if (noRoles) noRoles.style.display = 'block';
                            container.querySelectorAll('.rr-role-item').forEach(item => item.remove());
                            return;
                        }
                        
                        if (noRoles) noRoles.style.display = 'none';
                        
                        // Clear existing items
                        container.querySelectorAll('.rr-role-item').forEach(item => item.remove());
                        
                        // Add reaction role items
                        reactionRoleRoles.forEach((rrRole, index) => {
                            const item = document.createElement('div');
                            item.className = 'rr-role-item';
                            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.1); margin: 4px 0; border-radius: 4px;';
                            item.innerHTML = \`
                                <div>
                                    <span style="font-size: 18px; margin-right: 8px;">\${rrRole.emoji}</span>
                                    <span style="color: \${rrRole.roleColor || '#ffffff'}">\${rrRole.roleName}</span>
                                </div>
                                <button onclick="removeReactionRoleItem(\${index})" style="background: #ff4444; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Remove</button>
                            \`;
                            container.appendChild(item);
                        });
                    }

                    function removeReactionRoleItem(index) {
                        reactionRoleRoles.splice(index, 1);
                        updateReactionRolesList();
                    }

                    function submitReactionRoleMessage() {
                        const channelId = document.getElementById('rr-channel').value;
                        const title = document.getElementById('rr-message-title').value.trim();
                        const description = document.getElementById('rr-message-description').value.trim();
                        
                        if (!channelId || !title || reactionRoleRoles.length === 0) {
                            if (window.showNotification) {
                                window.showNotification('Please fill in all fields and add at least one reaction role', 'error');
                            }
                            return;
                        }
                        
                        // Implementation for creating reaction role message would go here
                        console.log('Creating reaction role message:', {
                            channelId,
                            title,
                            description,
                            roles: reactionRoleRoles
                        });
                        
                        document.getElementById('reaction-role-modal').style.display = 'none';
                        
                        if (window.showNotification) {
                            window.showNotification('Reaction role message creation not yet implemented', 'info');
                        }
                    }

                    // Make functions globally accessible for onclick handlers
                    window.removeLevelRole = removeLevelRole;
                    window.removeReactionRoleItem = removeReactionRoleItem;

                    // Initialize when the script loads
                    initializeAutoRolePlugin();

                })();
            `
        };
    }

    // Slash command support
    getSlashCommands() {
        return [
            {
                name: 'autorole',
                description: 'Manage automatic role assignment',
                type: 1, // CHAT_INPUT
                options: [
                    {
                        name: 'joinroles',
                        description: 'Manage roles given to new members',
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
                                name: 'role',
                                description: 'Role to add or remove from join roles',
                                type: 8, // ROLE
                                required: false
                            },
                            {
                                name: 'delay',
                                description: 'Delay in seconds before assigning roles',
                                type: 4, // INTEGER
                                required: false,
                                min_value: 0,
                                max_value: 3600
                            }
                        ]
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
                    },
                    {
                        name: 'synclevels',
                        description: 'Sync level roles for all members',
                        type: 1 // SUB_COMMAND
                    }
                ]
            },
            {
                name: 'reactionrole',
                description: 'Manage reaction role messages',
                type: 1, // CHAT_INPUT
                options: [
                    {
                        name: 'create',
                        description: 'Create a new reaction role message',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'channel',
                                description: 'Channel to send the message to',
                                type: 7, // CHANNEL
                                required: true
                            },
                            {
                                name: 'title',
                                description: 'Title for the reaction role message',
                                type: 3, // STRING
                                required: true
                            },
                            {
                                name: 'description',
                                description: 'Description for the reaction role message',
                                type: 3, // STRING
                                required: false
                            }
                        ]
                    },
                    {
                        name: 'addrole',
                        description: 'Add a reaction role to an existing message',
                        type: 1, // SUB_COMMAND
                        options: [
                            {
                                name: 'message_id',
                                description: 'ID of the message to add reaction role to',
                                type: 3, // STRING
                                required: true
                            },
                            {
                                name: 'emoji',
                                description: 'Emoji for the reaction',
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

    // Handle slash commands
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

    async handleJoinRolesCommand(interaction) {
        const guildId = interaction.guild.id;
        const action = interaction.options.getString('action');
        const role = interaction.options.getRole('role');
        const delay = interaction.options.getInteger('delay') ?? 0;
        
        const settings = this.autoRoleSettings[guildId] || {
            joinRoles: { enabled: false, roles: [], delay: 0 }
        };
        
        switch (action) {
            case 'enable':
                settings.joinRoles.enabled = true;
                if (delay !== null) settings.joinRoles.delay = delay;
                this.autoRoleSettings[guildId] = settings;
                this.saveAutoRoleSettings();
                await interaction.reply({ content: 'Join roles enabled!', ephemeral: true });
                break;
                
            case 'disable':
                settings.joinRoles.enabled = false;
                this.autoRoleSettings[guildId] = settings;
                this.saveAutoRoleSettings();
                await interaction.reply({ content: 'Join roles disabled!', ephemeral: true });
                break;
                
            case 'add':
                if (!role) {
                    await interaction.reply({ content: 'Please specify a role to add.', ephemeral: true });
                    return;
                }
                if (!settings.joinRoles.roles.includes(role.id)) {
                    settings.joinRoles.roles.push(role.id);
                    this.autoRoleSettings[guildId] = settings;
                    this.saveAutoRoleSettings();
                    await interaction.reply({ content: `Added ${role.name} to join roles!`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `${role.name} is already in join roles!`, ephemeral: true });
                }
                break;
                
            case 'remove':
                if (!role) {
                    await interaction.reply({ content: 'Please specify a role to remove.', ephemeral: true });
                    return;
                }
                const index = settings.joinRoles.roles.indexOf(role.id);
                if (index > -1) {
                    settings.joinRoles.roles.splice(index, 1);
                    this.autoRoleSettings[guildId] = settings;
                    this.saveAutoRoleSettings();
                    await interaction.reply({ content: `Removed ${role.name} from join roles!`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `${role.name} is not in join roles!`, ephemeral: true });
                }
                break;
                
            case 'list':
                const joinRoles = settings.joinRoles.roles.map(roleId => {
                    const role = interaction.guild.roles.cache.get(roleId);
                    return role ? role.name : 'Unknown Role';
                });
                const status = settings.joinRoles.enabled ? 'Enabled' : 'Disabled';
                const delayText = settings.joinRoles.delay > 0 ? ` (${settings.joinRoles.delay}s delay)` : '';
                
                await interaction.reply({
                    content: `**Join Roles Status:** ${status}${delayText}\n**Roles:** ${joinRoles.length ? joinRoles.join(', ') : 'None'}`,
                    ephemeral: true
                });
                break;
        }
    }

    async handleSyncLevelsCommand(interaction) {
        await interaction.reply({ content: 'Level role sync not yet implemented.', ephemeral: true });
    }

    async handleLevelRolesCommand(interaction) {
        await interaction.reply({ content: 'Level roles management not yet implemented.', ephemeral: true });
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
}

module.exports = AutoRolePlugin;