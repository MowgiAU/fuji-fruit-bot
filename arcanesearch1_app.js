const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } = require('discord.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Load plugins
const pluginLoader = require('./plugins/pluginLoader');

// Environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Discord client setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates, // Needed for voice XP in levelingPlugin
        GatewayIntentBits.GuildMembers,     // Needed for this new plugin and auto-role
        GatewayIntentBits.GuildMessageReactions, // Needed for reaction roles
    ]
});

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Middleware to check authentication
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Helper function to check if user has admin permissions or moderator role in a guild
async function hasAdminPermissions(userId, guildId) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return false;
        
        const member = await guild.members.fetch(userId);
        
        // Check if user has Administrator permissions
        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return true;
        }
        
        // Check if user has the specific Moderator role
        const moderatorRoleId = '957213892810010645';
        if (member.roles.cache.has(moderatorRoleId)) {
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error checking admin permissions:', error);
        return false;
    }
}

// Arcane user finder function
async function findAllArcaneUsers(guild) {
    const arcaneUsernames = [
        'revoltyx', 'infinity_jam', 'adamsteadychillin', 'sixbeeps', 'auver',
        'omarcomin_', 'platinumxyz', 'jarebehr', 'mowgi', 'm.a.v.s.',
        'crusaderdeleters', 'waveey', 'waddlesworth', 'ross2781_', 'grimmkin.',
        'pumpkeh', 'xblus', '_tyche.', '_day1day1', 'dm_', 'ice.quake',
        'thebigcheese192', 'anake_', 'gameee', 'dreadstump', '2heartremixxx',
        'paulboooom', 'cz84', 'mrrpmrreow', 'ellieee342', 'rdtup',
        'goatsoup.mp3', 'pickle_deviljho_', '.mannb', 'idkanything', 'q451',
        'red_circuit', 'not.telesta', 'rikki_b', 'speghitti', 'sidphonyofficial',
        'firebarough', 'soul404', 'bm.pipedream', 'ina067261', 'g58',
        'micro._wave', 'vincentvandiesel', 'swannti', 'riverofstyx847',
        'wiselyfluxed0976', '.surf', 'fabstapizza_yt', 'gatito.23', 'lunartfm',
        'chumder123134', 'sambbumpsinthenight', 'lawib', 'foampositebox',
        'leahyessurname', 'stilltho', 'stripesmusic', 'goddamnthakur',
        'idontknowtherealme3914', 'kingkoldblade_0001', 'scyllayoshiba',
        'asap78', '_bluestem', 'rav3rg1rl', 'wikiee', 'stonethemason',
        'dashveed', 'schizoetic', 'penisballs08', 'broken14.',
        'heartofthemasquerade', 'driomz', 'xarecrow', 'langoras',
        'optumus_mrime', 'lifeless_dawg', 'uncleshmekky', 'generalmasterentity',
        'icelikethat', 'grieftheboy', '2lazyy_', 'power9799', 'stargzr',
        'bugsyms', 'ggbk', 'zoro', 'gabealwayswins', 'pixelcd',
        'whenomechisama', 'miel._.', 'theminist3r', 'plain2', 'thomas.hyde',
        'sauron1998', 'fadinglight'
    ];

    console.log('🔍 Starting search for Arcane users...');
    
    // Fetch all members first (this might take a moment for large servers)
    console.log('📥 Fetching all guild members...');
    await guild.members.fetch();
    console.log(`✅ Fetched ${guild.members.cache.size} members`);
    
    const mappings = {};
    const notFound = [];
    const multipleMatches = {};

    for (const username of arcaneUsernames) {
        const matches = [];

        guild.members.cache.forEach(member => {
            const user = member.user;
            
            // Get all possible names to check
            const checkNames = [
                user.username.toLowerCase(),
                user.displayName?.toLowerCase(),
                member.nickname?.toLowerCase(),
                user.globalName?.toLowerCase()
            ].filter(Boolean);

            // Flexible matching with multiple strategies
            const isMatch = checkNames.some(name => {
                const cleanName = name.replace(/[._-]/g, '');
                const cleanUsername = username.toLowerCase().replace(/[._-]/g, '');
                
                return (
                    // Exact match
                    name === username.toLowerCase() ||
                    // Contains match
                    name.includes(username.toLowerCase()) ||
                    username.toLowerCase().includes(name) ||
                    // Clean match (no punctuation)
                    cleanName === cleanUsername ||
                    cleanName.includes(cleanUsername) ||
                    // Partial match for longer names
                    (cleanUsername.length > 3 && cleanName.includes(cleanUsername)) ||
                    // Special cases
                    (username.toLowerCase() === 'zoro' && name.includes('zoro')) ||
                    (username.toLowerCase() === 'dm_' && (name === 'dm' || name.includes('dm'))) ||
                    (username.toLowerCase().includes('m.a.v.s') && name.includes('mavs'))
                );
            });

            if (isMatch) {
                matches.push({
                    userId: user.id,
                    username: user.username,
                    displayName: user.displayName || user.username,
                    nickname: member.nickname,
                    matchedName: checkNames.find(name => {
                        const cleanName = name.replace(/[._-]/g, '');
                        const cleanUsername = username.toLowerCase().replace(/[._-]/g, '');
                        return name === username.toLowerCase() || 
                               name.includes(username.toLowerCase()) || 
                               cleanName === cleanUsername;
                    })
                });
            }
        });

        if (matches.length === 0) {
            notFound.push(username);
        } else if (matches.length === 1) {
            mappings[username] = matches[0].userId;
            console.log(`✅ Found ${username} -> ${matches[0].username} (${matches[0].userId})`);
        } else {
            // Multiple matches - take the best one or let admin decide
            console.log(`⚠️ Multiple matches for ${username}:`, matches.map(m => m.username));
            multipleMatches[username] = matches;
            // Take the first match for now
            mappings[username] = matches[0].userId;
        }
    }

    console.log(`🎯 Search complete: ${Object.keys(mappings).length} found, ${notFound.length} not found`);
    
    return { mappings, notFound, multipleMatches };
}

