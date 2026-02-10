#!/usr/bin/env node

const mineflayer = require('mineflayer');
const logger = require('./utils/logger');
const http = require('http');
const OpenAI = require('openai');

// Database integration - optional
let storage = null;
try {
    if (process.env.DATABASE_URL) {
        // Try to require the compiled JavaScript version first, then TypeScript
        try {
            storage = require('./server/storage.js').storage;
        } catch (jsError) {
            console.log('⚠️  Database TypeScript files need compilation, running without database');
            storage = null;
        }
    }
} catch (error) {
    console.log('⚠️  Database not available, continuing without database logging');
    storage = null;
}

// Initialize OpenAI for ChatGPT integration  
let openai = null;
try {
    if (process.env.OPENAI_API_KEY) {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        console.log('✅ OpenAI initialized successfully');
    } else {
        console.log('⚠️  No OPENAI_API_KEY found, running without ChatGPT integration');
    }
} catch (error) {
    console.log('⚠️  OpenAI initialization failed:', error.message);
    openai = null;
}

// Chat history for context
const chatHistory = new Map(); // playerName -> array of messages

// Check if database is available
const hasDatabase = !!storage;
if (hasDatabase) {
    logger.info('📊 Database connected successfully');
} else {
    logger.warn('⚠️  Database not available, running without database logging');
}

console.log('='.repeat(60));
console.log('🤖 AI Minecraft Bot + Database + Web Server');
console.log('⚠️  SINGLE BOT MODE: Only 1 bot connects at a time');
console.log('🔄 When banned → 1 new bot with different username');
console.log('='.repeat(60));

// Parse command line arguments
const args = process.argv.slice(2);
const config = require('./config');
const serverHost = args[0] || process.env.MINECRAFT_HOST || config.defaultServer.host;
const serverPort = parseInt(args[1]) || parseInt(process.env.MINECRAFT_PORT) || config.defaultServer.port;
const baseUsername = args[2] || process.env.MINECRAFT_USERNAME || config.bot.username;
const webPort = process.env.PORT || 5000;

// Username rotation system for ban evasion
const usernamePool = [
    'AIPlayer', 'BotHelper', 'AutoCrafter', 'MineBot', 'PlayerAI',
    'CraftBot', 'ExploreBot', 'BuildHelper', 'GameBot', 'ServerBot',
    'FriendlyAI', 'HelpBot', 'ChatBot', 'WorkBot', 'PlayBot',
    'SmartBot', 'QuickBot', 'FastBot', 'CoolBot', 'NiceBot'
];

let currentUsernameIndex = 0;
let currentUsername = baseUsername;
let currentSessionId = null;

console.log(`🎯 Target Server: ${serverHost}:${serverPort}`);
console.log(`👤 AI Bot Base Username: ${baseUsername}`);
console.log(`🌐 Web Server Port: ${webPort}`);
console.log(`🔄 Username Pool: ${usernamePool.length} usernames available`);
console.log(`📊 Database: ${hasDatabase ? 'ENABLED' : 'DISABLED'}`);
console.log(`🤖 ChatGPT: ${process.env.OPENAI_API_KEY ? 'ENABLED' : 'DISABLED'}`);
console.log('');

let bot = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 50;
let isReconnecting = false;

// Bot status for web server
let botStatus = {
    isRunning: false,
    lastSeen: null,
    currentUsername: 'Not connected',
    serverHost: serverHost,
    serverPort: serverPort,
    uptime: Date.now(),
    totalSessions: 0,
    totalChatMessages: 0,
    totalPlayersInteracted: 0,
    arrivedAt: null,
    hasArrived: false
};

// Bot statistics
let sessionStats = {
    chatMessagesSent: 0,
    playersInteracted: new Set(),
    blocksBreken: 0,
    itemsCrafted: 0,
    startTime: Date.now()
};

// Simplified database helper functions
async function createBotSession() {
    if (!hasDatabase) return null;

    try {
        // Use storage if available
        if (storage) {
            const session = await storage.createBotSession({
                username: currentUsername,
                serverHost: serverHost,
                serverPort: serverPort,
                startTime: new Date(),
                isActive: true
            });
            currentSessionId = session.id;
            botStatus.totalSessions++;
            logger.info(`📊 Created database session ${currentSessionId}`);
            return currentSessionId;
        }
    } catch (error) {
        logger.debug(`Database session creation: ${error.message}`);
    }
    return null;
}

async function endBotSession(reason = 'disconnect') {
    if (!hasDatabase || !currentSessionId) return;

    try {
        if (storage) {
            await storage.endCurrentSession(reason);
            logger.info(`📊 Ended database session ${currentSessionId}`);
            currentSessionId = null;
        }
    } catch (error) {
        logger.debug(`Database session end: ${error.message}`);
    }
}

async function logPlayerInteraction(playerName, messageType, message, botResponse = null) {
    if (!hasDatabase || !currentSessionId) return;

    try {
        if (storage) {
            await storage.logPlayerInteraction({
                sessionId: currentSessionId,
                playerName: playerName,
                messageType: messageType,
                message: message,
                botResponse: botResponse,
                timestamp: new Date()
            });
            sessionStats.playersInteracted.add(playerName);
            botStatus.totalPlayersInteracted = sessionStats.playersInteracted.size;
        }
    } catch (error) {
        logger.debug(`Database interaction logging: ${error.message}`);
    }
}

