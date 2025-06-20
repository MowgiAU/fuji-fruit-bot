const fs = require('fs');
const path = require('path');

class ChannelRulesPlugin {
    constructor(app, client, ensureAuthenticated, hasAdminPermissions) {
        this.name = 'Channel Rules';
        this.description = 'Set up automated rules for channels with custom conditions and actions';
        this.version = '1.0.0';
        this.enabled = true;
        
        this.app = app;
        this.client = client;
        this.ensureAuthenticated = ensureAuthenticated;
        this.hasAdminPermissions = hasAdminPermissions;
        
        // Storage for channel rules per server
        this.channelRules = this.loadChannelRules();
        
        this.setupRoutes();
        this.setupMessageListener();
    }

    loadChannelRules() {
        try {
            const rulesPath = './data/channelRules.json';
            if (fs.existsSync(rulesPath)) {
                return JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading channel rules:', error);
        }
        return {};
    }

    saveChannelRules() {
        try {
            const dataDir = './data';
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }
            fs.writeFileSync('./data/channelRules.json', JSON.stringify(this.channelRules, null, 2));
        } catch (error) {
            console.error('Error saving channel rules:', error);
        }
    }

    setupRoutes() {
        // Get all channel rules for a server
        this.app.get('/api/plugins/channelrules/rules/:serverId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId } = req.params;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }
                
                const serverRules = this.channelRules[serverId] || {};
                res.json(serverRules);
            } catch (error) {
                console.error('Error getting channel rules:', error);
                res.status(500).json({ error: 'Failed to get channel rules' });
            }
        });

        // Get rules for a specific channel
        this.app.get('/api/plugins/channelrules/rules/:serverId/:channelId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, channelId } = req.params;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }
                
                const channelRules = this.channelRules[serverId]?.[channelId] || {
                    enabled: false,
                    rules: [],
                    logChannelId: null
                };
                
                res.json(channelRules);
            } catch (error) {
                console.error('Error getting channel rules:', error);
                res.status(500).json({ error: 'Failed to get channel rules' });
            }
        });

        // Update rules for a specific channel
        this.app.post('/api/plugins/channelrules/rules/:serverId/:channelId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, channelId } = req.params;
                const { enabled, rules, logChannelId } = req.body;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }
                
                if (!this.channelRules[serverId]) {
                    this.channelRules[serverId] = {};
                }
                
                this.channelRules[serverId][channelId] = {
                    enabled: enabled || false,
                    rules: rules || [],
                    logChannelId: logChannelId || null
                };
                
                this.saveChannelRules();
                res.json({ success: true, message: 'Channel rules updated successfully' });
            } catch (error) {
                console.error('Error updating channel rules:', error);
                res.status(500).json({ error: 'Failed to update channel rules' });
            }
        });

        // Delete rules for a specific channel
        this.app.delete('/api/plugins/channelrules/rules/:serverId/:channelId', this.ensureAuthenticated, async (req, res) => {
            try {
                const { serverId, channelId } = req.params;
                
                const hasAdmin = await this.hasAdminPermissions(req.user.id, serverId);
                if (!hasAdmin) {
                    return res.status(403).json({ error: 'No admin permissions' });
                }
                
                if (this.channelRules[serverId] && this.channelRules[serverId][channelId]) {
                    delete this.channelRules[serverId][channelId];
                    this.saveChannelRules();
                }
                
                res.json({ success: true, message: 'Channel rules deleted successfully' });
            } catch (error) {
                console.error('Error deleting channel rules:', error);
                res.status(500).json({ error: 'Failed to delete channel rules' });
            }
        });
    }

    setupMessageListener() {
        this.client.on('messageCreate', async (message) => {
            // Ignore bot messages and DMs
            if (message.author.bot || !message.guild) return;
            
            const serverId = message.guild.id;
            const channelId = message.channel.id;
            
            // Check if there are rules for this channel
            const channelRules = this.channelRules[serverId]?.[channelId];
            if (!channelRules || !channelRules.enabled || !channelRules.rules.length) return;
            
            // Check each rule
            for (const rule of channelRules.rules) {
                const violation = await this.checkRule(message, rule);
                if (violation) {
                    await this.handleRuleViolation(message, rule, violation, channelRules.logChannelId);
                    break; // Only handle first violation
                }
            }
        });
    }

    async checkRule(message, rule) {
        switch (rule.type) {
            case 'must_contain_audio':
                return this.checkMustContainAudio(message, rule);
            
            case 'must_contain_image':
                return this.checkMustContainImage(message, rule);
            
            case 'must_contain_video':
                return this.checkMustContainVideo(message, rule);
            
            case 'must_contain_file':
                return this.checkMustContainFile(message, rule);
            
            case 'blocked_domains':
                return this.checkBlockedDomains(message, rule);
            
            case 'required_text':
                return this.checkRequiredText(message, rule);
            
            case 'blocked_text':
                return this.checkBlockedText(message, rule);
            
            case 'min_length':
                return this.checkMinLength(message, rule);
            
            case 'max_length':
                return this.checkMaxLength(message, rule);
            
            default:
                return null;
        }
    }

    checkMustContainAudio(message, rule) {
        const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'];
        const hasAudio = message.attachments.some(attachment => {
            const ext = attachment.name.split('.').pop().toLowerCase();
            return audioExtensions.includes(ext);
        });
        
        if (!hasAudio) {
            return {
                type: 'missing_audio',
                message: rule.customMessage || 'Your message must contain an audio file.'
            };
        }
        return null;
    }

    checkMustContainImage(message, rule) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
        const hasImage = message.attachments.some(attachment => {
            const ext = attachment.name.split('.').pop().toLowerCase();
            return imageExtensions.includes(ext);
        });
        
        if (!hasImage) {
            return {
                type: 'missing_image',
                message: rule.customMessage || 'Your message must contain an image.'
            };
        }
        return null;
    }

    checkMustContainVideo(message, rule) {
        const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
        const hasVideo = message.attachments.some(attachment => {
            const ext = attachment.name.split('.').pop().toLowerCase();
            return videoExtensions.includes(ext);
        });
        
        if (!hasVideo) {
            return {
                type: 'missing_video',
                message: rule.customMessage || 'Your message must contain a video file.'
            };
        }
        return null;
    }

    checkMustContainFile(message, rule) {
        if (message.attachments.size === 0) {
            return {
                type: 'missing_file',
                message: rule.customMessage || 'Your message must contain a file attachment.'
            };
        }
        return null;
    }

    checkBlockedDomains(message, rule) {
        const blockedDomains = rule.domains || [];
        const content = message.content.toLowerCase();
        
        for (const domain of blockedDomains) {
            if (content.includes(domain.toLowerCase())) {
                return {
                    type: 'blocked_domain',
                    message: rule.customMessage || `Links to ${domain} are not allowed in this channel.`,
                    domain: domain
                };
            }
        }
        return null;
    }

    checkRequiredText(message, rule) {
        const requiredTexts = rule.texts || [];
        const content = message.content.toLowerCase();
        
        for (const requiredText of requiredTexts) {
            if (!content.includes(requiredText.toLowerCase())) {
                return {
                    type: 'missing_required_text',
                    message: rule.customMessage || `Your message must contain: "${requiredText}"`,
                    requiredText: requiredText
                };
            }
        }
        return null;
    }

    checkBlockedText(message, rule) {
        const blockedTexts = rule.texts || [];
        const content = message.content.toLowerCase();
        
        for (const blockedText of blockedTexts) {
            if (content.includes(blockedText.toLowerCase())) {
                return {
                    type: 'blocked_text',
                    message: rule.customMessage || `Your message contains blocked content: "${blockedText}"`,
                    blockedText: blockedText
                };
            }
        }
        return null;
    }

    checkMinLength(message, rule) {
        const minLength = rule.length || 0;
        if (message.content.length < minLength) {
            return {
                type: 'too_short',
                message: rule.customMessage || `Your message must be at least ${minLength} characters long.`,
                currentLength: message.content.length,
                requiredLength: minLength
            };
        }
        return null;
    }

    checkMaxLength(message, rule) {
        const maxLength = rule.length || 2000;
        if (message.content.length > maxLength) {
            return {
                type: 'too_long',
                message: rule.customMessage || `Your message must be no more than ${maxLength} characters long.`,
                currentLength: message.content.length,
                maxLength: maxLength
            };
        }
        return null;
    }

    async handleRuleViolation(message, rule, violation, logChannelId) {
        try {
            // Delete the original message
            await message.delete();
            
            // Send DM to user if action is set to DM
            if (rule.action === 'dm' || rule.action === 'delete_and_dm') {
                try {
                    const dmEmbed = {
                        color: 0xff6b6b,
                        title: '🚫 Message Removed',
                        description: violation.message,
                        fields: [
                            {
                                name: 'Channel',
                                value: `#${message.channel.name}`,
                                inline: true
                            },
                            {
                                name: 'Server',
                                value: message.guild.name,
                                inline: true
                            },
                            {
                                name: 'Rule Type',
                                value: this.getRuleTypeDisplay(rule.type),
                                inline: true
                            },
                            {
                                name: 'Your Message',
                                value: message.content.length > 1000 ? 
                                    message.content.substring(0, 1000) + '...' : 
                                    message.content || '*No text content*',
                                inline: false
                            }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: 'Please review the channel rules and try again.'
                        }
                    };
                    
                    await message.author.send({ embeds: [dmEmbed] });
                } catch (dmError) {
                    console.log(`Could not send DM to ${message.author.tag}: ${dmError.message}`);
                }
            }
            
            // Log to designated channel if configured
            if (logChannelId) {
                const logChannel = this.client.channels.cache.get(logChannelId);
                if (logChannel) {
                    const logEmbed = {
                        color: 0xff6b6b,
                        title: '🚫 Rule Violation',
                        fields: [
                            {
                                name: 'User',
                                value: `${message.author} (${message.author.tag})`,
                                inline: true
                            },
                            {
                                name: 'Channel',
                                value: `${message.channel}`,
                                inline: true
                            },
                            {
                                name: 'Rule Type',
                                value: this.getRuleTypeDisplay(rule.type),
                                inline: true
                            },
                            {
                                name: 'Violation',
                                value: violation.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                                inline: true
                            },
                            {
                                name: 'Action Taken',
                                value: this.getActionDisplay(rule.action),
                                inline: true
                            },
                            {
                                name: 'Message Content',
                                value: message.content.length > 1000 ? 
                                    message.content.substring(0, 1000) + '...' : 
                                    message.content || '*No text content*',
                                inline: false
                            }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Message ID: ${message.id} • User ID: ${message.author.id}`
                        }
                    };
                    
                    // Add attachment info if any
                    if (message.attachments.size > 0) {
                        const attachmentInfo = Array.from(message.attachments.values())
                            .map(att => `${att.name} (${this.formatFileSize(att.size)})`)
                            .join('\n');
                        
                        logEmbed.fields.push({
                            name: 'Attachments',
                            value: attachmentInfo,
                            inline: false
                        });
                    }
                    
                    // Add specific violation details
                    if (violation.domain) {
                        logEmbed.fields.push({
                            name: 'Blocked Domain',
                            value: violation.domain,
                            inline: true
                        });
                    }
                    
                    if (violation.blockedText) {
                        logEmbed.fields.push({
                            name: 'Blocked Text',
                            value: `"${violation.blockedText}"`,
                            inline: true
                        });
                    }
                    
                    if (violation.requiredText) {
                        logEmbed.fields.push({
                            name: 'Missing Required Text',
                            value: `"${violation.requiredText}"`,
                            inline: true
                        });
                    }
                    
                    await logChannel.send({ embeds: [logEmbed] });
                }
            }
            
            console.log(`Rule violation in ${message.guild.name}#${message.channel.name} by ${message.author.tag}: ${violation.type}`);
            
        } catch (error) {
            console.error('Error handling rule violation:', error);
        }
    }

    getRuleTypeDisplay(type) {
        const displayMap = {
            'must_contain_audio': 'Must Contain Audio',
            'must_contain_image': 'Must Contain Image',
            'must_contain_video': 'Must Contain Video',
            'must_contain_file': 'Must Contain File',
            'blocked_domains': 'Blocked Domains',
            'required_text': 'Required Text',
            'blocked_text': 'Blocked Text',
            'min_length': 'Minimum Length',
            'max_length': 'Maximum Length'
        };
        return displayMap[type] || type;
    }

    getActionDisplay(action) {
        const displayMap = {
            'delete': 'Delete Message',
            'dm': 'Send DM',
            'delete_and_dm': 'Delete Message & Send DM'
        };
        return displayMap[action] || action;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getFrontendComponent() {
        return {
            id: 'channel-rules-plugin',
            name: 'Channel Rules',
            description: 'Set up automated rules for channels',
            icon: '⚖️',
            html: `
                <div class="plugin-container">
                    <div class="plugin-header">
                        <h3><span class="plugin-icon">⚖️</span> Channel Rules</h3>
                        <p>Set up automated rules for channels with custom conditions and actions</p>
                    </div>
                    
                    <form id="channelRulesForm">
                        <div class="form-group">
                            <label for="rulesServerSelect">Server</label>
                            <select id="rulesServerSelect" required>
                                <option value="">Select a server...</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="rulesChannelSelect">Channel</label>
                            <select id="rulesChannelSelect" required disabled>
                                <option value="">Select a channel...</option>
                            </select>
                        </div>
                        
                        <div id="channelRulesSettings" style="display: none;">
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="rulesEnabled" style="margin-right: 8px;">
                                    Enable Rules for This Channel
                                </label>
                            </div>
                            
                            <div class="form-group">
                                <label for="rulesLogChannelSelect">Log Channel (Optional)</label>
                                <select id="rulesLogChannelSelect">
                                    <option value="">Select a channel for violation logs...</option>
                                </select>
                                <small style="opacity: 0.7; display: block; margin-top: 4px;">
                                    Choose where rule violation logs will be sent
                                </small>
                            </div>
                            
                            <div class="form-group">
                                <label>Channel Rules</label>
                                <div id="rulesList" style="min-height: 100px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                                    <div id="noRulesMessage" style="opacity: 0.6; text-align: center; padding: 20px;">
                                        No rules configured for this channel
                                    </div>
                                </div>
                                
                                <button type="button" id="addRuleBtn" class="glass-btn" style="width: 100%;">
                                    + Add New Rule
                                </button>
                            </div>
                            
                            <div class="form-group">
                                <button type="button" id="saveChannelRules" class="btn-primary">
                                    <span class="btn-text">Save Rules</span>
                                    <span class="btn-loader" style="display: none;">Saving...</span>
                                </button>
                                
                                <button type="button" id="deleteChannelRules" class="glass-btn" style="margin-left: 10px;">
                                    Delete All Rules
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                <!-- Rule Creation Modal -->
                <div id="ruleModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center;">
                    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 15px; padding: 2rem; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.2);">
                        <h3 style="margin-bottom: 1rem; color: white;">Create New Rule</h3>
                        
                        <div class="form-group">
                            <label for="ruleType">Rule Type</label>
                            <select id="ruleType" class="form-control">
                                <option value="">Select rule type...</option>
                                <option value="must_contain_audio">Must Contain Audio File</option>
                                <option value="must_contain_image">Must Contain Image</option>
                                <option value="must_contain_video">Must Contain Video</option>
                                <option value="must_contain_file">Must Contain Any File</option>
                                <option value="blocked_domains">Block Specific Domains</option>
                                <option value="required_text">Require Specific Text</option>
                                <option value="blocked_text">Block Specific Text</option>
                                <option value="min_length">Minimum Message Length</option>
                                <option value="max_length">Maximum Message Length</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="ruleAction">Action When Rule is Violated</label>
                            <select id="ruleAction" class="form-control">
                                <option value="delete">Delete Message Only</option>
                                <option value="dm">Send DM to User Only</option>
                                <option value="delete_and_dm">Delete Message & Send DM</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="customMessage">Custom Message (Optional)</label>
                            <textarea id="customMessage" class="form-control" rows="3" placeholder="Custom message to send to user when rule is violated..."></textarea>
                        </div>
                        
                        <!-- Dynamic rule configuration areas -->
                        <div id="domainsConfig" style="display: none;" class="form-group">
                            <label>Blocked Domains</label>
                            <input type="text" id="domainInput" class="form-control" placeholder="Enter domain (e.g., youtube.com)" style="margin-bottom: 0.5rem;">
                            <button type="button" id="addDomainBtn" class="glass-btn">Add Domain</button>
                            <div id="domainsList" style="margin-top: 0.5rem;"></div>
                        </div>
                        
                        <div id="textsConfig" style="display: none;" class="form-group">
                            <label id="textsLabel">Text Phrases</label>
                            <input type="text" id="textInput" class="form-control" placeholder="Enter text phrase..." style="margin-bottom: 0.5rem;">
                            <button type="button" id="addTextBtn" class="glass-btn">Add Text</button>
                            <div id="textsList" style="margin-top: 0.5rem;"></div>
                        </div>
                        
                        <div id="lengthConfig" style="display: none;" class="form-group">
                            <label for="lengthValue" id="lengthLabel">Length</label>
                            <input type="number" id="lengthValue" class="form-control" min="1" max="2000" placeholder="Enter length...">
                        </div>
                        
                        <div style="display: flex; gap: 10px; margin-top: 1.5rem;">
                            <button type="button" id="saveRule" class="btn-primary">Save Rule</button>
                            <button type="button" id="cancelRule" class="glass-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            `,
            script: `
                console.log('Loading channel rules plugin...');
                
                // Wrap in IIFE to avoid variable conflicts
                (function() {
                    const rulesServerSelect = document.getElementById('rulesServerSelect');
                    const rulesChannelSelect = document.getElementById('rulesChannelSelect');
                    const rulesLogChannelSelect = document.getElementById('rulesLogChannelSelect');
                    const channelRulesSettings = document.getElementById('channelRulesSettings');
                    const rulesEnabled = document.getElementById('rulesEnabled');
                    const rulesList = document.getElementById('rulesList');
                    const noRulesMessage = document.getElementById('noRulesMessage');
                    const addRuleBtn = document.getElementById('addRuleBtn');
                    const saveChannelRules = document.getElementById('saveChannelRules');
                    const deleteChannelRules = document.getElementById('deleteChannelRules');
                    const btnText = saveChannelRules ? saveChannelRules.querySelector('.btn-text') : null;
                    const btnLoader = saveChannelRules ? saveChannelRules.querySelector('.btn-loader') : null;
                    
                    // Modal elements
                    const ruleModal = document.getElementById('ruleModal');
                    const ruleType = document.getElementById('ruleType');
                    const ruleAction = document.getElementById('ruleAction');
                    const customMessage = document.getElementById('customMessage');
                    const saveRule = document.getElementById('saveRule');
                    const cancelRule = document.getElementById('cancelRule');
                    
                    // Dynamic config elements
                    const domainsConfig = document.getElementById('domainsConfig');
                    const textsConfig = document.getElementById('textsConfig');
                    const lengthConfig = document.getElementById('lengthConfig');
                    const domainInput = document.getElementById('domainInput');
                    const addDomainBtn = document.getElementById('addDomainBtn');
                    const domainsList = document.getElementById('domainsList');
                    const textInput = document.getElementById('textInput');
                    const addTextBtn = document.getElementById('addTextBtn');
                    const textsList = document.getElementById('textsList');
                    const textsLabel = document.getElementById('textsLabel');
                    const lengthValue = document.getElementById('lengthValue');
                    const lengthLabel = document.getElementById('lengthLabel');
                    
                    let currentServerId = null;
                    let currentChannelId = null;
                    let currentRules = [];
                    let tempDomains = [];
                    let tempTexts = [];
                    let editingRuleIndex = -1;
                    
                    if (rulesServerSelect) {
                        loadRulesServers();
                        
                        rulesServerSelect.addEventListener('change', function() {
                            const serverId = this.value;
                            currentServerId = serverId;
                            if (serverId) {
                                loadRulesChannels(serverId);
                                if (rulesChannelSelect) rulesChannelSelect.disabled = false;
                            } else {
                                if (rulesChannelSelect) {
                                    rulesChannelSelect.disabled = true;
                                    rulesChannelSelect.innerHTML = '<option value="">Select a channel...</option>';
                                }
                                if (channelRulesSettings) channelRulesSettings.style.display = 'none';
                            }
                        });
                    }
                    
                    if (rulesChannelSelect) {
                        rulesChannelSelect.addEventListener('change', function() {
                            const channelId = this.value;
                            currentChannelId = channelId;
                            if (channelId && currentServerId) {
                                loadChannelRules(currentServerId, channelId);
                                loadRulesLogChannels(currentServerId);
                                if (channelRulesSettings) channelRulesSettings.style.display = 'block';
                            } else {
                                if (channelRulesSettings) channelRulesSettings.style.display = 'none';
                            }
                        });
                    }
                    
                    if (addRuleBtn) {
                        addRuleBtn.addEventListener('click', function() {
                            openRuleModal();
                        });
                    }
                    
                    if (saveChannelRules) {
                        saveChannelRules.addEventListener('click', saveRules);
                    }
                    
                    if (deleteChannelRules) {
                        deleteChannelRules.addEventListener('click', function() {
                            if (confirm('Are you sure you want to delete all rules for this channel?')) {
                                deleteAllRules();
                            }
                        });
                    }
                    
                    // Modal event listeners
                    if (ruleType) {
                        ruleType.addEventListener('change', function() {
                            updateRuleConfig(this.value);
                        });
                    }
                    
                    if (saveRule) {
                        saveRule.addEventListener('click', function() {
                            saveCurrentRule();
                        });
                    }
                    
                    if (cancelRule) {
                        cancelRule.addEventListener('click', function() {
                            closeRuleModal();
                        });
                    }
                    
                    if (addDomainBtn) {
                        addDomainBtn.addEventListener('click', addDomain);
                    }
                    
                    if (domainInput) {
                        domainInput.addEventListener('keypress', function(e) {
                            if (e.key === 'Enter') {
                                addDomain();
                            }
                        });
                    }
                    
                    if (addTextBtn) {
                        addTextBtn.addEventListener('click', addText);
                    }
                    
                    if (textInput) {
                        textInput.addEventListener('keypress', function(e) {
                            if (e.key === 'Enter') {
                                addText();
                            }
                        });
                    }
                    
                    // Close modal when clicking outside
                    if (ruleModal) {
                        ruleModal.addEventListener('click', function(e) {
                            if (e.target === ruleModal) {
                                closeRuleModal();
                            }
                        });
                    }
                    
                    async function loadRulesServers() {
                        try {
                            const response = await fetch('/api/servers');
                            const servers = await response.json();
                            
                            rulesServerSelect.innerHTML = '<option value="">Select a server...</option>';
                            servers.forEach(server => {
                                const option = document.createElement('option');
                                option.value = server.id;
                                option.textContent = server.name;
                                rulesServerSelect.appendChild(option);
                            });
                        } catch (error) {
                            console.error('Error loading servers:', error);
                            showNotification('Error loading servers', 'error');
                        }
                    }
                    
                    async function loadRulesChannels(serverId) {
                        try {
                            rulesChannelSelect.innerHTML = '<option value="">Loading...</option>';
                            const response = await fetch(\`/api/channels/\${serverId}\`);
                            const channels = await response.json();
                            
                            rulesChannelSelect.innerHTML = '<option value="">Select a channel...</option>';
                            channels.forEach(channel => {
                                const option = document.createElement('option');
                                option.value = channel.id;
                                option.textContent = \`# \${channel.name}\`;
                                rulesChannelSelect.appendChild(option);
                            });
                        } catch (error) {
                            console.error('Error loading channels:', error);
                            rulesChannelSelect.innerHTML = '<option value="">Error loading channels</option>';
                        }
                    }
                    
                    async function loadRulesLogChannels(serverId) {
                        try {
                            const response = await fetch(\`/api/channels/\${serverId}\`);
                            const channels = await response.json();
                            
                            rulesLogChannelSelect.innerHTML = '<option value="">Select a channel for violation logs...</option>';
                            channels.forEach(channel => {
                                const option = document.createElement('option');
                                option.value = channel.id;
                                option.textContent = \`# \${channel.name}\`;
                                rulesLogChannelSelect.appendChild(option);
                            });
                        } catch (error) {
                            console.error('Error loading log channels:', error);
                        }
                    }
                    
                    async function loadChannelRules(serverId, channelId) {
                        try {
                            const response = await fetch(\`/api/plugins/channelrules/rules/\${serverId}/\${channelId}\`);
                            const rules = await response.json();
                            
                            if (rulesEnabled) rulesEnabled.checked = rules.enabled || false;
                            if (rulesLogChannelSelect) rulesLogChannelSelect.value = rules.logChannelId || '';
                            
                            currentRules = rules.rules || [];
                            displayRules();
                        } catch (error) {
                            console.error('Error loading channel rules:', error);
                            showNotification('Error loading channel rules', 'error');
                        }
                    }
                    
                    function displayRules() {
                        if (!rulesList) return;
                        
                        if (currentRules.length === 0) {
                            rulesList.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">No rules configured for this channel</div>';
                            return;
                        }
                        
                        rulesList.innerHTML = '';
                        
                        currentRules.forEach((rule, index) => {
                            const ruleElement = document.createElement('div');
                            ruleElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.1); border-radius: 8px; border-left: 4px solid #7289da;';
                            
                            const ruleInfo = getRuleDisplayInfo(rule);
                            
                            ruleElement.innerHTML = \`
                                <div>
                                    <div style="font-weight: 600; margin-bottom: 4px;">\${ruleInfo.title}</div>
                                    <div style="font-size: 0.9rem; opacity: 0.8;">\${ruleInfo.description}</div>
                                    <div style="font-size: 0.8rem; opacity: 0.6; margin-top: 2px;">Action: \${getActionDisplay(rule.action)}</div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button type="button" onclick="window.editChannelRule(\${index})" class="glass-btn-small">Edit</button>
                                    <button type="button" onclick="window.removeChannelRule(\${index})" class="glass-btn-small">Remove</button>
                                </div>
                            \`;
                            rulesList.appendChild(ruleElement);
                        });
                    }
                    
                    function getRuleDisplayInfo(rule) {
                        const typeDisplays = {
                            'must_contain_audio': { title: 'Must Contain Audio', description: 'Messages must include audio files' },
                            'must_contain_image': { title: 'Must Contain Image', description: 'Messages must include image files' },
                            'must_contain_video': { title: 'Must Contain Video', description: 'Messages must include video files' },
                            'must_contain_file': { title: 'Must Contain File', description: 'Messages must include any file attachment' },
                            'blocked_domains': { title: 'Blocked Domains', description: \`Blocked: \${(rule.domains || []).join(', ')}\` },
                            'required_text': { title: 'Required Text', description: \`Must contain: \${(rule.texts || []).join(', ')}\` },
                            'blocked_text': { title: 'Blocked Text', description: \`Cannot contain: \${(rule.texts || []).join(', ')}\` },
                            'min_length': { title: 'Minimum Length', description: \`Messages must be at least \${rule.length || 0} characters\` },
                            'max_length': { title: 'Maximum Length', description: \`Messages must be no more than \${rule.length || 2000} characters\` }
                        };
                        
                        return typeDisplays[rule.type] || { title: rule.type, description: 'Custom rule' };
                    }
                    
                    function getActionDisplay(action) {
                        const displayMap = {
                            'delete': 'Delete Message',
                            'dm': 'Send DM',
                            'delete_and_dm': 'Delete & DM'
                        };
                        return displayMap[action] || action;
                    }
                    
                    window.editChannelRule = function(index) {
                        editingRuleIndex = index;
                        const rule = currentRules[index];
                        
                        if (ruleType) ruleType.value = rule.type;
                        if (ruleAction) ruleAction.value = rule.action;
                        if (customMessage) customMessage.value = rule.customMessage || '';
                        
                        updateRuleConfig(rule.type);
                        
                        // Populate specific rule data
                        if (rule.type === 'blocked_domains' && rule.domains) {
                            tempDomains = [...rule.domains];
                            displayDomains();
                        }
                        
                        if ((rule.type === 'required_text' || rule.type === 'blocked_text') && rule.texts) {
                            tempTexts = [...rule.texts];
                            displayTexts();
                        }
                        
                        if ((rule.type === 'min_length' || rule.type === 'max_length') && lengthValue) {
                            lengthValue.value = rule.length || '';
                        }
                        
                        openRuleModal();
                    };
                    
                    window.removeChannelRule = function(index) {
                        if (confirm('Are you sure you want to remove this rule?')) {
                            currentRules.splice(index, 1);
                            displayRules();
                        }
                    };
                    
                    function openRuleModal() {
                        if (ruleModal) {
                            ruleModal.style.display = 'flex';
                            
                            if (editingRuleIndex === -1) {
                                // Reset form for new rule
                                if (ruleType) ruleType.value = '';
                                if (ruleAction) ruleAction.value = 'delete_and_dm';
                                if (customMessage) customMessage.value = '';
                                tempDomains = [];
                                tempTexts = [];
                                updateRuleConfig('');
                            }
                        }
                    }
                    
                    function closeRuleModal() {
                        if (ruleModal) {
                            ruleModal.style.display = 'none';
                            editingRuleIndex = -1;
                        }
                    }
                    
                    function updateRuleConfig(type) {
                        // Hide all config sections
                        if (domainsConfig) domainsConfig.style.display = 'none';
                        if (textsConfig) textsConfig.style.display = 'none';
                        if (lengthConfig) lengthConfig.style.display = 'none';
                        
                        // Show relevant config section
                        switch (type) {
                            case 'blocked_domains':
                                if (domainsConfig) domainsConfig.style.display = 'block';
                                displayDomains();
                                break;
                            case 'required_text':
                                if (textsConfig) {
                                    textsConfig.style.display = 'block';
                                    if (textsLabel) textsLabel.textContent = 'Required Text Phrases';
                                }
                                displayTexts();
                                break;
                            case 'blocked_text':
                                if (textsConfig) {
                                    textsConfig.style.display = 'block';
                                    if (textsLabel) textsLabel.textContent = 'Blocked Text Phrases';
                                }
                                displayTexts();
                                break;
                            case 'min_length':
                                if (lengthConfig) {
                                    lengthConfig.style.display = 'block';
                                    if (lengthLabel) lengthLabel.textContent = 'Minimum Length (characters)';
                                }
                                break;
                            case 'max_length':
                                if (lengthConfig) {
                                    lengthConfig.style.display = 'block';
                                    if (lengthLabel) lengthLabel.textContent = 'Maximum Length (characters)';
                                }
                                break;
                        }
                    }
                    
                    function addDomain() {
                        const domain = domainInput ? domainInput.value.trim() : '';
                        if (domain && !tempDomains.includes(domain)) {
                            tempDomains.push(domain);
                            if (domainInput) domainInput.value = '';
                            displayDomains();
                        }
                    }
                    
                    function displayDomains() {
                        if (!domainsList) return;
                        domainsList.innerHTML = '';
                        tempDomains.forEach((domain, index) => {
                            const domainElement = document.createElement('div');
                            domainElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 4px;';
                            domainElement.innerHTML = \`
                                <span>\${domain}</span>
                                <button type="button" onclick="window.removeTempDomain(\${index})" class="glass-btn-small">Remove</button>
                            \`;
                            domainsList.appendChild(domainElement);
                        });
                    }
                    
                    function addText() {
                        const text = textInput ? textInput.value.trim() : '';
                        if (text && !tempTexts.includes(text)) {
                            tempTexts.push(text);
                            if (textInput) textInput.value = '';
                            displayTexts();
                        }
                    }
                    
                    function displayTexts() {
                        if (!textsList) return;
                        textsList.innerHTML = '';
                        tempTexts.forEach((text, index) => {
                            const textElement = document.createElement('div');
                            textElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 4px; background: rgba(255,255,255,0.1); border-radius: 4px;';
                            textElement.innerHTML = \`
                                <span>\${text}</span>
                                <button type="button" onclick="window.removeTempText(\${index})" class="glass-btn-small">Remove</button>
                            \`;
                            textsList.appendChild(textElement);
                        });
                    }
                    
                    window.removeTempDomain = function(index) {
                        tempDomains.splice(index, 1);
                        displayDomains();
                    };
                    
                    window.removeTempText = function(index) {
                        tempTexts.splice(index, 1);
                        displayTexts();
                    };
                    
                    function saveCurrentRule() {
                        const type = ruleType ? ruleType.value : '';
                        const action = ruleAction ? ruleAction.value : 'delete_and_dm';
                        const message = customMessage ? customMessage.value.trim() : '';
                        
                        if (!type) {
                            showNotification('Please select a rule type', 'error');
                            return;
                        }
                        
                        const rule = {
                            type: type,
                            action: action,
                            customMessage: message || null
                        };
                        
                        // Add type-specific data
                        switch (type) {
                            case 'blocked_domains':
                                if (tempDomains.length === 0) {
                                    showNotification('Please add at least one domain', 'error');
                                    return;
                                }
                                rule.domains = [...tempDomains];
                                break;
                            case 'required_text':
                            case 'blocked_text':
                                if (tempTexts.length === 0) {
                                    showNotification('Please add at least one text phrase', 'error');
                                    return;
                                }
                                rule.texts = [...tempTexts];
                                break;
                            case 'min_length':
                            case 'max_length':
                                const length = lengthValue ? parseInt(lengthValue.value) : 0;
                                if (!length || length < 1) {
                                    showNotification('Please enter a valid length', 'error');
                                    return;
                                }
                                rule.length = length;
                                break;
                        }
                        
                        if (editingRuleIndex >= 0) {
                            currentRules[editingRuleIndex] = rule;
                        } else {
                            currentRules.push(rule);
                        }
                        
                        displayRules();
                        closeRuleModal();
                        showNotification('Rule saved successfully', 'success');
                    }
                    
                    async function saveRules() {
                        if (!currentServerId || !currentChannelId) {
                            showNotification('Please select a server and channel', 'error');
                            return;
                        }
                        
                        try {
                            if (btnText) btnText.style.display = 'none';
                            if (btnLoader) btnLoader.style.display = 'inline';
                            if (saveChannelRules) saveChannelRules.disabled = true;
                            
                            const settings = {
                                enabled: rulesEnabled ? rulesEnabled.checked : false,
                                rules: currentRules,
                                logChannelId: rulesLogChannelSelect ? rulesLogChannelSelect.value || null : null
                            };
                            
                            const response = await fetch(\`/api/plugins/channelrules/rules/\${currentServerId}/\${currentChannelId}\`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(settings)
                            });
                            
                            const result = await response.json();
                            
                            if (response.ok) {
                                showNotification('Channel rules saved successfully!', 'success');
                            } else {
                                throw new Error(result.error || 'Failed to save rules');
                            }
                        } catch (error) {
                            console.error('Error saving rules:', error);
                            showNotification(error.message, 'error');
                        } finally {
                            if (btnText) btnText.style.display = 'inline';
                            if (btnLoader) btnLoader.style.display = 'none';
                            if (saveChannelRules) saveChannelRules.disabled = false;
                        }
                    }
                    
                    async function deleteAllRules() {
                        if (!currentServerId || !currentChannelId) {
                            showNotification('Please select a server and channel', 'error');
                            return;
                        }
                        
                        try {
                            const response = await fetch(\`/api/plugins/channelrules/rules/\${currentServerId}/\${currentChannelId}\`, {
                                method: 'DELETE'
                            });
                            
                            const result = await response.json();
                            
                            if (response.ok) {
                                currentRules = [];
                                if (rulesEnabled) rulesEnabled.checked = false;
                                if (rulesLogChannelSelect) rulesLogChannelSelect.value = '';
                                displayRules();
                                showNotification('All rules deleted successfully!', 'success');
                            } else {
                                throw new Error(result.error || 'Failed to delete rules');
                            }
                        } catch (error) {
                            console.error('Error deleting rules:', error);
                            showNotification(error.message, 'error');
                        }
                    }
                })();
            `
        };
    }
}

module.exports = ChannelRulesPlugin;
                