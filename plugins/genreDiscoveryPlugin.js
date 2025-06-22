const fs = require('fs').promises;
const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');

class GenreDiscoveryPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Genre Discovery';
        this.description = 'Helps music producers share and discover each other’s genres and setups.';
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
                const commands = [
                    new SlashCommandBuilder()
                        .setName('set')
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
                        .setName('remove')
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
                        .setName('find')
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
                        .setName('tags')
                        .setDescription("View a user's tags.")
                        .addUserOption(option => option.setName('user').setDescription('The user to view (defaults to yourself).')),
                ];

                await this.client.application.commands.set(commands.map(c => c.toJSON()));
                console.log('✓ Genre Discovery slash commands registered.');
            } catch (error) {
                console.error('Error registering Genre Discovery commands:', error);
            }
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName } = interaction;
            if (['set', 'remove', 'find', 'tags'].includes(commandName)) {
                await this.handleGenreCommands(interaction);
            }
        });
    }

    async handleGenreCommands(interaction) {
        const { commandName, options, guildId, user } = interaction;
        const data = await this.loadData();
        const userData = this.getUserData(data, guildId, user.id);
        const subCommand = options.getSubcommand();

        await interaction.deferReply({ ephemeral: commandName === 'find' });

        try {
            if (commandName === 'set') {
                const type = subCommand === 'genre' ? 'genres' : 'daws';
                const typeName = subCommand;
                const inputTags = options.getString('tags').split(',').map(t => t.trim()).filter(Boolean);
                
                userData[type] = [...new Set([...userData[type], ...inputTags])];
                await this.saveData(data);
                await this.logTagUpdate(interaction, user, 'added', typeName, inputTags);

                await interaction.editReply(`Your ${typeName} tags have been updated!`);
            }

            if (commandName === 'remove') {
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

            if (commandName === 'tags') {
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

            if (commandName === 'find') {
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
            if (!await this.hasAdminPermissions(req.user.id, req.params.guildId)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            const settings = await this.loadSettings();
            res.json(settings[req.params.guildId] || { logChannelId: null, predefinedGenres: [], predefinedDaws: [] });
        });

        // Save settings from the dashboard
        this.app.post('/api/plugins/genrediscovery/settings/:guildId', this.ensureAuthenticated, async (req, res) => {
            if (!await this.hasAdminPermissions(req.user.id, req.params.guildId)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            const settings = await this.loadSettings();
            settings[req.params.guildId] = req.body;
            await this.saveSettings(settings);
            res.json({ success: true });
        });

        // Get stats for the dashboard
        this.app.get('/api/plugins/genrediscovery/stats/:guildId', this.ensureAuthenticated, async (req, res) => {
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
        });
    }

    getFrontendComponent() {
        // We will create this in the next step!
        return {
            id: 'genre-discovery',
            name: 'Genre Discovery',
            description: 'Manage genre and software tags for your server.',
            icon: '🎶',
            html: `<!-- Frontend component will be added to dashboard.js -->`,
            script: `console.log('Genre Discovery plugin frontend loaded');`
        };
    }
}

module.exports = GenreDiscoveryPlugin;