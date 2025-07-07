const fs = require('fs');
const path = require('path');
const https = require('https');

class EventManagerPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Event Manager';
        this.description = 'Manage collaborations, competitions, and company promotions with Google Sheets integration';
        this.version = '1.0.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        this.settingsFile = './data/eventManagerSettings.json';
        this.collaborationsFile = './data/eventManagerCollaborations.json';
        
        this.initializeDataFiles();
        this.setupRoutes();
        
        console.log('Event Manager Plugin loaded successfully');
    }

    initializeDataFiles() {
        const defaultSettings = {
            googleSheetsId: '1_3XMoAsn6HbYBO0V8fBLQqyUipzxRlWPrah5DEUR2uc',
            notificationChannelId: '',
            eventReminderRoleId: '',
            autoSync: false,
            syncInterval: 3600000,
            lastSync: 0,
            reminderDays: [7, 3, 1],
            statusColors: {
                'Active': '#00ff00',
                'Pending': '#ffff00',
                'Completed': '#0080ff',
                'Cancelled': '#ff0000',
                'On Hold': '#ff8000'
            }
        };

        const defaultCollaborations = {
            lastUpdated: 0,
            data: []
        };

        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }

        if (!fs.existsSync(this.settingsFile)) {
            fs.writeFileSync(this.settingsFile, JSON.stringify(defaultSettings, null, 2));
        }

        if (!fs.existsSync(this.collaborationsFile)) {
            fs.writeFileSync(this.collaborationsFile, JSON.stringify(defaultCollaborations, null, 2));
        }
    }

    loadSettings() {
        try {
            return JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
        } catch (error) {
            console.error('Error loading event manager settings:', error);
            return {};
        }
    }

    saveSettings(settings) {
        try {
            fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving event manager settings:', error);
            return false;
        }
    }

    loadCollaborations() {
        try {
            return JSON.parse(fs.readFileSync(this.collaborationsFile, 'utf8'));
        } catch (error) {
            console.error('Error loading collaborations data:', error);
            return { lastUpdated: 0, data: [] };
        }
    }

    saveCollaborations(collaborations) {
        try {
            fs.writeFileSync(this.collaborationsFile, JSON.stringify(collaborations, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving collaborations data:', error);
            return false;
        }
    }

    async syncFromGoogleSheets() {
        const settings = this.loadSettings();
        const csvUrl = `https://docs.google.com/spreadsheets/d/${settings.googleSheetsId}/export?format=csv&gid=0`;
        
        return new Promise((resolve, reject) => {
            https.get(csvUrl, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    try {
                        const collaborations = this.parseCSV(data);
                        const collaborationData = {
                            lastUpdated: Date.now(),
                            data: collaborations
                        };
                        
                        if (this.saveCollaborations(collaborationData)) {
                            resolve(collaborations);
                        } else {
                            reject(new Error('Failed to save collaboration data'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', (error) => {
                reject(error);
            });
        });
    }

    parseCSV(csvData) {
        const lines = csvData.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const collaborations = [];

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = this.parseCSVLine(lines[i]);
            const collaboration = {};
            
            headers.forEach((header, index) => {
                collaboration[header] = values[index] || '';
            });
            
            if (collaboration['Collaborator'] && collaboration['Collaborator'].trim()) {
                collaborations.push(collaboration);
            }
        }

        return collaborations;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    setupRoutes() {
        this.app.get('/api/plugins/eventmanager/settings', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.query.guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                const settings = this.loadSettings();
                res.json(settings);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/plugins/eventmanager/settings', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.body.guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                const currentSettings = this.loadSettings();
                const newSettings = { ...currentSettings, ...req.body };
                
                if (this.saveSettings(newSettings)) {
                    res.json({ success: true, message: 'Settings updated successfully' });
                } else {
                    res.status(500).json({ error: 'Failed to save settings' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/plugins/eventmanager/collaborations', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.query.guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                const collaborations = this.loadCollaborations();
                res.json(collaborations);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/plugins/eventmanager/sync', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.body.guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                const collaborations = await this.syncFromGoogleSheets();
                res.json({ 
                    success: true, 
                    message: `Synced ${collaborations.length} collaborations from Google Sheets`,
                    data: collaborations
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/plugins/eventmanager/upcoming', this.ensureAuthenticated, async (req, res) => {
            try {
                if (!await this.hasAdminPermissions(req.user.id, req.query.guildId)) {
                    return res.status(403).json({ error: 'Admin permissions required' });
                }

                const collaborations = this.loadCollaborations();
                const upcoming = this.getUpcomingEvents(collaborations.data);
                res.json(upcoming);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    getUpcomingEvents(collaborations) {
        const now = new Date();
        const upcoming = [];

        collaborations.forEach(collab => {
            const events = [];
            
            const dateFields = [
                { field: 'Competition Begin', type: 'Competition Start' },
                { field: 'Competition End', type: 'Competition End' },
                { field: 'Voting Start', type: 'Voting Begins' },
                { field: 'Voting Second Round', type: 'Second Round Voting' },
                { field: 'Voting End', type: 'Voting Ends' }
            ];

            dateFields.forEach(({ field, type }) => {
                if (collab[field]) {
                    const eventDate = new Date(collab[field]);
                    if (eventDate > now) {
                        const daysUntil = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
                        events.push({
                            collaboration: collab['Collaborator'],
                            type: type,
                            date: eventDate,
                            daysUntil: daysUntil,
                            status: collab['Status']
                        });
                    }
                }
            });

            upcoming.push(...events);
        });

        return upcoming.sort((a, b) => a.date - b.date);
    }

    getFrontendComponent() {
        return {
            id: 'event-manager',
            name: 'Event Manager',
            description: 'Manage collaborations, competitions, and company promotions',
            icon: '📅',
            containerId: 'eventManagerContainer',
            pageId: 'event-manager',
            navIcon: '📅',
            html: `
                <div class="plugin-container">
                    <h3>📅 Event Manager</h3>
                    <p>Manage collaborations and competitions with Google Sheets integration</p>

                    <div class="form-group">
                        <label for="eventServerSelect">Server:</label>
                        <select id="eventServerSelect" class="form-control">
                            <option value="">Select a server...</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="eventNotificationChannel">Notification Channel:</label>
                        <select id="eventNotificationChannel" class="form-control" disabled>
                            <option value="">Select a channel...</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="eventReminderRole">Reminder Role:</label>
                        <select id="eventReminderRole" class="form-control" disabled>
                            <option value="">Select a role...</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="eventAutoSync"> Enable Auto-Sync (hourly)
                        </label>
                    </div>

                    <div class="form-group">
                        <button class="btn btn-primary" onclick="saveEventSettings()">Save Settings</button>
                        <button class="btn btn-secondary" onclick="syncEventData()">Sync Now</button>
                    </div>

                    <div class="dashboard-section">
                        <h4>📊 Dashboard</h4>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <h5>Total Collaborations</h5>
                                <span id="totalCollaborations">-</span>
                            </div>
                            <div class="stat-card">
                                <h5>Active Competitions</h5>
                                <span id="activeCompetitions">-</span>
                            </div>
                            <div class="stat-card">
                                <h5>Upcoming Events</h5>
                                <span id="upcomingEvents">-</span>
                            </div>
                            <div class="stat-card">
                                <h5>Last Sync</h5>
                                <span id="lastSync">-</span>
                            </div>
                        </div>
                    </div>

                    <div class="events-section">
                        <h4>⏰ Upcoming Events</h4>
                        <div id="upcomingEventsTable"></div>
                    </div>

                    <div class="collaborations-section">
                        <h4>🤝 Collaborations</h4>
                        <div class="form-group">
                            <input type="text" id="collaborationSearch" placeholder="Search collaborations..." class="form-control">
                        </div>
                        <div id="collaborationsTable"></div>
                    </div>
                </div>
            `,
            script: `
                console.log("Event Manager: Initializing frontend component...");
                
                let eventSettings = {};
                let collaborationsData = [];
                let upcomingEventsData = [];
                let currentServerId = null;

                async function loadServers() {
                    console.log("Event Manager: Loading servers...");
                    try {
                        const response = await fetch("/api/servers");
                        const servers = await response.json();
                        
                        console.log("Event Manager: Received servers:", servers.length);
                        
                        const serverSelect = document.getElementById("eventServerSelect");
                        if (serverSelect) {
                            serverSelect.innerHTML = '<option value="">Select a server...</option>';
                            servers.forEach(server => {
                                const option = document.createElement("option");
                                option.value = server.id;
                                option.textContent = server.name;
                                serverSelect.appendChild(option);
                            });
                            
                            console.log("Event Manager: Server dropdown populated successfully");
                        }
                    } catch (error) {
                        console.error("Event Manager: Error loading servers:", error);
                        if (typeof showNotification === "function") {
                            showNotification("Error loading servers", "error");
                        }
                    }
                }

                async function loadChannelsForServer(serverId) {
                    console.log("Event Manager: Loading channels for server:", serverId);
                    try {
                        const response = await fetch("/api/channels/" + serverId);
                        const channels = await response.json();
                        
                        const channelSelect = document.getElementById("eventNotificationChannel");
                        if (channelSelect) {
                            channelSelect.innerHTML = '<option value="">Select a channel...</option>';
                            channels.forEach(channel => {
                                const option = document.createElement("option");
                                option.value = channel.id;
                                option.textContent = "#" + channel.name;
                                channelSelect.appendChild(option);
                            });
                        }
                    } catch (error) {
                        console.error("Event Manager: Error loading channels:", error);
                    }
                }

                async function loadRolesForServer(serverId) {
                    console.log("Event Manager: Loading roles for server:", serverId);
                    try {
                        const response = await fetch("/api/roles/" + serverId);
                        const roles = await response.json();
                        
                        const roleSelect = document.getElementById("eventReminderRole");
                        if (roleSelect) {
                            roleSelect.innerHTML = '<option value="">Select a role...</option>';
                            roles.forEach(role => {
                                const option = document.createElement("option");
                                option.value = role.id;
                                option.textContent = "@" + role.name;
                                roleSelect.appendChild(option);
                            });
                        }
                    } catch (error) {
                        console.error("Event Manager: Error loading roles:", error);
                    }
                }

                async function loadCollaborationsForServer(serverId) {
                    console.log("Event Manager: Loading collaborations for server:", serverId);
                    try {
                        const response = await fetch("/api/plugins/eventmanager/collaborations?guildId=" + serverId);
                        const data = await response.json();
                        
                        collaborationsData = data.data || [];
                        updateDashboard();
                        renderCollaborationsTable();
                    } catch (error) {
                        console.error("Event Manager: Error loading collaborations:", error);
                    }
                }

                function updateDashboard() {
                    const totalCollabs = collaborationsData.length;
                    const activeCompetitions = collaborationsData.filter(c => c.Status === "Active").length;
                    
                    const totalEl = document.getElementById("totalCollaborations");
                    const activeEl = document.getElementById("activeCompetitions");
                    
                    if (totalEl) totalEl.textContent = totalCollabs;
                    if (activeEl) activeEl.textContent = activeCompetitions;
                }

                function renderCollaborationsTable() {
                    const container = document.getElementById("collaborationsTable");
                    if (!container) return;
                    
                    if (collaborationsData.length === 0) {
                        container.innerHTML = "<p>No collaborations found. <button onclick='syncEventData()' class='btn btn-primary'>Sync from Google Sheets</button></p>";
                        return;
                    }

                    let tableHTML = "<table class='table'><thead><tr><th>Collaborator</th><th>Contact</th><th>Status</th><th>Competition Begin</th><th>Product</th></tr></thead><tbody>";
                    
                    collaborationsData.slice(0, 10).forEach(collab => {
                        tableHTML += "<tr>";
                        tableHTML += "<td>" + (collab.Collaborator || "-") + "</td>";
                        tableHTML += "<td>" + (collab["Contact Name"] || "-") + "</td>";
                        tableHTML += "<td>" + (collab.Status || "-") + "</td>";
                        tableHTML += "<td>" + (collab["Competition Begin"] || "-") + "</td>";
                        tableHTML += "<td>" + (collab["Product Name"] || "-") + "</td>";
                        tableHTML += "</tr>";
                    });
                    
                    tableHTML += "</tbody></table>";
                    container.innerHTML = tableHTML;
                }

                // Event listeners
                const serverSelect = document.getElementById("eventServerSelect");
                if (serverSelect) {
                    loadServers();
                    
                    serverSelect.addEventListener("change", async (e) => {
                        currentServerId = e.target.value;
                        console.log("Event Manager: Server changed to:", currentServerId);
                        
                        if (currentServerId) {
                            document.getElementById("eventNotificationChannel").disabled = false;
                            document.getElementById("eventReminderRole").disabled = false;
                            
                            await loadChannelsForServer(currentServerId);
                            await loadRolesForServer(currentServerId);
                            await loadCollaborationsForServer(currentServerId);
                        } else {
                            document.getElementById("eventNotificationChannel").disabled = true;
                            document.getElementById("eventReminderRole").disabled = true;
                        }
                    });
                }

                // Global functions
                window.saveEventSettings = function() {
                    if (!currentServerId) {
                        if (typeof showNotification === "function") {
                            showNotification("Please select a server first", "error");
                        }
                        return;
                    }
                    
                    const settings = {
                        guildId: currentServerId,
                        notificationChannelId: document.getElementById("eventNotificationChannel").value,
                        eventReminderRoleId: document.getElementById("eventReminderRole").value,
                        autoSync: document.getElementById("eventAutoSync").checked
                    };

                    fetch("/api/plugins/eventmanager/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(settings)
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            if (typeof showNotification === "function") {
                                showNotification("Settings saved successfully!", "success");
                            }
                        } else {
                            if (typeof showNotification === "function") {
                                showNotification("Error saving settings", "error");
                            }
                        }
                    })
                    .catch(error => {
                        console.error("Error saving settings:", error);
                        if (typeof showNotification === "function") {
                            showNotification("Error saving settings", "error");
                        }
                    });
                };

                window.syncEventData = function() {
                    if (!currentServerId) {
                        if (typeof showNotification === "function") {
                            showNotification("Please select a server first", "error");
                        }
                        return;
                    }

                    if (typeof showNotification === "function") {
                        showNotification("Syncing data from Google Sheets...", "info");
                    }

                    fetch("/api/plugins/eventmanager/sync", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ guildId: currentServerId })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            if (typeof showNotification === "function") {
                                showNotification(data.message, "success");
                            }
                            loadCollaborationsForServer(currentServerId);
                        } else {
                            if (typeof showNotification === "function") {
                                showNotification("Error syncing data", "error");
                            }
                        }
                    })
                    .catch(error => {
                        console.error("Error syncing data:", error);
                        if (typeof showNotification === "function") {
                            showNotification("Error syncing data", "error");
                        }
                    });
                };

                console.log("Event Manager: Frontend component initialized successfully");
            `
        };
    }
}

module.exports = EventManagerPlugin;