const fs = require('fs').promises;
const path = require('path');
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

class GenreDiscoveryPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Genre Discovery';
        this.description = 'Helps music producers share and discover each other\'s genres and setups.';
        this.version = '2.1.0';
        this.enabled = true;

        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;

        this.dataFile = path.join(__dirname, '../data/genreDiscoveryData.json');
        this.settingsFile = path.join(__dirname, '../data/genreDiscoverySettings.json');
        this.categoriesFile = path.join(__dirname, '../data/genreDiscoveryCategories.json');

        // Default predefined lists
        this.defaultGenreChunks = [
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
                genres: ['Ambient', 'Lo-Fi', 'Chillwave', 'Downtempo', 'Chillhop', 'Lounge', 'Trip Hop', 'Chillout', 'New Age', 'Drone', 'Field Recording', 'Meditation Music', 'Spa Music', 'Nature Sounds', 'ASMR', 'Lo-Fi Hip Hop', 'Study Music', 'Sleep Music', 'Ethereal Wave', 'Dark Ambient', 'Space Ambient', 'Cinematic Ambient', 'Minimal Ambient', 'Organic Ambient', 'Experimental Ambient']
            },
            {
                name: 'Hip Hop & Rap',
                genres: ['Hip Hop', 'Trap', 'Boom Bap', 'Old School Hip Hop', 'Cloud Rap', 'Mumble Rap', 'Conscious Rap', 'Gangsta Rap', 'Alternative Hip Hop', 'Experimental Hip Hop', 'Jazz Rap', 'Lo-Fi Hip Hop', 'Memphis Rap', 'West Coast Hip Hop', 'East Coast Hip Hop', 'Southern Hip Hop', 'UK Hip Hop', 'French Hip Hop', 'Drill', 'Emo Rap', 'SoundCloud Rap', 'Horrorcore', 'Nerdcore', 'Gospel Rap', 'Latin Trap']
            },
            {
                name: 'Rock & Alternative',
                genres: ['Rock', 'Alternative Rock', 'Indie Rock', 'Punk Rock', 'Hard Rock', 'Metal', 'Heavy Metal', 'Death Metal', 'Black Metal', 'Progressive Rock', 'Post Rock', 'Shoegaze', 'Grunge', 'Britpop', 'Post Punk', 'New Wave', 'Gothic Rock', 'Industrial Rock', 'Nu Metal', 'Metalcore', 'Hardcore Punk', 'Emo', 'Screamo', 'Math Rock', 'Noise Rock']
            },
            {
                name: 'Pop & Commercial',
                genres: ['Pop', 'Dance Pop', 'Synthpop', 'Electropop', 'Indie Pop', 'Dream Pop', 'K-Pop', 'J-Pop', 'Teen Pop', 'Bubblegum Pop', 'Art Pop', 'Experimental Pop', 'Hyperpop', 'Future Pop', 'Retro Pop', 'Chamber Pop', 'Baroque Pop', 'Power Pop', 'Sophisti-pop', 'Sunshine Pop', 'Yacht Rock', 'Soft Rock', 'Adult Contemporary', 'Contemporary R&B', 'Neo Soul']
            },
            {
                name: 'World & Folk',
                genres: ['World Music', 'Folk', 'Celtic', 'Bluegrass', 'Country', 'Americana', 'Roots', 'Traditional', 'Ethnic', 'Tribal', 'Afrobeat', 'Latin', 'Reggae', 'Ska', 'Dub', 'Calypso', 'Soca', 'Bossa Nova', 'Samba', 'Tango', 'Flamenco', 'Middle Eastern', 'Indian Classical', 'Gamelan', 'Native American']
            },
            {
                name: 'Jazz & Blues',
                genres: ['Jazz', 'Blues', 'Swing', 'Bebop', 'Cool Jazz', 'Hard Bop', 'Free Jazz', 'Fusion', 'Smooth Jazz', 'Contemporary Jazz', 'Acid Jazz', 'Nu Jazz', 'Jazz Funk', 'Soul Jazz', 'Latin Jazz', 'Gypsy Jazz', 'Chicago Blues', 'Delta Blues', 'Electric Blues', 'Rhythm and Blues', 'Gospel', 'Soul', 'Funk', 'Motown', 'Northern Soul']
            },
            {
                name: 'Classical & Orchestral',
                genres: ['Classical', 'Orchestral', 'Chamber Music', 'Opera', 'Baroque', 'Romantic', 'Modern Classical', 'Contemporary Classical', 'Minimalist', 'Film Score', 'Video Game Music', 'Epic Music', 'Cinematic', 'Neoclassical', 'String Quartet', 'Symphony', 'Concerto', 'Sonata', 'Choral', 'Sacred Music', 'Medieval', 'Renaissance', 'Impressionist', 'Serialism', 'Atonal']
            },
            {
                name: 'Experimental & Avant-garde',
                genres: ['Experimental', 'Avant-garde', 'Noise', 'Glitch', 'IDM', 'Breakcore', 'Microsound', 'Lowercase', 'Harsh Noise Wall', 'Power Electronics', 'Musique Concrète', 'Acousmatic', 'Electroacoustic', 'Circuit Bending', 'Plunderphonics', 'Vaporwave', 'Witch House', 'Seapunk', 'Hauntology', 'Outsider Music', 'Anti-Music', 'Sound Art', 'Field Recording', 'Prepared Piano', 'Extended Technique']
            }
        ];

        this.defaultDawChunks = [
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

        this.genreChunks = [];
        this.dawChunks = [];

        this.initializeData();
        this.setupRoutes();
        this.setupInteractionListeners();
        
        console.log('Enhanced Genre Discovery plugin v2.1 with Management Features loaded successfully!');
    }

    async initializeData() {
        try {
            await fs.access(this.dataFile).catch(() => 
                fs.writeFile(this.dataFile, JSON.stringify({}, null, 2))
            );
            await fs.access(this.settingsFile).catch(() => 
                fs.writeFile(this.settingsFile, JSON.stringify({}, null, 2))
            );
            
            try {
                await fs.access(this.categoriesFile);
                const categories = await this.loadCategories();
                this.genreChunks = categories.genreChunks || this.defaultGenreChunks;
                this.dawChunks = categories.dawChunks || this.defaultDawChunks;
            } catch {
                this.genreChunks = [...this.defaultGenreChunks];
                this.dawChunks = [...this.defaultDawChunks];
                await this.saveCategories();
            }
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

    async loadCategories() {
        try {
            const categories = await fs.readFile(this.categoriesFile, 'utf8');
            return JSON.parse(categories);
        } catch (error) {
            return { genreChunks: this.defaultGenreChunks, dawChunks: this.defaultDawChunks };
        }
    }

    async saveCategories() {
        const categories = {
            genreChunks: this.genreChunks,
            dawChunks: this.dawChunks
        };
        await fs.writeFile(this.categoriesFile, JSON.stringify(categories, null, 2));
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

    // --- NEW: This method provides the command data for the centralized handler ---
    getSlashCommands() {
        return [
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
        ].map(command => command.toJSON());
    }

    // --- NEW: Optional method for command permissions (can be omitted if no special permissions needed) ---
    getCommandPermissions() {
        return {
            // All commands are available to everyone by default
        };
    }

    // --- NEW: Centralized slash command handler ---
    async handleSlashCommand(interaction) {
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

            } else if (commandName === 'mytags') {
                const embed = new EmbedBuilder()
                    .setColor(0x7289DA)
                    .setTitle(`🏷️ ${user.username}'s Tags`)
                    .addFields(
                        { name: '🎶 Genres', value: userData.genres.length > 0 ? userData.genres.slice(0, 20).join(', ') : 'None set', inline: false },
                        { name: '💻 DAWs', value: userData.daws.length > 0 ? userData.daws.slice(0, 20).join(', ') : 'None set', inline: false }
                    );

                if (userData.genres.length > 20) {
                    embed.setFooter({ text: `Showing first 20 of ${userData.genres.length} genres` });
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } else if (commandName === 'remove') {
                const subCommand = options.getSubcommand();
                
                if (subCommand === 'genre') {
                    const genreToRemove = options.getString('genre');
                    const index = userData.genres.findIndex(g => g.toLowerCase() === genreToRemove.toLowerCase());
                    
                    if (index === -1) {
                        return await interaction.reply({ content: `❌ You don't have the genre "${genreToRemove}" in your tags.`, ephemeral: true });
                    }
                    
                    userData.genres.splice(index, 1);
                    await this.saveData(data);
                    
                    await interaction.reply({ content: `✅ Removed "${genreToRemove}" from your genres.`, ephemeral: true });

                } else if (subCommand === 'daw') {
                    const dawToRemove = options.getString('daw');
                    const index = userData.daws.findIndex(d => d.toLowerCase() === dawToRemove.toLowerCase());
                    
                    if (index === -1) {
                        return await interaction.reply({ content: `❌ You don't have the DAW "${dawToRemove}" in your tags.`, ephemeral: true });
                    }
                    
                    userData.daws.splice(index, 1);
                    await this.saveData(data);
                    
                    await interaction.reply({ content: `✅ Removed "${dawToRemove}" from your DAWs.`, ephemeral: true });

                } else if (subCommand === 'all') {
                    const confirmation = options.getString('confirm');
                    if (confirmation === 'confirm') {
                        userData.genres = [];
                        userData.daws = [];
                        await this.saveData(data);
                        
                        await interaction.reply({ content: '✅ All your tags have been removed.', ephemeral: true });
                    }
                }

            } else if (commandName === 'tags') {
                const targetUser = options.getUser('user') || user;
                const targetUserData = this.getUserData(data, guildId, targetUser.id);
                
                const embed = new EmbedBuilder()
                    .setColor(0x7289DA)
                    .setTitle(`🏷️ ${targetUser.username}'s Tags`)
                    .addFields(
                        { name: '🎶 Genres', value: targetUserData.genres.length > 0 ? targetUserData.genres.slice(0, 20).join(', ') : 'None set', inline: false },
                        { name: '💻 DAWs', value: targetUserData.daws.length > 0 ? targetUserData.daws.slice(0, 20).join(', ') : 'None set', inline: false }
                    );

                if (targetUserData.genres.length > 20) {
                    embed.setFooter({ text: `Showing first 20 of ${targetUserData.genres.length} genres` });
                }

                await interaction.reply({ embeds: [embed] });

            } else if (commandName === 'find') {
                const subCommand = options.getSubcommand();
                const searchTerm = options.getString(subCommand);
                
                const allUsers = Object.entries(data[guildId] || {});
                const matches = [];
                
                for (const [userId, userData] of allUsers) {
                    const searchArray = subCommand === 'genre' ? userData.genres : userData.daws;
                    const hasMatch = searchArray?.some(item => 
                        item.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                    
                    if (hasMatch) {
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
                    .setTitle(`🔍 Search Results for "${searchTerm}"`)
                    .setDescription(matches.length > 0 ? 
                        matches.slice(0, 20).join('\n') : `No producers found with **${searchTerm}**.`);
                    
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

    // --- UPDATED: Non-slash command interaction listeners (kept as-is) ---
    setupInteractionListeners() {
        this.client.on('interactionCreate', async (interaction) => {
            if (interaction.isStringSelectMenu()) {
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
                
                const newGenres = values
                    .filter(value => value.startsWith('add_genre_'))
                    .map(value => value.replace('add_genre_', ''));
                
                const addedGenres = [];
                for (const genre of newGenres) {
                    if (!userData.genres.includes(genre)) {
                        userData.genres.push(genre);
                        addedGenres.push(genre);
                    }
                }
                
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
                
                const newDAWs = values
                    .filter(value => value.startsWith('add_daw_'))
                    .map(value => value.replace('add_daw_', ''));
                
                const addedDAWs = [];
                for (const daw of newDAWs) {
                    if (!userData.daws.includes(daw)) {
                        userData.daws.push(daw);
                        addedDAWs.push(daw);
                    }
                }
                
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

    setupRoutes() {
        // Get user data for a specific guild
        this.app.get('/api/plugins/genrediscovery/data/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const data = await this.loadData();
                const guildData = data[guildId] || {};
                
                const users = Object.entries(guildData).map(([userId, userData]) => ({
                    userId,
                    genres: userData.genres || [],
                    daws: userData.daws || []
                }));
                
                res.json({ users });
            } catch (error) {
                console.error('Error fetching genre discovery data:', error);
                res.status(500).json({ error: 'Failed to fetch data' });
            }
        });

        // Get settings for a specific guild
        this.app.get('/api/plugins/genrediscovery/settings/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const settings = await this.loadSettings();
                res.json(settings[guildId] || {});
            } catch (error) {
                console.error('Error fetching genre discovery settings:', error);
                res.status(500).json({ error: 'Failed to fetch settings' });
            }
        });

        // Update settings for a specific guild
        this.app.post('/api/plugins/genrediscovery/settings/:guildId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { guildId } = req.params;
                
                if (!await this.hasAdminPermissions(req.user.id, guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }
                
                const settings = await this.loadSettings();
                settings[guildId] = req.body;
                await this.saveSettings(settings);
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error updating genre discovery settings:', error);
                res.status(500).json({ error: 'Failed to update settings' });
            }
        });

        // Get categories
        this.app.get('/api/plugins/genrediscovery/categories', this.ensureAuthenticated, async (req, res) => {
            try {
                const categories = await this.loadCategories();
                res.json(categories);
            } catch (error) {
                console.error('Error fetching categories:', error);
                res.status(500).json({ error: 'Failed to fetch categories' });
            }
        });

        // Update categories
        this.app.post('/api/plugins/genrediscovery/categories', this.ensureAuthenticated, async (req, res) => {
            try {
                const { genreChunks, dawChunks } = req.body;
                
                this.genreChunks = genreChunks || this.defaultGenreChunks;
                this.dawChunks = dawChunks || this.defaultDawChunks;
                
                await this.saveCategories();
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error updating categories:', error);
                res.status(500).json({ error: 'Failed to update categories' });
            }
        });

        // Reset to default categories
        this.app.post('/api/plugins/genrediscovery/categories/reset', this.ensureAuthenticated, async (req, res) => {
            try {
                this.genreChunks = [...this.defaultGenreChunks];
                this.dawChunks = [...this.defaultDawChunks];
                
                await this.saveCategories();
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error resetting categories:', error);
                res.status(500).json({ error: 'Failed to reset categories' });
            }
        });
    }

    getFrontendComponent() {
        return {
            id: 'genre-discovery-plugin',
            name: 'Genre Discovery',
            description: 'Helps music producers share and discover each other\'s genres and setups',
            icon: '🎶',
            version: '2.1.0',
            
            containerId: 'genreDiscoveryPluginContainer',
            pageId: 'genre-discovery',
            navIcon: '🎶',
            
            html: `<div class="plugin-container">
                <div class="plugin-header">
                    <h3><span class="plugin-icon">🎶</span> Genre Discovery v2.1</h3>
                    <p>Set your music genres and DAWs using Discord select menus or manage categories in the dashboard</p>
                </div>

                <div class="info-section" style="background: rgba(114, 137, 218, 0.1); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3>🎯 Discord Select Menus!</h3>
                    <p>Use these <strong>slash commands</strong> in Discord for easy tag selection:</p>
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
                            <code>/tags [@user]</code>
                            <span>👀 View another user's tags</span>
                        </div>
                        <div class="command-item">
                            <code>/find genre [name]</code>
                            <span>🔍 Find users who produce a specific genre</span>
                        </div>
                        <div class="command-item">
                            <code>/find daw [name]</code>
                            <span>🔍 Find users who use a specific DAW</span>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h4>🎶 Genre Categories Management</h4>
                    <div id="genreCategoriesList"></div>
                    <button id="addGenreCategoryBtn" class="btn btn-primary">+ Add Genre Category</button>
                </div>

                <div class="card">
                    <h4>💻 DAW Categories Management</h4>
                    <div id="dawCategoriesList"></div>
                    <button id="addDawCategoryBtn" class="btn btn-primary">+ Add DAW Category</button>
                </div>

                <div class="card">
                    <h4>⚙️ Settings</h4>
                    <div class="form-group">
                        <label for="genreLogChannel">Log Channel (Optional)</label>
                        <select id="genreLogChannel" class="form-control">
                            <option value="">No logging</option>
                        </select>
                        <small class="form-text">Channel to log when users update their tags</small>
                    </div>
                    <button id="saveGenreSettingsBtn" class="btn btn-success">
                        <span class="btn-text">Save Settings</span>
                        <span class="btn-loader" style="display: none;">⏳</span>
                    </button>
                </div>

                <div class="card">
                    <h4>🔄 Actions</h4>
                    <button id="resetCategoriesBtn" class="btn btn-warning">Reset to Default Categories</button>
                    <small class="form-text">This will restore all genre and DAW categories to their default values</small>
                </div>
            </div>`,
            
            script: `(function() {
                console.log('🎶 Loading Genre Discovery plugin v2.1...');
                
                let currentGuildId = null;
                
                // Get DOM elements
                const genreCategoriesList = document.getElementById('genreCategoriesList');
                const dawCategoriesList = document.getElementById('dawCategoriesList');
                const addGenreCategoryBtn = document.getElementById('addGenreCategoryBtn');
                const addDawCategoryBtn = document.getElementById('addDawCategoryBtn');
                const genreLogChannel = document.getElementById('genreLogChannel');
                const saveGenreSettingsBtn = document.getElementById('saveGenreSettingsBtn');
                const resetCategoriesBtn = document.getElementById('resetCategoriesBtn');

                // Initialize when guild is selected
                if (window.onGuildChange) {
                    window.onGuildChange(function(guildId) {
                        currentGuildId = guildId;
                        if (guildId) {
                            loadChannels();
                            loadSettings();
                            loadCategories();
                        }
                    });
                }

                // Event listeners
                if (saveGenreSettingsBtn) {
                    saveGenreSettingsBtn.addEventListener('click', saveSettings);
                }

                if (resetCategoriesBtn) {
                    resetCategoriesBtn.addEventListener('click', resetCategories);
                }

                async function loadChannels() {
                    if (!currentGuildId || !genreLogChannel) return;
                    
                    try {
                        const response = await fetch('/api/servers/' + currentGuildId + '/channels');
                        const channels = await response.json();
                        
                        genreLogChannel.innerHTML = '<option value="">No logging</option>';
                        channels.filter(c => c.type === 0).forEach(function(channel) {
                            const option = document.createElement('option');
                            option.value = channel.id;
                            option.textContent = '#' + channel.name;
                            genreLogChannel.appendChild(option);
                        });
                    } catch (error) {
                        console.error('Error loading channels:', error);
                    }
                }
                
                async function loadSettings() {
                    if (!currentGuildId) return;
                    
                    try {
                        const response = await fetch('/api/plugins/genrediscovery/settings/' + currentGuildId);
                        const settings = await response.json();
                        
                        if (genreLogChannel) {
                            genreLogChannel.value = settings.logChannelId || '';
                        }
                    } catch (error) {
                        console.error('Error loading settings:', error);
                    }
                }

                async function loadCategories() {
                    if (!currentGuildId) return;
                    
                    try {
                        const response = await fetch('/api/plugins/genrediscovery/categories');
                        const data = await response.json();
                        
                        renderCategories('genre', data.genreChunks, genreCategoriesList);
                        renderCategories('daw', data.dawChunks, dawCategoriesList);
                    } catch (error) {
                        console.error('Error loading categories:', error);
                    }
                }

                function renderCategories(type, categories, container) {
                    if (!container) return;
                    
                    container.innerHTML = '';
                    
                    categories.forEach(function(category) {
                        const categoryDiv = document.createElement('div');
                        categoryDiv.className = 'category-container';
                        categoryDiv.style.border = '1px solid rgba(255,255,255,0.1)';
                        categoryDiv.style.borderRadius = '8px';
                        categoryDiv.style.padding = '15px';
                        categoryDiv.style.marginBottom = '15px';
                        categoryDiv.style.backgroundColor = 'rgba(255,255,255,0.05)';
                        
                        const items = type === 'genre' ? category.genres : category.daws;
                        const itemType = type === 'genre' ? 'genres' : 'DAWs';
                        
                        categoryDiv.innerHTML = \`
                            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 10px;">
                                <h5 style="margin: 0; color: #7289DA;">\${category.name} (\${items.length} \${itemType})</h5>
                                <button class="btn btn-sm btn-danger" onclick="removeCategory('\${type}', '\${category.name}')">Remove</button>
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                \${items.map(item => \`<span style="background: rgba(114, 137, 218, 0.2); padding: 2px 8px; border-radius: 12px; font-size: 12px;">\${item}</span>\`).join('')}
                            </div>
                        \`;
                        
                        container.appendChild(categoryDiv);
                    });
                }

                async function saveSettings() {
                    if (!currentGuildId) return;
                    
                    const saveBtn = saveGenreSettingsBtn;
                    const btnText = saveBtn.querySelector('.btn-text');
                    const btnLoader = saveBtn.querySelector('.btn-loader');
                    
                    try {
                        saveBtn.disabled = true;
                        if (btnText) btnText.style.display = 'none';
                        if (btnLoader) btnLoader.style.display = 'inline';
                        
                        const settings = {
                            logChannelId: genreLogChannel && genreLogChannel.value ? genreLogChannel.value : null
                        };
                        
                        const response = await fetch('/api/plugins/genrediscovery/settings/' + currentGuildId, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(settings)
                        });
                        
                        if (response.ok) {
                            if (window.showNotification) window.showNotification('Settings saved successfully!', 'success');
                        } else {
                            const result = await response.json();
                            if (window.showNotification) window.showNotification('Error: ' + (result.error || 'Failed to save'), 'error');
                        }
                    } catch (error) {
                        console.error('Error saving settings:', error);
                        if (window.showNotification) window.showNotification('Error saving settings', 'error');
                    } finally {
                        if (saveBtn) saveBtn.disabled = false;
                        if (btnText) btnText.style.display = 'inline';
                        if (btnLoader) btnLoader.style.display = 'none';
                    }
                }

                async function resetCategories() {
                    if (!confirm('Are you sure you want to reset all categories to defaults? This cannot be undone.')) {
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/plugins/genrediscovery/categories/reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        if (response.ok) {
                            if (window.showNotification) window.showNotification('Categories reset to defaults!', 'success');
                            loadCategories();
                        } else {
                            const result = await response.json();
                            if (window.showNotification) window.showNotification('Error: ' + (result.error || 'Failed to reset'), 'error');
                        }
                    } catch (error) {
                        console.error('Error resetting categories:', error);
                        if (window.showNotification) window.showNotification('Error resetting categories', 'error');
                    }
                }
                
                console.log('✓ Genre Discovery plugin v2.1 loaded with management features');
            })();`
        };
    }
}

module.exports = GenreDiscoveryPlugin;