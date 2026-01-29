const mineflayer = require('mineflayer');

const options = {
    host: 'chiku99.aternos.me',
    port: 50044,
    username: 'DebugBot',
    version: '1.21.1', // Hardcoded version based on log info
    auth: 'offline'
};

console.log('Attempting to connect with options:', options);

const bot = mineflayer.createBot(options);

bot.on('login', () => {
    console.log('Logged in successfully!');
    setTimeout(() => {
        console.log('Quitting...');
        bot.quit();
        process.exit(0);
    }, 5000);
});

bot.on('error', (err) => {
    console.error('Bot error:', err);
});

bot.on('kicked', (reason) => {
    console.log('Bot kicked:', reason);
});

bot.on('end', (reason) => {
    console.log('Bot disconnected:', reason);
});
