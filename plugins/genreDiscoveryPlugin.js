const fs = require('fs').promises;
const path = require('path');
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

class GenreDiscoveryPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Genre Discovery';
        this.description = 'Helps music producers share and discover each other\'s genres and setups.';
        this.version = '2.0.0';
        this.enabled = true;

        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;

        this.dataFile = path.join(__dirname, '../data/genreDiscoveryData.json');
        this.settingsFile = path.join(__dirname, '../data/genreDiscoverySettings.json');

        // Predefined lists - organized into chunks for Discord select menus (max 25 options)
        this.genreChunks = [
            {
                name: 'Electronic & Dance',
                genres: ['House', 'Techno', 'Trance', 'Dubstep', 'Future Bass', 'Progressive House', 'Deep House', 'Tech House', 'Minimal Techno', 'Big Room', 'Electro House', 'French House', 'Tropical House', 'UK Garage', 'Future Garage', 'Garage', 'Speed Garage', 'Bassline', 'Breakbeat', 'Hardcore', 'Hardstyle', 'Psytrance', 'Goa Trance', 'Acid Techno', 'Detroit Techno']
            },
            {
                name: 'Bass & Electronic',
                genres: ['Drum & Bass', 'Liquid DNB', 'Neurofunk', 'Jump Up', 'Jungle', 'Riddim', 'Melodic Dubstep', 'Brostep', 'Chillstep', 'Glitch Hop', 'Moombahton', 'Trap', 'Future Trap', 'Hybrid Trap', 'Festival Trap', 'Colour Bass', 'Melodic Bass', 'Tearout', 'Deathstep', 'Drumstep', 'Halftime', 'Neurostep', 'Experimental Bass', 'Wave', 'Phonk']
            },
            {
                name: 'Ambient & Chill',
                genres: ['Ambient', 'Lo-Fi', 'Chillwave', 'Downtempo', 'Chillhop', 'Lounge', 'Trip Hop', 'Chill Trap', 'Future Garage', 'Liquid DnB', 'Jazzhop', 'Study Beats', 'Meditation', 'Nature Sounds', 'Dark Ambient', 'Drone', 'Post-Rock', 'Cinematic', 'Neoclassical', 'Piano', 'Instrumental', 'New Age', 'Ethereal', 'Soundscape', 'Field Recording']
            },
            {
                name: 'Retro & Synthwave',
                genres: ['Synthwave', 'Retrowave', 'Vaporwave', 'Outrun', 'Darksynth', 'Cyberpunk', 'Dreamwave', 'Chillsynth', 'Futuresynth', 'Spacewave', 'Nu-Disco', 'Italo Disco', 'Disco', 'Funk', 'Electro-Funk', 'Synthfunk', '80s Pop', 'New Wave', 'Post-Punk', 'Coldwave', 'Industrial', 'EBM', 'Techno-Pop', 'Kraftwerk Style', 'Minimal Wave']
            },
            {
                name: 'Hip Hop & Urban',
                genres: ['Hip Hop', 'Rap', 'Trap', 'Boom Bap', 'Lo-Fi Hip Hop', 'Jazz Rap', 'Conscious Rap', 'Gangsta Rap', 'Mumble Rap', 'Cloud Rap', 'Emo Rap', 'Drill', 'UK Drill', 'Grime', 'Afrobeat', 'Afro Trap', 'Latin Trap', 'Reggaeton', 'Dancehall', 'Dub', 'Reggae', 'R&B', 'Soul', 'Neo-Soul', 'Alternative R&B']
            },
            {
                name: 'Rock & Alternative',
                genres: ['Rock', 'Alternative Rock', 'Indie Rock', 'Post-Rock', 'Prog Rock', 'Psych Rock', 'Garage Rock', 'Punk Rock', 'Post-Punk', 'Grunge', 'Metal', 'Heavy Metal', 'Death Metal', 'Black Metal', 'Thrash Metal', 'Progressive Metal', 'Metalcore', 'Hardcore', 'Screamo', 'Emo', 'Pop Punk', 'Ska', 'Reggae Rock', 'Folk Rock', 'Country Rock']
            }
        ];

        this.dawChunks = [
            {
                name: 'Professional DAWs',
                daws: ['Ableton Live', 'FL Studio', 'Logic Pro', 'Pro Tools', 'Cubase', 'Studio One', 'Reaper', 'Reason', 'Bitwig Studio', 'Digital Performer', 'Nuendo', 'Samplitude', 'Mixbus', 'Harrison Mixbus', 'Waveform', 'Tracktion T7', 'MuLab', 'n-Track Studio', 'MultitrackStudio', 'Podium', 'Zynewave Podium', 'Music Maker', 'Mixcraft', 'Acid Pro', 'BandLab']
            },
            {
                name: 'Free & Budget DAWs',
                daws: ['GarageBand', 'Audacity', 'Cakewalk', 'LMMS', 'Ardour', 'Renoise', 'OpenMPT', 'Caustic', 'Soundtrap', 'BandLab', 'Ohm Studio', 'Tracktion T7', 'SunVox', 'Zrythm', 'REAPER (Trial)', 'Cubase LE', 'FL Studio Demo', 'Studio One Prime', 'Ableton Live Lite', 'Logic Pro (Trial)', 'Presonus Capture', 'Cockos REAPER', 'Harrison Mixbus Demo', 'Bitwig 8-Track', 'WavePad']
            },
            {
                name: 'Mobile & Browser',
                daws: ['FL Studio Mobile', 'Caustic', 'AudioTool', 'Soundtrap', 'BandLab', 'Chrome Music Lab', 'Beepbox', 'JummBox', 'Looplabs', 'Soundation', 'Amped Studio', 'TwistedWave Online', 'Audio Mass', 'Beautiful Audio Editor', 'WavePad Online', 'GarageBand iOS', 'Cubasis', 'Auria Pro', 'Steinberg Cubasis', 'Music Maker JAM', 'Walk Band', 'Caustic 3', 'SunVox Mobile', 'Stagelight', 'Audio Evolution Mobile']
            }
        ];

        this.initializeData();
        this.setupRoutes();
        this.setupSlashCommands();
        
        console.log('Enhanced Genre Discovery plugin with Select Menus loaded successfully!');
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
        // Get predefined lists (flattened for dashboard)
        this.app.get('/api/plugins/genrediscovery/lists', this.ensureAuthenticated, async (req, res) => {
            try {
                const genres = this.genreChunks.flatMap(chunk => chunk.genres);
                const daws = this.dawChunks.flatMap(chunk => chunk.daws);
                
                res.json({ genres, daws });
            } catch (error) {
                console.error('Error getting predefined lists:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Get user's current tags
        this.app.get('/api/plugins/genrediscovery/user/:guildId/:userId', this.ensureAuthenticated, async (req, res) => {
            try {
                const data = await this.loadData();
                const userData = this.getUserData(data, req.params.guildId, req.params.userId);
                res.json(userData);
            } catch (error) {
                console.error('Error getting user data:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Update user's tags
        this.app.post('/api/plugins/genrediscovery/user/:guildId/:userId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { genres, daws } = req.body;
                const data = await this.loadData();
                const userData = this.getUserData(data, req.params.guildId, req.params.userId);
                
                userData.genres = genres || [];
                userData.daws = daws || [];
                
                await this.saveData(data);
                res.json({ success: true });
            } catch (error) {
                console.error('Error updating user data:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Get settings for a guild
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

        // Save settings for a guild
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

        // Get stats for a guild
        this.app.get('/api/plugins/genrediscovery/stats/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.params.guildId)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }

                const data = await this.loadData();
                const guildData = data[req.params.guildId] || {};

                const genreCounts = {};
                const dawCounts = {};

                Object.values(guildData).forEach(userData => {
                    userData.genres?.forEach(genre => {
                        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                    });
                    userData.daws?.forEach(daw => {
                        dawCounts[daw] = (dawCounts[daw] || 0) + 1;
                    });
                });

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

    createGenreSelectMenu(selectedGenres = []) {
        const options = this.genreChunks.map(chunk => ({
            label: chunk.name,
            value: `genre_category_${chunk.name.toLowerCase().replace(/\s+/g, '_')}`,
            description: `${chunk.genres.length} genres available`,
            emoji: '🎵'
        }));

        return new StringSelectMenuBuilder()
            .setCustomId('genre_category_select')
            .setPlaceholder('🎶 Choose a genre category')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options);
    }

    createDAWSelectMenu(selectedDAWs = []) {
        const options = this.dawChunks.map(chunk => ({
            label: chunk.name,
            value: `daw_category_${chunk.name.toLowerCase().replace(/\s+/g, '_')}`,
            description: `${chunk.daws.length} DAWs available`,
            emoji: '💻'
        }));

        return new StringSelectMenuBuilder()
            .setCustomId('daw_category_select')
            .setPlaceholder('💻 Choose a DAW category')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options);
    }

    createSpecificGenreMenu(categoryName, selectedGenres = []) {
        const chunk = this.genreChunks.find(c => c.name.toLowerCase().replace(/\s+/g, '_') === categoryName);
        if (!chunk) return null;

        const options = chunk.genres.slice(0, 25).map(genre => ({
            label: genre.length > 100 ? genre.substring(0, 97) + '...' : genre,
            value: `add_genre_${genre}`,
            description: selectedGenres.includes(genre) ? '✅ Already selected' : 'Click to add to your tags',
            emoji: selectedGenres.includes(genre) ? '✅' : '🎵'
        }));

        return new StringSelectMenuBuilder()
            .setCustomId('specific_genre_select')
            .setPlaceholder(`🎶 Select genres from ${chunk.name}`)
            .setMinValues(1)
            .setMaxValues(Math.min(options.length, 10))
            .addOptions(options);
    }

    createSpecificDAWMenu(categoryName, selectedDAWs = []) {
        const chunk = this.dawChunks.find(c => c.name.toLowerCase().replace(/\s+/g, '_') === categoryName);
        if (!chunk) return null;

        const options = chunk.daws.slice(0, 25).map(daw => ({
            label: daw.length > 100 ? daw.substring(0, 97) + '...' : daw,
            value: `add_daw_${daw}`,
            description: selectedDAWs.includes(daw) ? '✅ Already selected' : 'Click to add to your tags',
            emoji: selectedDAWs.includes(daw) ? '✅' : '💻'
        }));

        return new StringSelectMenuBuilder()
            .setCustomId('specific_daw_select')
            .setPlaceholder(`💻 Select DAWs from ${chunk.name}`)
            .setMinValues(1)
            .setMaxValues(Math.min(options.length, 10))
            .addOptions(options);
    }

	setupSlashCommands() {
		this.client.once('ready', async () => {
			try {
				const commands = [
					new SlashCommandBuilder()
						.setName('genres')
						.setDescription('🎶 Set your music genres using dropdown menus'),
					
					new SlashCommandBuilder()
						.setName('daws')
						.setDescription('💻 Set your DAWs/software using dropdown menus'),
					
					new SlashCommandBuilder()
						.setName('remove')
						.setDescription('🗑️ Remove genres or DAWs from your tags')
						.addSubcommand(subcommand =>
							subcommand
								.setName('genre')
								.setDescription('Remove a genre from your tags')
								.addStringOption(option => option.setName('genre').setDescription('Genre to remove').setRequired(true)))
						.addSubcommand(subcommand =>
							subcommand
								.setName('daw')
								.setDescription('Remove a DAW from your tags')
								.addStringOption(option => option.setName('daw').setDescription('DAW to remove').setRequired(true)))
						.addSubcommand(subcommand =>
							subcommand
								.setName('all')
								.setDescription('Remove all your tags')
								.addStringOption(option => 
									option.setName('confirm')
									.setDescription('Type "confirm" to remove all tags')
									.setRequired(true)
									.addChoices(
										{ name: 'Yes, remove all my tags', value: 'confirm' }
									))),
						
					new SlashCommandBuilder()
						.setName('mytags')
						.setDescription('👤 View your current genres and DAWs'),
						
					new SlashCommandBuilder()
						.setName('find')
						.setDescription('🔍 Find users by their tags')
						.addSubcommand(subcommand =>
							subcommand
								.setName('genre')
								.setDescription('Find users by genre')
								.addStringOption(option => option.setName('genre').setDescription('Genre to search for').setRequired(true)))
						.addSubcommand(subcommand =>
							subcommand
								.setName('daw')
								.setDescription('Find users by DAW')
								.addStringOption(option => option.setName('daw').setDescription('DAW to search for').setRequired(true))),
					
					new SlashCommandBuilder()
						.setName('tags')
						.setDescription('👀 View someone\'s tags')
						.addUserOption(option => option.setName('user').setDescription('User to view tags for')),
				];

				// Register commands for each guild
				const guilds = this.client.guilds.cache;
				for (const guild of guilds.values()) {
					try {
						for (const command of commands) {
							await guild.commands.create(command.toJSON());
						}
						console.log(`✓ Registered Genre Discovery commands for guild: ${guild.name}`);
					} catch (error) {
						console.error(`Error registering commands for guild ${guild.name}:`, error);
					}
				}
				
				console.log('✓ Genre Discovery slash commands with select menus registered.');
			} catch (error) {
				console.error('Error registering Genre Discovery commands:', error);
			}
		});

		this.client.on('interactionCreate', async (interaction) => {
			if (interaction.isChatInputCommand()) {
				const { commandName } = interaction;
				if (['genres', 'daws', 'mytags', 'remove', 'find', 'tags'].includes(commandName)) {
					await this.handleGenreCommands(interaction);
				}
			} else if (interaction.isStringSelectMenu()) {
				const { customId } = interaction;
				if (['genre_category_select', 'daw_category_select', 'specific_genre_select', 'specific_daw_select'].includes(customId)) {
					await this.handleSelectMenuInteraction(interaction);
				}
			}
		});
	}

    async handleSelectMenuInteraction(interaction) {
        try {
            const { customId, values, guildId, user } = interaction;

            if (customId === 'genre_category_select') {
                const categoryName = values[0].replace('genre_category_', '');
                const data = await this.loadData();
                const userData = this.getUserData(data, guildId, user.id);
                
                const specificMenu = this.createSpecificGenreMenu(categoryName, userData.genres);
                if (!specificMenu) {
                    return await interaction.reply({ content: '❌ Category not found.', ephemeral: true });
                }

                const row = new ActionRowBuilder().addComponents(specificMenu);
                
                const categoryDisplayName = this.genreChunks.find(c => 
                    c.name.toLowerCase().replace(/\s+/g, '_') === categoryName
                )?.name || categoryName;
                
                await interaction.reply({
                    content: `🎶 **Select genres from ${categoryDisplayName}:**`,
                    components: [row],
                    ephemeral: true
                });

            } else if (customId === 'daw_category_select') {
                const categoryName = values[0].replace('daw_category_', '');
                const data = await this.loadData();
                const userData = this.getUserData(data, guildId, user.id);
                
                const specificMenu = this.createSpecificDAWMenu(categoryName, userData.daws);
                if (!specificMenu) {
                    return await interaction.reply({ content: '❌ Category not found.', ephemeral: true });
                }

                const row = new ActionRowBuilder().addComponents(specificMenu);
                
                const categoryDisplayName = this.dawChunks.find(c => 
                    c.name.toLowerCase().replace(/\s+/g, '_') === categoryName
                )?.name || categoryName;
                
                await interaction.reply({
                    content: `💻 **Select DAWs from ${categoryDisplayName}:**`,
                    components: [row],
                    ephemeral: true
                });

            } else if (customId === 'specific_genre_select') {
                const data = await this.loadData();
                const userData = this.getUserData(data, guildId, user.id);
                
                // Extract genre names from values
                const newGenres = values.map(value => value.replace('add_genre_', ''));
                const addedGenres = [];
                
                // Add new genres to user's list (avoid duplicates)
                newGenres.forEach(genre => {
                    if (!userData.genres.includes(genre)) {
                        userData.genres.push(genre);
                        addedGenres.push(genre);
                    }
                });
                
                await this.saveData(data);
                
                const responseText = addedGenres.length > 0 
                    ? `✅ **Added genres:** ${addedGenres.join(', ')}\n\n**Your current genres:** ${userData.genres.slice(0, 10).join(', ')}${userData.genres.length > 10 ? ` (+${userData.genres.length - 10} more)` : ''}`
                    : `ℹ️ All selected genres were already in your list.\n\n**Your current genres:** ${userData.genres.slice(0, 10).join(', ')}${userData.genres.length > 10 ? ` (+${userData.genres.length - 10} more)` : ''}`;
                
                await interaction.update({
                    content: responseText,
                    components: []
                });

            } else if (customId === 'specific_daw_select') {
                const data = await this.loadData();
                const userData = this.getUserData(data, guildId, user.id);
                
                // Extract DAW names from values
                const newDAWs = values.map(value => value.replace('add_daw_', ''));
                const addedDAWs = [];
                
                // Add new DAWs to user's list (avoid duplicates)
                newDAWs.forEach(daw => {
                    if (!userData.daws.includes(daw)) {
                        userData.daws.push(daw);
                        addedDAWs.push(daw);
                    }
                });
                
                await this.saveData(data);
                
                const responseText = addedDAWs.length > 0 
                    ? `✅ **Added DAWs:** ${addedDAWs.join(', ')}\n\n**Your current DAWs:** ${userData.daws.slice(0, 10).join(', ')}${userData.daws.length > 10 ? ` (+${userData.daws.length - 10} more)` : ''}`
                    : `ℹ️ All selected DAWs were already in your list.\n\n**Your current DAWs:** ${userData.daws.slice(0, 10).join(', ')}${userData.daws.length > 10 ? ` (+${userData.daws.length - 10} more)` : ''}`;
                
                await interaction.update({
                    content: responseText,
                    components: []
                });
            }

        } catch (error) {
            console.error('Error handling select menu interaction:', error);
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '❌ An error occurred while processing your selection.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ An error occurred while processing your selection.', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }

    async handleGenreCommands(interaction) {
        try {
            const { commandName, options, guildId, user } = interaction;
            const data = await this.loadData();
            const userData = this.getUserData(data, guildId, user.id);

            if (commandName === 'genres') {
                const genreMenu = this.createGenreSelectMenu(userData.genres);
                const row = new ActionRowBuilder().addComponents(genreMenu);
                
                await interaction.reply({
                    content: '🎶 **Choose a genre category to explore:**',
                    components: [row],
                    ephemeral: true
                });

            } else if (commandName === 'daws') {
                const dawMenu = this.createDAWSelectMenu(userData.daws);
                const row = new ActionRowBuilder().addComponents(dawMenu);
                
                await interaction.reply({
                    content: '💻 **Choose a DAW category to explore:**',
                    components: [row],
                    ephemeral: true
                });

            } else if (commandName === 'remove') {
				const subCommand = options.getSubcommand();
    
				if (subCommand === 'genre') {
				const genreToRemove = options.getString('genre');
				const index = userData.genres.findIndex(g => g.toLowerCase() === genreToRemove.toLowerCase());
				
				if (index === -1) {
					await interaction.reply({ 
						content: `❌ You don't have "${genreToRemove}" in your genres.\n\n**Your current genres:** ${userData.genres.join(', ') || 'None'}`, 
						ephemeral: true 
					});
					return;
				}
        
        const removedGenre = userData.genres.splice(index, 1)[0];
        await this.saveData(data);
        
        await interaction.reply({ 
            content: `✅ Removed "${removedGenre}" from your genres.\n\n**Remaining genres:** ${userData.genres.join(', ') || 'None'}` 
        });
                    
                } else if (subCommand === 'daw') {
                    const dawToRemove = options.getString('daw');
                    const index = userData.daws.findIndex(d => d.toLowerCase() === dawToRemove.toLowerCase());
                    
                    if (index === -1) {
                        await interaction.reply({ 
                            content: `❌ You don't have "${dawToRemove}" in your DAWs.\n\n**Your current DAWs:** ${userData.daws.join(', ') || 'None'}`, 
                            ephemeral: true 
                        });
                        return;
                    }
                    
                    const removedDAW = userData.daws.splice(index, 1)[0];
                    await this.saveData(data);
                    
                    await interaction.reply({ 
                        content: `✅ Removed "${removedDAW}" from your DAWs.\n\n**Remaining DAWs:** ${userData.daws.join(', ') || 'None'}` 
                    });
                    
                } else if (subCommand === 'all') {
                    const confirmation = options.getString('confirm');
                    
                    if (confirmation !== 'confirm') {
                        await interaction.reply({ 
                            content: '❌ You must select "Yes, remove all my tags" to confirm this action.', 
                            ephemeral: true 
                        });
                        return;
                    }
                    
                    const removedGenres = [...userData.genres];
                    const removedDAWs = [...userData.daws];
                    
                    userData.genres = [];
                    userData.daws = [];
                    await this.saveData(data);
                    
                    const embed = new EmbedBuilder()
                        .setColor(0xff6b6b)
                        .setTitle('🗑️ All Tags Removed')
                        .setDescription('All your genres and DAWs have been cleared.')
                        .addFields(
                            { name: '🎶 Removed Genres', value: removedGenres.join(', ') || 'None', inline: false },
                            { name: '💻 Removed DAWs', value: removedDAWs.join(', ') || 'None', inline: false }
                        )
                        .setFooter({ text: 'Use /genres and /daws to add new tags!' });

                    await interaction.reply({ embeds: [embed] });
                }

            } else if (commandName === 'mytags') {
                const embed = new EmbedBuilder()
                    .setColor(0x7289DA)
                    .setAuthor({ name: `${user.username}'s Music Tags`, iconURL: user.displayAvatarURL() })
                    .addFields(
                        { name: '🎶 Genres', value: userData.genres.length > 0 ? userData.genres.slice(0, 20).join(', ') : 'None set', inline: false },
                        { name: '💻 DAWs', value: userData.daws.length > 0 ? userData.daws.slice(0, 20).join(', ') : 'None set', inline: false }
                    )
                    .setFooter({ text: 'Use /genres or /daws to update your tags!' });

                if (userData.genres.length > 20) {
                    embed.addFields({ name: '📝 Note', value: `You have ${userData.genres.length} genres total (showing first 20)`, inline: false });
                }
                if (userData.daws.length > 20) {
                    embed.addFields({ name: '📝 Note', value: `You have ${userData.daws.length} DAWs total (showing first 20)`, inline: false });
                }

                await interaction.reply({ embeds: [embed] });

            } else if (commandName === 'tags') {
                const targetUser = options.getUser('user') || user;
                const targetData = data[guildId]?.[targetUser.id] || { genres: [], daws: [] };

                const embed = new EmbedBuilder()
                    .setColor(0x7289DA)
                    .setAuthor({ name: `${targetUser.username}'s Music Tags`, iconURL: targetUser.displayAvatarURL() })
                    .addFields(
                        { name: '🎶 Genres', value: targetData.genres.length > 0 ? targetData.genres.slice(0, 20).join(', ') : 'None set', inline: false },
                        { name: '💻 DAWs', value: targetData.daws.length > 0 ? targetData.daws.slice(0, 20).join(', ') : 'None set', inline: false }
                    );

                if (targetData.genres.length > 20) {
                    embed.addFields({ name: '📝 Note', value: `${targetUser.username} has ${targetData.genres.length} genres total (showing first 20)`, inline: false });
                }
                if (targetData.daws.length > 20) {
                    embed.addFields({ name: '📝 Note', value: `${targetUser.username} has ${targetData.daws.length} DAWs total (showing first 20)`, inline: false });
                }

                await interaction.reply({ embeds: [embed] });

            } else if (commandName === 'find') {
                const subCommand = options.getSubcommand();
                const type = subCommand === 'genre' ? 'genres' : 'daws';
                const searchTerm = options.getString(subCommand).toLowerCase();
                const guildData = data[guildId] || {};
                
                let matches = [];
                for (const userId in guildData) {
                    if (guildData[userId][type]?.some(t => t.toLowerCase().includes(searchTerm))) {
                        try {
                           const member = await interaction.guild.members.fetch(userId);
                           matches.push(member.toString());
                        } catch { 
                            // Member likely left the server, skip them
                        }
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor(0x7289DA)
                    .setTitle(`🔍 Producers with ${subCommand}: **${searchTerm}**`)
                    .setDescription(matches.length > 0 ? matches.slice(0, 20).join('\n') : `No producers found with **${searchTerm}**.`);
                
                if (matches.length > 20) {
                    embed.setFooter({ text: `Showing first 20 of ${matches.length} results` });
                }

                await interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error handling genre command:', error);
            
            try {
                const errorMessage = '❌ An error occurred while processing your command.';
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }

    // Dashboard component - streamlined admin-only interface
    getFrontendComponent() {
        return {
            id: 'genre-discovery-plugin',
            name: 'Genre Discovery',
            description: 'Helps music producers share and discover each other\'s genres and setups',
            icon: '🎶',
            version: '2.0.0',
            
            containerId: 'genreDiscoveryPluginContainer',
            pageId: 'genre-discovery',
            navIcon: '🎶',
            
            html: `<div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">🎶</span> Genre Discovery v2.0</h3>
                    <p>Set your music genres and DAWs using Discord select menus or the dashboard</p>
                </div>

                <div class="info-section" style="background: rgba(114, 137, 218, 0.1); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3>🎯 New Discord Select Menus!</h3>
                    <p>Use these <strong>new slash commands</strong> in Discord for easy tag selection:</p>
                    <div class="command-list">
                        <div class="command-item">
                            <code>/genres</code>
                            <span>🎶 Select your genres from organized categories</span>
                        </div>
                        <div class="command-item">
                            <code>/daws</code>
                            <span>💻 Select your DAWs from organized categories</span>
                        </div>
                        <div class="command-item">
                            <code>/mytags</code>
                            <span>👤 View your current tags</span>
                        </div>
                        <div class="command-item">
                            <code>/remove genre [name]</code>
                            <span>🗑️ Remove a specific genre from your tags</span>
                        </div>
                        <div class="command-item">
                            <code>/remove daw [name]</code>
                            <span>🗑️ Remove a specific DAW from your tags</span>
                        </div>
                        <div class="command-item">
                            <code>/remove all</code>
                            <span>🗑️ Remove all your tags (requires confirmation)</span>
                        </div>
                        <div class="command-item">
                            <code>/find genre [name]</code>
                            <span>🔍 Find users by genre</span>
                        </div>
                        <div class="command-item">
                            <code>/find daw [name]</code>
                            <span>🔍 Find users by DAW</span>
                        </div>
                        <div class="command-item">
                            <code>/tags [@user]</code>
                            <span>👀 View someone else's tags</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Dashboard Management</h3>
                    <div class="form-group">
                        <label for="genre-server-select">Server:</label>
                        <select id="genre-server-select" class="form-control">
                            <option value="">Select a server...</option>
                        </select>
                    </div>
                </div>

                <div id="genre-settings-section" class="settings-section" style="display: none;">
                    <h3>Plugin Settings (Admin Only)</h3>
                    <div class="form-group">
                        <label for="genre-log-channel">Log Channel:</label>
                        <select id="genre-log-channel" class="form-control">
                            <option value="">None (no logging)</option>
                        </select>
                    </div>
                    <button id="save-genre-settings" class="btn btn-primary">
                        <span class="btn-text">💾 Save Settings</span>
                        <span class="btn-loader" style="display: none;">⏳</span>
                    </button>
                </div>

                <div id="genre-stats-section" class="settings-section" style="display: none;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3>Server Statistics</h3>
                        <button id="refresh-genre-stats" class="btn btn-secondary">🔄 Refresh</button>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div>
                            <h4>🎶 Top Genres</h4>
                            <div id="genre-stats-list" class="stats-list"></div>
                        </div>
                        <div>
                            <h4>💻 Top DAWs</h4>
                            <div id="daw-stats-list" class="stats-list"></div>
                        </div>
                    </div>
                </div>

                <div class="info-section">
                    <h3>Genre Categories Available</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>🎵 Electronic & Dance</h4>
                            <small>House, Techno, Trance, Dubstep, Progressive, Deep House, Tech House, and more...</small>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>🔊 Bass & Electronic</h4>
                            <small>Drum & Bass, Trap, Future Bass, Riddim, Neurofunk, Jump Up, and more...</small>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>🌙 Ambient & Chill</h4>
                            <small>Lo-Fi, Ambient, Chillwave, Downtempo, Chillhop, Trip Hop, and more...</small>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>🌆 Retro & Synthwave</h4>
                            <small>Synthwave, Vaporwave, Retrowave, Nu-Disco, Outrun, Darksynth, and more...</small>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>🎤 Hip Hop & Urban</h4>
                            <small>Hip Hop, Trap, Boom Bap, Grime, Drill, R&B, Reggae, Afrobeat, and more...</small>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>🎸 Rock & Alternative</h4>
                            <small>Rock, Metal, Punk, Indie, Alternative, Progressive, Post-Rock, and more...</small>
                        </div>
                    </div>
                </div>

                <div class="info-section">
                    <h3>DAW Categories Available</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>💼 Professional DAWs</h4>
                            <small>Ableton Live, FL Studio, Logic Pro, Pro Tools, Cubase, Studio One, and more...</small>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>🆓 Free & Budget DAWs</h4>
                            <small>GarageBand, Audacity, Cakewalk, LMMS, Reaper Trial, Studio One Prime, and more...</small>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <h4>📱 Mobile & Browser</h4>
                            <small>FL Studio Mobile, BandLab, Caustic, AudioTool, Soundtrap, GarageBand iOS, and more...</small>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .tag-item {
                    display: inline-block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 5px 10px;
                    margin: 3px;
                    border-radius: 15px;
                    font-size: 0.9em;
                }
                
                .remove-tag {
                    margin-left: 8px;
                    cursor: pointer;
                    color: rgba(255, 255, 255, 0.8);
                    font-weight: bold;
                }
                
                .remove-tag:hover {
                    color: #ff6b6b;
                }
                
                .command-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    margin-bottom: 8px;
                }
                
                .command-item code {
                    background: rgba(114, 137, 218, 0.2);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-family: 'Courier New', monospace;
                    color: #7289da;
                }
                
                .stats-list {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    padding: 15px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .stats-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .stats-item:last-child {
                    border-bottom: none;
                }
                
                .stats-name {
                    font-weight: 500;
                }
                
                .stats-count {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 0.9em;
                }
            </style>`,
            
            script: `
                (function() {
                    console.log('🎶 Loading Genre Discovery plugin with Select Menus...');
                    
                    let selectedGenres = [];
                    let selectedDaws = [];
                    let currentGuildId = null;
                    
                    function init() {
                        const serverSelect = document.getElementById('genre-server-select');
                        const settingsSection = document.getElementById('genre-settings-section');
                        const statsSection = document.getElementById('genre-stats-section');
                        
                        if (!serverSelect) {
                            console.error('Genre server select not found');
                            return;
                        }
                        
                        // Load servers
                        loadServers();
                        
                        // Server change handler
                        serverSelect.addEventListener('change', function() {
                            currentGuildId = serverSelect.value;
                            if (currentGuildId) {
                                if (settingsSection) settingsSection.style.display = 'block';
                                if (statsSection) statsSection.style.display = 'block';
                                loadSettings();
                                loadStats();
                            } else {
                                if (settingsSection) settingsSection.style.display = 'none';
                                if (statsSection) statsSection.style.display = 'none';
                            }
                        });
                        
                        // Settings and stats handlers
                        setupSettingsHandlers();
                    }
                    
                    function setupSettingsHandlers() {
                        const saveSettingsBtn = document.getElementById('save-genre-settings');
                        if (saveSettingsBtn) {
                            saveSettingsBtn.addEventListener('click', saveSettings);
                        }
                        
                        const refreshStatsBtn = document.getElementById('refresh-genre-stats');
                        if (refreshStatsBtn) {
                            refreshStatsBtn.addEventListener('click', function() {
                                if (currentGuildId) loadStats();
                            });
                        }
                    }
                    
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
                    
                    async function loadLists() {
                        // No longer needed since we removed the dashboard tag management
                        return;
                    }
                    
                    async function loadUserTags() {
                        // No longer needed since we removed the dashboard tag management
                        return;
                    }
                    
                    async function loadSettings() {
                        if (!currentGuildId) return;
                        
                        try {
                            const response = await fetch('/api/plugins/genrediscovery/settings/' + currentGuildId);
                            const settings = await response.json();
                            
                            const logChannel = document.getElementById('genre-log-channel');
                            if (logChannel) {
                                // Load channels first, then set value
                                await loadChannels();
                                logChannel.value = settings.logChannelId || '';
                            }
                        } catch (error) {
                            console.error('Error loading settings:', error);
                        }
                    }
                    
                    async function loadChannels() {
                        if (!currentGuildId) return;
                        
                        try {
                            const response = await fetch('/api/channels/' + currentGuildId);
                            const channels = await response.json();
                            
                            const logChannel = document.getElementById('genre-log-channel');
                            if (logChannel) {
                                logChannel.innerHTML = '<option value="">None (no logging)</option>';
                                channels.forEach(channel => {
                                    const option = document.createElement('option');
                                    option.value = channel.id;
                                    option.textContent = '#' + channel.name;
                                    logChannel.appendChild(option);
                                });
                            }
                        } catch (error) {
                            console.error('Error loading channels:', error);
                        }
                    }
                    
                    async function loadStats() {
                        if (!currentGuildId) return;
                        
                        try {
                            const response = await fetch('/api/plugins/genrediscovery/stats/' + currentGuildId);
                            const stats = await response.json();
                            
                            const genreStatsList = document.getElementById('genre-stats-list');
                            const dawStatsList = document.getElementById('daw-stats-list');
                            
                            if (genreStatsList) {
                                genreStatsList.innerHTML = '';
                                if (stats.topGenres.length === 0) {
                                    genreStatsList.innerHTML = '<div class="stats-item"><span>No genre data yet</span></div>';
                                } else {
                                    stats.topGenres.forEach(function(item) {
                                        const genre = item[0];
                                        const count = item[1];
                                        const div = document.createElement('div');
                                        div.className = 'stats-item';
                                        div.innerHTML = '<span class="stats-name">' + genre + '</span><span class="stats-count">' + count + '</span>';
                                        genreStatsList.appendChild(div);
                                    });
                                }
                            }
                            
                            if (dawStatsList) {
                                dawStatsList.innerHTML = '';
                                if (stats.topDaws.length === 0) {
                                    dawStatsList.innerHTML = '<div class="stats-item"><span>No DAW data yet</span></div>';
                                } else {
                                    stats.topDaws.forEach(function(item) {
                                        const daw = item[0];
                                        const count = item[1];
                                        const div = document.createElement('div');
                                        div.className = 'stats-item';
                                        div.innerHTML = '<span class="stats-name">' + daw + '</span><span class="stats-count">' + count + '</span>';
                                        dawStatsList.appendChild(div);
                                    });
                                }
                            }
                        } catch (error) {
                            console.error('Error loading stats:', error);
                        }
                    }
                    
                    function updateSelections() {
                        // No longer needed since we removed the dashboard tag management
                        return;
                    }
                    
                    function updateTags() {
                        // No longer needed since we removed the dashboard tag management
                        return;
                    }
                    
                    window.removeTag = function(type, value) {
                        // No longer needed since we removed the dashboard tag management
                        return;
                    };
                    
                    async function saveTags() {
                        // No longer needed since we removed the dashboard tag management
                        return;
                    }
                    
                    async function saveSettings() {
                        if (!currentGuildId) return;
                        
                        const saveBtn = document.getElementById('save-genre-settings');
                        const btnText = saveBtn ? saveBtn.querySelector('.btn-text') : null;
                        const btnLoader = saveBtn ? saveBtn.querySelector('.btn-loader') : null;
                        const logChannel = document.getElementById('genre-log-channel');
                        
                        if (saveBtn) saveBtn.disabled = true;
                        if (btnText) btnText.style.display = 'none';
                        if (btnLoader) btnLoader.style.display = 'inline';
                        
                        try {
                            const response = await fetch('/api/plugins/genrediscovery/settings/' + currentGuildId, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    logChannelId: logChannel ? logChannel.value || null : null
                                })
                            });
                            
                            if (response.ok) {
                                if (window.showNotification) {
                                    window.showNotification('✅ Settings saved!', 'success');
                                }
                            } else {
                                throw new Error('Failed to save settings');
                            }
                        } catch (error) {
                            console.error('Error saving settings:', error);
                            if (window.showNotification) {
                                window.showNotification('❌ Failed to save settings', 'error');
                            }
                        } finally {
                            if (saveBtn) saveBtn.disabled = false;
                            if (btnText) btnText.style.display = 'inline';
                            if (btnLoader) btnLoader.style.display = 'none';
                        }
                    }
                    
                    // Initialize when DOM is ready
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', init);
                    } else {
                        setTimeout(init, 100);
                    }
                    
                    console.log('✅ Genre Discovery plugin with Select Menus loaded!');
                })();
            `
        };
    }
}

module.exports = GenreDiscoveryPlugin;