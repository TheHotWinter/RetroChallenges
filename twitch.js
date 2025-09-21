/**
 * Twitch Integration Module
 * Handles Twitch IRC connection, chat parsing, and BizHawk command bridge
 */

const { ipcRenderer } = require('electron');

class TwitchIntegration {
    constructor() {
        this.isConnected = false;
        this.channel = null;
        this.socket = null;
        this.commandQueue = [];
        this.recentChannels = this.loadRecentChannels();
        this.eventHandlers = {
            onMessage: null,
            onBits: null,
            onSubscription: null,
            onFollow: null,
            onRaid: null
        };
    }

    /**
     * Load recent channels from localStorage
     */
    loadRecentChannels() {
        try {
            const stored = localStorage.getItem('twitch_recent_channels');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading recent channels:', error);
            return [];
        }
    }

    /**
     * Save recent channels to localStorage
     */
    saveRecentChannels() {
        try {
            localStorage.setItem('twitch_recent_channels', JSON.stringify(this.recentChannels));
        } catch (error) {
            console.error('Error saving recent channels:', error);
        }
    }

    /**
     * Add channel to recent channels
     * @param {string} channelName - Channel name to add
     */
    addToRecentChannels(channelName) {
        // Remove if already exists
        this.recentChannels = this.recentChannels.filter(ch => ch !== channelName);
        // Add to beginning
        this.recentChannels.unshift(channelName);
        // Keep only last 5
        this.recentChannels = this.recentChannels.slice(0, 5);
        // Save
        this.saveRecentChannels();
        // Update UI
        this.updateRecentChannelsUI();
    }

    /**
     * Update recent channels UI
     */
    updateRecentChannelsUI() {
        const recentSection = document.getElementById('recent-channels-section');
        const recentContainer = document.getElementById('recent-channels');
        
        if (this.recentChannels.length > 0) {
            recentSection.classList.remove('hidden');
            recentContainer.innerHTML = '';
            
            this.recentChannels.forEach(channel => {
                const channelButton = document.createElement('button');
                channelButton.className = 'w-full px-3 py-2 text-sm text-gray-300 bg-slate-700 rounded-md hover:bg-slate-600 hover:text-white text-left';
                channelButton.innerHTML = `<i data-feather="hash" class="h-3 w-3 mr-2 inline"></i>${channel}`;
                channelButton.addEventListener('click', () => {
                    document.getElementById('twitch-channel-input').value = channel;
                    this.connect(channel);
                });
                recentContainer.appendChild(channelButton);
            });
            
            feather.replace();
        } else {
            recentSection.classList.add('hidden');
        }
    }

    /**
     * Update UI based on connection status
     */
    updateUI() {
        const connectBtn = document.getElementById('connect-twitch');
        const disconnectBtn = document.getElementById('disconnect-twitch');
        const channelInput = document.getElementById('twitch-channel-input');
        
        if (this.isConnected) {
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            channelInput.disabled = true;
        } else {
            connectBtn.classList.remove('hidden');
            disconnectBtn.classList.add('hidden');
            channelInput.disabled = false;
        }
    }

