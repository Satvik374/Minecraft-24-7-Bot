/**
 * Sleeper Ability Module
 * Handles finding beds and sleeping through the night
 */

const logger = require('../utils/logger');

class Sleeper {
    constructor(bot, pathfinder) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.isActive = false;
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
     * Find nearest bed and sleep until morning
     */
    async goToBedAndSleep() {
        if (!this.isNight()) {
            return false; // Not night
        }

        logger.info('Sleeper: It is night time! Looking for a bed...');
        this.sendChat('Night time detected! Going to sleep... 💤');
        this.isActive = true;

        try {
            // Find nearby bed
            const mcData = require('minecraft-data')(this.bot.version);
            const bedIds = ['white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed', 'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed', 'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed', 'brown_bed', 'green_bed', 'red_bed', 'black_bed']
                .map(name => mcData.blocksByName[name]?.id)
                .filter(id => id);

            const bed = this.bot.findBlock({
                matching: bedIds,
                maxDistance: 32
            });

            if (!bed) {
                this.sendChat('No bed found nearby! Cannot sleep.');
                return false;
            }

            // Go to bed
            await this.goToBed(bed);

            // Sleep
            try {
                await this.bot.sleep(bed);
                this.sendChat('Zzz... Sleeping...');

                // Wait until wake up
                await new Promise((resolve) => {
                    const checkWake = () => {
                        if (!this.bot.isSleeping) {
                            this.bot.removeListener('wake', checkWake);
                            resolve();
                        }
                    };
                    this.bot.on('wake', checkWake);

                    // Failsafe timeout
                    setTimeout(() => {
                        this.bot.removeListener('wake', checkWake);
                        resolve();
                    }, 15000);
                });

                this.sendChat('Good morning! ☀️');
                logger.info('Sleeper: Woke up!');

            } catch (err) {
                if (err.message.includes('not safe')) {
                    this.sendChat('Monsters nearby! Cannot sleep.');
                } else {
                    logger.debug(`Sleep error: ${err.message}`);
                }
            }

        } catch (error) {
            logger.debug(`Sleeper error: ${error.message}`);
        } finally {
            this.isActive = false;
        }

        return true;
    }

    /**
     * Set respawn point at nearest bed
     */
    async setRespawn() {
        this.sendChat('Setting respawn point...');
        const mcData = require('minecraft-data')(this.bot.version);
        const bedIds = ['white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed', 'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed', 'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed', 'brown_bed', 'green_bed', 'red_bed', 'black_bed']
            .map(name => mcData.blocksByName[name]?.id)
            .filter(id => id);

        const bed = this.bot.findBlock({
            matching: bedIds,
            maxDistance: 32
        });

        if (!bed) {
            this.sendChat('No bed found nearby! Cannot set respawn.');
            return false;
        }

        this.sendChat(`Found bed at ${bed.position}. Going there...`);
        await this.goToBed(bed);

        // Interact with bed to set spawn
        try {
            await this.bot.activateBlock(bed);
            this.sendChat('Respawn point set!');
        } catch (err) {
            if (err.message.includes('safely')) {
                this.sendChat('Monsters nearby, but tried to set spawn.');
            } else {
                logger.debug(`Bed interaction: ${err.message}`);
            }
        }
        return true;
    }

    async goToBed(bedBlock) {
        if (this.bot.pathfinder) {
            const { goals } = require('mineflayer-pathfinder');
            const goal = new goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 1);
            await this.bot.pathfinder.goto(goal);
        } else {
            // Simple approach
            await this.bot.lookAt(bedBlock.position);
            this.bot.setControlState('forward', true);
            // ... simple move ...
            await this.delay(2000); // minimal fallback
            this.bot.setControlState('forward', false);
        }
    }

    sendChat(msg) {
        try { this.bot.chat(msg); } catch (e) { }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Sleeper;
