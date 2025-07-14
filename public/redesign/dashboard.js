// Global variables
let currentUser = null;
let pluginComponents = [];
let currentServer = null;
let servers = [];

// Utility Functions
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

function switchToPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const activeLink = document.querySelector(`[data-page="${pageId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    // Update dashboard stats if on overview page
    if (pageId === 'overview') {
        updateDashboardStats();
    }
    
    console.log(`🔄 Switched to page: ${pageId}`);
}

// Load user information
async function loadUser() {
    try {
        const response = await fetch('/api/user');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        currentUser = await response.json();
        
        const username = document.getElementById('username');
        const userAvatar = document.getElementById('userAvatar');
        
        if (username) username.textContent = currentUser.username;
        
        if (userAvatar) {
            if (currentUser.avatar) {
                userAvatar.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png" alt="Avatar">`;
            } else {
                userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
            }
        }
        
        console.log('✅ User loaded:', currentUser.username);
    } catch (error) {
        console.error('Error loading user:', error);
        window.location.href = '/login.html';
    }
}

// Load servers for stats
async function loadServers() {
    try {
        const response = await fetch('/api/servers');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        servers = await response.json();
        console.log('✅ Servers loaded:', servers.length);
        return servers;
    } catch (error) {
        console.error('Error loading servers:', error);
        return [];
    }
}

// Update dashboard statistics
async function updateDashboardStats() {
    try {
        const servers = await loadServers();
        
        // Update stat cards
        const totalServersEl = document.getElementById('totalServers');
        const totalUsersEl = document.getElementById('totalUsers');
        const activePluginsEl = document.getElementById('activePlugins');
        const todayMessagesEl = document.getElementById('todayMessages');
        
        if (totalServersEl) {
            totalServersEl.textContent = servers.length.toLocaleString();
        }
        
        // Calculate total users across all servers
        const totalUsers = servers.reduce((sum, server) => sum + (server.memberCount || 0), 0);
        if (totalUsersEl) {
            totalUsersEl.textContent = totalUsers.toLocaleString();
        }
        
        // Count active plugins
        const activePluginCount = pluginComponents.filter(plugin => plugin.enabled !== false).length;
        if (activePluginsEl) {
            activePluginsEl.textContent = activePluginCount.toString();
        }
        
        // Mock data for today's messages (you can replace this with actual API call)
        if (todayMessagesEl) {
            todayMessagesEl.textContent = Math.floor(Math.random() * 1000 + 500).toLocaleString();
        }
        
        // Update servers list in the teams table
        updateServersTable(servers);
        
        console.log('✅ Dashboard stats updated');
    } catch (error) {
        console.error('Error updating dashboard stats:', error);
    }
}

// Update servers table
function updateServersTable(servers) {
    const serversListEl = document.getElementById('servers-list');
    if (!serversListEl || !servers.length) return;
    
    serversListEl.innerHTML = '';
    
    servers.slice(0, 5).forEach(server => { // Show only first 5 servers
        const serverRow = document.createElement('div');
        serverRow.className = 'table-row';
        
        serverRow.innerHTML = `
            <div class="col">
                <div class="team-info">
                    <div class="team-avatar">${server.icon ? `<img src="https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png" alt="">` : '🎮'}</div>
                    <div class="team-details">
                        <div class="team-name">${server.name}</div>
                        <div class="team-desc">${server.memberCount || 0} members</div>
                    </div>
                </div>
            </div>
            <div class="col">
                <span class="status-badge active">⭐⭐⭐⭐⭐</span>
            </div>
            <div class="col">Recently Active</div>
            <div class="col">
                <div class="member-avatars">
                    <div class="member-avatar">👤</div>
                    <div class="member-avatar">👤</div>
                </div>
            </div>
        `;
        
        serversListEl.appendChild(serverRow);
    });
}

// Load plugins dynamically
async function loadPlugins() {
    try {
        console.log('🔄 Loading plugins dynamically...');
        
        const response = await fetch('/api/plugins/components');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        pluginComponents = await response.json();
        console.log('📦 Loaded plugin components:', pluginComponents);
        
        // Load each plugin HTML
        pluginComponents.forEach(plugin => {
            loadPluginHTML(plugin);
        });
        
        // Generate navigation dynamically
        generateNavigation(pluginComponents);
        
        // Generate feature cards
        generateFeatureCards(pluginComponents);
        
        // Execute plugin scripts
        setTimeout(() => {
            pluginComponents.forEach(plugin => {
                executePluginScript(plugin);
            });
        }, 100);
        
        console.log('🎉 All plugins loaded successfully!');
    } catch (error) {
        console.error('Error loading plugins:', error);
        showNotification('Error loading plugins', 'error');
    }
}

