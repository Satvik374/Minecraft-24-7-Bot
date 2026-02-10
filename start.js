#!/usr/bin/env node

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

console.log('='.repeat(60));
console.log('🤖 Minecraft 24/7 Bot');
console.log('='.repeat(60));

console.log('\nUsage:');
console.log('  node start.js <host> <port> <username>');
console.log('  node start.js');
console.log('\nEnvironment Variables:');
console.log('  MINECRAFT_HOST     - Server host (default: localhost)');
console.log('  MINECRAFT_PORT     - Server port (default: 25565)');
console.log('  MINECRAFT_USERNAME - Bot username (default: AutoBot)');
console.log('  LOG_LEVEL         - Logging level (default: info)');

console.log('\nExamples:');
console.log('  node start.js hypixel.net 25565 MyBot');
console.log('  MINECRAFT_HOST=play.mineville.org node start.js');
console.log('');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    process.exit(0);
}

const serverHost = args[0] || process.env.MINECRAFT_HOST || config.defaultServer.host;
const serverPort = parseInt(args[1]) || parseInt(process.env.MINECRAFT_PORT) || config.defaultServer.port;
const username = args[2] || process.env.MINECRAFT_USERNAME || config.bot.username;

// Validate inputs
if (!serverHost) {
    logger.error('Server host is required');
    process.exit(1);
}

if (isNaN(serverPort) || serverPort < 1 || serverPort > 65535) {
    logger.error('Invalid port number');
    process.exit(1);
}

if (!username || username.length < 3 || username.length > 16) {
    logger.error('Username must be between 3 and 16 characters');
    process.exit(1);
}

console.log(`🎯 Target Server: ${serverHost}:${serverPort}`);
console.log(`👤 Bot Username: ${username}`);
console.log(`📝 Log Level: ${process.env.LOG_LEVEL || 'info'}`);
console.log('');

logger.info('Starting Minecraft bot...');
logger.info(`Connecting to ${serverHost}:${serverPort} as ${username}`);

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
        logger.info(`✅ Bot logged in successfully!`);
        logger.info(`🌍 Connected to ${serverHost}:${serverPort}`);
        reconnectAttempts = 0;

        console.log('');
        console.log('🤖 Bot is now active and running 24/7!');
        console.log('📊 Monitoring bot activity in logs...');
        console.log('');
        console.log('Press Ctrl+C to stop the bot');
        console.log('='.repeat(60));
    });

    bot.on('error', (err) => {
        logger.error(`❌ Bot error: ${err.message}`);
        scheduleReconnect();
    });

    bot.on('end', (reason) => {
        logger.warn(`🔌 Bot disconnected: ${reason}`);
        scheduleReconnect();
    });

    bot.on('kicked', (reason) => {
        logger.warn(`👢 Bot was kicked: ${reason}`);
        scheduleReconnect();
    });

    return bot;
}

function scheduleReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        logger.error(`💀 Max reconnection attempts (${maxReconnectAttempts}) reached. Exiting.`);
        console.log('\n❌ Bot failed to maintain connection. Please check server details and try again.');
        process.exit(1);
    }

    reconnectAttempts++;
    const delay = Math.min(config.connection.reconnectDelay * reconnectAttempts, config.connection.maxReconnectDelay);

    logger.info(`🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);

    setTimeout(() => {
        try {
            if (bot) {
                bot.quit();
                bot = null;
            }
            createBot();
        } catch (error) {
            logger.error(`Error during reconnection: ${error.message}`);
        }
    }, delay);
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n');
    logger.info('🛑 Received shutdown signal...');
    console.log('Shutting down bot gracefully...');

    if (bot) {
        bot.quit();
    }

    setTimeout(() => {
        console.log('✅ Bot shutdown complete. Goodbye!');
        process.exit(0);
    }, 1000);
});

process.on('SIGTERM', () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully...');
    if (bot) {
        bot.quit();
    }
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught exception:', error);
    if (bot) {
        bot.quit();
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
});

// Display startup banner and start the bot
console.log('🚀 Initializing bot...');
createBot();