    /**
     * Connect to Twitch IRC
     * @param {string} channelName - Channel name without #
     */
    async connect(channelName) {
        try {
            this.channel = channelName.toLowerCase();
            
            // Update UI status
            this.updateConnectionStatus('Connecting...', 'yellow');
            
            // Send connection request to main process
            const result = await ipcRenderer.invoke('twitch-connect', this.channel);
            
            if (result.success) {
                this.isConnected = true;
                this.updateConnectionStatus('Connected', 'green');
                this.updateChannelDisplay(this.channel);
                this.addToRecentChannels(this.channel);
                this.updateUI();
                this.logEvent(`Connected to #${this.channel}`, 'success');
                return true;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Twitch connection failed:', error);
            this.updateConnectionStatus('Failed', 'red');
            this.logEvent(`Connection failed: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Disconnect from Twitch IRC
     */
    async disconnect() {
        try {
            if (this.isConnected) {
                await ipcRenderer.invoke('twitch-disconnect');
                this.isConnected = false;
                this.updateConnectionStatus('Disconnected', 'red');
                this.updateChannelDisplay('Not set');
                this.updateUI();
                this.logEvent('Disconnected from Twitch', 'info');
            }
        } catch (error) {
            console.error('Twitch disconnect failed:', error);
        }
    }

    /**
     * Send command to BizHawk via Lua bridge
     * @param {string} command - Command to send
     * @param {object} params - Command parameters
     */
    async sendBizHawkCommand(command, params = {}) {
        try {
            const result = await ipcRenderer.invoke('bizhawk-command', {
                command,
                params,
                timestamp: new Date().toISOString()
            });

            if (result.success) {
                this.logEvent(`Command sent: ${command}`, 'success');
                return true;
            } else {
                this.logEvent(`Command failed: ${command} - ${result.error}`, 'error');
                return false;
            }
        } catch (error) {
            console.error('BizHawk command failed:', error);
            this.logEvent(`Command error: ${command} - ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Parse chat message for commands
     * @param {object} message - Chat message object
     */
    parseChatMessage(message) {
        console.log('Received Twitch message:', message);
        const { username, content, tags } = message;
        
        // Add message to chat feed
        this.addChatMessage(username, content, tags);
        
        // Parse for commands
        if (content.startsWith('!')) {
            this.parseCommand(username, content, tags);
        }
        
        // Parse for bits
        if (tags && tags.bits) {
            this.handleBits(username, parseInt(tags.bits), content);
        }
        
        // Parse for subscriptions
        if (tags && tags.subscriber === '1') {
            this.handleSubscription(username, content);
        }
    }

    /**
     * Parse command from chat message
     * @param {string} username - Username who sent command
     * @param {string} content - Command content
     * @param {object} tags - Message tags
     */
    parseCommand(username, content, tags) {
        const command = content.toLowerCase().trim();
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        this.logEvent(`Command from ${username}: ${command}`, 'info');

        switch (cmd) {
            case '!pause':
                this.sendBizHawkCommand('pause');
                break;
                
            case '!resume':
                this.sendBizHawkCommand('resume');
                break;
                
            case '!speed':
                const speed = parseFloat(args[0]) || 1.0;
                this.sendBizHawkCommand('set_speed', { speed });
                break;
                
            case '!screenshot':
                this.sendBizHawkCommand('screenshot');
                break;
                
            case '!challenge':
                if (args[0] === 'start') {
                    this.sendBizHawkCommand('start_challenge');
                }
                break;
                
            default:
                this.logEvent(`Unknown command: ${cmd}`, 'warning');
        }
    }

    /**
     * Handle bits donation
     * @param {string} username - Username who donated
     * @param {number} bits - Amount of bits
     * @param {string} message - Donation message
     */
    handleBits(username, bits, message) {
        this.logEvent(`🎉 ${username} donated ${bits} bits!`, 'success');
        
        // Trigger special effects based on bits amount
        if (bits >= 100) {
            this.sendBizHawkCommand('speed_boost', { duration: 30, speed: 2.0 });
        } else if (bits >= 50) {
            this.sendBizHawkCommand('speed_boost', { duration: 15, speed: 1.5 });
        }
    }

    /**
     * Handle subscription
     * @param {string} username - Username who subscribed
     * @param {string} message - Subscription message
     */
    handleSubscription(username, message) {
        this.logEvent(`🎊 ${username} subscribed!`, 'success');
        this.sendBizHawkCommand('celebration_effect');
    }

    /**
     * Update connection status in UI
     * @param {string} status - Status text
     * @param {string} color - Status color (green/yellow/red)
     */
    updateConnectionStatus(status, color) {
        const statusElement = document.getElementById('twitch-status');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `px-2 py-1 text-xs font-medium rounded-full ${
                color === 'green' ? 'bg-green-100 text-green-800' :
                color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
            }`;
        }
    }

    /**
     * Update channel display in UI
     * @param {string} channel - Channel name
     */
    updateChannelDisplay(channel) {
        const channelElement = document.getElementById('twitch-channel');
        if (channelElement) {
            channelElement.textContent = channel;
        }
    }

    /**
     * Add message to chat feed
     * @param {string} username - Username
     * @param {string} content - Message content
     * @param {object} tags - Message tags
     */
    addChatMessage(username, content, tags) {
        console.log('Adding chat message:', { username, content, tags });
        const chatFeed = document.getElementById('chat-feed');
        if (!chatFeed) {
            console.error('Chat feed element not found!');
            return;
        }

        // Remove placeholder if it exists
        const placeholder = chatFeed.querySelector('.text-center');
        if (placeholder) {
            placeholder.remove();
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'flex items-start space-x-2 text-sm';
        
        // Username with color based on user type
        const usernameElement = document.createElement('span');
        usernameElement.className = 'font-medium text-blue-400';
        usernameElement.textContent = username;
        
        // Message content
        const contentElement = document.createElement('span');
        contentElement.className = 'text-gray-300';
        contentElement.textContent = content;
        
        messageElement.appendChild(usernameElement);
        messageElement.appendChild(contentElement);
        
        // Add badges if available
        if (tags && tags.badges && typeof tags.badges === 'string') {
            const badges = tags.badges.split(',');
            if (badges.includes('subscriber')) {
                usernameElement.className += ' text-purple-400';
            }
            if (badges.includes('moderator')) {
                usernameElement.className += ' text-green-400';
            }
        }
        
        chatFeed.appendChild(messageElement);
        
        // Auto-scroll to bottom
        chatFeed.scrollTop = chatFeed.scrollHeight;
        
        // Limit messages to prevent memory issues
        const messages = chatFeed.children;
        if (messages.length > 100) {
            messages[0].remove();
        }
    }

    /**
     * Log event to event log
     * @param {string} message - Event message
     * @param {string} type - Event type (success/error/info/warning)
     */
    logEvent(message, type = 'info') {
        const eventLog = document.getElementById('event-log');
        if (!eventLog) return;

        // Remove placeholder if it exists
        const placeholder = eventLog.querySelector('.text-center');
        if (placeholder) {
            placeholder.remove();
        }

        const eventElement = document.createElement('div');
        eventElement.className = 'flex items-center space-x-2 text-sm';
        
        // Timestamp
        const timestamp = new Date().toLocaleTimeString();
        const timestampElement = document.createElement('span');
        timestampElement.className = 'text-gray-500 text-xs';
        timestampElement.textContent = timestamp;
        
        // Event message with color
        const messageElement = document.createElement('span');
        messageElement.className = {
            'success': 'text-green-400',
            'error': 'text-red-400',
            'warning': 'text-yellow-400',
            'info': 'text-blue-400'
        }[type] || 'text-gray-300';
        messageElement.textContent = message;
        
        eventElement.appendChild(timestampElement);
        eventElement.appendChild(messageElement);
        
        eventLog.appendChild(eventElement);
        
        // Auto-scroll to bottom
        eventLog.scrollTop = eventLog.scrollHeight;
        
        // Limit events to prevent memory issues
        const events = eventLog.children;
        if (events.length > 50) {
            events[0].remove();
        }
    }
}

// Initialize Twitch integration when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.twitchIntegration = new TwitchIntegration();
    
    // Initialize UI
    window.twitchIntegration.updateRecentChannelsUI();
    window.twitchIntegration.updateUI();
    
    // Connect button handler
    document.getElementById('connect-twitch')?.addEventListener('click', async () => {
        const channelInput = document.getElementById('twitch-channel-input');
        const channel = channelInput.value.trim();
        
        if (!channel) {
            alert('Please enter a channel name');
            return;
        }
        
        await window.twitchIntegration.connect(channel);
    });
    
    
    // Disconnect button handler
    document.getElementById('disconnect-twitch')?.addEventListener('click', async () => {
        await window.twitchIntegration.disconnect();
    });
    
    // Listen for Twitch messages from main process
    ipcRenderer.on('twitch-message', (event, message) => {
        window.twitchIntegration.parseChatMessage(message);
    });
    
    // Listen for Twitch connection status
    ipcRenderer.on('twitch-status', (event, status) => {
        if (status === 'connected') {
            window.twitchIntegration.updateConnectionStatus('Connected', 'green');
            window.twitchIntegration.updateUI();
        } else if (status === 'disconnected') {
            window.twitchIntegration.updateConnectionStatus('Disconnected', 'red');
            window.twitchIntegration.updateUI();
        }
    });
});

module.exports = TwitchIntegration;
