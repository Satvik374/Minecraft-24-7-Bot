module.exports = {
    defaultServer: {
        host: 'chiku99.aternos.me',
        port: 50044
    },

    bot: {
        username: 'AutoBot',
        version: '1.20.1',
        auth: 'offline'
    },

    connection: {
        maxReconnectAttempts: 10,
        reconnectDelay: 5000,
        maxReconnectDelay: 60000,
        checkTimeoutInterval: 30000
    },

    behavior: {
        movement: {
            enabled: true,
            forwardMovementChance: 0.8,
            directionChangeInterval: { min: 5000, max: 15000 },
            stopMovementChance: 0.1,
            stopDuration: { min: 2000, max: 8000 }
        },

        blockBreaking: {
            enabled: true,
            breakChance: 0.15,
            checkInterval: 3000,
            maxReach: 4.5,
            preferredBlocks: ['dirt', 'grass_block', 'stone', 'cobblestone', 'oak_log', 'birch_log']
        },

        chat: {
            enabled: true,
            messageChance: 0.05,
            checkInterval: 30000,
            messages: [
                'hey there!',
                'how is everyone doing?',
                'nice server',
                'anyone want to build something?',
                'this is fun',
                'hello',
                'what are you all up to?',
                'cool builds around here',
                'thanks for the server',
                'having a great time'
            ]
        },

        antiIdle: {
            enabled: true,
            jumpInterval: { min: 60000, max: 120000 },
            lookAroundInterval: { min: 10000, max: 30000 },
            inventoryCheckInterval: { min: 45000, max: 90000 }
        }
    },

    safety: {
        avoidLava: true,
        avoidVoid: true,
        maxFallDistance: 3
    }
};