// Load individual plugin HTML
function loadPluginHTML(plugin) {
    const containerId = plugin.containerId;
    if (!containerId) {
        console.warn(`⚠ Plugin ${plugin.name} has no containerId defined`);
        return;
    }
    
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = plugin.html;
        console.log(`✓ Loaded HTML for plugin: ${plugin.name} into ${containerId}`);
    } else {
        console.warn(`⚠ Container '${containerId}' not found for plugin: ${plugin.name}`);
    }
}

// Execute plugin script
function executePluginScript(plugin) {
    if (plugin.script) {
        try {
            eval(plugin.script);
            console.log(`✓ Executed script for plugin: ${plugin.name}`);
        } catch (error) {
            console.error(`✗ Error executing script for plugin ${plugin.name}:`, error);
        }
    }
}

// Generate navigation dynamically
function generateNavigation(plugins) {
    const navContainer = document.querySelector('.nav-menu');
    if (!navContainer) {
        console.warn('⚠ Navigation container not found');
        return;
    }
    
    // Keep the overview link, clear plugin links
    const existingItems = navContainer.querySelectorAll('li');
    const overviewItem = existingItems[0]; // First item should be overview
    
    // Remove all existing plugin items
    existingItems.forEach((item, index) => {
        if (index > 0) item.remove();
    });
    
    // Add plugin navigation links
    plugins.forEach(plugin => {
        const li = document.createElement('li');
        li.innerHTML = `
            <a class="nav-link" data-page="${plugin.id}">
                <span class="nav-icon">${plugin.icon || '🔌'}</span>
                <span class="nav-text">${plugin.name}</span>
            </a>
        `;
        navContainer.appendChild(li);
    });
    
    console.log(`✓ Generated navigation for ${plugins.length} plugins`);
}

// Generate feature cards for overview page
function generateFeatureCards(plugins) {
    const featureGrid = document.getElementById('feature-grid');
    if (!featureGrid) {
        console.warn('⚠ Feature grid not found');
        return;
    }
    
    featureGrid.innerHTML = '';
    
    plugins.forEach(plugin => {
        const card = document.createElement('div');
        card.className = 'feature-card';
        card.setAttribute('data-page', plugin.id);
        
        card.innerHTML = `
            <span class="feature-icon">${plugin.icon || '🔌'}</span>
            <div class="feature-name">${plugin.name}</div>
            <div class="feature-description">${plugin.description || 'No description available'}</div>
        `;
        
        featureGrid.appendChild(card);
    });
    
    console.log(`✓ Generated ${plugins.length} feature cards`);
}

// Setup navigation and event handlers
function setupNavigation() {
    document.addEventListener('click', function(e) {
        // Handle navigation links
        const navLink = e.target.closest('.nav-link');
        if (navLink) {
            e.preventDefault();
            const page = navLink.getAttribute('data-page');
            switchToPage(page);
            
            // Close mobile sidebar
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('mobile-open');
            return;
        }
        
        // Handle feature cards
        const featureCard = e.target.closest('.feature-card');
        if (featureCard) {
            const page = featureCard.getAttribute('data-page');
            switchToPage(page);
            return;
        }
        
        // Handle mobile menu button
        const mobileMenuBtn = e.target.closest('.mobile-menu-btn');
        if (mobileMenuBtn) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('mobile-open');
            return;
        }
        
        // Close mobile sidebar when clicking outside
        const sidebar = document.getElementById('sidebar');
        const mobileMenuBtnElem = document.querySelector('.mobile-menu-btn');
        if (sidebar && !sidebar.contains(e.target) && mobileMenuBtnElem && !mobileMenuBtnElem.contains(e.target)) {
            sidebar.classList.remove('mobile-open');
        }
    });
    
    // Handle search functionality
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase();
            // Implement search functionality here
            console.log('Search query:', query);
        });
    }
}

// Setup activity chart (mock implementation)
function setupActivityChart() {
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = 400;
    canvas.height = 200;
    
    // Draw a simple mock chart
    ctx.fillStyle = '#374151';
    ctx.fillText('Activity Chart (Integration Required)', 100, 100);
    
    console.log('📊 Activity chart placeholder created');
}

// Initialize dashboard
async function initializeDashboard() {
    console.log('🚀 Dashboard initializing...');
    
    try {
        // Setup navigation first
        setupNavigation();
        
        // Load user data
        await loadUser();
        
        // Load plugins
        await loadPlugins();
        
        // Load servers and update stats
        await updateDashboardStats();
        
        // Setup charts
        setupActivityChart();
        
        // Set initial page
        switchToPage('overview');
        
        console.log('✅ Dashboard initialization complete');
    } catch (error) {
        console.error('❌ Dashboard initialization failed:', error);
        showNotification('Failed to initialize dashboard', 'error');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDashboard);

// Export functions for plugin use
window.dashboardAPI = {
    showNotification,
    switchToPage,
    currentUser: () => currentUser,
    servers: () => servers
};