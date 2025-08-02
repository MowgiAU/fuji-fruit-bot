// Global helper functions that plugins can use
window.pluginHelpers = {
    // Load servers for any plugin
    async loadServers(selectElementId) {
        try {
            const response = await fetch('/api/servers');
            if (!response.ok) throw new Error('Failed to fetch servers');
            
            const servers = await response.json();
            const selectElement = document.getElementById(selectElementId);
            
            if (selectElement) {
                selectElement.innerHTML = '<option value="">Select a server...</option>';
                servers.forEach(server => {
                    const option = document.createElement('option');
                    option.value = server.id;
                    option.textContent = server.name;
                    selectElement.appendChild(option);
                });
                console.log(`✓ Loaded ${servers.length} servers into ${selectElementId}`);
            }
            
            return servers;
        } catch (error) {
            console.error('Error loading servers:', error);
            if (window.showNotification) {
                window.showNotification('Failed to load servers', 'error');
            }
            throw error;
        }
    },

    // Load channels for a specific server
    async loadChannels(serverId, selectElementId, emptyOptionText = 'Select a channel...') {
        try {
            const response = await fetch(`/api/channels/${serverId}`);
            if (!response.ok) throw new Error('Failed to fetch channels');
            
            const channels = await response.json();
            const selectElement = document.getElementById(selectElementId);
            
            if (selectElement) {
                selectElement.innerHTML = `<option value="">${emptyOptionText}</option>`;
                channels.forEach(channel => {
                    const option = document.createElement('option');
                    option.value = channel.id;
                    option.textContent = `# ${channel.name}`;
                    selectElement.appendChild(option);
                });
                console.log(`✓ Loaded ${channels.length} channels into ${selectElementId}`);
            }
            
            return channels;
        } catch (error) {
            console.error('Error loading channels:', error);
            throw error;
        }
    },

    // Load roles for a specific server
    async loadRoles(serverId, selectElementId, emptyOptionText = 'Select a role...') {
        try {
            const response = await fetch(`/api/roles/${serverId}`);
            if (!response.ok) throw new Error('Failed to fetch roles');
            
            const roles = await response.json();
            const selectElement = document.getElementById(selectElementId);
            
            if (selectElement) {
                selectElement.innerHTML = `<option value="">${emptyOptionText}</option>`;
                roles.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role.id;
                    option.textContent = role.name;
                    option.style.color = role.color || '#ffffff';
                    selectElement.appendChild(option);
                });
                console.log(`✓ Loaded ${roles.length} roles into ${selectElementId}`);
            }
            
            return roles;
        } catch (error) {
            console.error('Error loading roles:', error);
            throw error;
        }
    },

    // Generic data loader for plugins
    async loadPluginData(pluginName, serverId, endpoint) {
        try {
            const response = await fetch(`/api/plugins/${pluginName}/${endpoint}/${serverId}`);
            if (!response.ok) throw new Error(`Failed to fetch ${pluginName} data`);
            
            return await response.json();
        } catch (error) {
            console.error(`Error loading ${pluginName} data:`, error);
            throw error;
        }
    },

    // Save plugin settings
    async savePluginSettings(pluginName, serverId, settings) {
        try {
            const response = await fetch(`/api/plugins/${pluginName}/settings/${serverId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });
            
            if (!response.ok) throw new Error(`Failed to save ${pluginName} settings`);
            
            return await response.json();
        } catch (error) {
            console.error(`Error saving ${pluginName} settings:`, error);
            throw error;
        }
    }
};

// Specific helper functions for missing plugin functions

// Auto Role Plugin helpers
window.loadAutoRoleServers = async function() {
    return await window.pluginHelpers.loadServers('autorole-server-select');
};

// Message Cleanup Plugin helpers  
window.loadCleanupData = async function() {
    const serverId = window.getCurrentServerId();
    if (!serverId) {
        console.warn('No server selected for cleanup data loading');
        return;
    }
    
    try {
        // Load cleanup statistics
        const statsResponse = await fetch(`/api/plugins/message-cleanup/stats/${serverId}`);
        const stats = await statsResponse.json();
        
        // Update UI elements
        const totalCleanupsEl = document.getElementById('total-cleanups');
        const totalMessagesEl = document.getElementById('total-messages');
        const activeModeratorsEl = document.getElementById('active-moderators');
        
        if (totalCleanupsEl) totalCleanupsEl.textContent = stats.totalCleanups || '0';
        if (totalMessagesEl) totalMessagesEl.textContent = stats.totalMessages || '0';
        if (activeModeratorsEl) activeModeratorsEl.textContent = stats.activeModerators || '0';
        
        // Load recent logs
        const logsResponse = await fetch(`/api/plugins/message-cleanup/logs/${serverId}`);
        const logsData = await logsResponse.json();
        
        const logList = document.getElementById('cleanup-log-list');
        if (logList && logsData.logs && logsData.logs.length > 0) {
            logList.innerHTML = logsData.logs.slice(-10).reverse().map(log => 
                `<div class="log-entry">
                    <strong>Cleanup by ${log.moderatorId || 'Unknown'}</strong><br>
                    Channel: ${log.channelId || 'Unknown'}<br>
                    Reason: ${log.reason || 'No reason provided'}<br>
                    <small>${new Date(log.timestamp).toLocaleString()}</small>
                </div>`
            ).join('');
        } else if (logList) {
            logList.innerHTML = '<p>No cleanup logs found.</p>';
        }
        
    } catch (error) {
        console.error('Error loading cleanup data:', error);
        
        // Update UI to show error state
        ['total-cleanups', 'total-messages', 'active-moderators'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = 'Error';
        });
        
        const logList = document.getElementById('cleanup-log-list');
        if (logList) logList.innerHTML = '<p>Error loading logs.</p>';
    }
};

// Reputation Plugin helpers
window.loadReputationServers = async function() {
    return await window.pluginHelpers.loadServers('repServerSelect');
};

// Generic function to load plugin servers
window.loadPluginServers = async function(selectElementId) {
    return await window.pluginHelpers.loadServers(selectElementId);
};

console.log('✅ Plugin helper functions loaded');