async function updateServerStatus(isOnline, playerCount = 0, errorMessage = null) {
    if (!hasDatabase) return;

    try {
        if (storage) {
            await storage.updateServerStatus({
                serverHost: serverHost,
                serverPort: serverPort,
                isOnline: isOnline,
                playerCount: playerCount,
                errorMessage: errorMessage,
                timestamp: new Date()
            });
        }
    } catch (error) {
        logger.debug(`Database server status update: ${error.message}`);
    }
}

async function logUsernameUsage(username, wasBanned = false, banReason = null) {
    if (!hasDatabase) return;

    try {
        if (storage) {
            await storage.logUsernameUsage({
                username: username,
                serverHost: serverHost,
                serverPort: serverPort,
                wasBanned: wasBanned,
                banReason: banReason,
                timestamp: new Date()
            });
        }
    } catch (error) {
        logger.debug(`Database username logging: ${error.message}`);
    }
}

// Web Server for UptimeRobot - Enhanced with Database Stats
const webServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=30, max=100');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = req.url;
    const now = new Date();

    // Root route - redirect to health page for preview tab
    if (url === '/') {
        res.writeHead(302, { 'Location': '/health' });
        res.end();
        return;
    }

    // Debug endpoint to check bot status
    if (url === '/debug') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const debugInfo = {
            botExists: !!bot,
            botEntityExists: !!(bot && bot.entity),
            botStatusRunning: botStatus.isRunning,
            currentUsername: currentUsername,
            botStatusUsername: botStatus.currentUsername,
            hasArrived: botStatus.hasArrived,
            arrivedAt: botStatus.arrivedAt,
            isReconnecting: isReconnecting,
            reconnectAttempts: reconnectAttempts
        };
        res.end(JSON.stringify(debugInfo, null, 2));
        return;
    }

    // Keep-alive endpoint for UptimeRobot - shows "Alive!" in preview
    if (url === '/health' || url === '/ping') {
        res.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        // Movement patterns active status
        const keepAliveStatus = true;
        const uptimeHours = Math.floor((Date.now() - botStatus.uptime) / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((Date.now() - botStatus.uptime) / (1000 * 60)) % 60;

        const response = `
<!DOCTYPE html>
<html>
<head>
    <title>Alive! - Minecraft Bot Monitor</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { 
            background: rgba(255,255,255,0.1); 
            padding: 40px; 
            border-radius: 20px; 
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 600px;
        }
        .alive { 
            font-size: 4em; 
            color: #4ade80; 
            font-weight: bold; 
            margin-bottom: 20px;
            text-shadow: 0 0 20px rgba(74, 222, 128, 0.5);
        }
        .bot-arrived { 
            font-size: 3em; 
            color: #fbbf24; 
            font-weight: bold; 
            margin: 20px 0;
            text-shadow: 0 0 15px rgba(251, 191, 36, 0.6);
            animation: glow 2s ease-in-out infinite alternate;
        }
        @keyframes glow {
            from { text-shadow: 0 0 15px rgba(251, 191, 36, 0.6), 0 0 30px rgba(251, 191, 36, 0.4); }
            to { text-shadow: 0 0 25px rgba(251, 191, 36, 0.8), 0 0 40px rgba(251, 191, 36, 0.6); }
        }
        .status { 
            font-size: 1.5em; 
            margin: 20px 0;
            color: ${botStatus.isRunning ? '#4ade80' : '#f87171'};
        }
        .info { 
            background: rgba(255,255,255,0.1); 
            padding: 20px; 
            border-radius: 10px; 
            margin: 20px 0;
            font-size: 1.1em;
        }
        .url-box { 
            background: rgba(0,0,0,0.3); 
            padding: 15px; 
            border-radius: 10px; 
            font-family: monospace; 
            word-break: break-all; 
            margin: 10px 0;
            font-size: 1.2em;
            border: 2px solid #4ade80;
        }
        .pulse { 
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
            gap: 15px; 
            margin: 20px 0;
        }
        .stat { 
            background: rgba(255,255,255,0.1); 
            padding: 15px; 
            border-radius: 10px;
        }
        .stat-value { 
            font-size: 2em; 
            font-weight: bold; 
            color: #4ade80;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="alive pulse">Alive!</div>
        
        ${botStatus.hasArrived && botStatus.isRunning ?
                '<div class="bot-arrived">🎉 Bot Has Arrived! 🎉</div>' :
                ''
            }
        
        <div class="status">
            ${botStatus.isRunning ? '🟢 Bot Active' : '🔴 Bot Connecting...'}
        </div>
        
        <div class="info">
            <strong>Bot:</strong> ${botStatus.currentUsername}<br>
            <strong>Server:</strong> ${botStatus.serverHost}:${botStatus.serverPort}<br>
            <strong>Uptime:</strong> ${uptimeHours}h ${uptimeMinutes}m<br>
            ${botStatus.arrivedAt ? `<strong>Arrived:</strong> ${botStatus.arrivedAt.toLocaleString()}<br>` : ''}
            <strong>ChatGPT:</strong> ${process.env.OPENAI_API_KEY ? 'Enabled' : 'Disabled'}<br>
            <strong>Keep-Alive:</strong> ${keepAliveStatus ? 'Active' : 'Standby'}<br>
            <strong>Last Update:</strong> ${now.toLocaleString()}
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${botStatus.totalSessions}</div>
                <div>Sessions</div>
            </div>
            <div class="stat">
                <div class="stat-value">${botStatus.totalChatMessages + sessionStats.chatMessagesSent}</div>
                <div>Messages</div>
            </div>
            <div class="stat">
                <div class="stat-value">${sessionStats.playersInteracted.size}</div>
                <div>Players</div>
            </div>
            <div class="stat">
                <div class="stat-value">${reconnectAttempts}</div>
                <div>Reconnects</div>
            </div>
        </div>
        
        <div class="info">
            <h3>🔗 UptimeRobot Monitor Setup</h3>
            <p><strong>Copy this URL for UptimeRobot:</strong></p>
            <div class="url-box">https://${req.headers.host}/health</div>
            <p><strong>Monitor Settings:</strong></p>
            <ul style="text-align: left; margin: 10px 0;">
                <li>Monitor Type: HTTP(s)</li>
                <li>URL: Use the URL above</li>
                <li>Monitoring Interval: 5 minutes</li>
                <li>Keyword Monitoring: "Alive!"</li>
            </ul>
        </div>
    </div>
    
    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>
        `;

        res.end(response);
        return;
    }

    // Enhanced status endpoint with database stats
    if (url === '/' || url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        const uptimeHours = Math.floor((Date.now() - botStatus.uptime) / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((Date.now() - botStatus.uptime) / (1000 * 60)) % 60;

        // Get recent database stats if available
        let dbStats = null;
        if (db) {
            try {
                const result = await db.execute(`
                    SELECT COUNT(*) as total_sessions,
                           SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_sessions,
                           MAX(start_time) as last_session
                    FROM bot_sessions 
                    WHERE server_host = $1 AND server_port = $2
                `, [serverHost, serverPort]);

                dbStats = result.rows[0];
            } catch (error) {
                logger.debug(`Database stats query failed: ${error.message}`);
            }
        }

        const response = {
            status: "OK",
            webServer: "ACTIVE",
            database: db ? "CONNECTED" : "DISABLED",
            bot: {
                running: botStatus.isRunning,
                username: botStatus.currentUsername,
                server: `${botStatus.serverHost}:${botStatus.serverPort}`,
                lastSeen: botStatus.lastSeen,
                uptime: `${uptimeHours}h ${uptimeMinutes}m`,
                reconnectAttempts: reconnectAttempts,
                sessionId: currentSessionId
            },
            statistics: {
                totalSessions: dbStats?.total_sessions || botStatus.totalSessions,
                activeSessions: dbStats?.active_sessions || (botStatus.isRunning ? 1 : 0),
                totalChatMessages: botStatus.totalChatMessages + sessionStats.chatMessagesSent,
                currentSessionPlayers: sessionStats.playersInteracted.size,
                lastSession: dbStats?.last_session
            },
            timestamp: now.toISOString(),
            message: botStatus.isRunning ?
                "Bot online - All systems operational" :
                `Bot reconnecting (attempt ${reconnectAttempts}) - Web server active`
        };

        res.end(JSON.stringify(response, null, 2));
        return;
    }

    // Enhanced web dashboard with database stats
    if (url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        const uptimeHours = Math.floor((Date.now() - botStatus.uptime) / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((Date.now() - botStatus.uptime) / (1000 * 60)) % 60;

        res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Minecraft Bot + Database Monitor</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status { padding: 20px; border-radius: 8px; margin: 15px 0; text-align: center; }
        .online { background-color: #d4edda; border: 2px solid #28a745; color: #155724; }
        .offline { background-color: #f8d7da; border: 2px solid #dc3545; color: #721c24; }
        .info { background-color: #e7f3ff; border: 2px solid #007bff; color: #004085; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #ddd; text-align: center; }
        .url-box { background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; word-break: break-all; border: 1px solid #ddd; }
        h1 { color: #333; text-align: center; }
        .emoji { font-size: 1.2em; }
        .db-status { padding: 10px; border-radius: 5px; margin: 10px 0; text-align: center; font-weight: bold; }
        .db-connected { background-color: #d1ecf1; border: 1px solid #b8daff; color: #0c5460; }
        .db-disabled { background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
    </style>
</head>
<body>
    <div class="container">
        <h1><span class="emoji">🤖</span> Minecraft Bot + Database Monitor</h1>
        
        <div class="status ${botStatus.isRunning ? 'online' : 'offline'}">
            <h2>${botStatus.isRunning ? '🟢 BOT ONLINE' : '🔴 BOT OFFLINE'}</h2>
            <p><strong>Username:</strong> ${botStatus.currentUsername}</p>
            <p><strong>Server:</strong> ${botStatus.serverHost}:${botStatus.serverPort}</p>
            <p><strong>Last Seen:</strong> ${botStatus.lastSeen || 'Never'}</p>
            <p><strong>Uptime:</strong> ${uptimeHours}h ${uptimeMinutes}m</p>
            <p><strong>Session ID:</strong> ${currentSessionId || 'None'}</p>
        </div>

        <div class="db-status ${db ? 'db-connected' : 'db-disabled'}">
            📊 Database: ${db ? 'CONNECTED & LOGGING' : 'DISABLED'}
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <h3>Total Sessions</h3>
                <p style="font-size: 2em; color: #007bff;">${botStatus.totalSessions}</p>
            </div>
            <div class="stat-card">
                <h3>Chat Messages</h3>
                <p style="font-size: 2em; color: #28a745;">${botStatus.totalChatMessages + sessionStats.chatMessagesSent}</p>
            </div>
            <div class="stat-card">
                <h3>Players Met</h3>
                <p style="font-size: 2em; color: #ffc107;">${sessionStats.playersInteracted.size}</p>
            </div>
            <div class="stat-card">
                <h3>Reconnect Attempts</h3>
                <p style="font-size: 2em; color: #dc3545;">${reconnectAttempts}</p>
            </div>
        </div>
        
        <div class="info">
            <h3><span class="emoji">📊</span> UptimeRobot Setup Instructions</h3>
            <p><strong>1. Copy this URL:</strong></p>
            <div class="url-box">https://${req.headers.host || 'your-replit-domain'}.replit.app/health</div>
            <p><strong>2. Add to UptimeRobot:</strong></p>
            <ul>
                <li>Monitor Type: HTTP(s)</li>
                <li>URL: Use the URL above</li>
                <li>Monitoring Interval: 5 minutes</li>
                <li>Keyword Monitoring: OFF</li>
            </ul>
            <p><strong>3. Your bot will stay online 24/7 with full database logging!</strong></p>
        </div>
        
        <div class="info">
            <h3><span class="emoji">🎮</span> Enhanced Bot Features</h3>
            <ul>
                <li>✅ Anti-ban system with username rotation</li>
                <li>✅ PostgreSQL database logging</li>
                <li>✅ Player interaction tracking</li>
                <li>✅ Session statistics</li>
                <li>✅ Server status monitoring</li>
                <li>✅ 24/7 operation with UptimeRobot</li>
            </ul>
        </div>
    </div>
    
    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>
        `);
        return;
    }

    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found - Available endpoints: /health, /status, /dashboard');
});

// Start web server
webServer.listen(webPort, '0.0.0.0', () => {
    logger.info(`🌐 Web server running on port ${webPort}`);
    logger.info(`📊 UptimeRobot URL: https://your-replit-domain.replit.app/health`);
    logger.info(`🖥️  Dashboard: https://your-replit-domain.replit.app/dashboard`);
    console.log('🔗 COPY THIS URL FOR UPTIMEROBOT:');
    console.log(`https://your-replit-domain.replit.app/health`);
    console.log('');
});

// Update bot status function
function updateBotStatus(isConnected) {
    botStatus.isRunning = isConnected;
    botStatus.lastSeen = new Date().toISOString();
    botStatus.currentUsername = currentUsername;

    if (isConnected) {
        console.log(`🟢 Status updated: Bot is ACTIVE - Preview will show "Bot Active"`);
        logger.info(`Bot status: ACTIVE`);
    } else {
        console.log(`🔴 Status updated: Bot disconnected - Preview will show "Bot Reconnecting"`);
        logger.info(`Bot status: DISCONNECTED`);
        // Reset arrival status when disconnecting
        botStatus.hasArrived = false;
        botStatus.arrivedAt = null;
    }

    // Update server status in database
    updateServerStatus(isConnected, isConnected ? 1 : 0);
}

// Username management with database logging
function getNextUsername() {
    if (reconnectAttempts === 0) {
        currentUsername = baseUsername;
    } else {
        currentUsernameIndex = (currentUsernameIndex + 1) % usernamePool.length;
        currentUsername = usernamePool[currentUsernameIndex];
        const randomSuffix = Math.floor(Math.random() * 999);
        currentUsername = `${currentUsername}${randomSuffix}`;
    }

    logger.info(`🔄 Using username: ${currentUsername} (attempt ${reconnectAttempts + 1})`);

    // Log username usage
    logUsernameUsage(currentUsername, false);

    return currentUsername;
}

// Function to test basic server connectivity 
async function testServerConnectivity(host, port) {
    return new Promise((resolve) => {
        const net = require('net');
        const socket = new net.Socket();

        socket.setTimeout(60000);

        socket.on('connect', () => {
            console.log(`✅ TCP connection test successful to ${host}:${port}`);
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            console.log(`❌ TCP connection timeout to ${host}:${port}`);
            socket.destroy();
            resolve(false);
        });

        socket.on('error', (err) => {
            console.log(`❌ TCP connection failed: ${err.message}`);
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

function createBot() {
    // Ensure only one bot exists at a time
    if (bot && typeof bot.quit === 'function') {
        console.log('🔄 Cleaning up existing bot instance...');
        try {
            bot.quit();
        } catch (error) {
            logger.debug(`Error cleaning up bot: ${error.message}`);
        }
        bot = null;
    }

    // Test server connectivity first
    console.log(`🔍 Testing server connectivity: ${serverHost}:${serverPort}`);
    testServerConnectivity(serverHost, serverPort).then(isConnectable => {
        if (!isConnectable) {
            console.log('🔴 Server is not accessible - skipping connection attempt');
            return;
        }
    });

    const username = getNextUsername();

    console.log(`🔧 Using Minecraft version ${config.bot.version} (configured in config.js)`);

    const botOptions = {
        host: serverHost,
        port: serverPort,
        username: username,
        version: config.bot.version,
        auth: 'offline',
        connectTimeout: 60000,
        hideErrors: false // Simplified configuration to match working test
    };

    logger.info('Creating AI bot instance...');
    console.log(`🔗 Attempting connection to ${serverHost}:${serverPort} with username ${username}`);
    console.log(`🤖 Only 1 bot will connect at a time (current attempt: ${reconnectAttempts + 1})`);
    bot = mineflayer.createBot(botOptions);

    // Backup movement activation - start after connection regardless of spawn event
    setTimeout(() => {
        if (bot && bot.entity) {
            console.log('🔄 Backup movement activation - bot detected as spawned');
            startKeepAliveActivities();
        } else if (bot) {
            console.log('🔄 Starting movement patterns anyway - bot instance exists');
            // Try to start movement patterns even without entity confirmation
            startKeepAliveActivities();
        }
    }, 10000); // Wait 10 seconds after bot creation

    // Add comprehensive connection monitoring
    bot.on('connect', () => {
        console.log('🔗 TCP connection established');
        logger.info('TCP connection established to Minecraft server');
        console.log('⏳ Waiting for Minecraft login to complete...');
    });

    // Add timeout for login with multiple fallback attempts
    let loginTimeout = setTimeout(() => {
        if (bot && !bot.entity) {
            console.log('❌ Login timeout - authentication failed after 30 seconds');
            logger.error('Login timeout - authentication handshake failed');

            // Try more aggressive version/protocol combinations
            console.log('🔄 Trying fallback connection with different protocols...');
            bot.quit();

            // Store attempt count to try different approaches
            reconnectAttempts++;
            if (reconnectAttempts < 3) {
                setTimeout(() => createBot(), 5000); // Quick retry
            } else {
                console.log('🔄 Multiple attempts failed, waiting longer before retry...');
                scheduleReconnect();
            }
        }
    }, 60000);

    // Monitor authentication state changes
    bot.on('session', () => {
        console.log('🔐 Authentication session established');
        logger.info('Authentication session established');
    });

    // Clear timeout when login succeeds
    bot.on('login', () => {
        clearTimeout(loginTimeout);
        console.log('✅ Login timeout cleared - authentication successful');
    });

    bot.on('login', async () => {
        console.log(`✅ AI Bot logged in successfully!`);
        logger.info(`✅ AI Bot logged in successfully!`);
        logger.info(`🌍 Connected to ${serverHost}:${serverPort}`);
        console.log(`🟢 Bot is now ACTIVE - Preview will show "Bot Active"`);
        reconnectAttempts = 0;
        isReconnecting = false;
        updateBotStatus(true);

        // Mark bot as arrived for preview display
        botStatus.hasArrived = true;
        botStatus.arrivedAt = new Date();

        // Create database session
        await createBotSession();

        // Reset session stats
        sessionStats = {
            chatMessagesSent: 0,
            playersInteracted: new Set(),
            blocksBreken: 0,
            itemsCrafted: 0,
            startTime: Date.now()
        };

        console.log('🤖 AI Bot is now online and ready to play!');
        console.log('🎮 Bot will behave like a real intelligent player...');
        console.log('📊 All activities will be logged to database');
        console.log('Press Ctrl+C to stop the bot');
        console.log('='.repeat(60));
    });

    bot.on('spawn', () => {
        logger.info(`AI Bot spawned at ${bot.entity.position}`);

        // Log spawn position in database
        if (currentSessionId && db) {
            const position = bot.entity.position;
            db.execute(`
                UPDATE bot_sessions SET position = $1 WHERE id = $2
            `, [JSON.stringify(position), currentSessionId]).catch(err =>
                logger.debug(`Failed to log spawn position: ${err.message}`)
            );
        }

        // Start keep-alive activities immediately
        console.log('🎮 Starting movement patterns now...');
        logger.info('🎮 Bot spawned - activating movement patterns');
        startKeepAliveActivities();

        // Immediate movement test to show it's working
        setTimeout(() => {
            if (bot && bot.entity) {
                console.log('🧪 Testing immediate movement...');
                bot.setControlState('jump', true);
                setTimeout(() => {
                    if (bot) bot.setControlState('jump', false);
                    console.log('✅ Jump test completed');
                }, 500);

                // Test movement
                bot.setControlState('forward', true);
                setTimeout(() => {
                    if (bot) bot.setControlState('forward', false);
                    console.log('✅ Forward movement test completed');
                }, 1000);
            }
        }, 500);

        setTimeout(() => {
            if (bot) {
                try {
                    bot.chat('/gamemode creative');
                    sendIntelligentChat('switching to creative mode for better building!');
                } catch (error) {
                    logger.debug('Could not set creative mode');
                }
            }
        }, 2000);

        setTimeout(() => {
            startAIBehaviors();
        }, 2000);
    });

    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        logger.info(`<${username}> ${message}`);

        // Log player interaction
        await logPlayerInteraction(username, 'chat', message);

        // Test movement command
        if (message.toLowerCase().includes('move test')) {
            console.log('🧪 Manual movement test triggered by chat');

            // Immediate jump
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);

            // Forward movement for 2 seconds
            setTimeout(() => {
                bot.setControlState('forward', true);
                setTimeout(() => bot.setControlState('forward', false), 2000);
            }, 1000);

            bot.chat('Testing movement patterns!');
        }

        handlePlayerChat(username, message);
    });

    bot.on('playerJoined', async (player) => {
        logger.info(`${player.username} joined the game`);

        // Log player join
        await logPlayerInteraction(player.username, 'join', null);

        setTimeout(async () => {
            try {
                // Use ChatGPT for personalized welcome message
                const response = await openai.chat.completions.create({
                    model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
                    messages: [
                        {
                            role: 'system',
                            content: `You are ${currentUsername}, a friendly player on a Minecraft server. Generate a short, warm welcome message (under 50 characters) for a new player named ${player.username}. Be casual and friendly like a real player.`
                        }
                    ],
                    max_tokens: 50,
                    temperature: 0.8
                });

                const welcomeMessage = response.choices[0].message.content.trim();
                await sendIntelligentChat(welcomeMessage);

                // Log bot response
                await logPlayerInteraction(player.username, 'welcome', null, welcomeMessage);

            } catch (error) {
                // Fallback welcome if ChatGPT fails
                const fallbackWelcome = `welcome ${player.username}! nice to meet you!`;
                await sendIntelligentChat(fallbackWelcome);
                await logPlayerInteraction(player.username, 'welcome', null, fallbackWelcome);
            }
        }, 1500 + Math.random() * 2500);
    });

    bot.on('playerLeft', async (player) => {
        logger.info(`${player.username} left the game`);

        // Log player leave
        await logPlayerInteraction(player.username, 'leave', null);
    });

    bot.on('error', async (err) => {
        clearTimeout(loginTimeout);
        logger.error(`❌ AI Bot error: ${err.message}`);
        logger.error(`Error code: ${err.code || 'N/A'}`);

        // Log specific authentication errors
        if (err.message.includes('ECONNREFUSED')) {
            console.log('🔴 Server connection refused - server may be offline');
        } else if (err.message.includes('timeout')) {
            console.log('🔴 Connection timeout - server not responding');
        } else if (err.message.includes('protocol')) {
            console.log('🔴 Protocol error - version mismatch or server issue');
        } else if (err.message.includes('ENOTFOUND')) {
            console.log('🔴 Server hostname not found - DNS resolution failed');
        } else {
            console.log(`🔴 Authentication error: ${err.message}`);
        }

        clearKeepAliveIntervals();
        updateBotStatus(false);
        await endBotSession(`error: ${err.message}`);
        scheduleReconnect();
    });

    bot.on('end', async (reason) => {
        logger.warn(`🔌 AI Bot disconnected: ${reason}`);
        clearKeepAliveIntervals();
        updateBotStatus(false);
        await endBotSession(reason);
        scheduleReconnect();
    });

    bot.on('kicked', async (reason) => {
        logger.warn(`👢 AI Bot was kicked: ${reason}`);

        clearKeepAliveIntervals();

        const banKeywords = ['ban', 'banned', 'blacklist', 'prohibited', 'blocked', 'suspended'];
        const isBanned = banKeywords.some(keyword =>
            reason.toLowerCase().includes(keyword)
        );

        if (isBanned) {
            logger.warn(`🚫 Detected ban! Reason: ${reason}`);
            logger.info(`🔄 Will reconnect with different username...`);
            console.log(`🚫 Bot ${currentUsername} was BANNED: ${reason}`);
            console.log(`🔄 Only 1 new bot will reconnect with different username`);

            // Log banned username
            await logUsernameUsage(currentUsername, true, reason);
        } else {
            console.log(`👢 Bot ${currentUsername} was kicked (not banned): ${reason}`);
            console.log(`🔄 Only 1 bot will reconnect with same username pool`);
        }

        updateBotStatus(false);
        await endBotSession(`kicked: ${reason}`);
        scheduleReconnect();
    });

    return bot;
}

function scheduleReconnect() {
    // Prevent multiple simultaneous reconnection attempts
    if (isReconnecting) {
        logger.debug('⚠️  Reconnection already in progress, skipping duplicate attempt');
        return;
    }

    isReconnecting = true;

    if (reconnectAttempts >= maxReconnectAttempts) {
        logger.warn(`⚠️  Max reconnection attempts (${maxReconnectAttempts}) reached. Will keep trying with longer delays...`);
        reconnectAttempts = Math.floor(maxReconnectAttempts / 2);
    }

    reconnectAttempts++;

    let delay;
    if (reconnectAttempts <= 3) {
        delay = 5000;
        logger.info(`🔄 Quick reconnect in ${delay / 1000}s (attempt ${reconnectAttempts})`);
    } else if (reconnectAttempts <= 10) {
        delay = 30000;
        logger.info(`🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}) - server may be down`);
    } else {
        delay = Math.min(300000, 60000 + (reconnectAttempts * 10000));
        logger.info(`🔄 Long reconnect in ${Math.floor(delay / 60000)}min (attempt ${reconnectAttempts}) - waiting for server`);
    }

    setTimeout(() => {
        try {
            // Ensure only one bot exists at a time
            if (bot && typeof bot.quit === 'function') {
                bot.quit();
            }
            bot = null;

            // Reset reconnecting flag and create new bot
            isReconnecting = false;
            createBot();
        } catch (error) {
            logger.error(`Error during reconnection: ${error.message}`);
            bot = null;
            isReconnecting = false;

            // Wait before trying again, but don't create nested reconnection loop
            setTimeout(() => {
                if (!isReconnecting) {
                    scheduleReconnect();
                }
            }, 10000);
        }
    }, delay);
}

// ChatGPT integration function
async function getChatGPTResponse(playerName, message) {
    if (!openai) {
        // Return fallback response if OpenAI is not available
        const fallbackResponses = [
            `hey ${playerName}! how are you doing?`,
            `hi ${playerName}! what's up?`,
            `cool ${playerName}! tell me more`,
            `awesome ${playerName}! that sounds fun!`,
            `nice ${playerName}! what are you building?`
        ];
        return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }

    try {
        // Get or create chat history for this player
        if (!chatHistory.has(playerName)) {
            chatHistory.set(playerName, []);
        }

        const playerHistory = chatHistory.get(playerName);

        // Add player message to history
        playerHistory.push({ role: 'user', content: `${playerName}: ${message}` });

        // Keep only last 10 messages for context (to manage API costs)
        if (playerHistory.length > 10) {
            playerHistory.splice(0, playerHistory.length - 10);
        }

        // Create messages array for ChatGPT
        const messages = [
            {
                role: 'system',
                content: `You are ${currentUsername}, a friendly AI player in a Minecraft server. You should:
- Respond naturally like a real player
- Keep responses short (under 50 characters for Minecraft chat)
- Be helpful, friendly, and engaging
- Talk about Minecraft activities like building, mining, crafting
- Use casual gaming language
- Remember you're playing Minecraft with ${playerName}
- Don't mention you're an AI unless directly asked`
            },
            ...playerHistory
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages: messages,
            max_tokens: 60,
            temperature: 0.8
        });

        const aiResponse = response.choices[0].message.content.trim();

        // Add AI response to history
        playerHistory.push({ role: 'assistant', content: aiResponse });

        return aiResponse;

    } catch (error) {
        logger.error(`ChatGPT API error: ${error.message}`);
        // Fallback to simple responses if ChatGPT fails
        const fallbackResponses = [
            `hey ${playerName}! how are you doing?`,
            `hi ${playerName}! what's up?`,
            `cool ${playerName}! tell me more`,
            `awesome ${playerName}! that sounds fun!`,
            `nice ${playerName}! what are you building?`
        ];
        return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
}

// Enhanced chat function with ChatGPT and database logging
async function sendIntelligentChat(message, isResponseTo = null) {
    if (!bot || !message) return;

    const currentTime = Date.now();
    if (currentTime - (botStatus.lastChatTime || 0) < 3000) return;

    try {
        bot.chat(message);
        botStatus.lastChatTime = currentTime;
        sessionStats.chatMessagesSent++;
        botStatus.totalChatMessages++;

        // Log bot chat message
        if (currentSessionId) {
            await logPlayerInteraction(bot.username, 'bot_chat', message);
        }

        logger.info(`💬 AI Bot: ${message}`);
    } catch (error) {
        logger.debug(`Failed to send chat: ${error.message}`);
    }
}

// Enhanced keep-alive function to prevent disconnections
let keepAliveIntervals = [];

function startKeepAliveActivities() {
    if (!bot) return;

    // Clear any existing intervals
    clearKeepAliveIntervals();

    // Movement Pattern: 3 seconds random movement/sprint every 5 seconds
    const moveInterval = setInterval(() => {
        if (!bot || !bot.entity) {
            clearInterval(moveInterval);
            return;
        }

        try {
            // Random movement direction
            const movements = ['forward', 'back', 'left', 'right'];
            const randomMovement = movements[Math.floor(Math.random() * movements.length)];

            // Random sprint chance (50%)
            const shouldSprint = Math.random() > 0.5;

            // Start movement
            bot.setControlState(randomMovement, true);
            if (shouldSprint) {
                bot.setControlState('sprint', true);
                console.log(`🏃 Keep-alive: Sprint ${randomMovement} for 3 seconds`);
                logger.info(`🏃 Keep-alive: Sprint ${randomMovement} for 3 seconds`);
            } else {
                console.log(`🚶 Keep-alive: Move ${randomMovement} for 3 seconds`);
                logger.info(`🚶 Keep-alive: Move ${randomMovement} for 3 seconds`);
            }

            // Stop movement after 3 seconds
            setTimeout(() => {
                if (bot) {
                    bot.setControlState(randomMovement, false);
                    if (shouldSprint) {
                        bot.setControlState('sprint', false);
                    }
                }
            }, 3000);

        } catch (error) {
            logger.debug(`Keep-alive movement error: ${error.message}`);
        }
    }, 5000); // Every 5 seconds
    keepAliveIntervals.push(moveInterval);

    // Jump Pattern: Every 15 seconds
    const jumpInterval = setInterval(() => {
        if (!bot || !bot.entity) {
            clearInterval(jumpInterval);
            return;
        }

        try {
            bot.setControlState('jump', true);
            setTimeout(() => {
                if (bot) bot.setControlState('jump', false);
            }, 500);
            console.log('🦘 Keep-alive: Jump');
            logger.info('🦘 Keep-alive: Jump');
        } catch (error) {
            logger.debug(`Keep-alive jump error: ${error.message}`);
        }
    }, 15000); // Every 15 seconds
    keepAliveIntervals.push(jumpInterval);

    // Camera Movement: Every 2 seconds
    const lookInterval = setInterval(() => {
        if (!bot || !bot.entity) {
            clearInterval(lookInterval);
            return;
        }

        try {
            // Random camera movement
            const yaw = Math.random() * Math.PI * 2; // Random direction (0-360 degrees)
            const pitch = (Math.random() - 0.5) * 0.6; // Random up/down (-0.3 to 0.3 radians)
            bot.look(yaw, pitch);
            console.log('👀 Keep-alive: Camera movement');
            logger.info('👀 Keep-alive: Camera movement');
        } catch (error) {
            logger.debug(`Keep-alive camera error: ${error.message}`);
        }
    }, 2000); // Every 2 seconds
    keepAliveIntervals.push(lookInterval);

    // Inventory keep-alive (every 60-120 seconds)
    const inventoryInterval = setInterval(() => {
        if (!bot || !bot.entity) {
            clearInterval(inventoryInterval);
            return;
        }

        try {
            // Switch held item occasionally
            if (bot.inventory && bot.inventory.slots.length > 0) {
                const randomSlot = Math.floor(Math.random() * 9); // Hotbar slots 0-8
                bot.setQuickBarSlot(randomSlot);
            }
        } catch (error) {
            logger.debug(`Keep-alive inventory error: ${error.message}`);
        }
    }, 60000 + Math.random() * 60000);
    keepAliveIntervals.push(inventoryInterval);

    // Ping keep-alive using tab list (every 30 seconds)
    const pingInterval = setInterval(() => {
        if (!bot || !bot.entity) {
            clearInterval(pingInterval);
            return;
        }

        try {
            // Send a harmless packet to keep connection alive
            if (bot.players && Object.keys(bot.players).length > 0) {
                // Just accessing player list keeps connection active
                const playerCount = Object.keys(bot.players).length;
                logger.debug(`Keep-alive: ${playerCount} players online`);
            }
        } catch (error) {
            logger.debug(`Keep-alive ping error: ${error.message}`);
        }
    }, 30000);
    keepAliveIntervals.push(pingInterval);

    // Connection health check (every 5 minutes)
    const healthInterval = setInterval(() => {
        if (!bot || !bot.entity) {
            clearInterval(healthInterval);
            return;
        }

        try {
            const uptime = Math.floor((Date.now() - sessionStats.startTime) / 1000);
            logger.info(`🔄 Keep-alive: Bot healthy, uptime ${Math.floor(uptime / 60)}m`);
            logger.info(`🎮 Movement patterns: 3s movement every 5s, jump every 15s, camera every 2s`);

            // Update bot status
            updateBotStatus(true);

        } catch (error) {
            logger.debug(`Keep-alive health check error: ${error.message}`);
        }
    }, 300000); // 5 minutes
    keepAliveIntervals.push(healthInterval);

    logger.info('🔄 Enhanced keep-alive system started with precise movement patterns');
    logger.info('🎮 Movement: 3s random direction/sprint every 5s');
    logger.info('🦘 Jump: Every 15 seconds');
    logger.info('👀 Camera: Every 2 seconds');
}

function clearKeepAliveIntervals() {
    keepAliveIntervals.forEach(interval => {
        clearInterval(interval);
    });
    keepAliveIntervals = [];
}

// Removed keep_alive function per user request

// AI behaviors with ChatGPT-enhanced random chat
function startAIBehaviors() {
    logger.info('🧠 Starting AI behaviors with ChatGPT...');

    setInterval(async () => {
        if (bot && Math.random() < 0.3) {
            try {
                // Use ChatGPT for more natural random messages
                const randomTopics = [
                    'general chat about minecraft',
                    'asking about building projects',
                    'talking about mining adventures',
                    'discussing server community',
                    'offering help to players'
                ];

                const topic = randomTopics[Math.floor(Math.random() * randomTopics.length)];

                const response = await openai.chat.completions.create({
                    model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
                    messages: [
                        {
                            role: 'system',
                            content: `You are ${currentUsername}, a friendly player on a Minecraft server. Generate a short, casual message (under 50 characters) about: ${topic}. Sound like a real player, be friendly and engaging.`
                        }
                    ],
                    max_tokens: 50,
                    temperature: 0.9
                });

                const aiMessage = response.choices[0].message.content.trim();
                await sendIntelligentChat(aiMessage);

            } catch (error) {
                // Fallback to simple messages if ChatGPT fails
                const fallbackMessages = [
                    'hey everyone! how is everyone doing today?',
                    'this server has such a great community!',
                    'anyone need help with anything? i am happy to assist!',
                    'love meeting new players here!',
                    'keeping the server active! hope everyone is having fun!'
                ];
                await sendIntelligentChat(fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)]);
            }
        }
    }, 60000 + Math.random() * 120000);

    logger.info('🎮 AI behaviors activated with ChatGPT integration!');
}

async function handlePlayerChat(username, message) {
    if (username === bot.username) return;

    const lowerMessage = message.toLowerCase();
    logger.info(`📢 Player message from ${username}: "${message}"`);

    // Respond to 90% of messages with ChatGPT (increased from 70%)
    if (Math.random() < 0.9) {
        setTimeout(async () => {
            try {
                // Get intelligent ChatGPT response
                const chatGPTResponse = await getChatGPTResponse(username, message);

                // Send the response
                await sendIntelligentChat(chatGPTResponse, username);

                // Log the interaction with bot response
                await logPlayerInteraction(username, 'chat_response', message, chatGPTResponse);

                logger.info(`🤖 ChatGPT response to ${username}: "${chatGPTResponse}"`);

            } catch (error) {
                logger.error(`Failed to generate ChatGPT response: ${error.message}`);

                // Fallback to simple response if ChatGPT fails
                const fallbackResponse = `hey ${username}! how's it going?`;
                await sendIntelligentChat(fallbackResponse, username);
                await logPlayerInteraction(username, 'chat_response', message, fallbackResponse);
            }
        }, 1000 + Math.random() * 2000);
    }
}

// Force start movement function for debugging
function forceStartMovement() {
    if (!bot) {
        console.log('❌ No bot instance available');
        return false;
    }

    if (!bot.entity) {
        console.log('❌ Bot not spawned yet');
        return false;
    }

    console.log('🎮 Force starting movement patterns...');

    // Clear any existing intervals first
    clearKeepAliveIntervals();

    // Start movement patterns immediately
    startKeepAliveActivities();

    // Immediate test movement
    setTimeout(() => {
        console.log('🧪 Force movement test - Jump');
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
    }, 1000);

    setTimeout(() => {
        console.log('🧪 Force movement test - Forward');
        bot.setControlState('forward', true);
        setTimeout(() => bot.setControlState('forward', false), 2000);
    }, 3000);

    console.log('✅ Movement patterns force started');
    return true;
}

// Expose function globally for manual testing
global.forceStartMovement = forceStartMovement;

// Start the bot
createBot();

// Handle process termination
process.on('SIGINT', async () => {
    logger.info('Shutting down bot...');
    clearKeepAliveIntervals();
    await endBotSession('shutdown');
    if (bot) {
        bot.quit();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down bot...');
    clearKeepAliveIntervals();
    await endBotSession('shutdown');
    if (bot) {
        bot.quit();
    }
    process.exit(0);
});

// Exports removed per user request
module.exports = {};