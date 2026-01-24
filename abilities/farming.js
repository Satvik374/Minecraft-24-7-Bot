/**
 * Farming Ability Module
 * Handles the -bot start farm command for auto-harvesting and replanting
 */

const logger = require('../utils/logger');

class FarmingAbility {
    constructor(bot, pathfinder, sleeper, homeManager) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.sleeper = sleeper; // Auto-sleep module
        this.homeManager = homeManager; // Auto-deposit module
        this.isActive = false;
        this.harvestCount = 0;
        this.farmLoop = null;
    }

    /**
     * Execute farming command
     * @param {object} command - Parsed command
     */
    async execute(command) {
        // Prevent multiple execution loops
        if (this.isLooping) {
            this.sendChat('Farming is already stopping/restarting...');
            this.isActive = false; // Signal stop
            // Wait for loop to exit
            while (this.isLooping) {
                await this.delay(100);
            }
        }

        this.isActive = true;
        this.isLooping = true; // Flag that loop is running
        this.harvestCount = 0;

        this.sendChat('Starting farm mode - harvesting wheat and replanting!');
        logger.info('Farming: Started');

        // Run farming loop
        try {
            while (this.isActive) {
                try {
                    // 0. AUTO SLEEP CHECK
                    if (this.sleeper && this.sleeper.isNight()) {
                        this.sendChat('Night time! Pausing farming to sleep...');
                        await this.sleeper.goToBedAndSleep();
                        this.sendChat('Morning! Resuming farming...');
                        await this.delay(1000);
                    }

                    // Check if inventory is full
                    if (this.isInventoryFull()) {
                        this.sendChat('Inventory full, storing items in chest...');
                        if (this.homeManager) {
                            await this.homeManager.findNearbyChestAndDeposit(50, ['wheat_seeds']);
                        } else {
                            await this.storeItemsInChest(); // Fallback to old method if no manager
                        }
                    }

                    // 1. HARVEST PHASE
                    if (!this.isActive) break;
                    // Try to find and harvest mature wheat
                    const harvested = await this.harvestWheat();

                    if (harvested) {
                        // If we found wheat, keep harvesting (don't collect yet, efficiency)
                        await this.delay(500);
                        continue;
                    }

                    // 2. COLLECT PHASE
                    if (!this.isActive) break;
                    // No mature wheat found? Time to clean up!
                    this.sendChat('No mature wheat found. Collecting dropped items...');
                    await this.collectDrops(this.bot.entity.position, 50); // Scan 50 blocks

                    // 3. WAIT PHASE
                    // After cleaning up, wait a bit for crops to grow
                    if (this.isActive) {
                        this.sendChat('Waiting for crops to grow...');
                        // Break wait into chunks to be responsive to stop
                        for (let i = 0; i < 10; i++) {
                            if (!this.isActive) break;
                            await this.delay(500);
                        }
                    }

                } catch (error) {
                    logger.debug(`Farming error: ${error.message}`);
                    await this.delay(2000);
                }
            }
        } finally {
            this.isLooping = false;
            this.isActive = false;
            this.sendChat(`Farming stopped. Harvested ${this.harvestCount} wheat.`);
            logger.info(`Farming: Stopped, harvested ${this.harvestCount}`);
        }
    }

    /**
     * Harvest fully grown wheat and replant
     */
    async harvestWheat() {
        const mcData = require('minecraft-data')(this.bot.version);
        const wheatId = mcData.blocksByName['wheat']?.id;

        if (!wheatId) return false;

        // Find wheat blocks - INCREASED RADIUS TO 50
        const wheatBlocks = this.bot.findBlocks({
            matching: wheatId,
            maxDistance: 50,
            count: 128 // Increased count limit
        });

        if (wheatBlocks.length === 0) {
            return false;
        }

        let harvestedAny = false;

        for (const blockPos of wheatBlocks) {
            if (!this.isActive) break;

            const block = this.bot.blockAt(blockPos);
            if (!block) continue;

            // Check if wheat is fully grown (age = 7)
            const state = block.getProperties ? block.getProperties() : {};
            // Debug the actual state to see why it fails
            // logger.debug(`Checking wheat at ${blockPos}: age=${state.age}`);

            const age = parseInt(state.age || '0');

            if (age < 7) continue; // Not fully grown

            try {
                // Navigate to wheat
                await this.navigateTo(blockPos);

                // Re-check block after navigation
                const currentBlock = this.bot.blockAt(blockPos);
                if (!currentBlock || currentBlock.name !== 'wheat') {
                    continue;
                }

                // Harvest (break) the wheat
                await this.bot.dig(currentBlock);
                this.harvestCount++;
                harvestedAny = true;

                // Wait a moment for drops to spawn/bounce
                await this.delay(250);

                // Collect drops - AGGRESSIVE COLLECTION
                // Look in wider radius because drops fly around
                await this.collectDrops(blockPos, 8);

                // Replant seeds
                await this.replantSeeds(blockPos);

            } catch (error) {
                logger.debug(`Failed to harvest wheat: ${error.message}`);
            }
        }

        return harvestedAny;
    }

    /**
     * Replant seeds at position
     */
    async replantSeeds(position) {
        try {
            // Find wheat seeds in inventory
            const seeds = this.bot.inventory.items().find(
                item => item.name === 'wheat_seeds'
            );

            if (!seeds) {
                logger.debug('No seeds to replant');
                return;
            }

            // Equip seeds
            await this.bot.equip(seeds, 'hand');

            // Get the farmland block below
            const farmlandPos = position.offset(0, -1, 0);
            const farmland = this.bot.blockAt(farmlandPos);

            if (farmland && farmland.name === 'farmland') {
                // Place seeds on farmland
                await this.bot.placeBlock(farmland, { x: 0, y: 1, z: 0 });
                logger.debug(`Replanted at ${position}`);
            }

        } catch (error) {
            logger.debug(`Failed to replant: ${error.message}`);
        }
    }

    /**
     * Navigate to a position
     */
    async navigateTo(position) {
        const distance = this.bot.entity.position.distanceTo(position);

        if (distance <= 4) {
            await this.bot.lookAt(position.offset(0.5, 0.5, 0.5));
            return;
        }

        // Use pathfinder
        if (this.pathfinder && this.pathfinder.goals && this.bot.pathfinder) {
            try {
                const goal = new this.pathfinder.goals.GoalNear(position.x, position.y, position.z, 3);
                await this.bot.pathfinder.goto(goal);
            } catch (error) {
                // Simple movement fallback
                await this.bot.lookAt(position);
                this.bot.setControlState('forward', true);
                await this.delay(1000);
                this.bot.setControlState('forward', false);
            }
        }
    }

    /**
     * Check if inventory is full
     */
    isInventoryFull() {
        const inventory = this.bot.inventory;
        const emptySlots = inventory.slots.filter(slot => slot === null).length;
        // Keep at least 3 empty slots
        return emptySlots <= 3;
    }

    /**
     * Store items in nearest chest
     */
    async storeItemsInChest() {
        const mcData = require('minecraft-data')(this.bot.version);
        const chestId = mcData.blocksByName['chest']?.id;

        if (!chestId) {
            this.sendChat('Cannot find chest block type');
            return;
        }

        // Find nearby chests
        const chests = this.bot.findBlocks({
            matching: chestId,
            maxDistance: 32,
            count: 10
        });

        if (chests.length === 0) {
            this.sendChat('No chests found nearby!');
            return;
        }

        for (const chestPos of chests) {
            if (!this.isActive) break;

            try {
                // Navigate to chest
                await this.navigateTo(chestPos);

                const chestBlock = this.bot.blockAt(chestPos);
                if (!chestBlock) continue;

                // Open chest
                const chest = await this.bot.openContainer(chestBlock);

                // Deposit items (keep seeds for replanting)
                const itemsToDeposit = this.bot.inventory.items().filter(
                    item => item.name !== 'wheat_seeds'
                );

                let deposited = 0;
                for (const item of itemsToDeposit) {
                    try {
                        await chest.deposit(item.type, null, item.count);
                        deposited += item.count;
                    } catch (e) {
                        // Chest might be full
                        logger.debug(`Could not deposit ${item.name}: ${e.message}`);
                    }
                }

                // Close chest
                chest.close();

                if (deposited > 0) {
                    this.sendChat(`Stored ${deposited} items in chest`);
                    logger.info(`Stored ${deposited} items in chest at ${chestPos}`);
                    return; // Successfully stored
                }

            } catch (error) {
                logger.debug(`Chest error: ${error.message}`);
                // Try next chest
            }
        }

        this.sendChat('All nearby chests are full!');
    }

    /**
     * Collect drops near a position
     */
    async collectDrops(position, radius = 4) {
        if (!this.isActive) return;

        // Wait briefly for server to spawn drops
        await this.delay(200);

        // Find items within radius
        const drops = Object.values(this.bot.entities).filter(entity =>
            (entity.type === 'object' || entity.name === 'item') &&
            entity.position.distanceTo(position) < radius &&
            entity.isValid
        );

        if (drops.length === 0) return;

        logger.info(`[Farming] Found ${drops.length} drops to collect in ${radius}m radius`);

        // Sort by distance
        drops.sort((a, b) =>
            a.position.distanceTo(this.bot.entity.position) -
            b.position.distanceTo(this.bot.entity.position)
        );

        for (const drop of drops) {
            if (!this.isActive) break;
            if (!drop.isValid) continue;

            // Prioritize wheat/seeds but pick up EVERYTHING (as requested)
            // Just move to it
            const distance = this.bot.entity.position.distanceTo(drop.position);

            if (distance > 1.0) {
                try {
                    // Use pathfinder if available for robust movement
                    if (this.bot.pathfinder) {
                        const { goals } = require('mineflayer-pathfinder');
                        await this.bot.pathfinder.goto(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 1));
                    } else {
                        // Fallback
                        await this.bot.lookAt(drop.position);
                        this.bot.setControlState('forward', true);
                        const startTime = Date.now();
                        while (this.bot.entity.position.distanceTo(drop.position) > 1.0 && Date.now() - startTime < 3000) {
                            await this.delay(50);
                        }
                        this.bot.setControlState('forward', false);
                    }
                    // logger.info(`Collected item`); // Silent collection to avoid spam
                } catch (e) { }
            }
        }
    }

    /**
     * Stop farming
     */
    async stop() {
        logger.info('Farming: Stop signal received');
        this.sendChat('Stopping farming...');
        this.isActive = false;

        // Force stop movement
        this.stopMovement();

        if (this.bot.pathfinder) {
            try {
                this.bot.pathfinder.setGoal(null);
                this.bot.pathfinder.stop(); // Try new method if available
            } catch (e) {
                logger.debug(`Pathfinder stop error: ${e.message}`);
            }
        }

        // Wait for loop to respond?
        logger.info('Farming: Flag set to false');
    }

    /**
     * Stop movement
     */
    stopMovement() {
        this.bot.setControlState('forward', false);
        this.bot.setControlState('back', false);
        this.bot.setControlState('left', false);
        this.bot.setControlState('right', false);
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('jump', false);
    }

    /**
     * Send chat message
     */
    sendChat(message) {
        try {
            this.bot.chat(message);
        } catch (e) {
            logger.debug(`Chat error: ${e.message}`);
        }
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = FarmingAbility;
