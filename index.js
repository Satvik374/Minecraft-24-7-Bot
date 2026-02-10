const mineflayer = require('mineflayer');
const MinecraftBot = require('./bot');
const config = require('./config');
const logger = require('./utils/logger');
const http = require('http');

// Simple health check server for Render/UptimeRobot
const PORT = process.env.PORT || 10000;
const healthServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive!');
});

healthServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Health check server running on port ${PORT}`);
});

// Parse command line arguments
const args = process.argv.slice(2);
const serverHost = args[0] || process.env.MINECRAFT_HOST || config.defaultServer.host;
const serverPort = parseInt(args[1]) || parseInt(process.env.MINECRAFT_PORT) || config.defaultServer.port;
const username = args[2] || process.env.MINECRAFT_USERNAME || config.bot.username;

logger.info(`Starting Minecraft bot with config:`);
logger.info(`Server: ${serverHost}:${serverPort}`);
logger.info(`Username: ${username}`);

let bot = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = config.connection.maxReconnectAttempts;

function createBot() {
    const botOptions = {
        host: serverHost,
        port: serverPort,
        username: username,
        version: config.bot.version,
        auth: config.bot.auth,
        checkTimeoutInterval: config.connection.checkTimeoutInterval,
        keepAlive: true
    };

    logger.info('Creating new bot instance...');
    bot = new MinecraftBot(botOptions);

    bot.on('login', () => {
        logger.info(`Bot logged in successfully to ${serverHost}:${serverPort}`);
        reconnectAttempts = 0;
    });

    bot.on('error', (err) => {
        logger.error('Bot error:', err.message);
        scheduleReconnect();
    });

    bot.on('end', (reason) => {
        logger.warn('Bot disconnected:', reason);
        scheduleReconnect();
    });

    bot.on('kicked', (reason) => {
        logger.warn('Bot was kicked:', reason);
        scheduleReconnect();
    });

    return bot;
}

function scheduleReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        logger.error(`Max reconnection attempts (${maxReconnectAttempts}) reached. Exiting.`);
        process.exit(1);
    }

    reconnectAttempts++;
    const delay = Math.min(config.connection.reconnectDelay * reconnectAttempts, config.connection.maxReconnectDelay);

    logger.info(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);

    setTimeout(() => {
        if (bot) {
            bot.quit();
        }
        createBot();
    }, delay);
}

// Handle process termination
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    if (bot) {
        bot.quit();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    if (bot) {
        bot.quit();
    }
    process.exit(0);
});

// Start the bot
createBot();
