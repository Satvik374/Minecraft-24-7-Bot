/**
 * Auto Eat Ability Module
 * Monitors hunger and automatically eats food
 */

const logger = require('../utils/logger');

class AutoEat {
    constructor(bot) {
        this.bot = bot;
        this.isActive = false;
        this.interval = null;
        this.eating = false;
    }

    /**
     * Start monitoring hunger
     */
    start() {
        if (this.isActive) return;
        this.isActive = true;

        logger.info('🍎 Auto Eat: Monitoring started');

        // Check every 5 seconds
        this.interval = setInterval(() => this.checkAndEat(), 5000);
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (!this.isActive) return;
        this.isActive = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    /**
     * Check hunger and eat if necessary
     */
    async checkAndEat() {
        if (this.eating) return;

        // Minecraft food level is 0-20. 20 is full.
        // Eat if below 18 (9 shanks) to maintain saturation/regen
        if (this.bot.food === undefined || this.bot.food >= 18) return;

        this.eating = true;

        try {
            const food = this.getBestFood();

            if (!food) {
                // Only warn once in a while?
                // logger.debug('Auto Eat: No food found in inventory');
                return;
            }

            logger.info(`Auto Eat: Hungry (${this.bot.food}/20). Eating ${food.name}...`);
            this.sendChat(`Eating ${food.displayName || food.name} for energy... 🍖`);

            // Equip food
            await this.bot.equip(food, 'hand');

            // Consume
            await this.bot.consume();

            logger.info(`Auto Eat: Finished eating. Food level: ${this.bot.food}`);

        } catch (error) {
            logger.debug(`Auto Eat error: ${error.message}`);
        } finally {
            this.eating = false;
        }
    }

    /**
     * Get best available food from inventory
     */
    getBestFood() {
        const foodRegistry = this.bot.registry.foods;
        const items = this.bot.inventory.items();

        // Filter for edible items
        const edibleItems = items.filter(item => {
            if (item.name === 'rotten_flesh') return false; // Avoid unless desperate (todo: logic)
            if (item.name === 'spider_eye') return false;
            if (item.name === 'pufferfish') return false;
            if (item.name === 'chicken' && !item.name.includes('cooked')) return false; // Avoid raw chicken

            // ID must be in food registry
            return foodRegistry[item.type];
        });

        if (edibleItems.length === 0) return null;

        // Sort by food points (descending)
        edibleItems.sort((a, b) => {
            const foodA = foodRegistry[a.type].foodPoints;
            const foodB = foodRegistry[b.type].foodPoints;
            return foodB - foodA;
        });

        return edibleItems[0];
    }

    sendChat(msg) {
        try { this.bot.chat(msg); } catch (e) { }
    }
}

module.exports = AutoEat;
