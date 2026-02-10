const mineflayer = require('mineflayer');
const EventEmitter = require('events');

const MovementBehavior = require('./behaviors/movement');
const BlockBreakingBehavior = require('./behaviors/blockBreaking');
const ChatBehavior = require('./behaviors/chat');
const AntiIdleBehavior = require('./behaviors/antiIdle');
const SimplePathfinding = require('./utils/pathfinding');
const logger = require('./utils/logger');
const config = require('./config');

class MinecraftBot extends EventEmitter {
    constructor(options) {
        super();

        this.options = options;
        this.bot = null;
        this.behaviors = {};
        this.pathfinding = null;
        this.isConnected = false;

        this.createBot();
    }

    createBot() {
        logger.info('Creating bot instance...');

        // Ensure connectTimeout is set to handle Render/Aternos delays
        const botOptions = {
            ...this.options,
            connectTimeout: this.options.connectTimeout || 60000
        };

        this.bot = mineflayer.createBot(botOptions);
        this.setupEventHandlers();
        this.setupBehaviors();
    }

    setupEventHandlers() {
        this.bot.on('login', () => {
            logger.info(`Bot ${this.bot.username} logged in to ${this.options.host}:${this.options.port}`);
            this.isConnected = true;
            this.emit('login');
        });

        this.bot.on('spawn', () => {
            logger.info(`Bot spawned at ${this.bot.entity.position}`);

            // Wait a moment for health/food to be properly set
            setTimeout(() => {
                logger.info(`Health: ${this.bot.health || 'N/A'}, Food: ${this.bot.food || 'N/A'}`);

                // Initialize pathfinding
                this.pathfinding = new SimplePathfinding(this.bot);

                this.emit('spawn');
            }, 1000);
        });

        this.bot.on('health', () => {
            logger.debug(`Health: ${this.bot.health}, Food: ${this.bot.food}`);

            // Handle low health
            if (this.bot.health < 6) {
                logger.warn('Low health detected, trying to find food or shelter');
                this.handleLowHealth();
            }
        });

        this.bot.on('death', () => {
            logger.warn('Bot died! Respawning...');
            this.cleanupBehaviors();

            // Respawn after a short delay
            setTimeout(() => {
                this.bot.respawn();
                this.setupBehaviors();
            }, 2000);
        });

        this.bot.on('kicked', (reason, loggedIn) => {
            logger.warn(`Bot was kicked: ${reason}`);
            this.isConnected = false;
            this.cleanupBehaviors();
            this.emit('kicked', reason);
        });

        this.bot.on('error', (err) => {
            logger.error(`Bot error: ${err.message}`);
            this.isConnected = false;
            this.cleanupBehaviors();
            this.emit('error', err);
        });

        this.bot.on('end', (reason) => {
            logger.info(`Bot connection ended: ${reason}`);
            this.isConnected = false;
            this.cleanupBehaviors();
            this.emit('end', reason);
        });

        // Handle chat messages
        this.bot.on('chat', (username, message) => {
            if (username === this.bot.username) return;
            logger.info(`<${username}> ${message}`);
        });

        // Handle whispers
        this.bot.on('whisper', (username, message) => {
            logger.info(`${username} whispers: ${message}`);
        });

        // Handle player join/leave
        this.bot.on('playerJoined', (player) => {
            logger.info(`${player.username} joined the game`);
        });

        this.bot.on('playerLeft', (player) => {
            logger.info(`${player.username} left the game`);
        });
    }

    setupBehaviors() {
        this.cleanupBehaviors();

        // Wait for spawn before setting up behaviors
        if (!this.bot.entity) {
            this.bot.once('spawn', () => {
                this.initializeBehaviors();
            });
        } else {
            this.initializeBehaviors();
        }
    }

