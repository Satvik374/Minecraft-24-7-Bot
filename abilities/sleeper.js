/**
 * Sleeper Ability Module
 * Handles finding beds and sleeping through the night
 * Supports: -bot sleep command
 */

const logger = require('../utils/logger');

class Sleeper {
    constructor(bot, pathfinder) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.isActive = false;
    }

    /**
     * Execute sleep command
     */
    async execute(command) {
        await this.sleep();
    }

    /**
     * Main sleep function - tries to sleep on a bed
     * 1. Check if it's night (or skip check if forced)
     * 2. Look for nearby bed
     * 3. If no bed nearby, check inventory for a bed to place
     * 4. Go to bed and sleep
     */
    async sleep() {
        this.isActive = true;

        try {
            // Check if it's night time
            if (!this.isNight()) {
                this.sendChat('It is not night time yet. Cannot sleep!');
                this.isActive = false;
                return false;
            }

            this.sendChat('Looking for a bed to sleep on... 🛏️');
            logger.info('Sleeper: Attempting to sleep');

            // Step 1: Look for nearby bed
            let bed = this.findNearestBed();

            // Step 2: If no bed nearby, try to place one from inventory
            if (!bed) {
                this.sendChat('No bed found nearby. Checking inventory...');

                const placedBed = await this.placeBedFromInventory();
                if (placedBed) {
                    bed = placedBed;
                    this.sendChat('Placed a bed from inventory!');
                } else {
                    this.sendChat('No bed in inventory either. Cannot sleep!');
                    this.isActive = false;
                    return false;
                }
            }

            // Step 3: Go to the bed
            this.sendChat(`Found bed! Going to it...`);
            await this.goToBed(bed);

            // Step 4: Sleep on the bed
            await this.sleepOnBed(bed);

        } catch (error) {
            logger.error(`Sleeper error: ${error.message}`);
            this.sendChat(`Sleep failed: ${error.message}`);
        } finally {
            this.isActive = false;
        }

        return true;
    }

    /**
     * Check if it's currently night time (or thunderstorm)
     * Minecraft night starts at 12541 and ends at 23458
     * Thunderstorms allow sleeping anytime
     */
    isNight() {
        const timeOfDay = this.bot.time.timeOfDay;
        const isThunder = this.bot.isRaining && (this.bot.thunderState > 0);
        return (timeOfDay >= 12541 && timeOfDay <= 23458) || isThunder;
    }

    /**
     * Find nearest bed block
     */
    findNearestBed() {
        const mcData = require('minecraft-data')(this.bot.version);
        const bedIds = this.getBedBlockIds(mcData);

        const bed = this.bot.findBlock({
            matching: bedIds,
            maxDistance: 32
        });

        return bed;
    }

    /**
     * Get all bed block IDs
     */
    getBedBlockIds(mcData) {
        const bedColors = ['white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed',
            'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed',
            'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed',
            'brown_bed', 'green_bed', 'red_bed', 'black_bed'];

        return bedColors
            .map(name => mcData.blocksByName[name]?.id)
            .filter(id => id !== undefined);
    }

    /**
     * Get all bed item names
     */
    getBedItemNames() {
        return ['white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed',
            'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed',
            'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed',
            'brown_bed', 'green_bed', 'red_bed', 'black_bed'];
    }

    /**
     * Place a bed from inventory
     */
    async placeBedFromInventory() {
        const bedNames = this.getBedItemNames();

        // Find a bed in inventory
        const bedItem = this.bot.inventory.items().find(item =>
            bedNames.includes(item.name)
        );

        if (!bedItem) {
            return null; // No bed in inventory
        }

        logger.info(`Found ${bedItem.name} in inventory, trying to place it`);

        try {
            // Equip the bed
            await this.bot.equip(bedItem, 'hand');
            await this.delay(200);

            // Find a suitable place to put the bed (needs 2 adjacent blocks)
            const pos = this.bot.entity.position;
            const placePos = await this.findPlaceForBed(pos);

            if (!placePos) {
                this.sendChat('Cannot find a suitable place to put the bed!');
                return null;
            }

            // Place the bed
            const referenceBlock = this.bot.blockAt(placePos.offset(0, -1, 0));
            if (referenceBlock) {
                await this.bot.placeBlock(referenceBlock, new (require('vec3'))(0, 1, 0));
                await this.delay(500);

                // Find the placed bed
                const mcData = require('minecraft-data')(this.bot.version);
                const bedIds = this.getBedBlockIds(mcData);

                const placedBed = this.bot.findBlock({
                    matching: bedIds,
                    maxDistance: 5
                });

                return placedBed;
            }
        } catch (error) {
            logger.debug(`Failed to place bed: ${error.message}`);
        }

        return null;
    }

    /**
     * Find a place to put the bed (needs flat ground)
     */
    async findPlaceForBed(aroundPos) {
        const offsets = [
            { x: 1, z: 0 },
            { x: -1, z: 0 },
            { x: 0, z: 1 },
            { x: 0, z: -1 },
            { x: 2, z: 0 },
            { x: -2, z: 0 },
            { x: 0, z: 2 },
            { x: 0, z: -2 }
        ];

        for (const offset of offsets) {
            const checkPos = aroundPos.offset(offset.x, 0, offset.z);
            const blockBelow = this.bot.blockAt(checkPos.offset(0, -1, 0));
            const blockAt = this.bot.blockAt(checkPos);
            const blockAbove = this.bot.blockAt(checkPos.offset(0, 1, 0));

            // Need solid ground below, air at position and above
            if (blockBelow && blockBelow.boundingBox === 'block' &&
                blockAt && blockAt.name === 'air' &&
                blockAbove && blockAbove.name === 'air') {
                return checkPos;
            }
        }

        return null;
    }

    /**
     * Sleep on a bed block
     */
    async sleepOnBed(bed) {
        try {
            await this.bot.sleep(bed);
            this.sendChat('Zzz... Sleeping... 💤');
            logger.info('Sleeper: Now sleeping');

            // Wait until wake up
            await new Promise((resolve) => {
                const checkWake = () => {
                    if (!this.bot.isSleeping) {
                        this.bot.removeListener('wake', checkWake);
                        resolve();
                    }
                };
                this.bot.on('wake', checkWake);

                // Failsafe timeout (30 seconds max sleep)
                setTimeout(() => {
                    this.bot.removeListener('wake', checkWake);
                    resolve();
                }, 30000);
            });

            this.sendChat('Good morning! Slept well! ☀️');
            logger.info('Sleeper: Woke up!');
            return true;

        } catch (err) {
            if (err.message.includes('not safe') || err.message.includes('monster')) {
                this.sendChat('Monsters nearby! Cannot sleep safely.');
            } else if (err.message.includes('day')) {
                this.sendChat('You can only sleep at night!');
            } else if (err.message.includes('occupied')) {
                this.sendChat('This bed is occupied by someone else!');
            } else {
                logger.debug(`Sleep error: ${err.message}`);
                this.sendChat(`Cannot sleep: ${err.message}`);
            }
            return false;
        }
    }

    /**
     * Find nearest bed and sleep until morning (legacy method)
     */
    async goToBedAndSleep() {
        return await this.sleep();
    }

    /**
     * Set respawn point at nearest bed
     */
    async setRespawn() {
        this.sendChat('Setting respawn point...');

        let bed = this.findNearestBed();

        if (!bed) {
            // Try placing from inventory
            bed = await this.placeBedFromInventory();
            if (!bed) {
                this.sendChat('No bed found nearby or in inventory! Cannot set respawn.');
                return false;
            }
        }

        this.sendChat(`Found bed at ${Math.floor(bed.position.x)}, ${Math.floor(bed.position.y)}, ${Math.floor(bed.position.z)}. Going there...`);
        await this.goToBed(bed);

        // Interact with bed to set spawn
        try {
            await this.bot.activateBlock(bed);
            this.sendChat('Respawn point set! ✅');
        } catch (err) {
            if (err.message.includes('safely') || err.message.includes('monster')) {
                this.sendChat('Monsters nearby, but tried to set spawn.');
            } else {
                logger.debug(`Bed interaction: ${err.message}`);
            }
        }
        return true;
    }

    /**
     * Navigate to bed
     */
    async goToBed(bedBlock) {
        if (this.bot.pathfinder) {
            const { goals } = require('mineflayer-pathfinder');
            const goal = new goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2);

            try {
                await this.bot.pathfinder.goto(goal);
            } catch (e) {
                logger.debug(`Pathfinder error going to bed: ${e.message}`);
                // Continue anyway, might be close enough
            }
        } else {
            // Simple approach
            await this.bot.lookAt(bedBlock.position);
            this.bot.setControlState('forward', true);
            await this.delay(2000);
            this.bot.setControlState('forward', false);
        }
    }

    /**
     * Stop sleeping
     */
    async stop() {
        this.isActive = false;
        if (this.bot.isSleeping) {
            try {
                await this.bot.wake();
                this.sendChat('Woke up!');
            } catch (e) {
                logger.debug(`Wake error: ${e.message}`);
            }
        }
    }

    /**
     * Send chat message
     */
    sendChat(msg) {
        try {
            this.bot.chat(msg);
            logger.info(`[Sleeper] ${msg}`);
        } catch (e) { }
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Sleeper;

