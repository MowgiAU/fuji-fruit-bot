const fs = require('fs').promises;
const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');

class GenreDiscoveryPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Genre Discovery';
        this.description = 'Helps music producers share and discover each other\'s genres and setups.';
        this.version = '1.0.0';
        this.enabled = true;

        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;

        this.dataFile = path.join(__dirname, '../data/genreDiscoveryData.json');
        this.settingsFile = path.join(__dirname, '../data/genreDiscoverySettings.json');

        this.initializeData();
        this.setupRoutes();
        this.setupSlashCommands();
        
        console.log('Genre Discovery plugin loaded successfully!');
    }

    async initializeData() {
        try {
            await fs.access(this.dataFile).catch(() => 
                fs.writeFile(this.dataFile, JSON.stringify({}, null, 2))
            );
            await fs.access(this.settingsFile).catch(() => 
                fs.writeFile(this.settingsFile, JSON.stringify({}, null, 2))
            );
        } catch (error) {
            console.error('Error initializing Genre Discovery data:', error);
        }
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }

    async saveData(data) {
        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    }

    async loadSettings() {
        try {
            const settings = await fs.readFile(this.settingsFile, 'utf8');
            return JSON.parse(settings);
        } catch (error) {
            return {};
        }
    }

    async saveSettings(settings) {
        await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
    }

    setupRoutes() {
        this.app.get('/api/plugins/genrediscovery/settings/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.params.guildId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                const settings = await this.loadSettings();
                res.json(settings[req.params.guildId] || { logChannelId: null });
            } catch (error) {
                console.error('Error getting settings:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.post('/api/plugins/genrediscovery/settings/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.params.guildId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                const settings = await this.loadSettings();
                settings[req.params.guildId] = req.body;
                await this.saveSettings(settings);
                res.json({ success: true });
            } catch (error) {
                console.error('Error saving settings:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.get('/api/plugins/genrediscovery/stats/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.params.guildId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                const data = await this.loadData();
                const guildData = data[req.params.guildId] || {};
                
                const genreCounts = {};
                const dawCounts = {};

                for (const userId in guildData) {
                    if (guildData[userId].genres) {
                        guildData[userId].genres.forEach(genre => {
                            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                        });
                    }
                    if (guildData[userId].daws) {
                        guildData[userId].daws.forEach(daw => {
                            dawCounts[daw] = (dawCounts[daw] || 0) + 1;
                        });
                    }
                }

                const topGenres = Object.entries(genreCounts)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 10);
                
                const topDaws = Object.entries(dawCounts)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 10);

                res.json({ topGenres, topDaws });
            } catch (error) {
                console.error('Error getting stats:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }

    getUserData(data, guildId, userId) {
        if (!data[guildId]) data[guildId] = {};
        if (!data[guildId][userId]) data[guildId][userId] = { genres: [], daws: [] };
        return data[guildId][userId];
    }

    async logTagUpdate(interaction, user, action, type, tags) {
        try {
            const settings = await this.loadSettings();
            const guildSettings = settings[interaction.guildId];
            
            if (!guildSettings?.logChannelId) return;
            
            const channel = interaction.guild.channels.cache.get(guildSettings.logChannelId);
            if (!channel) return;
            
            const embed = {
                color: 0x7289DA,
                title: '🏷️ Tag Update',
                fields: [
                    { name: 'User', value: user.toString(), inline: true },
                    { name: 'Action', value: action, inline: true },
                    { name: 'Type', value: type, inline: true },
                    { name: 'Tags', value: tags.join(', '), inline: false }
                ],
                timestamp: new Date().toISOString()
            };
            
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error logging tag update:', error);
        }
    }

    setupSlashCommands() {
        this.client.once('ready', async () => {
            try {
                const commands = [
                    new SlashCommandBuilder()
                        .setName('set')
                        .setDescription('Set your genre or software tags')
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('genre')
                                .setDescription('Set your genre tags')
                                .addStringOption(option => option.setName('tags').setDescription('Comma-separated genres').setRequired(true)))
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('daw')
                                .setDescription('Set your software/DAW tags')
                                .addStringOption(option => option.setName('tags').setDescription('Comma-separated software/DAWs').setRequired(true))),
                    
                    new SlashCommandBuilder()
                        .setName('find')
                        .setDescription('Find users by their tags')
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('genre')
                                .setDescription('Find users by genre')
                                .addStringOption(option => option.setName('tag').setDescription('Genre to search for').setRequired(true)))
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('daw')
                                .setDescription('Find users by software/DAW')
                                .addStringOption(option => option.setName('tag').setDescription('Software/DAW to search for').setRequired(true))),
                    
                    new SlashCommandBuilder()
                        .setName('tags')
                        .setDescription('View user tags')
                        .addUserOption(option => option.setName('user').setDescription('The user to view (defaults to yourself).')),
                ];

                // Register for each guild the bot is in
                this.client.guilds.cache.forEach(async (guild) => {
                    for (const command of commands) {
                        await guild.commands.create(command.toJSON());
                    }
                });
                
                console.log('✓ Genre Discovery slash commands registered.');
            } catch (error) {
                console.error('Error registering Genre Discovery commands:', error);
            }
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName } = interaction;
            if (['set', 'find', 'tags'].includes(commandName)) {
                await this.handleGenreCommands(interaction);
            }
        });
    }

    async handleGenreCommands(interaction) {
        try {
            const { commandName, options, guildId, user } = interaction;
            const data = await this.loadData();
            const userData = this.getUserData(data, guildId, user.id);

            await interaction.deferReply({ ephemeral: false });

            if (commandName === 'set') {
                const subCommand = options.getSubcommand();
                const type = subCommand === 'genre' ? 'genres' : 'daws';
                const typeName = subCommand;
                const inputTags = options.getString('tags').split(',').map(t => t.trim()).filter(Boolean);
                
                userData[type] = [...new Set([...userData[type], ...inputTags])];
                await this.saveData(data);
                await this.logTagUpdate(interaction, user, 'added', typeName, inputTags);

                await interaction.editReply(`✅ Your ${typeName} tags have been updated: ${inputTags.join(', ')}`);
            }

            else if (commandName === 'tags') {
                const targetUser = options.getUser('user') || user;
                const targetData = data[guildId]?.[targetUser.id] || { genres: [], daws: [] };

                const embed = {
                    color: 0x7289DA,
                    author: { name: `${targetUser.username}'s Tags`, icon_url: targetUser.displayAvatarURL() },
                    fields: [
                        { name: '🎶 Genres', value: targetData.genres.length > 0 ? targetData.genres.join(', ') : 'None set.', inline: false },
                        { name: '💻 Software', value: targetData.daws.length > 0 ? targetData.daws.join(', ') : 'None set.', inline: false }
                    ]
                };
                await interaction.editReply({ embeds: [embed] });
            }

            else if (commandName === 'find') {
                const subCommand = options.getSubcommand();
                const type = subCommand === 'genre' ? 'genres' : 'daws';
                const typeName = subCommand;
                const tagToFind = options.getString('tag').trim();
                const guildData = data[guildId] || {};
                
                let matches = [];
                for (const userId in guildData) {
                    if (guildData[userId][type]?.some(t => t.toLowerCase() === tagToFind.toLowerCase())) {
                        try {
                           const member = await interaction.guild.members.fetch(userId);
                           matches.push(member.toString());
                        } catch { 
                            // Member likely left the server
                        }
                    }
                }

                const embed = {
                    color: 0x7289DA,
                    title: `🔍 Producers with ${typeName}: **${tagToFind}**`,
                    description: matches.length > 0 ? matches.join('\n') : `No producers found with the **${tagToFind}** tag.`,
                };
                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error handling genre command:', error);
            
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: '❌ An error occurred while processing your command.' });
                } else {
                    await interaction.reply({ content: '❌ An error occurred while processing your command.', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }

    getFrontendComponent() {
        return {
            id: 'genre-discovery-plugin',
            name: 'Genre Discovery',
            description: 'Helps music producers share and discover each other\'s genres and setups',
            icon: '🎶',
            version: '1.0.0',
            
            // Plugin defines its own targets
            containerId: 'genreDiscoveryPluginContainer',  // Where to inject HTML
            pageId: 'genre-discovery',                     // Page ID for navigation
            navIcon: '🎶',                                // Icon for navigation
            
            html: `<div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">🎶</span> Genre Discovery</h3>
                    <p>Helps music producers share and discover each other's genres and setups</p>
                </div>

                <div class="settings-section">
                    <h3>Server Selection</h3>
                    <div class="form-group">
                        <label for="genre-server-select">Server:</label>
                        <select id="genre-server-select" class="form-control">
                            <option value="">Select a server...</option>
                        </select>
                    </div>
                </div>

                <div id="genre-stats-section" style="display: none;">
                    <h3>📊 Server Statistics</h3>
                    <div class="stats-grid">
                        <div class="stats-card">
                            <h4>🎶 Popular Genres</h4>
                            <div class="stats-list" id="genre-stats-list">
                                <div class="no-data">No genre data available</div>
                            </div>
                        </div>
                        <div class="stats-card">
                            <h4>💻 Popular Software</h4>
                            <div class="stats-list" id="daw-stats-list">
                                <div class="no-data">No software data available</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="genre-settings-section" style="display: none;">
                    <h3>⚙️ Settings</h3>
                    <div class="form-group">
                        <label for="genre-log-channel">Log Channel (Optional):</label>
                        <select id="genre-log-channel" class="form-control">
                            <option value="">No logging</option>
                        </select>
                        <small style="opacity: 0.7; display: block; margin-top: 4px;">
                            Choose where tag updates will be logged
                        </small>
                    </div>
                    
                    <button type="button" id="save-genre-settings" class="btn-primary">
                        <span class="btn-text">Save Settings</span>
                        <span class="btn-loader" style="display: none;">Saving...</span>
                    </button>
                </div>

                <div id="genre-refresh-section" style="display: none;">
                    <h3>🔄 Data Management</h3>
                    <button type="button" id="refresh-genre-stats" class="btn-secondary">
                        🔄 Refresh Statistics
                    </button>
                </div>

                <div class="info-section">
                    <h3>Available Commands</h3>
                    <div class="command-list">
                        <div class="command-item">
                            <code>/set genre [tags]</code>
                            <span>Set your genre(s). Separate multiple with commas.</span>
                        </div>
                        <div class="command-item">
                            <code>/set daw [tags]</code>
                            <span>Set your software/DAW(s). Separate multiple with commas.</span>
                        </div>
                        <div class="command-item">
                            <code>/find genre [tag]</code>
                            <span>Find users by genre.</span>
                        </div>
                        <div class="command-item">
                            <code>/find daw [tag]</code>
                            <span>Find users by software/DAW.</span>
                        </div>
                        <div class="command-item">
                            <code>/tags [@user]</code>
                            <span>View a user's tags (defaults to yourself).</span>
                        </div>
                    </div>
                </div>
            </div>`,
            script: `
                (function() {
                    console.log('🎶 Loading Genre Discovery plugin...');
                    
                    const genreServerSelect = document.getElementById('genre-server-select');
                    const genreStatsSection = document.getElementById('genre-stats-section');
                    const genreSettingsSection = document.getElementById('genre-settings-section');
                    const genreRefreshSection = document.getElementById('genre-refresh-section');
                    const genreLogChannel = document.getElementById('genre-log-channel');
                    const saveGenreSettings = document.getElementById('save-genre-settings');
                    const refreshGenreStats = document.getElementById('refresh-genre-stats');
                    const genreStatsList = document.getElementById('genre-stats-list');
                    const dawStatsList = document.getElementById('daw-stats-list');
                    const btnText = saveGenreSettings ? saveGenreSettings.querySelector('.btn-text') : null;
                    const btnLoader = saveGenreSettings ? saveGenreSettings.querySelector('.btn-loader') : null;
                    
                    let currentGuildId = null;
                    
                    if (genreServerSelect) {
                        genreServerSelect.addEventListener('change', handleGenreServerChange);
                        loadGenreServers();
                        console.log('✓ Genre server select initialized');
                    } else {
                        console.warn('⚠ Genre server select not found');
                    }
                    
                    if (saveGenreSettings) {
                        saveGenreSettings.addEventListener('click', saveGenreSettings_internal);
                    }
                    
                    if (refreshGenreStats) {
                        refreshGenreStats.addEventListener('click', loadGenreStats);
                    }
                    
                    async function loadGenreServers() {
                        try {
                            console.log('🔄 Loading genre servers...');
                            const response = await fetch('/api/servers');
                            const servers = await response.json();
                            
                            if (genreServerSelect) {
                                genreServerSelect.innerHTML = '<option value="">Select a server...</option>';
                                servers.forEach(server => {
                                    const option = document.createElement('option');
                                    option.value = server.id;
                                    option.textContent = server.name;
                                    genreServerSelect.appendChild(option);
                                });
                                console.log(\`✓ Loaded \${servers.length} servers for genre discovery\`);
                            }
                        } catch (error) {
                            console.error('❌ Error loading servers:', error);
                            if (window.showNotification) {
                                window.showNotification('Error loading servers', 'error');
                            }
                        }
                    }
                    
                    async function handleGenreServerChange() {
                        currentGuildId = genreServerSelect ? genreServerSelect.value : null;
                        console.log('🔄 Server changed:', currentGuildId);
                        
                        if (currentGuildId) {
                            try {
                                await Promise.all([
                                    loadGenreChannels(),
                                    loadGenreSettings(),
                                    loadGenreStats()
                                ]);
                                showGenreSections();
                                console.log('✓ Genre data loaded for guild:', currentGuildId);
                            } catch (error) {
                                console.error('❌ Error loading genre data:', error);
                            }
                        } else {
                            hideGenreSections();
                            console.log('✓ Genre sections hidden (no server selected)');
                        }
                    }
                    
                    function showGenreSections() {
                        [genreStatsSection, genreSettingsSection, genreRefreshSection].forEach(section => {
                            if (section) section.style.display = 'block';
                        });
                        console.log('✓ Genre sections shown');
                    }
                    
                    function hideGenreSections() {
                        [genreStatsSection, genreSettingsSection, genreRefreshSection].forEach(section => {
                            if (section) section.style.display = 'none';
                        });
                        console.log('✓ Genre sections hidden');
                    }
                    
                    async function loadGenreChannels() {
                        try {
                            console.log('🔄 Loading genre channels...');
                            const response = await fetch(\`/api/channels/\${currentGuildId}\`);
                            const channels = await response.json();
                            
                            if (genreLogChannel) {
                                genreLogChannel.innerHTML = '<option value="">No logging</option>';
                                channels.forEach(channel => {
                                    const option = document.createElement('option');
                                    option.value = channel.id;
                                    option.textContent = \`# \${channel.name}\`;
                                    genreLogChannel.appendChild(option);
                                });
                                console.log(\`✓ Loaded \${channels.length} channels for genre discovery\`);
                            }
                        } catch (error) {
                            console.error('❌ Error loading channels:', error);
                        }
                    }
                    
                    async function loadGenreSettings() {
                        try {
                            console.log('🔄 Loading genre settings...');
                            const response = await fetch(\`/api/plugins/genrediscovery/settings/\${currentGuildId}\`);
                            const settings = await response.json();
                            
                            if (genreLogChannel) {
                                genreLogChannel.value = settings.logChannelId || '';
                            }
                            console.log('✓ Genre settings loaded');
                        } catch (error) {
                            console.error('❌ Error loading genre settings:', error);
                        }
                    }
                    
                    async function loadGenreStats() {
                        if (!currentGuildId) return;
                        
                        try {
                            console.log('🔄 Loading genre stats...');
                            if (refreshGenreStats) {
                                refreshGenreStats.disabled = true;
                                refreshGenreStats.textContent = '🔄 Loading...';
                            }
                            
                            const response = await fetch(\`/api/plugins/genrediscovery/stats/\${currentGuildId}\`);
                            const stats = await response.json();
                            
                            displayGenreStats(stats.topGenres, genreStatsList);
                            displayGenreStats(stats.topDaws, dawStatsList);
                            console.log('✓ Genre stats loaded and displayed');
                            
                        } catch (error) {
                            console.error('❌ Error loading genre stats:', error);
                            if (window.showNotification) {
                                window.showNotification('Error loading statistics', 'error');
                            }
                        } finally {
                            if (refreshGenreStats) {
                                refreshGenreStats.disabled = false;
                                refreshGenreStats.textContent = '🔄 Refresh Statistics';
                            }
                        }
                    }
                    
                    function displayGenreStats(data, container) {
                        if (!container) return;
                        
                        if (!data || data.length === 0) {
                            container.innerHTML = '<div class="no-data">No data available</div>';
                            return;
                        }
                        
                        container.innerHTML = '';
                        data.forEach(([tag, count]) => {
                            const item = document.createElement('div');
                            item.className = 'stats-item';
                            item.innerHTML = \`
                                <span class="tag">\${tag}</span>
                                <span class="count">\${count} user\${count === 1 ? '' : 's'}</span>
                            \`;
                            container.appendChild(item);
                        });
                    }
                    
                    async function saveGenreSettings_internal() {
                        if (!currentGuildId) {
                            if (window.showNotification) {
                                window.showNotification('Please select a server first', 'error');
                            }
                            return;
                        }
                        
                        try {
                            console.log('💾 Saving genre settings...');
                            if (btnText) btnText.style.display = 'none';
                            if (btnLoader) btnLoader.style.display = 'inline';
                            if (saveGenreSettings) saveGenreSettings.disabled = true;
                            
                            const settings = {
                                logChannelId: genreLogChannel ? genreLogChannel.value || null : null
                            };
                            
                            const response = await fetch(\`/api/plugins/genrediscovery/settings/\${currentGuildId}\`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(settings)
                            });
                            
                            const result = await response.json();
                            
                            if (response.ok) {
                                if (window.showNotification) {
                                    window.showNotification('Genre Discovery settings saved successfully!', 'success');
                                }
                                console.log('✓ Genre settings saved successfully');
                            } else {
                                throw new Error(result.error || 'Failed to save settings');
                            }
                        } catch (error) {
                            console.error('❌ Error saving genre settings:', error);
                            if (window.showNotification) {
                                window.showNotification(error.message, 'error');
                            }
                        } finally {
                            if (btnText) btnText.style.display = 'inline';
                            if (btnLoader) btnLoader.style.display = 'none';
                            if (saveGenreSettings) saveGenreSettings.disabled = false;
                        }
                    }
                    
                    console.log('✅ Genre Discovery plugin loaded successfully!');
                })();
            `
        };
    }
}

module.exports = GenreDiscoveryPlugin;