// Routes
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/dashboard');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/login' }),
    (req, res) => {
        res.redirect('/dashboard');
    }
);

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

app.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API Routes
app.get('/api/user', ensureAuthenticated, (req, res) => {
    res.json({
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar
    });
});

app.get('/api/servers', ensureAuthenticated, async (req, res) => {
    try {
        const userGuilds = req.user.guilds || [];
        const botGuilds = client.guilds.cache.map(guild => guild.id);
        
        const adminServers = [];
        
        for (const guild of userGuilds) {
            const hasAdmin = await hasAdminPermissions(req.user.id, guild.id);
            const botInGuild = botGuilds.includes(guild.id);
            
            if (hasAdmin && botInGuild) {
                const discordGuild = client.guilds.cache.get(guild.id);
                if (discordGuild) {
                    adminServers.push({
                        id: guild.id,
                        name: discordGuild.name,
                        icon: guild.icon
                    });
                }
            }
        }
        
        res.json(adminServers);
    } catch (error) {
        console.error('Error fetching servers:', error);
        res.status(500).json({ error: 'Failed to fetch servers' });
    }
});

app.get('/api/channels/:serverId', ensureAuthenticated, async (req, res) => {
    try {
        const { serverId } = req.params;
        const hasAdmin = await hasAdminPermissions(req.user.id, serverId);
        
        if (!hasAdmin) {
            return res.status(403).json({ error: 'No admin permissions' });
        }
        
        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            return res.status(404).json({ error: 'Server not found' });
        }
        
        const channels = guild.channels.cache
            // 1. Filter for text channels using the ChannelType enum
            .filter(channel => channel.type === ChannelType.GuildText) 
            // 2. Sort the channels by their position property (This is the fix!)
            .sort((a, b) => a.position - b.position)
            // 3. Map the sorted channels to the format your frontend expects
            .map(channel => ({
                id: channel.id,
                name: channel.name
            }));
        
        res.json(channels);
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// API endpoint to expose plugin components
app.get('/api/plugins/components', ensureAuthenticated, (req, res) => {
    try {
        const components = pluginLoader.getPluginComponents();
        res.json(components);
    } catch (error) {
        console.error('Error getting plugin components:', error);
        res.status(500).json({ error: 'Failed to get plugin components' });
    }
});

// Plugin API endpoint
app.post('/api/message', ensureAuthenticated, upload.array('attachments'), async (req, res) => {
    try {
        const { serverId, channelId, message } = req.body;
        const files = req.files;
        
        const hasAdmin = await hasAdminPermissions(req.user.id, serverId);
        if (!hasAdmin) {
            return res.status(403).json({ error: 'No admin permissions' });
        }
        
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }
        
        const messageOptions = { content: message };
        
        if (files && files.length > 0) {
            messageOptions.files = files.map(file => ({
                attachment: file.path,
                name: file.originalname
            }));
        }
        
        await channel.send(messageOptions);
        
        // Clean up uploaded files
        if (files) {
            files.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.error('Error deleting file:', err);
                });
            });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Load and register plugin routes
pluginLoader.loadPlugins(app, client, ensureAuthenticated, hasAdminPermissions);

// Discord client events
client.once('ready', () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

// ARCANE USER FINDER COMMAND
client.on('messageCreate', async (message) => {
    if (message.content === '!findarcane' && message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply('🔍 Searching for Arcane users... This may take a moment...');
        
        try {
            const result = await findAllArcaneUsers(message.guild);
            
            // Format results for Discord
            let response = `**Found ${Object.keys(result.mappings).length}/100 Arcane users:**\n\`\`\`\n`;
            
            // Add mappings
            Object.entries(result.mappings).forEach(([username, userId]) => {
                response += `${username}=${userId}\n`;
            });
            response += `\`\`\``;
            
            // Add not found if any
            if (result.notFound.length > 0) {
                response += `\n**Not found (${result.notFound.length}):** ${result.notFound.join(', ')}`;
            }
            
            // Split message if too long for Discord (2000 char limit)
            if (response.length > 1900) {
                // Send mappings in chunks
                const mappingText = Object.entries(result.mappings)
                    .map(([username, userId]) => `${username}=${userId}`)
                    .join('\n');
                
                const chunks = mappingText.match(/.{1,1800}/g) || [];
                
                await message.channel.send(`**Found ${Object.keys(result.mappings).length}/100 users:**`);
                
                for (let i = 0; i < chunks.length; i++) {
                    await message.channel.send(`\`\`\`\n${chunks[i]}\n\`\`\``);
                }
                
                if (result.notFound.length > 0) {
                    await message.channel.send(`**Not found:** ${result.notFound.join(', ')}`);
                }
            } else {
                await message.channel.send(response);
            }
            
            // Show multiple matches info if any
            if (Object.keys(result.multipleMatches).length > 0) {
                let multipleText = '**⚠️ Multiple matches (using first match):**\n';
                Object.entries(result.multipleMatches).forEach(([username, matches]) => {
                    multipleText += `${username}: ${matches.map(m => m.username).join(', ')}\n`;
                });
                
                if (multipleText.length < 1900) {
                    await message.channel.send(multipleText);
                }
            }
            
        } catch (error) {
            console.error('Error finding Arcane users:', error);
            await message.channel.send('❌ Error occurred while searching for users.');
        }
    }
});

client.on('error', console.error);

// Start the application
async function start() {
    try {
        await client.login(process.env.DISCORD_BOT_TOKEN);
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error starting the application:', error);
    }
}

start();