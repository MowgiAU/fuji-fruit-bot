// plugins/pluginLoader.js
const fs = require('fs');
const path = require('path');
const SlashCommandManager = require('./slashCommandManager');

class PluginLoader {
    constructor() {
        this.plugins = [];
        this.pluginDir = path.join(__dirname);
        this.slashCommandManager = new SlashCommandManager();
    }

    loadPlugins(app, client, ensureAuthenticated, hasAdminPermissions) {
        try {
            const pluginFiles = fs.readdirSync(this.pluginDir)
                .filter(file => file.endsWith('.js') && 
                       file !== 'pluginLoader.js' && 
                       file !== 'slashCommandManager.js');

            console.log(`📦 Found ${pluginFiles.length} plugin files to load...`);

            for (const file of pluginFiles) {
                try {
                    const pluginPath = path.join(this.pluginDir, file);
                    
                    // Clear require cache to allow reloading
                    delete require.cache[require.resolve(pluginPath)];
                    
                    const Plugin = require(pluginPath);
                    
                    if (typeof Plugin === 'function') {
                        const plugin = new Plugin(app, client, ensureAuthenticated, hasAdminPermissions);
                        this.plugins.push(plugin);

                        // Register slash commands if the plugin provides them
                        this.registerPluginSlashCommands(plugin);

                        console.log(`✓ Loaded plugin: ${plugin.name || file}`);
                    } else {
                        console.warn(`⚠ Plugin ${file} does not export a constructor function`);
                    }
                } catch (error) {
                    console.error(`✗ Failed to load plugin ${file}:`, error.message);
                    if (process.env.NODE_ENV === 'development') {
                        console.error(error.stack);
                    }
                }
            }

            console.log(`📦 Successfully loaded ${this.plugins.length} plugins`);
            
            // Log slash command statistics
            const stats = this.slashCommandManager.getStats();
            console.log(`🎯 Registered ${stats.totalCommands} slash commands across ${Object.keys(stats.pluginBreakdown).length} plugins`);
            
            return this.plugins;
        } catch (error) {
            console.error('Error loading plugins:', error);
            return [];
        }
    }

    /**
     * Register slash commands from a plugin with the centralized manager
     */
    registerPluginSlashCommands(plugin) {
        try {
            // Get commands from plugin
            let commands = [];
            let permissions = {};

            // Try multiple methods to get commands
            if (typeof plugin.getSlashCommands === 'function') {
                commands = plugin.getSlashCommands();
            } else if (plugin.slashCommands && Array.isArray(plugin.slashCommands)) {
                commands = plugin.slashCommands;
            }

            // Get permissions if available
            if (typeof plugin.getCommandPermissions === 'function') {
                permissions = plugin.getCommandPermissions();
            } else if (plugin.commandPermissions) {
                permissions = plugin.commandPermissions;
            }

            // Register with the manager
            if (commands.length > 0) {
                this.slashCommandManager.registerPluginCommands(plugin, commands, permissions);
            }

            // Disable any old setupSlashCommands method to prevent conflicts
            if (typeof plugin.setupSlashCommands === 'function') {
                console.log(`⚠ Plugin ${plugin.name} has deprecated setupSlashCommands method - ignoring in favor of centralized system`);
            }

        } catch (error) {
            console.error(`Error registering slash commands for plugin ${plugin.name}:`, error);
        }
    }

    /**
     * Get all slash commands for Discord registration
     */
    getAllSlashCommands() {
        return this.slashCommandManager.getAllCommands();
    }

    /**
     * Handle slash command interaction
     */
    async handleSlashCommandInteraction(interaction) {
        return await this.slashCommandManager.handleInteraction(interaction);
    }

    /**
     * Get plugin information including command counts
     */
    getPluginInfo() {
        const commandStats = this.slashCommandManager.getStats();
        
        return this.plugins.map(plugin => {
            const pluginCommands = commandStats.pluginBreakdown[plugin.name] || [];
            
            return {
                name: plugin.name || 'Unknown',
                description: plugin.description || 'No description',
                version: plugin.version || '1.0.0',
                enabled: plugin.enabled !== false,
                commands: pluginCommands,
                commandCount: pluginCommands.length
            };
        });
    }

    getPluginComponents() {
        const components = [];
        
        for (const plugin of this.plugins) {
            if (plugin.getFrontendComponent) {
                try {
                    const component = plugin.getFrontendComponent();
                    if (component) {
                        components.push(component);
                    }
                } catch (error) {
                    console.error(`Error getting frontend component from plugin ${plugin.name}:`, error);
                }
            }
        }
        
        return components;
    }

    /**
     * Reload a specific plugin (useful for development)
     */
    reloadPlugin(pluginName) {
        try {
            // Find the plugin
            const pluginIndex = this.plugins.findIndex(p => p.name === pluginName);
            if (pluginIndex === -1) {
                throw new Error(`Plugin ${pluginName} not found`);
            }

            // Unregister its commands
            const removedCommands = this.slashCommandManager.unregisterPluginCommands(pluginName);
            console.log(`🗑️ Removed ${removedCommands} commands from ${pluginName}`);

            // Remove from plugins array
            this.plugins.splice(pluginIndex, 1);

            // TODO: Could reload the plugin here if needed
            
            return true;
        } catch (error) {
            console.error(`Error reloading plugin ${pluginName}:`, error);
            return false;
        }
    }

    /**
     * Get slash command statistics
     */
    getSlashCommandStats() {
        return this.slashCommandManager.getStats();
    }
}

module.exports = new PluginLoader();