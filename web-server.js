#!/usr/bin/env node

const http = require('http');
const logger = require('./utils/logger');

// Web server config
const PORT = process.env.PORT || 5000;
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

// Add log entry (limited to last 10)
function addLog(message) {
    botStatus.logs.unshift({ time: new Date().toLocaleTimeString(), message });
    if (botStatus.logs.length > 20) botStatus.logs.pop(); // Increased log size
}

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    const url = req.url;

    // API: Status
    if (url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        const uptimeMs = botStatus.isRunning ? (Date.now() - botStatus.uptime) : 0;
        // Format uptime
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
    <title>AI Bot Command Center V2</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0f172a; --card-bg: rgba(30, 41, 59, 0.6); --primary: #10b981; --danger: #ef4444; --warning: #f59e0b;
            --text-main: #f8fafc; --text-muted: #94a3b8; --border: rgba(148, 163, 184, 0.1);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text-main);
            min-height: 100vh; display: flex; justify-content: center; padding: 20px;
            background-image: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.08) 0%, transparent 40%);
        }
        .dashboard { width: 100%; max-width: 1000px; display: grid; gap: 20px; }
        
        /* Header */
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .title { font-size: 1.8rem; font-weight: 800; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .status-badge { 
            padding: 6px 14px; border-radius: 99px; font-size: 0.85rem; font-weight: 700;
            background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2);
            display: flex; align-items: center; gap: 8px;
        }
        .status-badge.online { background: rgba(16, 185, 129, 0.1); color: var(--primary); border-color: rgba(16, 185, 129, 0.2); }
        .pulse { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 2s infinite; }
        
        /* Grid Layout */
        .grid-main { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { 
            background: var(--card-bg); backdrop-filter: blur(12px); border: 1px solid var(--border);
            border-radius: 16px; padding: 24px; position: relative; overflow: hidden;
        }
        
        /* Specific Cards */
        .stat-row { display: flex; justify-content: space-between; margin-bottom: 15px; }
        .stat-label { color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .stat-value { font-size: 1.2rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .stat-value.large { font-size: 1.8rem; }
        
        /* Location */
        .coords { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; margin-top: 10px; }
        .coord-box { background: rgba(0,0,0,0.2); padding: 8px; border-radius: 8px; }
        .coord-val { font-family: 'JetBrains Mono'; font-weight: 700; font-size: 1.2rem; color: var(--primary); }
        .coord-lbl { font-size: 0.7rem; color: var(--text-muted); margin-top: 4px; }

        /* Bars */
        .bar-container { margin-top: 15px; }
        .bar-label { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem; font-weight: 600; }
        .progress-bg { height: 10px; background: rgba(255,255,255,0.05); border-radius: 5px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 5px; transition: width 0.5s ease; width: 0%; }
        .health-bar { background: var(--danger); }
        .food-bar { background: var(--warning); }
        
        /* Task & Logs */
        .task-badge { 
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2));
            color: #2dd4bf; border: 1px solid rgba(45, 212, 191, 0.3);
            padding: 8px 16px; border-radius: 8px; font-weight: 600; text-align: center; margin-top: 5px;
        }

        .logs { height: 250px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
        .log-entry { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-muted); }
        .log-time { color: #64748b; margin-right: 8px; }
        
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <div class="title">AI COMMAND CENTER</div>
            <div id="status-badge" class="status-badge">
                <div class="pulse"></div><span id="status-text">DISCONNECTED</span>
            </div>
        </div>

        <div class="grid-main">
            <!-- Vitals Column -->
            <div class="card">
                <div class="stat-label">System Vitals</div>
                <div class="bar-container">
                    <div class="bar-label"><span>Health</span><span id="hp-val">20/20</span></div>
                    <div class="progress-bg"><div id="hp-bar" class="progress-fill health-bar" style="width: 100%"></div></div>
                </div>
                <div class="bar-container">
                    <div class="bar-label"><span>Hunger</span><span id="food-val">20/20</span></div>
                    <div class="progress-bg"><div id="food-bar" class="progress-fill food-bar" style="width: 100%"></div></div>
                </div>
                <div style="margin-top: 20px;">
                    <div class="stat-label">Current Task</div>
                    <div id="current-task" class="task-badge">Idle</div>
                </div>
            </div>

            <!-- Stats Column -->
            <div class="card">
                <div class="stat-row">
                    <div><div class="stat-label">Username</div><div id="username" class="stat-value">---</div></div>
                    <div style="text-align: right"><div class="stat-label">Server</div><div id="server" class="stat-value">---</div></div>
                </div>
                <div class="stat-row" style="margin-top: 20px;">
                   <div><div class="stat-label">Uptime</div><div id="uptime" class="stat-value large">00m 00s</div></div>
                </div>
                
                <div style="margin-top: 15px;">
                    <div class="stat-label" style="text-align: center">Live Position</div>
                    <div class="coords">
                        <div class="coord-box"><div id="pos-x" class="coord-val">0</div><div class="coord-lbl">X</div></div>
                        <div class="coord-box"><div id="pos-y" class="coord-val">0</div><div class="coord-lbl">Y</div></div>
                        <div class="coord-box"><div id="pos-z" class="coord-val">0</div><div class="coord-lbl">Z</div></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Logs -->
        <div class="card">
            <div class="stat-label" style="margin-bottom: 10px;">Activity Log</div>
            <div id="logs" class="logs">
                <div class="log-entry">Waiting for connection...</div>
            </div>
        </div>
    </div>

    <script>
        async function update() {
            try {
                const res = await fetch('/status');
                const data = await res.json();
                
                // Status
                const badge = document.getElementById('status-badge');
                if(data.online) { badge.classList.add('online'); document.getElementById('status-text').innerText = 'OPERATIONAL'; }
                else { badge.classList.remove('online'); document.getElementById('status-text').innerText = 'OFFLINE'; }

                // Info
                document.getElementById('username').innerText = data.username;
                document.getElementById('server').innerText = data.server;
                document.getElementById('uptime').innerText = data.uptime;
                document.getElementById('current-task').innerText = data.task || 'Idle';

                // Vitals
                const hp = data.health || 0;
                const fd = data.food || 0;
                document.getElementById('hp-val').innerText = Math.round(hp) + '/20';
                document.getElementById('hp-bar').style.width = (hp / 20 * 100) + '%';
                document.getElementById('food-val').innerText = Math.round(fd) + '/20';
                document.getElementById('food-bar').style.width = (fd / 20 * 100) + '%';

                // Pos
                if(data.position) {
                    document.getElementById('pos-x').innerText = data.position.x;
                    document.getElementById('pos-y').innerText = data.position.y;
                    document.getElementById('pos-z').innerText = data.position.z;
                }

                // Logs
                const logsHTML = data.logs.map(l => 
                    \`<div class="log-entry"><span class="log-time">\${l.time}</span>\${l.message}</div>\`
                ).join('');
                document.getElementById('logs').innerHTML = logsHTML;

            } catch(e) {}
        }
        setInterval(update, 1000);
        update();
    </script>
</body>
</html>
    `;
}

function start() {
    server.listen(PORT, '0.0.0.0', () => {
        logger.info(`🌐 Premium Dashboard running on port ${PORT}`);
    });
}

module.exports = { start, updateBotStatus, updateStats, addLog };