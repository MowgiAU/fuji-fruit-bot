// Define global variables and functions first
let currentUser = null;
let pluginComponents = [];

// Global utility functions
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// NEW: Global reusable function to add search functionality to a dropdown
window.setupChannelSearch = function(searchInputId, selectId) {
    const searchInput = document.getElementById(searchInputId);
    const channelSelect = document.getElementById(selectId);

    if (!searchInput || !channelSelect) return;

    // Store the original full list of options on the select element itself
    // This is safer than a global variable and gets set when channels are first loaded.
    if (!channelSelect.originalOptions) {
        channelSelect.originalOptions = Array.from(channelSelect.options);
    }

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const selectedValue = channelSelect.value; // Preserve selection

        // Use the stored original list for filtering
        const originalOptions = channelSelect.originalOptions || [];
        
        // Clear current options
        channelSelect.innerHTML = '';

        // Filter and add matching options back
        originalOptions.forEach(option => {
            // Always include the placeholder/default option (which usually has no value)
            if (option.value === "" || option.text.toLowerCase().includes(searchTerm)) {
                channelSelect.add(option.cloneNode(true));
            }
        });

        // Restore the previously selected value, if it still exists in the list
        channelSelect.value = selectedValue;
    });
};

function switchToPage(pageId) {
    console.log('Switching to page:', pageId);
    
    // Hide all pages
    const pages = document.querySelectorAll('.plugin-page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const targetPage = document.getElementById(pageId + '-page');
    if (targetPage) {
        targetPage.classList.add('active');
    } else {
        console.error('Page not found:', pageId + '-page');
    }
    
    // Update navigation active state
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const linkPage = link.getAttribute('data-page');
        if (linkPage === pageId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Make functions globally available
window.switchToPage = switchToPage;
window.showNotification = showNotification;

// Initialize the application
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
                userAvatar.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png" width="40" height="40" style="border-radius: 50%;">`;
            } else {
                userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
            }
        }
    } catch (error) {
        console.error('Error loading user:', error);
        window.location.href = '/login.html';
    }
}

// Completely dynamic plugin loading - NO hardcoding!
async function loadPlugins() {
    try {
        console.log('🔄 Loading plugins dynamically...');
        
        // Fetch plugin components from the backend
        const response = await fetch('/api/plugins/components');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        pluginComponents = await response.json();
        console.log('📦 Loaded plugin components:', pluginComponents);
        
        // Load each plugin using ITS OWN defined targets
        pluginComponents.forEach(plugin => {
            loadPluginHTML(plugin);
        });
        
        // Generate navigation dynamically from plugins
        generateNavigation(pluginComponents);
        
        // Generate overview page dynamically from plugins
        generateOverviewPage(pluginComponents);
        
        // Execute plugin scripts after DOM is ready
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

// Load individual plugin HTML into its defined container
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

// Execute individual plugin script
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

// Generate navigation links dynamically from plugins
function generateNavigation(plugins) {
    const navContainer = document.querySelector('.nav-links');
    if (!navContainer) {
        console.warn('⚠ Navigation container not found');
        return;
    }
    
    // Keep the overview link, clear the rest
    const existingOverview = navContainer.querySelector('[data-page="overview"]');
    navContainer.innerHTML = '';
    
    // Re-add overview link first
    if (existingOverview) {
        navContainer.appendChild(existingOverview);
    }
    
    // Add plugin navigation links
    plugins.forEach(plugin => {
        if (!plugin.pageId) {
            console.warn(`⚠ Plugin ${plugin.name} has no pageId defined`);
            return;
        }
        
        const navLink = document.createElement('a');
        navLink.href = '#';
        navLink.className = 'nav-link';
        navLink.setAttribute('data-page', plugin.pageId);
        navLink.innerHTML = `
            <span class="nav-icon">${plugin.navIcon || plugin.icon || '🔌'}</span>
            ${plugin.name}
        `;
        navContainer.appendChild(navLink);
    });
    
    console.log(`✓ Generated navigation for ${plugins.length} plugins`);
}

// Generate overview page feature cards dynamically from plugins
function generateOverviewPage(plugins) {
    const featureGrid = document.getElementById('feature-grid');
    if (!featureGrid) {
        console.warn('⚠ Feature grid not found');
        return;
    }
    
    // Clear existing content
    featureGrid.innerHTML = '';
    
    // Create feature cards for each plugin
    plugins.forEach(plugin => {
        if (!plugin.pageId) {
            console.warn(`⚠ Plugin ${plugin.name} has no pageId defined for feature card`);
            return;
        }
        
        const card = document.createElement('div');
        card.className = 'feature-card';
        card.setAttribute('data-page', plugin.pageId);
        card.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">${plugin.icon || '🔌'}</div>
            <h4>${plugin.name}</h4>
            <p style="opacity: 0.7; font-size: 0.9rem;">${plugin.description || 'No description available'}</p>
        `;
        featureGrid.appendChild(card);
    });
    
    console.log(`✓ Generated ${plugins.length} feature cards for overview page`);
}

function setupNavigation() {
    document.addEventListener('click', function(e) {
        const navLink = e.target.closest('.nav-link');
        if (navLink) {
            e.preventDefault();
            const page = navLink.getAttribute('data-page');
            switchToPage(page);
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('mobile-open');
            return;
        }
        
        const featureCard = e.target.closest('.feature-card');
        if (featureCard) {
            const page = featureCard.getAttribute('data-page');
            switchToPage(page);
            return;
        }
        
        const mobileMenuBtn = e.target.closest('#mobileMenuBtn');
        if (mobileMenuBtn) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('mobile-open');
            return;
        }
        
        const sidebar = document.getElementById('sidebar');
        const mobileMenuBtnElem = document.getElementById('mobileMenuBtn');
        if (sidebar && !sidebar.contains(e.target) && mobileMenuBtnElem && !mobileMenuBtnElem.contains(e.target)) {
            sidebar.classList.remove('mobile-open');
        }
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Dashboard initializing...');
    setupNavigation();
    await loadUser();
    await loadPlugins(); // Completely dynamic - NO plugin hardcoding!
    
    // Set the initial page
    switchToPage('overview');
    console.log('✅ Dashboard initialization complete');
});