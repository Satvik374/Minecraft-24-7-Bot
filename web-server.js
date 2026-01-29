#!/usr/bin/env node

const http = require('http');
const logger = require('./utils/logger');

// Web server config
const PORT = process.env.PORT || 5000;

// Bot instance reference for commands
let botInstance = null;
let botInventory = [];
let commandHistory = [];
let chatHistory = [];
let nearbyEntities = { players: [], mobs: [] };
let configOptions = {
    randomBehaviors: true,
    autoEat: true,
    autoTpaAccept: true,
    creativeMode: true
};

let botStatus = {
    isRunning: false,
    lastSeen: null,
    currentUsername: 'Offline',
    serverHost: process.env.MINECRAFT_HOST || 'Not Connected',
    serverPort: process.env.MINECRAFT_PORT || '',
    uptime: Date.now(),
    health: 20,
    food: 20,
    position: { x: '-', y: '-', z: '-' },
    task: 'Idle',
    logs: []
};

// Set bot instance for command execution
function setBotInstance(bot) {
    botInstance = bot;
    if (bot) {
        // Update inventory periodically
        setInterval(() => {
            if (botInstance && botInstance.inventory) {
                try {
                    botInventory = botInstance.inventory.items().map(item => ({
                        name: item.name,
                        displayName: item.displayName,
                        count: item.count,
                        slot: item.slot
                    }));
                } catch (e) {
                    // Ignore inventory errors
                }
            }
        }, 2000);

        // Track nearby entities for map view
        setInterval(() => {
            if (botInstance && botInstance.entity) {
                try {
                    const players = [];
                    const mobs = [];

                    // Get nearby players
                    Object.values(botInstance.players || {}).forEach(player => {
                        if (player.entity && player.username !== botInstance.username) {
                            const dist = botInstance.entity.position.distanceTo(player.entity.position);
                            if (dist < 100) {
                                players.push({
                                    name: player.username,
                                    x: Math.round(player.entity.position.x),
                                    y: Math.round(player.entity.position.y),
                                    z: Math.round(player.entity.position.z),
                                    distance: Math.round(dist)
                                });
                            }
                        }
                    });

                    // Get nearby mobs
                    Object.values(botInstance.entities || {}).forEach(entity => {
                        if (entity.type === 'mob' || entity.type === 'hostile') {
                            const dist = botInstance.entity.position.distanceTo(entity.position);
                            if (dist < 50) {
                                mobs.push({
                                    name: entity.name || entity.displayName || 'Unknown',
                                    x: Math.round(entity.position.x),
                                    z: Math.round(entity.position.z),
                                    distance: Math.round(dist)
                                });
                            }
                        }
                    });

                    nearbyEntities = { players, mobs };
                } catch (e) {
                    // Ignore entity tracking errors
                }
            }
        }, 1500);

        // Listen for chat messages
        bot.on('message', (jsonMsg) => {
            const message = jsonMsg.toString();
            if (message.trim()) {
                chatHistory.unshift({
                    time: new Date().toLocaleTimeString(),
                    message: message
                });
                if (chatHistory.length > 50) chatHistory.pop();
            }
        });

        // Sync config with global botState
        if (global.botState) {
            configOptions.randomBehaviors = global.botState.randomBehaviorsEnabled !== false;
            configOptions.creativeMode = global.botState.isCreativeMode !== false;
        }
    }
}

// Update extended bot stats
function updateStats(stats) {
    if (stats.health !== undefined) botStatus.health = stats.health;
    if (stats.food !== undefined) botStatus.food = stats.food;
    if (stats.position) {
        botStatus.position = {
            x: Math.round(stats.position.x),
            y: Math.round(stats.position.y),
            z: Math.round(stats.position.z)
        };
    }
    if (stats.task) botStatus.task = stats.task;
}

// Update basic bot status
function updateBotStatus(username, isConnected, host, port) {
    botStatus.isRunning = isConnected;
    botStatus.lastSeen = new Date().toISOString();
    if (username) botStatus.currentUsername = username;
    if (host) botStatus.serverHost = host;
    if (port) botStatus.serverPort = port;
}

// Add log entry (limited to last 20)
function addLog(message) {
    botStatus.logs.unshift({ time: new Date().toLocaleTimeString(), message });
    if (botStatus.logs.length > 20) botStatus.logs.pop();
}

// Parse POST body
function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                resolve({});
            }
        });
    });
}

