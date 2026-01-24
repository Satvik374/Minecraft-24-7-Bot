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
    logs: []
};

// Update bot status
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
    if (botStatus.logs.length > 10) botStatus.logs.pop();
}

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    const url = req.url;

    // API: Status
    if (url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        const uptimeMs = botStatus.isRunning ? (Date.now() - botStatus.uptime) : 0;
        const uptimeHtml = botStatus.isRunning
            ? `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m ${Math.floor((uptimeMs % 60000) / 1000)}s`
            : "Offline";

        res.end(JSON.stringify({
            online: botStatus.isRunning,
            username: botStatus.currentUsername,
            server: `${botStatus.serverHost}:${botStatus.serverPort}`,
            uptime: uptimeHtml,
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
    <title>AI Bot Command Center</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --primary: #10b981;
            --danger: #ef4444;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --border: rgba(148, 163, 184, 0.1);
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body { 
            font-family: 'Inter', sans-serif; 
            background: var(--bg); 
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background-image: radial-gradient(circle at 10% 20%, rgba(16, 185, 129, 0.05) 0%, transparent 20%),
                              radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 20%);
        }

        .dashboard {
            width: 100%;
            max-width: 900px;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 6px 16px;
            border-radius: 9999px;
            font-size: 0.9rem;
            font-weight: 600;
            background: rgba(239, 68, 68, 0.1);
            color: var(--danger);
            border: 1px solid rgba(239, 68, 68, 0.2);
            transition: all 0.3s ease;
        }

        .status-badge.online {
            background: rgba(16, 185, 129, 0.1);
            color: var(--primary);
            border-color: rgba(16, 185, 129, 0.2);
            box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);
        }

        .pulse {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
            margin-right: 8px;
            animation: pulse 2s infinite;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            transition: transform 0.2s;
        }
        
        .card:hover { border-color: rgba(148, 163, 184, 0.3); }

        .card-label {
            color: var(--text-muted);
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 8px;
        }

        .card-value {
            font-size: 1.5rem;
            font-weight: 700;
        }

        .logs-container {
            background: #000;
            border-radius: 12px;
            padding: 20px;
            border: 1px solid var(--border);
            font-family: 'Consolas', monospace;
            font-size: 0.9rem;
            height: 200px;
            overflow-y: auto;
        }

        .log-entry {
            margin-bottom: 8px;
            color: var(--text-muted);
            border-bottom: 1px solid #1e293b;
            padding-bottom: 8px;
        }
        .log-time { color: #64748b; margin-right: 10px; font-size: 0.8em; }

        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
            100% { opacity: 1; transform: scale(1); }
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>AI BOT DASHBOARD</h1>
            <div id="status-badge" class="status-badge">
                <div class="pulse"></div>
                <span id="status-text">OFFLINE</span>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-label">Logged In As</div>
                <div class="card-value" id="username">---</div>
            </div>
            <div class="card">
                <div class="card-label">Target Server</div>
                <div class="card-value" id="server">---</div>
            </div>
            <div class="card">
                <div class="card-label">Current Uptime</div>
                <div class="card-value" id="uptime">0h 0m 0s</div>
            </div>
        </div>

        <div class="card">
            <div class="card-label">Activity Logs</div>
            <div class="logs-container" id="logs">
                <div class="log-entry">Waiting for connection...</div>
            </div>
        </div>
    </div>

    <script>
        async function fetchStatus() {
            try {
                const res = await fetch('/status');
                const data = await res.json();
                updateUI(data);
            } catch (e) {
                console.error("Connection lost");
            }
        }

        function updateUI(data) {
            // Status Badge
            const badge = document.getElementById('status-badge');
            const text = document.getElementById('status-text');
            if (data.online) {
                badge.classList.add('online');
                text.textContent = 'SYSTEM ONLINE';
            } else {
                badge.classList.remove('online');
                text.textContent = 'SYSTEM OFFLINE';
            }

            // Cards
            document.getElementById('username').textContent = data.username;
            document.getElementById('server').textContent = data.server;
            document.getElementById('uptime').textContent = data.uptime;

            // Logs
            const logsDiv = document.getElementById('logs');
            logsDiv.innerHTML = data.logs.map(l => 
                \`<div class="log-entry"><span class="log-time">\${l.time}</span> \${l.message}</div>\`
            ).join('');
        }

        // Poll every 1 second
        setInterval(fetchStatus, 1000);
        fetchStatus();
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

module.exports = { start, updateBotStatus, addLog };