/**
 * Home Manager Ability
 * Handles setting home, going home, and depositing items
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class HomeManager {
    constructor(bot, pathfinder) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.homePath = path.join(__dirname, '../data/home.json');
        this.homeLocation = this.loadHome();
    }

    /**
     * Load home location from disk
     */
    loadHome() {
        try {
            if (fs.existsSync(this.homePath)) {
                const data = fs.readFileSync(this.homePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.error(`Failed to load home: ${error.message}`);
        }
        return null;
    }

    /**
     * Save home location to disk
     */
    saveHome(location) {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.homePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(this.homePath, JSON.stringify(location, null, 2));
            this.homeLocation = location;
            return true;
        } catch (error) {
            logger.error(`Failed to save home: ${error.message}`);
            return false;
        }
    }

    /**
     * Execute commands
     */
    async execute(command) {
        if (command.action === 'sethome') {
            const pos = this.bot.entity.position;
            const location = {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                dimension: this.bot.game.dimension
            };

            if (this.saveHome(location)) {
                this.sendChat(`Home set to ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`);
            } else {
                this.sendChat('Failed to save home location');
            }
            return;
        }

        if (command.action === 'home') {
            if (!this.homeLocation) {
                this.sendChat('No home set! Use -bot sethome first.');
                return;
            }

            if (command.target === 'deposit') {
                await this.goHomeAndDeposit();
            } else {
                await this.goHome();
            }
        }
    }

    /**
     * Go to home location
     */
    async goHome() {
        if (!this.homeLocation) {
            return false;
        }

        const { x, y, z } = this.homeLocation;
        this.sendChat(`Going home (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})...`);

        if (this.pathfinder && this.bot.pathfinder) {
            try {
                const { goals } = require('mineflayer-pathfinder');
                const goal = new goals.GoalNear(x, y, z, 1);
                await this.bot.pathfinder.goto(goal);
                this.sendChat('Welcome home!');
                return true;
            } catch (error) {
                this.sendChat(`Cannot reach home: ${error.message}`);
                return false;
            }
        } else {
            // Basic fallback
            await this.bot.lookAt({ x, y, z });
            this.bot.setControlState('forward', true);
            // ... (implement simple move if needed, but pathfinder is standard now)
            return false;
        }
    }

    /**
     * Go home and deposit items
     */
    async goHomeAndDeposit() {
        if (!await this.goHome()) return;

        // Look for chests nearby
        const chestBlock = this.bot.findBlock({
            matching: this.bot.registry.blocksByName['chest'].id,
            maxDistance: 5
        });

        if (!chestBlock) {
            this.sendChat('No chest found at home!');
            return;
        }

        await this.depositToChest(chestBlock);
    }

    /**
     * Find nearby chest and deposit non-essential items
     */
    async findNearbyChestAndDeposit(radius = 50, extraKeepItems = []) {
        logger.info(`Searching for chest within ${radius}m to deposit items...`);

        const mcData = require('minecraft-data')(this.bot.version);
        const chestId = mcData.blocksByName['chest']?.id;

        if (!chestId) return false;

        // Find nearest chest
        const chestBlock = this.bot.findBlock({
            matching: chestId,
            maxDistance: radius
        });

        if (!chestBlock) {
            this.sendChat('Inventory full and no chests found nearby!');
            return false;
        }

        this.sendChat(`Found chest at ${chestBlock.position}. Depositing items...`);

        // Go to chest
        if (this.pathfinder && this.bot.pathfinder) {
            try {
                const { goals } = require('mineflayer-pathfinder');
                // Go next to chest
                await this.bot.pathfinder.goto(new goals.GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 2));
            } catch (e) {
                this.sendChat('Cannot reach chest');
                return false;
            }
        } else {
            await this.bot.lookAt(chestBlock.position);
            this.bot.setControlState('forward', true);
            await new Promise(r => setTimeout(r, 2000));
            this.bot.setControlState('forward', false);
        }

        // Deposit with extra keep items
        await this.depositToChest(chestBlock, extraKeepItems);
        return true;
    }

    /**
     * Deposit non-essential items to chest
     */
    async depositToChest(chestBlock, extraKeepItems = []) {
        this.sendChat(' depositing items...');
        try {
            const chest = await this.bot.openChest(chestBlock);

            // Items to KEEP
            const defaultKeep = [
                'sword', 'pickaxe', 'axe', 'shovel', 'hoe',
                'helmet', 'chestplate', 'leggings', 'boots',
                'torch', 'food', 'bread', 'steak', 'cooked_beef'
            ];

            const keepItems = [...defaultKeep, ...extraKeepItems];

            const inventory = this.bot.inventory.items();

            for (const item of inventory) {
                const isKeep = keepItems.some(k => item.name.includes(k));
                if (!isKeep) {
                    try {
                        await chest.deposit(item.type, null, item.count);
                        logger.info(`Deposited ${item.name} x${item.count}`);
                    } catch (err) {
                        // Chest might be full
                        logger.debug(`Failed to deposit ${item.name}: ${err.message}`);
                    }
                }
            }

            await chest.close();
            this.sendChat('Deposit complete!');

        } catch (error) {
            logger.error(`Chest error: ${error.message}`);
            this.sendChat('Failed to access chest');
        }
    }

    /**
     * Send chat wrapper
     */
    sendChat(message) {
        try {
            this.bot.chat(message);
        } catch (e) {
            logger.debug(`Chat error: ${e.message}`);
        }
    }
}

module.exports = HomeManager;