    initializeBehaviors() {
        logger.info('Setting up bot behaviors...');

        try {
            this.behaviors.movement = new MovementBehavior(this.bot, config);
            this.behaviors.blockBreaking = new BlockBreakingBehavior(this.bot, config);
            this.behaviors.chat = new ChatBehavior(this.bot, config);
            this.behaviors.antiIdle = new AntiIdleBehavior(this.bot, config);

            logger.info('All behaviors initialized successfully');
        } catch (error) {
            logger.error(`Failed to initialize behaviors: ${error.message}`);
        }
    }

    handleLowHealth() {
        try {
            // Look for food in inventory
            const food = this.bot.inventory.items().find(item =>
                item.name.includes('bread') ||
                item.name.includes('apple') ||
                item.name.includes('carrot') ||
                item.name.includes('potato') ||
                item.name.includes('beef') ||
                item.name.includes('pork') ||
                item.name.includes('chicken')
            );

            if (food) {
                logger.info(`Eating ${food.name} to restore health`);
                this.bot.equip(food, 'hand').then(() => {
                    this.bot.consume();
                }).catch(err => {
                    logger.error(`Failed to eat food: ${err.message}`);
                });
            }

            // Try to find shelter or move to safer location
            this.findShelter();

        } catch (error) {
            logger.error(`Error handling low health: ${error.message}`);
        }
    }

    findShelter() {
        // Simple shelter finding - look for covered areas
        const position = this.bot.entity.position;

        for (let x = -5; x <= 5; x++) {
            for (let z = -5; z <= 5; z++) {
                const checkPos = position.offset(x, 0, z);
                const blockAbove = this.bot.blockAt(checkPos.offset(0, 2, 0));
                const blockBelow = this.bot.blockAt(checkPos.offset(0, -1, 0));

                if (blockAbove && blockAbove.name !== 'air' &&
                    blockBelow && blockBelow.name !== 'air') {
                    logger.info('Found potential shelter, moving there');
                    this.bot.pathfinder?.setGoal(new this.bot.pathfinder.goals.GoalBlock(checkPos.x, checkPos.y, checkPos.z));
                    break;
                }
            }
        }
    }

    cleanupBehaviors() {
        for (const [name, behavior] of Object.entries(this.behaviors)) {
            if (behavior && typeof behavior.cleanup === 'function') {
                try {
                    behavior.cleanup();
                } catch (error) {
                    logger.error(`Error cleaning up ${name} behavior: ${error.message}`);
                }
            }
        }
        this.behaviors = {};
    }

    // Public methods for external control
    chat(message) {
        if (this.isConnected && this.bot) {
            this.bot.chat(message);
        }
    }

    quit() {
        logger.info('Quitting bot...');
        this.cleanupBehaviors();
        if (this.bot) {
            this.bot.quit();
        }
    }

    // Proxy important bot properties and methods
    get username() {
        return this.bot ? this.bot.username : null;
    }

    get entity() {
        return this.bot ? this.bot.entity : null;
    }

    get health() {
        return this.bot ? this.bot.health : 0;
    }

    get food() {
        return this.bot ? this.bot.food : 0;
    }

    get inventory() {
        return this.bot ? this.bot.inventory : null;
    }

    get heldItem() {
        return this.bot ? this.bot.heldItem : null;
    }

    // Proxy bot methods
    setControlState(control, state) {
        if (this.bot) {
            this.bot.setControlState(control, state);
        }
    }

    look(yaw, pitch) {
        if (this.bot) {
            this.bot.look(yaw, pitch);
        }
    }

    async lookAt(position) {
        if (this.bot) {
            return this.bot.lookAt(position);
        }
    }

    blockAt(position) {
        return this.bot ? this.bot.blockAt(position) : null;
    }

    async dig(block) {
        if (this.bot) {
            return this.bot.dig(block);
        }
    }

    async equip(item, destination = 'hand') {
        if (this.bot) {
            return this.bot.equip(item, destination);
        }
    }
}

module.exports = MinecraftBot;
