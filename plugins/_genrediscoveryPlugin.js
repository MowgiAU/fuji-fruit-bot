const fs = require('fs').promises;
const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');

class GenreDiscoveryPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Genre Discovery';
        this.description = 'Helps music producers share and discover each other's genres and setups.';
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
    
    // Helper to log tag updates
    async logTagUpdate(interaction, user, action, type, tags) {
        const settings = await this.loadSettings();
        const guildSettings = settings[interaction.guildId];

        if (guildSettings && guildSettings.logChannelId) {
            const logChannel = this.client.channels.cache.get(guildSettings.logChannelId);
            if (logChannel) {
                const tagString = tags.map(t => `**${t}**`).join(', ');
                const embed = {
                    color: 0x2ECC71,
                    description: `**${user.username}** ${action} ${tagString} ${action === 'added' ? 'to' : 'from'} their ${type}.`,
                    timestamp: new Date().toISOString()
                };
                await logChannel.send({ embeds: [embed] });
            }
        }
    }

    // Helper to get or create user data
    getUserData(data, guildId, userId) {
        if (!data[guildId]) {
            data[guildId] = {};
        }
        if (!data[guildId][userId]) {
            data[guildId][userId] = { genres: [], daws: [] };
        }
        return data[guildId][userId];
    }

    setupSlashCommands() {
        this.client.once('ready', async () => {
            try {
                // FIXED: Register commands individually instead of replacing all commands
                const commands = [
                    new SlashCommandBuilder()
                        .setName('gset')
                        .setDescription('Set your genre or software tags.')
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('genre')
                                .setDescription('Set your genre(s). Separate multiple with commas.')
                                .addStringOption(option => option.setName('tags').setDescription('e.g., Trap, Lo-fi, DnB').setRequired(true)))
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('daw')
                                .setDescription('Set your software/DAW(s). Separate multiple with commas.')
                                .addStringOption(option => option.setName('tags').setDescription('e.g., FL Studio, Ableton').setRequired(true))),
                    new SlashCommandBuilder()
                        .setName('gremove')
                        .setDescription('Remove a specific genre or software tag.')
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('genre')
                                .setDescription('Remove a genre tag.')
                                .addStringOption(option => option.setName('tag').setDescription('The exact genre to remove.').setRequired(true)))
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('daw')
                                .setDescription('Remove a software/DAW tag.')
                                .addStringOption(option => option.setName('tag').setDescription('The exact software to remove.').setRequired(true))),
                    new SlashCommandBuilder()
                        .setName('gfind')
                        .setDescription('Find producers by genre or software.')
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('genre')
                                .setDescription('Find users by genre.')
                                .addStringOption(option => option.setName('tag').setDescription('The genre to search for.').setRequired(true)))
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('daw')
                                .setDescription('Find users by software/DAW.')
                                .addStringOption(option => option.setName('tag').setDescription('The software to search for.').setRequired(true))),
                    new SlashCommandBuilder()
                        .setName('gtags')
                        .setDescription("View a user's tags.")
                        .addUserOption(option => option.setName('user').setDescription('The user to view (defaults to yourself).')),
                ];

                // Register each command individually
                for (const command of commands) {
                    await this.client.application.commands.create(command.toJSON());
                }
                
                console.log('✓ Genre Discovery slash commands registered.');
            } catch (error) {
                console.error('Error registering Genre Discovery commands:', error);
            }
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName } = interaction;
            if (['gset', 'gremove', 'gfind', 'gtags'].includes(commandName)) {
                await this.handleGenreCommands(interaction);
            }
        });
    }

    async handleGenreCommands(interaction) {
        const { commandName, options, guildId, user } = interaction;
        const data = await this.loadData();
        const userData = this.getUserData(data, guildId, user.id);
        const subCommand = options.getSubcommand();

        await interaction.deferReply({ ephemeral: commandName === 'gfind' });

        try {
            if (commandName === 'gset') {
                const type = subCommand === 'genre' ? 'genres' : 'daws';
                const typeName = subCommand;
                const inputTags = options.getString('tags').split(',').map(t => t.trim()).filter(Boolean);
                
                userData[type] = [...new Set([...userData[type], ...inputTags])];
                await this.saveData(data);
                await this.logTagUpdate(interaction, user, 'added', typeName, inputTags);

                await interaction.editReply(`Your ${typeName} tags have been updated!`);
            }

            if (commandName === 'gremove') {
                const type = subCommand === 'genre' ? 'genres' : 'daws';
                const typeName = subCommand;
                const tagToRemove = options.getString('tag').trim();

                const initialLength = userData[type].length;
                userData[type] = userData[type].filter(t => t.toLowerCase() !== tagToRemove.toLowerCase());
                
                if (initialLength > userData[type].length) {
                    await this.saveData(data);
                    await this.logTagUpdate(interaction, user, 'removed', typeName, [tagToRemove]);
                    await interaction.editReply(`Removed **${tagToRemove}** from your ${typeName}s.`);
                } else {
                    await interaction.editReply(`You don't have the **${tagToRemove}** tag.`);
                }
            }

            if (commandName === 'gtags') {
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

            if (commandName === 'gfind') {
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
                        } catch { /* Member likely left */ }
                    }
                }

                const embed = {
                    color: 0x7289DA,
                    title: `Producers with ${typeName}: **${tagToFind}**`,
                    description: matches.length > 0 ? matches.join('\n') : `No producers found with the **${tagToFind}** tag.`,
                };
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error handling genre command:', error);
            await interaction.editReply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }

    setupRoutes() {
        // Get settings for the dashboard
        this.app.get('/api/plugins/genrediscovery/settings/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.params.guildId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
                const settings = await this.loadSettings();
                res.json(settings[req.params.guildId] || { logChannelId: null, predefinedGenres: [], predefinedDaws: [] });
            } catch (error) {
                console.error('Error getting settings:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Save settings from the dashboard
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

        // Get stats for the dashboard
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
                    guildData[userId].genres?.forEach(genre => {
                        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                    });
                    guildData[userId].daws?.forEach(daw => {
                        dawCounts[daw] = (dawCounts[daw] || 0) + 1;
                    });
                }

                // Sort and take top 10
                const topGenres = Object.entries(genreCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
                const topDaws = Object.entries(dawCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);

                res.json({ topGenres, topDaws });
            } catch (error) {
                console.error('Error getting stats:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }

    getFrontendComponent() {
        return {
            id: 'genre-discovery',
            name: 'Genre Discovery',
            description: 'Manage genre and software tags for your server.',
            icon: '🎶',
            html: `
                <div class="plugin-container">
                    <div class="plugin-header">
                        <h3><span class="plugin-icon">🎶</span> Genre Discovery</h3>
                        <p>Help music producers share and discover each other's genres and setups</p>
                    </div>

                    <div class="settings-section">
                        <h3>Settings</h3>
                        <div class="form-group">
                            <label>Server:</label>
                            <select id="genre-server-select" class="form-control">
                                <option value="">Select a server...</option>
                            </select>
                        </div>

                        <div id="genre-settings-container" style="display: none;">
                            <div class="form-group">
                                <label for="genre-log-channel">Log Channel (Optional):</label>
                                <select id="genre-log-channel" class="form-control">
                                    <option value="">Select a channel for tag logs...</option>
                                </select>
                                <small style="opacity: 0.7; display: block; margin-top: 4px;">
                                    Choose where tag update logs will be sent
                                </small>
                            </div>

                            <button type="button" id="save-genre-settings" class="btn-primary">
                                <span class="btn-text">Save Settings</span>
                                <span class="btn-loader" style="display: none;">Saving...</span>
                            </button>
                        </div>
                    </div>

                    <div id="genre-stats-section" style="display: none;">
                        <h3>Server Statistics</h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                            <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px;">
                                <h4>🎶 Top Genres</h4>
                                <div id="top-genres-list"></div>
                            </div>
                            
                            <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px;">
                                <h4>💻 Top Software</h4>
                                <div id="top-daws-list"></div>
                            </div>
                        </div>
                        
                        <button type="button" id="refresh-genre-stats" style="background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255, 255, 255, 0.2); padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                            🔄 Refresh Statistics
                        </button>
                    </div>

                    <div class="info-section">
                        <h3>Available Commands</h3>
                        <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; border: 1px solid rgba(255, 255, 255, 0.1);">
                            <div style="margin-bottom: 15px;">
                                <code style="background: rgba(0, 0, 0, 0.3); color: #64B5F6; padding: 6px 10px; border-radius: 6px;">/gset genre [tags]</code>
                                <span style="color: rgba(255, 255, 255, 0.8); margin-left: 10px;">Set your music genres</span>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <code style="background: rgba(0, 0, 0, 0.3); color: #64B5F6; padding: 6px 10px; border-radius: 6px;">/gset daw [tags]</code>
                                <span style="color: rgba(255, 255, 255, 0.8); margin-left: 10px;">Set your software/DAWs</span>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <code style="background: rgba(0, 0, 0, 0.3); color: #64B5F6; padding: 6px 10px; border-radius: 6px;">/gfind genre [tag]</code>
                                <span style="color: rgba(255, 255, 255, 0.8); margin-left: 10px;">Find users by genre</span>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <code style="background: rgba(0, 0, 0, 0.3); color: #64B5F6; padding: 6px 10px; border-radius: 6px;">/gfind daw [tag]</code>
                                <span style="color: rgba(255, 255, 255, 0.8); margin-left: 10px;">Find users by software</span>
                            </div>
                            <div>
                                <code style="background: rgba(0, 0, 0, 0.3); color: #64B5F6; padding: 6px 10px; border-radius: 6px;">/gtags [@user]</code>
                                <span style="color: rgba(255, 255, 255, 0.8); margin-left: 10px;">View someone's tags</span>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            script: `
                (function() {
                    console.log('Genre Discovery plugin frontend loaded');
                    
                    let currentServer = null;
                    
                    async function loadServers() {
                        try {
                            const response = await fetch('/api/servers');
                            const servers = await response.json();
                            
                            const serverSelect = document.getElementById('genre-server-select');
                            if (serverSelect) {
                                serverSelect.innerHTML = '<option value="">Select a server...</option>';
                                servers.forEach(server => {
                                    const option = document.createElement('option');
                                    option.value = server.id;
                                    option.textContent = server.name;
                                    serverSelect.appendChild(option);
                                });
                            }
                        } catch (error) {
                            console.error('Error loading servers:', error);
                        }
                    }
                    
                    async function loadChannels(serverId) {
                        if (!serverId) return;
                        
                        try {
                            const response = await fetch('/api/channels/' + serverId);
                            const channels = await response.json();
                            
                            const logChannelSelect = document.getElementById('genre-log-channel');
                            if (logChannelSelect) {
                                logChannelSelect.innerHTML = '<option value="">Select a channel for tag logs...</option>';
                                channels.forEach(channel => {
                                    const option = document.createElement('option');
                                    option.value = channel.id;
                                    option.textContent = '#' + channel.name;
                                    logChannelSelect.appendChild(option);
                                });
                            }
                        } catch (error) {
                            console.error('Error loading channels:', error);
                        }
                    }
                    
                    async function loadStats(serverId) {
                        if (!serverId) return;
                        
                        try {
                            const response = await fetch('/api/plugins/genrediscovery/stats/' + serverId);
                            const stats = await response.json();
                            
                            const topGenresList = document.getElementById('top-genres-list');
                            const topDawsList = document.getElementById('top-daws-list');
                            
                            if (topGenresList) {
                                topGenresList.innerHTML = stats.topGenres.length > 0 
                                    ? stats.topGenres.map(([genre, count]) => 
                                        '<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.1);"><span>' + genre + '</span><span style="opacity: 0.7;">' + count + ' users</span></div>'
                                      ).join('')
                                    : '<div style="color: rgba(255, 255, 255, 0.6); text-align: center; padding: 20px;">No genre data yet</div>';
                            }
                            
                            if (topDawsList) {
                                topDawsList.innerHTML = stats.topDaws.length > 0 
                                    ? stats.topDaws.map(([daw, count]) => 
                                        '<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.1);"><span>' + daw + '</span><span style="opacity: 0.7;">' + count + ' users</span></div>'
                                      ).join('')
                                    : '<div style="color: rgba(255, 255, 255, 0.6); text-align: center; padding: 20px;">No software data yet</div>';
                            }
                        } catch (error) {
                            console.error('Error loading stats:', error);
                        }
                    }
                    
                    async function saveSettings() {
                        if (!currentServer) return;
                        
                        const saveButton = document.getElementById('save-genre-settings');
                        if (saveButton) saveButton.disabled = true;
                        
                        try {
                            const logChannelSelect = document.getElementById('genre-log-channel');
                            const settings = {
                                logChannelId: logChannelSelect ? logChannelSelect.value : null
                            };
                            
                            const response = await fetch('/api/plugins/genrediscovery/settings/' + currentServer, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(settings)
                            });
                            
                            const result = await response.json();
                            if (result.success && window.showNotification) {
                                window.showNotification('Genre Discovery settings saved!', 'success');
                            }
                        } catch (error) {
                            console.error('Error saving settings:', error);
                            if (window.showNotification) {
                                window.showNotification('Failed to save settings', 'error');
                            }
                        } finally {
                            if (saveButton) saveButton.disabled = false;
                        }
                    }
                    
                    function initializeGenreDiscovery() {
                        loadServers();
                        
                        const serverSelect = document.getElementById('genre-server-select');
                        if (serverSelect) {
                            serverSelect.addEventListener('change', async function() {
                                currentServer = this.value;
                                const settingsContainer = document.getElementById('genre-settings-container');
                                const statsSection = document.getElementById('genre-stats-section');
                                
                                if (currentServer) {
                                    if (settingsContainer) settingsContainer.style.display = 'block';
                                    if (statsSection) statsSection.style.display = 'block';
                                    await loadChannels(currentServer);
                                    await loadStats(currentServer);
                                } else {
                                    if (settingsContainer) settingsContainer.style.display = 'none';
                                    if (statsSection) statsSection.style.display = 'none';
                                }
                            });
                        }
                        
                        const saveButton = document.getElementById('save-genre-settings');
                        if (saveButton) {
                            saveButton.addEventListener('click', saveSettings);
                        }
                        
                        const refreshButton = document.getElementById('refresh-genre-stats');
                        if (refreshButton) {
                            refreshButton.addEventListener('click', function() {
                                if (currentServer) {
                                    loadStats(currentServer);
                                    if (window.showNotification) {
                                        window.showNotification('Statistics refreshed!', 'success');
                                    }
                                }
                            });
                        }
                    }
                    
                    initializeGenreDiscovery();
                })();
            `
        };
    }
}

module.exports = GenreDiscoveryPlugin;