const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = req.url;

    // API: Status
    if (url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        const uptimeMs = botStatus.isRunning ? (Date.now() - botStatus.uptime) : 0;
        const hours = Math.floor(uptimeMs / 3600000);
        const mins = Math.floor((uptimeMs % 3600000) / 60000);
        const secs = Math.floor((uptimeMs % 60000) / 1000);
        const uptimeHtml = botStatus.isRunning ? `${hours}h ${mins}m ${secs}s` : "Offline";

        res.end(JSON.stringify({
            online: botStatus.isRunning,
            username: botStatus.currentUsername,
            server: `${botStatus.serverHost}:${botStatus.serverPort}`,
            uptime: uptimeHtml,
            health: botStatus.health,
            food: botStatus.food,
            position: botStatus.position,
            task: botStatus.task,
            logs: botStatus.logs
        }));
        return;
    }

    // API: Inventory
    if (url === '/api/inventory') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: botInventory }));
        return;
    }

    // API: Command execution
    if (url === '/api/command' && req.method === 'POST') {
        const body = await parseBody(req);
        const command = body.command;
        let result = { success: false, message: 'Unknown command' };

        if (!botInstance) {
            result = { success: false, message: 'Bot not connected' };
        } else {
            try {
                switch (command) {
                    case 'stop':
                        if (botInstance.pathfinder) {
                            botInstance.pathfinder.stop();
                        }
                        botInstance.clearControlStates();
                        result = { success: true, message: 'Bot stopped all actions' };
                        addLog('⏹️ Bot stopped via dashboard');
                        break;

                    case 'eat':
                        const food = botInstance.inventory.items().find(item =>
                            item.name.includes('apple') || item.name.includes('bread') ||
                            item.name.includes('cooked') || item.name.includes('steak') ||
                            item.name.includes('carrot') || item.name.includes('potato')
                        );
                        if (food) {
                            await botInstance.equip(food, 'hand');
                            botInstance.consume();
                            result = { success: true, message: `Eating ${food.name}` };
                            addLog(`🍎 Eating ${food.name}`);
                        } else {
                            result = { success: false, message: 'No food in inventory' };
                        }
                        break;

                    case 'sleep':
                        const bed = botInstance.findBlock({
                            matching: block => block.name.includes('bed'),
                            maxDistance: 16
                        });
                        if (bed) {
                            await botInstance.sleep(bed);
                            result = { success: true, message: 'Going to sleep' };
                            addLog('🛏️ Going to sleep');
                        } else {
                            result = { success: false, message: 'No bed nearby' };
                        }
                        break;

                    case 'jump':
                        botInstance.setControlState('jump', true);
                        setTimeout(() => botInstance.setControlState('jump', false), 300);
                        result = { success: true, message: 'Jumping!' };
                        break;

                    case 'respawn':
                        try {
                            botInstance.chat('/respawn');
                        } catch (e) {
                            botInstance.respawn();
                        }
                        result = { success: true, message: 'Respawning...' };
                        addLog('🔄 Respawning via dashboard');
                        break;

                    case 'home':
                        botInstance.chat('/home');
                        result = { success: true, message: 'Going home...' };
                        addLog('🏠 Going home via dashboard');
                        break;

                    default:
                        result = { success: false, message: `Unknown command: ${command}` };
                }
            } catch (error) {
                result = { success: false, message: error.message };
            }
        }

        commandHistory.unshift({ command, result: result.message, time: new Date().toLocaleTimeString() });
        if (commandHistory.length > 50) commandHistory.pop();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: Send chat message
    if (url === '/api/chat' && req.method === 'POST') {
        const body = await parseBody(req);
        const message = body.message;

        if (!botInstance) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Bot not connected' }));
            return;
        }

        try {
            botInstance.chat(message);
            addLog(`💬 Sent: ${message}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Message sent' }));
        } catch (error) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: error.message }));
        }
        return;
    }

    // API: Command history
    if (url === '/api/history') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ history: commandHistory }));
        return;
    }

    // API: Nearby entities (for map view)
    if (url === '/api/entities') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        let dimension = 'overworld';
        let yaw = 0;
        if (botInstance && botInstance.entity) {
            if (botInstance.game && botInstance.game.dimension) {
                dimension = botInstance.game.dimension;
            }
            yaw = botInstance.entity.yaw || 0;
        }
        res.end(JSON.stringify({
            players: nearbyEntities.players,
            mobs: nearbyEntities.mobs,
            dimension: dimension,
            yaw: yaw
        }));
        return;
    }

    // API: Chat history
    if (url === '/api/chat-history') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages: chatHistory }));
        return;
    }

    // API: Get configuration
    if (url === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(configOptions));
        return;
    }

    // API: Update configuration
    if (url === '/api/config' && req.method === 'POST') {
        const body = await parseBody(req);
        let result = { success: true, message: 'Configuration updated' };

        try {
            if (body.randomBehaviors !== undefined) {
                configOptions.randomBehaviors = body.randomBehaviors;
                if (global.botState) {
                    global.botState.randomBehaviorsEnabled = body.randomBehaviors;
                }
                addLog(`⚙️ Random behaviors: ${body.randomBehaviors ? 'ON' : 'OFF'}`);
            }
            if (body.autoEat !== undefined) {
                configOptions.autoEat = body.autoEat;
                addLog(`⚙️ Auto-eat: ${body.autoEat ? 'ON' : 'OFF'}`);
            }
            if (body.autoTpaAccept !== undefined) {
                configOptions.autoTpaAccept = body.autoTpaAccept;
                addLog(`⚙️ Auto TPA accept: ${body.autoTpaAccept ? 'ON' : 'OFF'}`);
            }
            if (body.creativeMode !== undefined) {
                configOptions.creativeMode = body.creativeMode;
                if (global.botState) {
                    global.botState.isCreativeMode = body.creativeMode;
                }
                addLog(`⚙️ Creative mode: ${body.creativeMode ? 'ON' : 'OFF'}`);
            }
        } catch (error) {
            result = { success: false, message: error.message };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: Movement controls
    if (url === '/api/movement' && req.method === 'POST') {
        const body = await parseBody(req);
        const direction = body.direction;
        let result = { success: false, message: 'Unknown direction' };

        if (!botInstance) {
            result = { success: false, message: 'Bot not connected' };
        } else {
            try {
                // Clear all movement states first
                botInstance.clearControlStates();

                switch (direction) {
                    case 'forward':
                        botInstance.setControlState('forward', true);
                        setTimeout(() => botInstance.setControlState('forward', false), 500);
                        result = { success: true, message: 'Moving forward' };
                        break;
                    case 'back':
                        botInstance.setControlState('back', true);
                        setTimeout(() => botInstance.setControlState('back', false), 500);
                        result = { success: true, message: 'Moving backward' };
                        break;
                    case 'left':
                        botInstance.setControlState('left', true);
                        setTimeout(() => botInstance.setControlState('left', false), 500);
                        result = { success: true, message: 'Moving left' };
                        break;
                    case 'right':
                        botInstance.setControlState('right', true);
                        setTimeout(() => botInstance.setControlState('right', false), 500);
                        result = { success: true, message: 'Moving right' };
                        break;
                    case 'jump':
                        botInstance.setControlState('jump', true);
                        setTimeout(() => botInstance.setControlState('jump', false), 300);
                        result = { success: true, message: 'Jumping' };
                        break;
                    case 'sneak':
                        const currentSneak = botInstance.getControlState ? botInstance.getControlState('sneak') : false;
                        botInstance.setControlState('sneak', !currentSneak);
                        result = { success: true, message: currentSneak ? 'Stopped sneaking' : 'Sneaking' };
                        break;
                    case 'stop':
                        result = { success: true, message: 'Stopped' };
                        break;
                    default:
                        result = { success: false, message: `Unknown direction: ${direction}` };
                }
            } catch (error) {
                result = { success: false, message: error.message };
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: Drop item
    if (url === '/api/drop-item' && req.method === 'POST') {
        const body = await parseBody(req);
        let result = { success: false, message: 'Failed to drop item' };

        if (!botInstance) {
            result = { success: false, message: 'Bot not connected' };
        } else {
            try {
                const item = botInstance.inventory.items().find(i => i.slot === body.slot);
                if (item) {
                    await botInstance.tossStack(item);
                    result = { success: true, message: `Dropped ${item.count}x ${item.displayName}` };
                    addLog(`🗑️ Dropped ${item.count}x ${item.displayName}`);
                } else {
                    result = { success: false, message: 'Item not found in slot' };
                }
            } catch (error) {
                result = { success: false, message: error.message };
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: Equip item
    if (url === '/api/equip-item' && req.method === 'POST') {
        const body = await parseBody(req);
        let result = { success: false, message: 'Failed to equip item' };

        if (!botInstance) {
            result = { success: false, message: 'Bot not connected' };
        } else {
            try {
                const item = botInstance.inventory.items().find(i => i.slot === body.slot);
                if (item) {
                    const destination = body.destination || 'hand';
                    await botInstance.equip(item, destination);
                    result = { success: true, message: `Equipped ${item.displayName} to ${destination}` };
                    addLog(`🎒 Equipped ${item.displayName}`);
                } else {
                    result = { success: false, message: 'Item not found in slot' };
                }
            } catch (error) {
                result = { success: false, message: error.message };
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // UI: Dashboard
    if (url === '/dashboard' || url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getDashboardHTML());
        return;
    }

    // Health Check
    if (url === '/health') {
        res.writeHead(200);
        res.end('OK');
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

function getDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Command Center | Minecraft Bot</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg-dark: #050b14;
            --glass-bg: rgba(16, 23, 42, 0.65);
            --glass-border: rgba(255, 255, 255, 0.08);
            --neon-green: #00ff9d;
            --neon-blue: #00bcd4;
            --neon-red: #ff2a6d;
            --neon-orange: #ff9d00;
            --text-main: #e2e8f0;
            --text-dim: #94a3b8;
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; scrollbar-width: thin; scrollbar-color: var(--neon-blue) transparent; }
        
        body { 
            font-family: 'Rajdhani', sans-serif;
            background-color: var(--bg-dark);
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(0, 188, 212, 0.1) 0%, transparent 20%),
                radial-gradient(circle at 90% 80%, rgba(0, 255, 157, 0.08) 0%, transparent 20%),
                linear-gradient(rgba(5, 11, 20, 0.9), rgba(5, 11, 20, 0.9)),
                url('https://www.transparenttextures.com/patterns/cubes.png');
            color: var(--text-main);
            height: 100vh;
            overflow: hidden;
            display: flex;
        }

        /* Layout */
        .app-container {
            display: grid;
            grid-template-columns: 80px 1fr;
            width: 100%;
            height: 100%;
        }

        /* Sidebar */
        .sidebar {
            background: rgba(5, 11, 20, 0.8);
            border-right: 1px solid var(--glass-border);
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px 0;
            gap: 25px;
            backdrop-filter: blur(10px);
            z-index: 10;
        }

        .nav-item {
            width: 50px;
            height: 50px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-dim);
            font-size: 1.2rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            position: relative;
        }

        .nav-item:hover, .nav-item.active {
            color: var(--neon-blue);
            background: rgba(0, 188, 212, 0.1);
            box-shadow: 0 0 15px rgba(0, 188, 212, 0.2);
            transform: translateY(-2px);
        }

        .nav-item.active::before {
            content: '';
            position: absolute;
            left: -15px;
            height: 70%;
            width: 4px;
            background: var(--neon-blue);
            border-radius: 0 4px 4px 0;
            box-shadow: 0 0 10px var(--neon-blue);
        }

        /* Main Content */
        .main-content {
            padding: 30px;
            display: grid;
            grid-template-rows: auto 1fr auto;
            gap: 25px;
            overflow-y: auto;
            position: relative;
        }

        /* Header */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--glass-bg);
            padding: 20px 30px;
            border-radius: 16px;
            border: 1px solid var(--glass-border);
            backdrop-filter: blur(12px);
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .logo-icon {
            font-size: 1.8rem;
            color: var(--neon-blue);
            filter: drop-shadow(0 0 5px var(--neon-blue));
        }

        .app-title {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.8rem;
            font-weight: 700;
            background: linear-gradient(135deg, #fff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: 2px;
            text-transform: uppercase;
        }

        .status-container {
            display: flex;
            gap: 20px;
            align-items: center;
        }

        .status-badge {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid var(--glass-border);
            padding: 8px 16px;
            border-radius: 50px;
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9rem;
        }

        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--text-dim);
            box-shadow: 0 0 5px var(--text-dim);
            transition: all 0.3s ease;
        }

        .status-dot.online {
            background: var(--neon-green);
            box-shadow: 0 0 10px var(--neon-green), 0 0 20px var(--neon-green);
            animation: pulse 2s infinite;
        }

        .connection-time {
            font-family: 'JetBrains Mono', monospace;
            color: var(--neon-blue);
            font-weight: 700;
        }

        /* Dashboard Grid */
        .dashboard-grid {
            display: grid;
            grid-template-columns: 350px 1fr 300px;
            grid-template-rows: 1fr;
            gap: 25px;
            height: 100%;
        }

        /* Glass Panel */
        .glass-panel {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 25px;
            backdrop-filter: blur(12px);
            display: flex;
            flex-direction: column;
            gap: 20px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .glass-panel:hover {
            box-shadow: 0 10px 40px rgba(0, 188, 212, 0.1);
            border-color: rgba(0, 188, 212, 0.3);
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--glass-border);
            padding-bottom: 15px;
            margin-bottom: 5px;
        }

        .panel-title {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.2rem;
            color: var(--neon-blue);
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Vitals Section */
        .stat-card {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            padding: 15px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .stat-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-weight: 700;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .progress-container {
            height: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }

        .progress-bar {
            height: 100%;
            border-radius: 4px;
            width: 0%;
            transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }

        .progress-bar::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            transform: translateX(-100%);
            animation: shine 2s infinite;
        }

        .health .progress-bar { background: var(--neon-red); box-shadow: 0 0 10px var(--neon-red); }
        .food .progress-bar { background: var(--neon-orange); box-shadow: 0 0 10px var(--neon-orange); }
        .level .progress-bar { background: var(--neon-green); box-shadow: 0 0 10px var(--neon-green); }

        .stat-value { font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; }

        /* Live Preview */
        .live-preview-container {
            flex: 1;
            background: #000;
            border-radius: 12px;
            position: relative;
            overflow: hidden;
            border: 1px solid var(--neon-blue);
            box-shadow: inset 0 0 20px rgba(0, 188, 212, 0.2);
            min-height: 300px;
        }
        
        .placeholder-art {
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.7;
        }

        .overlay-grid {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: 
                linear-gradient(rgba(0, 188, 212, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 188, 212, 0.1) 1px, transparent 1px);
            background-size: 40px 40px;
            pointer-events: none;
        }

        .live-tag {
            position: absolute;
            top: 15px; left: 15px;
            background: rgba(239, 68, 68, 0.9);
            color: white;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 800;
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
        }

        /* Quick Actions */
        .action-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }

        .action-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--text-main);
            padding: 15px;
            border-radius: 12px;
            cursor: pointer;
            font-family: 'Rajdhani', sans-serif;
            font-weight: 700;
            font-size: 1rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            transition: all 0.2s ease;
        }

        .action-btn i { font-size: 1.5rem; }

        .action-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: var(--neon-blue);
            color: var(--neon-blue);
            transform: translateY(-3px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }

        .action-btn.danger:hover {
            border-color: var(--neon-red);
            color: var(--neon-red);
        }

        /* Custom Scrollbar for Logs */
        .logs-container {
            flex: 1;
            overflow-y: auto;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
            background: rgba(0, 0, 0, 0.5);
            padding: 15px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .log-entry {
            margin-bottom: 6px;
            line-height: 1.4;
            display: flex;
            gap: 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            padding-bottom: 4px;
        }
        
        .log-time { color: var(--text-dim); min-width: 65px; }
        .log-msg { color: var(--text-main); word-break: break-all; }

        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @keyframes shine { 100% { transform: translateX(100%); } }

        /* Responsive */
        @media (max-width: 1200px) {
            .dashboard-grid { grid-template-columns: 300px 1fr; grid-template-rows: auto auto; }
            .sidebar { width: 60px; }
            .app-container { grid-template-columns: 60px 1fr; }
        }
        @media (max-width: 900px) {
            .dashboard-grid { grid-template-columns: 1fr; }
        }
        /* Toggle Switch */
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 26px;
            flex-shrink: 0;
        }
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(255,255,255,0.1);
            transition: 0.3s;
            border-radius: 26px;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 20px;
            width: 20px;
            left: 3px;
            bottom: 2px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
        }
        .toggle-switch input:checked + .toggle-slider {
            background-color: var(--neon-green);
            box-shadow: 0 0 10px var(--neon-green);
        }
        .toggle-switch input:checked + .toggle-slider:before {
            transform: translateX(22px);
        }

        /* Inventory Item */
        .inventory-item {
            position: relative;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .inventory-item:hover {
            transform: translateY(-3px);
            box-shadow: 0 5px 15px rgba(0, 188, 212, 0.3);
        }
        .inventory-item:hover .item-actions {
            opacity: 1;
        }
        .item-actions {
            position: absolute;
            bottom: 5px;
            left: 5px;
            right: 5px;
            display: flex;
            gap: 5px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .item-action-btn {
            flex: 1;
            padding: 4px;
            font-size: 0.7rem;
            background: rgba(0,0,0,0.7);
            border: 1px solid var(--glass-border);
            color: white;
            border-radius: 4px;
            cursor: pointer;
        }
        .item-action-btn:hover {
            background: var(--neon-blue);
        }
        .item-action-btn.danger:hover {
            background: var(--neon-red);
        }

        /* Player/Mob list item */
        .entity-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 10px;
            background: rgba(255,255,255,0.05);
            border-radius: 6px;
            margin-bottom: 5px;
        }
        .entity-item .name {
            font-weight: bold;
        }
        .entity-item .distance {
            font-family: 'JetBrains Mono';
            font-size: 0.8rem;
            color: var(--text-dim);
        }
    </style>
</head>
<body>
    <div class="app-container">
        <!-- Sidebar -->
        <div class="sidebar">
            <div class="nav-item active" data-view="dashboard" title="Dashboard"><i class="fas fa-home"></i></div>
            <div class="nav-item" data-view="map" title="Map"><i class="fas fa-globe-americas"></i></div>
            <div class="nav-item" data-view="inventory" title="Inventory"><i class="fas fa-box-open"></i></div>
            <div class="nav-item" data-view="config" title="Configuration"><i class="fas fa-cog"></i></div>
            <div class="nav-item" data-view="terminal" title="Terminal"><i class="fas fa-terminal"></i></div>
        </div>

        <!-- Main Content -->
        <div class="main-content">
            <!-- Header -->
            <div class="header">
                <div class="brand">
                    <i class="fas fa-robot logo-icon"></i>
                    <div class="app-title">AI Command Center</div>
                </div>
                <div class="status-container">
                    <div class="status-badge">
                        <div id="status-dot" class="status-dot"></div>
                        <span id="status-text">DISCONNECTED</span>
                    </div>
                    <div class="status-badge" style="background: rgba(0, 188, 212, 0.1); border-color: rgba(0, 188, 212, 0.3);">
                        <i class="fas fa-clock" style="color: var(--neon-blue)"></i>
                        <span id="uptime" class="connection-time">00:00:00</span>
                    </div>
                    <div class="status-badge" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3);">
                        <i class="fas fa-server" style="color: var(--neon-green)"></i>
                        <span id="server-name">---</span>
                    </div>
                </div>
            </div>

            <!-- Dashboard Grid (default view) -->
            <div id="view-dashboard" class="view-panel active-view">
            <div class="dashboard-grid">
                
                <!-- Left Column: Vitals -->
                <div class="glass-panel">
                    <div class="panel-header">
                        <div class="panel-title"><i class="fas fa-heartbeat"></i> SYSTEM VITALS</div>
                    </div>
                    
                    <div class="stat-card health">
                        <div class="stat-header">
                            <span style="color: var(--neon-red)"><i class="fas fa-heart"></i> Health</span>
                            <span id="hp-text" class="stat-value">20/20</span>
                        </div>
                        <div class="progress-container">
                            <div id="hp-bar" class="progress-bar" style="width: 100%"></div>
                        </div>
                    </div>

                    <div class="stat-card food">
                        <div class="stat-header">
                            <span style="color: var(--neon-orange)"><i class="fas fa-drumstick-bite"></i> Hunger</span>
                            <span id="food-text" class="stat-value">20/20</span>
                        </div>
                        <div class="progress-container">
                            <div id="food-bar" class="progress-bar" style="width: 100%"></div>
                        </div>
                    </div>
                    
                    <div class="stat-card level">
                        <div class="stat-header">
                            <span style="color: var(--neon-green)"><i class="fas fa-star"></i> Current Task</span>
                        </div>
                        <div id="task-text" style="color: var(--neon-green); font-family: 'JetBrains Mono'; font-weight: bold;">IDLE</div>
                    </div>

                    <div class="panel-header" style="margin-top: 20px;">
                        <div class="panel-title"><i class="fas fa-map-marker-alt"></i> TELEMETRY</div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                        <div class="stat-card">
                            <div style="font-size: 0.8rem; color: var(--text-dim);">X</div>
                            <div id="pos-x" style="font-family: 'JetBrains Mono'; color: var(--neon-blue); font-weight: bold;">0</div>
                        </div>
                        <div class="stat-card">
                            <div style="font-size: 0.8rem; color: var(--text-dim);">Y</div>
                            <div id="pos-y" style="font-family: 'JetBrains Mono'; color: var(--neon-blue); font-weight: bold;">0</div>
                        </div>
                        <div class="stat-card">
                            <div style="font-size: 0.8rem; color: var(--text-dim);">Z</div>
                            <div id="pos-z" style="font-family: 'JetBrains Mono'; color: var(--neon-blue); font-weight: bold;">0</div>
                        </div>
                    </div>
                </div>

                <!-- Center Column: Live View -->
                <div class="glass-panel" style="overflow: visible;">
                    <div class="panel-header">
                        <div class="panel-title"><i class="fas fa-eye"></i> VISUAL UPLINK</div>
                        <div style="font-size: 0.8rem; color: var(--neon-red); font-weight: bold;">REC ●</div>
                    </div>
                    <div class="live-preview-container">
                        <div class="overlay-grid"></div>
                        <div class="live-tag"><div class="status-dot" style="background: white; animation: pulse 1s infinite;"></div> LIVE</div>
                        <!-- Placeholder for Bot Vision -->
                        <div style="width: 100%; height: 100%; background: linear-gradient(0deg, #1a2980 0%, #26d0ce 100%); display: flex; align-items: center; justify-content: center; flex-direction: column;">
                            <i class="fas fa-cube" style="font-size: 5rem; color: rgba(255,255,255,0.2); margin-bottom: 20px;"></i>
                            <div style="font-family: 'Orbitron'; color: rgba(255,255,255,0.5); letter-spacing: 2px;">NEURAL INTERFACE ACTIVE</div>
                        </div>
                    </div>
                    
                    <div class="panel-header" style="margin-top: 10px;">
                        <div class="panel-title"><i class="fas fa-list-alt"></i> SYSTEM LOGS</div>
                    </div>
                    <div id="logs" class="logs-container">
                        <div class="log-entry"><span class="log-time">System</span><span class="log-msg">Initializing dashboard interface...</span></div>
                    </div>
                </div>

                <!-- Right Column: Actions -->
                <div class="glass-panel">
                    <div class="panel-header">
                        <div class="panel-title"><i class="fas fa-gamepad"></i> QUICK ACTIONS</div>
                    </div>
                    <div class="action-grid">
                        <button class="action-btn" onclick="sendCommand('stop')">
                            <i class="fas fa-stop" style="color: var(--neon-red)"></i> Stop Bot
                        </button>
                        <button class="action-btn" onclick="sendCommand('eat')">
                            <i class="fas fa-utensils" style="color: var(--neon-orange)"></i> Eat Food
                        </button>
                        <button class="action-btn" onclick="sendCommand('sleep')">
                            <i class="fas fa-bed" style="color: var(--neon-blue)"></i> Sleep
                        </button>
                        <button class="action-btn" onclick="sendCommand('home')">
                            <i class="fas fa-home" style="color: var(--neon-green)"></i> Go Home
                        </button>
                        <button class="action-btn" onclick="sendCommand('jump')">
                            <i class="fas fa-arrow-up" style="color: var(--neon-blue)"></i> Jump
                        </button>
                        <button class="action-btn" onclick="sendCommand('respawn')">
                            <i class="fas fa-sync" style="color: var(--neon-orange)"></i> Respawn
                        </button>
                    </div>

                    <div class="panel-header" style="margin-top: 20px;">
                        <div class="panel-title"><i class="fas fa-user-astronaut"></i> ACTIVE PROFILE</div>
                    </div>
                    <div style="text-align: center; padding: 10px;">
                        <div style="width: 80px; height: 80px; background: var(--glass-border); border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center; position: relative;">
                            <i class="fas fa-user" style="font-size: 2rem; color: var(--text-dim);"></i>
                            <div style="position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; background: var(--neon-green); border-radius: 50%; border: 3px solid #050b14;"></div>
                        </div>
                        <h3 id="username" style="font-family: 'Orbitron'; margin-bottom: 5px;">Bot_Player</h3>
                        <p style="color: var(--text-dim); font-size: 0.9rem;">Artificial Intelligence Unit</p>
                    </div>
                </div>

            </div>
            </div><!-- End dashboard view -->

            <!-- Inventory View -->
            <div id="view-inventory" class="view-panel" style="display: none;">
                <div class="glass-panel" style="height: 100%;">
                    <div class="panel-header">
                        <div class="panel-title"><i class="fas fa-box-open"></i> INVENTORY</div>
                        <button class="action-btn" style="padding: 8px 15px;" onclick="refreshInventory()"><i class="fas fa-sync"></i> Refresh</button>
                    </div>
                    <div id="inventory-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; overflow-y: auto;">
                        <div style="color: var(--text-dim); text-align: center; grid-column: 1/-1; padding: 40px;">Loading inventory...</div>
                    </div>
                </div>
            </div>

            <!-- Map View -->
            <div id="view-map" class="view-panel" style="display: none;">
                <div class="glass-panel" style="height: 100%;">
                    <div class="panel-header">
                        <div class="panel-title"><i class="fas fa-globe-americas"></i> WORLD MAP</div>
                        <div id="dimension-badge" style="background: rgba(0, 188, 212, 0.2); padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; color: var(--neon-blue);">
                            <i class="fas fa-layer-group"></i> <span id="dimension-text">OVERWORLD</span>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 300px; gap: 20px; flex: 1; overflow: hidden;">
                        <!-- Left: Position & Controls -->
                        <div style="display: flex; flex-direction: column; gap: 20px;">
                            <!-- Position Display -->
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                                <div class="stat-card" style="text-align: center; padding: 20px;">
                                    <div style="color: var(--text-dim); margin-bottom: 5px;">X</div>
                                    <div id="map-x" style="font-family: 'JetBrains Mono'; font-size: 1.8rem; color: var(--neon-blue);">0</div>
                                </div>
                                <div class="stat-card" style="text-align: center; padding: 20px;">
                                    <div style="color: var(--text-dim); margin-bottom: 5px;">Y</div>
                                    <div id="map-y" style="font-family: 'JetBrains Mono'; font-size: 1.8rem; color: var(--neon-green);">0</div>
                                </div>
                                <div class="stat-card" style="text-align: center; padding: 20px;">
                                    <div style="color: var(--text-dim); margin-bottom: 5px;">Z</div>
                                    <div id="map-z" style="font-family: 'JetBrains Mono'; font-size: 1.8rem; color: var(--neon-orange);">0</div>
                                </div>
                            </div>
                            
                            <!-- Movement Controls -->
                            <div class="stat-card" style="padding: 20px;">
                                <div style="font-weight: bold; color: var(--neon-blue); margin-bottom: 15px;"><i class="fas fa-gamepad"></i> MOVEMENT CONTROLS</div>
                                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 200px; margin: 0 auto;">
                                    <div></div>
                                    <button class="action-btn" onclick="sendMovement('forward')" style="padding: 15px;">
                                        <i class="fas fa-arrow-up"></i> W
                                    </button>
                                    <div></div>
                                    <button class="action-btn" onclick="sendMovement('left')" style="padding: 15px;">
                                        <i class="fas fa-arrow-left"></i> A
                                    </button>
                                    <button class="action-btn" onclick="sendMovement('stop')" style="padding: 15px; background: rgba(255, 42, 109, 0.2);">
                                        <i class="fas fa-stop"></i>
                                    </button>
                                    <button class="action-btn" onclick="sendMovement('right')" style="padding: 15px;">
                                        <i class="fas fa-arrow-right"></i> D
                                    </button>
                                    <div></div>
                                    <button class="action-btn" onclick="sendMovement('back')" style="padding: 15px;">
                                        <i class="fas fa-arrow-down"></i> S
                                    </button>
                                    <div></div>
                                </div>
                                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                                    <button class="action-btn" onclick="sendMovement('jump')" style="padding: 10px 20px;">
                                        <i class="fas fa-level-up-alt"></i> Jump
                                    </button>
                                    <button class="action-btn" onclick="sendMovement('sneak')" style="padding: 10px 20px;">
                                        <i class="fas fa-user-ninja"></i> Sneak
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Right: Nearby Entities -->
                        <div class="stat-card" style="display: flex; flex-direction: column; overflow: hidden;">
                            <div style="font-weight: bold; color: var(--neon-green); margin-bottom: 10px;"><i class="fas fa-users"></i> NEARBY PLAYERS</div>
                            <div id="nearby-players" style="flex: 1; overflow-y: auto; font-size: 0.9rem;">
                                <div style="color: var(--text-dim); text-align: center; padding: 20px;">No players nearby</div>
                            </div>
                            <div style="font-weight: bold; color: var(--neon-red); margin: 15px 0 10px;"><i class="fas fa-skull"></i> NEARBY MOBS</div>
                            <div id="nearby-mobs" style="flex: 1; overflow-y: auto; font-size: 0.9rem;">
                                <div style="color: var(--text-dim); text-align: center; padding: 20px;">No hostile mobs nearby</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Terminal View -->
            <div id="view-terminal" class="view-panel" style="display: none;">
                <div class="glass-panel" style="height: 100%; display: flex; flex-direction: column;">
                    <div class="panel-header">
                        <div class="panel-title"><i class="fas fa-terminal"></i> COMMAND TERMINAL</div>
                    </div>
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <input id="chat-input" type="text" placeholder="Type a message or command..." 
                            style="flex: 1; background: rgba(0,0,0,0.5); border: 1px solid var(--glass-border); padding: 12px 15px; border-radius: 8px; color: white; font-family: 'JetBrains Mono';">
                        <button onclick="sendChat()" class="action-btn" style="padding: 12px 20px;"><i class="fas fa-paper-plane"></i> Send</button>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 10px;">Quick Commands:</div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">
                        <button onclick="sendQuickChat('/home')" class="action-btn" style="padding: 8px 12px; font-size: 0.8rem;">/home</button>
                        <button onclick="sendQuickChat('/spawn')" class="action-btn" style="padding: 8px 12px; font-size: 0.8rem;">/spawn</button>
                        <button onclick="sendQuickChat('/tpa')" class="action-btn" style="padding: 8px 12px; font-size: 0.8rem;">/tpa</button>
                        <button onclick="sendQuickChat('-bot stop')" class="action-btn" style="padding: 8px 12px; font-size: 0.8rem;">-bot stop</button>
                        <button onclick="sendQuickChat('-bot status')" class="action-btn" style="padding: 8px 12px; font-size: 0.8rem;">-bot status</button>
                    </div>
                    <div class="panel-header"><div class="panel-title"><i class="fas fa-history"></i> RECENT MESSAGES</div></div>
                    <div id="terminal-logs" class="logs-container" style="flex: 1;">
                        <div class="log-entry"><span class="log-time">System</span><span class="log-msg">Terminal ready. Type a message to send to chat.</span></div>
                    </div>
                </div>
            </div>

            <!-- Config View -->
            <div id="view-config" class="view-panel" style="display: none;">
                <div class="glass-panel" style="height: 100%; overflow-y: auto;">
                    <div class="panel-header">
                        <div class="panel-title"><i class="fas fa-cog"></i> CONFIGURATION</div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 20px;">
                        <div class="stat-card">
                            <div class="stat-header"><span>Bot Information</span></div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                                <div><span style="color: var(--text-dim);">Username:</span> <span id="cfg-username" style="color: var(--neon-blue);">-</span></div>
                                <div><span style="color: var(--text-dim);">Server:</span> <span id="cfg-server" style="color: var(--neon-green);">-</span></div>
                            </div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-header"><span><i class="fas fa-sliders-h"></i> Behavior Settings</span></div>
                            <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-weight: bold;">Random Behaviors</div>
                                        <div style="color: var(--text-dim); font-size: 0.85rem;">Bot will explore, mine, and craft automatically</div>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="toggle-random" onchange="updateConfig('randomBehaviors', this.checked)" checked>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-weight: bold;">Auto-Eat</div>
                                        <div style="color: var(--text-dim); font-size: 0.85rem;">Automatically eat when hungry</div>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="toggle-autoeat" onchange="updateConfig('autoEat', this.checked)" checked>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-weight: bold;">Auto-Accept TPA</div>
                                        <div style="color: var(--text-dim); font-size: 0.85rem;">Automatically accept teleport requests</div>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="toggle-tpa" onchange="updateConfig('autoTpaAccept', this.checked)" checked>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-weight: bold;">Creative Mode</div>
                                        <div style="color: var(--text-dim); font-size: 0.85rem;">Attempt to enable creative mode on spawn</div>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="toggle-creative" onchange="updateConfig('creativeMode', this.checked)" checked>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-header"><span>Quick Actions</span></div>
                            <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                                <button onclick="sendCommand('stop')" class="action-btn" style="padding: 10px 15px;"><i class="fas fa-stop"></i> Stop All</button>
                                <button onclick="sendCommand('respawn')" class="action-btn" style="padding: 10px 15px;"><i class="fas fa-sync"></i> Respawn</button>
                                <button onclick="sendCommand('home')" class="action-btn" style="padding: 10px 15px;"><i class="fas fa-home"></i> Go Home</button>
                            </div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-header"><span>About</span></div>
                            <div style="margin-top: 10px; color: var(--text-dim); font-size: 0.9rem;">
                                AI Minecraft Bot Dashboard v2.0<br>
                                Real-time bot monitoring and control.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div><!-- End main-content -->
    </div>

    <script>
        async function update() {
            try {
                const res = await fetch('/status');
                const data = await res.json();
                
                // Connection Status
                const dot = document.getElementById('status-dot');
                const text = document.getElementById('status-text');
                
                if(data.online) {
                    dot.classList.add('online');
                    text.innerText = 'ONLINE - CONNECTED';
                    text.style.color = 'var(--neon-green)';
                } else {
                    dot.classList.remove('online');
                    text.innerText = 'OFFLINE';
                    text.style.color = 'var(--neon-red)';
                }

                // Header Info
                document.getElementById('uptime').innerText = data.uptime || '00:00:00';
                document.getElementById('server-name').innerText = data.server || '---';
                document.getElementById('username').innerText = data.username || 'Offline';

                // Vitals
                const hp = data.health || 0;
                const fd = data.food || 0;
                
                document.getElementById('hp-text').innerText = Math.round(hp) + '/20';
                document.getElementById('hp-bar').style.width = (hp / 20 * 100) + '%';
                
                document.getElementById('food-text').innerText = Math.round(fd) + '/20';
                document.getElementById('food-bar').style.width = (fd / 20 * 100) + '%';
                
                document.getElementById('task-text').innerText = (data.task || 'IDLE').toUpperCase();

                // Position
                if(data.position) {
                    document.getElementById('pos-x').innerText = data.position.x;
                    document.getElementById('pos-y').innerText = data.position.y;
                    document.getElementById('pos-z').innerText = data.position.z;
                }

                // Logs
                if (data.logs && data.logs.length > 0) {
                    const logsContainer = document.getElementById('logs');
                    const logsHTML = data.logs.map(l => 
                        \`<div class="log-entry"><span class="log-time">\${l.time}</span><span class="log-msg">\${l.message}</span></div>\`
                    ).join('');
                    
                    // Only update if changed to prevent scroll jumping (simple check)
                    if (logsContainer.innerHTML !== logsHTML) {
                        logsContainer.innerHTML = logsHTML;
                    }
                }

            } catch(e) {
                console.error("Dashboard update error:", e);
            }
        }
        
        // Initial call and interval
        update();
        setInterval(update, 1000);

        // Sidebar Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                if (!view) return;

                // Update active nav
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                item.classList.add('active');

                // Show correct view
                document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');
                const panel = document.getElementById('view-' + view);
                if (panel) panel.style.display = 'block';

                // Trigger view-specific updates
                if (view === 'inventory') refreshInventory();
            });
        });

        // Send command to bot
        async function sendCommand(cmd) {
            try {
                const res = await fetch('/api/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: cmd })
                });
                const data = await res.json();
                showNotification(data.message, data.success ? 'success' : 'error');
            } catch (e) {
                showNotification('Failed to send command', 'error');
            }
        }

        // Send chat message
        async function sendChat() {
            const input = document.getElementById('chat-input');
            const msg = input.value.trim();
            if (!msg) return;

            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg })
                });
                const data = await res.json();
                if (data.success) {
                    input.value = '';
                    addTerminalLog('You', msg);
                }
                showNotification(data.message, data.success ? 'success' : 'error');
            } catch (e) {
                showNotification('Failed to send message', 'error');
            }
        }

        function sendQuickChat(msg) {
            document.getElementById('chat-input').value = msg;
            sendChat();
        }

        function addTerminalLog(sender, msg) {
            const container = document.getElementById('terminal-logs');
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.innerHTML = \`<span class="log-time">\${new Date().toLocaleTimeString()}</span><span class="log-msg"><b>\${sender}:</b> \${msg}</span>\`;
            container.insertBefore(entry, container.firstChild);
        }

        // Refresh inventory
        async function refreshInventory() {
            try {
                const res = await fetch('/api/inventory');
                const data = await res.json();
                const grid = document.getElementById('inventory-grid');

                if (!data.items || data.items.length === 0) {
                    grid.innerHTML = '<div style="color: var(--text-dim); text-align: center; grid-column: 1/-1; padding: 40px;"><i class="fas fa-box" style="font-size: 3rem; margin-bottom: 15px; display: block;"></i>Inventory is empty</div>';
                    return;
                }

                grid.innerHTML = data.items.map(item => \`
                    <div class="stat-card inventory-item" style="text-align: center; padding: 15px 15px 40px;">
                        <div style="font-size: 1.5rem; margin-bottom: 8px;">\${getItemEmoji(item.name)}</div>
                        <div style="font-weight: bold; color: var(--neon-blue); font-size: 0.85rem;">\${item.displayName || item.name}</div>
                        <div style="color: var(--neon-green); font-family: 'JetBrains Mono';">&times;\${item.count}</div>
                        <div class="item-actions">
                            <button class="item-action-btn" onclick="equipItem(\${item.slot})"><i class="fas fa-hand-paper"></i></button>
                            <button class="item-action-btn danger" onclick="dropItem(\${item.slot})"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                \`).join('');
            } catch (e) {
                console.error('Inventory fetch error:', e);
            }
        }

        function getItemEmoji(name) {
            if (name.includes('diamond')) return '💎';
            if (name.includes('iron')) return '🪨';
            if (name.includes('gold')) return '🥇';
            if (name.includes('coal')) return '⚫';
            if (name.includes('wood') || name.includes('log')) return '🪵';
            if (name.includes('apple')) return '🍎';
            if (name.includes('sword')) return '⚔️';
            if (name.includes('pickaxe')) return '⛏️';
            if (name.includes('axe')) return '🪓';
            if (name.includes('shovel')) return '🔧';
            if (name.includes('bread')) return '🍞';
            if (name.includes('steak') || name.includes('beef')) return '🥩';
            if (name.includes('torch')) return '🔥';
            if (name.includes('stone')) return '🪨';
            if (name.includes('dirt')) return '🟫';
            return '📦';
        }

        // Notification toast
        function showNotification(msg, type) {
            const toast = document.createElement('div');
            toast.style.cssText = \`
                position: fixed; bottom: 20px; right: 20px; padding: 15px 25px;
                background: \${type === 'success' ? 'rgba(0, 255, 157, 0.9)' : 'rgba(255, 42, 109, 0.9)'};
                color: white; border-radius: 8px; font-weight: bold; z-index: 1000;
                animation: slideIn 0.3s ease;
            \`;
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        // Handle enter key in chat
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChat();
        });

        // Movement controls
        async function sendMovement(direction) {
            try {
                const res = await fetch('/api/movement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ direction })
                });
                const data = await res.json();
                showNotification(data.message, data.success ? 'success' : 'error');
            } catch (e) {
                showNotification('Failed to send movement', 'error');
            }
        }

        // Config updates
        async function updateConfig(key, value) {
            try {
                const body = {};
                body[key] = value;
                const res = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                showNotification(data.message, data.success ? 'success' : 'error');
            } catch (e) {
                showNotification('Failed to update config', 'error');
            }
        }

        // Load config on page load
        async function loadConfig() {
            try {
                const res = await fetch('/api/config');
                const config = await res.json();
                document.getElementById('toggle-random').checked = config.randomBehaviors !== false;
                document.getElementById('toggle-autoeat').checked = config.autoEat !== false;
                document.getElementById('toggle-tpa').checked = config.autoTpaAccept !== false;
                document.getElementById('toggle-creative').checked = config.creativeMode !== false;
            } catch (e) {
                console.error('Failed to load config:', e);
            }
        }

        // Equip item
        async function equipItem(slot) {
            try {
                const res = await fetch('/api/equip-item', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slot, destination: 'hand' })
                });
                const data = await res.json();
                showNotification(data.message, data.success ? 'success' : 'error');
                if (data.success) refreshInventory();
            } catch (e) {
                showNotification('Failed to equip item', 'error');
            }
        }

        // Drop item
        async function dropItem(slot) {
            try {
                const res = await fetch('/api/drop-item', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slot })
                });
                const data = await res.json();
                showNotification(data.message, data.success ? 'success' : 'error');
                if (data.success) refreshInventory();
            } catch (e) {
                showNotification('Failed to drop item', 'error');
            }
        }

        // Update map view with entities
        async function updateMapView() {
            try {
                const statusRes = await fetch('/status');
                const statusData = await statusRes.json();
                
                // Update position
                if (statusData.position) {
                    document.getElementById('map-x').innerText = statusData.position.x;
                    document.getElementById('map-y').innerText = statusData.position.y;
                    document.getElementById('map-z').innerText = statusData.position.z;
                }

                // Update config view
                document.getElementById('cfg-username').innerText = statusData.username || '-';
                document.getElementById('cfg-server').innerText = statusData.server || '-';

                const entitiesRes = await fetch('/api/entities');
                const entitiesData = await entitiesRes.json();
                
                // Update dimension
                const dimText = document.getElementById('dimension-text');
                if (dimText) {
                    dimText.innerText = (entitiesData.dimension || 'overworld').toUpperCase().replace('_', ' ');
                }

                // Update nearby players
                const playersContainer = document.getElementById('nearby-players');
                if (playersContainer) {
                    if (entitiesData.players && entitiesData.players.length > 0) {
                        playersContainer.innerHTML = entitiesData.players.map(p => \`
                            <div class="entity-item">
                                <span class="name" style="color: var(--neon-green);"><i class="fas fa-user"></i> \${p.name}</span>
                                <span class="distance">\${p.distance}m</span>
                            </div>
                        \`).join('');
                    } else {
                        playersContainer.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 10px;">No players nearby</div>';
                    }
                }

                // Update nearby mobs
                const mobsContainer = document.getElementById('nearby-mobs');
                if (mobsContainer) {
                    if (entitiesData.mobs && entitiesData.mobs.length > 0) {
                        mobsContainer.innerHTML = entitiesData.mobs.map(m => \`
                            <div class="entity-item">
                                <span class="name" style="color: var(--neon-red);"><i class="fas fa-skull"></i> \${m.name}</span>
                                <span class="distance">\${m.distance}m</span>
                            </div>
                        \`).join('');
                    } else {
                        mobsContainer.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 10px;">No hostile mobs nearby</div>';
                    }
                }
            } catch (e) {
                console.error('Map update error:', e);
            }
        }

        // Update chat history in terminal
        async function updateChatHistory() {
            try {
                const res = await fetch('/api/chat-history');
                const data = await res.json();
                const container = document.getElementById('terminal-logs');
                
                if (data.messages && data.messages.length > 0) {
                    container.innerHTML = data.messages.map(m => \`
                        <div class="log-entry">
                            <span class="log-time">\${m.time}</span>
                            <span class="log-msg">\${m.message}</span>
                        </div>
                    \`).join('');
                }
            } catch (e) {
                console.error('Chat history error:', e);
            }
        }

        // Initialize and start update loops
        loadConfig();
        setInterval(updateMapView, 2000);
        setInterval(updateChatHistory, 3000);
    </script>
    <style>
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .view-panel { height: 100%; }
    </style>
</body>
</html>
    `;
}

function start() {
    server.listen(PORT, '0.0.0.0', () => {
        logger.info(`🌐 Premium Dashboard running on port ${PORT}`);
    });
}

module.exports = { start, updateBotStatus, updateStats, addLog, setBotInstance };