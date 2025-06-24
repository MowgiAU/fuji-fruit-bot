const fs = require('fs').promises;
const path = require('path');

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
            html: '<div>Genre Discovery Dashboard</div>',
            script: 'console.log("Genre Discovery frontend loaded");'
        };
    }
}

module.exports = GenreDiscoveryPlugin;
