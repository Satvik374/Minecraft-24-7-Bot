/**
 * Inventory Manager Ability
 * Handles inventory interactions like equipping items and managing slots
 */

const logger = require('../utils/logger');

class InventoryManager {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Execute commands
     */
    async execute(command) {
        if (command.action === 'equip') {
            await this.equipItem(command.target);
        }
    }

    /**
     * Equip an item by name
     * @param {string} itemName - The name of the item to equip
     */
    async equipItem(itemName) {
        const targetName = itemName.toLowerCase();

        // Find the item in inventory
        const items = this.bot.inventory.items();
        const item = items.find(i => i.name.toLowerCase().includes(targetName));

        if (!item) {
            this.sendChat(`I don't have any ${itemName}.`);
            return;
        }

        this.sendChat(`Equipping ${item.name}...`);

        try {
            const destination = this.determineEquipDestination(item.name);
            await this.bot.equip(item, destination);
            this.sendChat(`Equipped ${item.name} in ${destination}.`);
            logger.info(`Equipped ${item.name} in ${destination}`);
        } catch (error) {
            logger.error(`Failed to equip ${item.name}: ${error.message}`);
            this.sendChat(`Couldn't equip ${item.name}: ${error.message}`);
        }
    }

    /**
     * Determine where an item should be equipped
     */
    determineEquipDestination(itemName) {
        const name = itemName.toLowerCase();

        if (name.includes('helmet') || name.includes('cap') || name.includes('skull') || name.includes('head')) return 'head';
        if (name.includes('chestplate') || name.includes('tunic') || name.includes('elytra')) return 'torso';
        if (name.includes('leggings') || name.includes('pants')) return 'legs';
        if (name.includes('boots')) return 'feet';
        if (name.includes('shield')) return 'off-hand';

        return 'hand'; // Default to main hand
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

module.exports = InventoryManager;
