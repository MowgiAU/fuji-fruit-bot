// plugins/slashCommandManager.js
const { Collection } = require('discord.js');

class SlashCommandManager {
    constructor() {
        this.commands = new Collection();
        this.commandPermissions = new Map();
        this.pluginCommands = new Map(); // Track which plugin owns which command
    }

    /**
     * Register commands from a plugin
     * @param {Object} plugin - The plugin instance
     * @param {Array} commands - Array of slash command data
     * @param {Object} permissions - Permission requirements for commands
     */
    registerPluginCommands(plugin, commands, permissions = {}) {
        if (!Array.isArray(commands)) {
            console.warn(`Plugin ${plugin.name} provided invalid commands format`);
            return;
        }

        for (const command of commands) {
            if (!command.name) {
                console.warn(`Plugin ${plugin.name} has command without name`);
                continue;
            }

            // Check for command name conflicts
            if (this.commands.has(command.name)) {
                const existingPlugin = this.pluginCommands.get(command.name);
                console.error(`❌ Command conflict: '${command.name}' already registered by ${existingPlugin}`);
                console.error(`❌ Plugin ${plugin.name} cannot register duplicate command`);
                continue;
            }

            // Register the command
            this.commands.set(command.name, {
                data: command,
                plugin: plugin,
                handler: this.findCommandHandler(plugin, command.name)
            });

            // Store plugin ownership
            this.pluginCommands.set(command.name, plugin.name);

            // Store permissions if provided
            if (permissions[command.name]) {
                this.commandPermissions.set(command.name, permissions[command.name]);
            }

            console.log(`✓ Registered command '${command.name}' from plugin: ${plugin.name}`);
        }
    }

    /**
     * Find the appropriate handler method in the plugin
     */
    findCommandHandler(plugin, commandName) {
        // Look for specific handler methods
        const handlerMethods = [
            `handle${commandName.charAt(0).toUpperCase() + commandName.slice(1)}Command`,
            `handle${commandName}`,
            'handleSlashCommand',
            'handleCommand'
        ];

        for (const method of handlerMethods) {
            if (typeof plugin[method] === 'function') {
                return plugin[method].bind(plugin);
            }
        }

        console.warn(`No handler found for command '${commandName}' in plugin ${plugin.name}`);
        return null;
    }

    /**
     * Get all registered commands for Discord API
     */
    getAllCommands() {
        return Array.from(this.commands.values()).map(cmd => cmd.data);
    }

    /**
     * Handle incoming slash command interaction
     */
    async handleInteraction(interaction) {
        if (!interaction.isChatInputCommand()) return false;

        const command = this.commands.get(interaction.commandName);
        if (!command) {
            console.warn(`Unknown command: ${interaction.commandName}`);
            return false;
        }

        // Check permissions
        if (!this.checkPermissions(interaction, command)) {
            await interaction.reply({ 
                content: '❌ You do not have permission to use this command.', 
                ephemeral: true 
            });
            return true;
        }

        // Execute command handler
        try {
            if (command.handler) {
                await command.handler(interaction);
            } else {
                await interaction.reply({ 
                    content: '❌ Command handler not found. Please contact an administrator.', 
                    ephemeral: true 
                });
            }
            return true;
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            
            const errorMsg = '❌ An error occurred while executing this command.';
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMsg, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMsg, ephemeral: true });
            }
            return true;
        }
    }

    /**
     * Check if user has permission to use command
     */
    checkPermissions(interaction, command) {
        const permissions = this.commandPermissions.get(command.data.name);
        if (!permissions) return true; // No specific permissions required

        const member = interaction.member;
        if (!member) return false;

        // Check for required roles
        if (permissions.roles && permissions.roles.length > 0) {
            const hasRole = permissions.roles.some(roleId => 
                member.roles.cache.has(roleId)
            );
            if (!hasRole) return false;
        }

        // Check for required permissions
        if (permissions.permissions && permissions.permissions.length > 0) {
            const hasPermission = permissions.permissions.every(perm => 
                member.permissions.has(perm)
            );
            if (!hasPermission) return false;
        }

        // Check for admin requirement
        if (permissions.adminOnly && !member.permissions.has('Administrator')) {
            return false;
        }

        return true;
    }

    /**
     * Get command statistics
     */
    getStats() {
        const pluginStats = new Map();
        
        for (const [commandName, pluginName] of this.pluginCommands) {
            if (!pluginStats.has(pluginName)) {
                pluginStats.set(pluginName, []);
            }
            pluginStats.get(pluginName).push(commandName);
        }

        return {
            totalCommands: this.commands.size,
            pluginBreakdown: Object.fromEntries(pluginStats),
            commandList: Array.from(this.commands.keys())
        };
    }

    /**
     * Unregister commands from a specific plugin (useful for plugin reloading)
     */
    unregisterPluginCommands(pluginName) {
        const commandsToRemove = [];
        
        for (const [commandName, registeredPluginName] of this.pluginCommands) {
            if (registeredPluginName === pluginName) {
                commandsToRemove.push(commandName);
            }
        }

        for (const commandName of commandsToRemove) {
            this.commands.delete(commandName);
            this.pluginCommands.delete(commandName);
            this.commandPermissions.delete(commandName);
            console.log(`🗑️ Unregistered command '${commandName}' from plugin: ${pluginName}`);
        }

        return commandsToRemove.length;
    }
}

module.exports = SlashCommandManager;