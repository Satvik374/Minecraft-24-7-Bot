/**
 * Chest Manager Ability
 * Handles sorting and organizing items in chests
 * Features:
 * - Sort items in a chest alphabetically by category
 * - Ensure all items from chest go back into chest
 * - Verify bot inventory is empty after sorting
 */

const logger = require('../utils/logger');

class ChestManager {
    constructor(bot, pathfinder) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.isActive = false;
        this.currentChest = null;

        // Item categories for sorting (priority order)
        this.itemCategories = {
            'weapons': ['sword', 'bow', 'crossbow', 'trident', 'axe'],
            'tools': ['pickaxe', 'shovel', 'hoe', 'fishing_rod', 'shears', 'flint_and_steel'],
            'armor': ['helmet', 'chestplate', 'leggings', 'boots', 'shield', 'elytra'],
            'food': ['apple', 'bread', 'beef', 'pork', 'chicken', 'mutton', 'rabbit', 'cod', 'salmon', 'carrot', 'potato', 'melon', 'cookie', 'cake', 'pie', 'stew', 'soup', 'golden_apple', 'enchanted_golden_apple'],
            'ores': ['diamond', 'emerald', 'gold', 'iron', 'copper', 'coal', 'lapis', 'redstone', 'quartz', 'netherite', 'ancient_debris'],
            'valuables': ['diamond', 'emerald', 'gold_ingot', 'iron_ingot', 'netherite_ingot', 'enchanted_book'],
            'blocks': ['stone', 'cobblestone', 'dirt', 'grass', 'sand', 'gravel', 'log', 'planks', 'wool', 'concrete', 'terracotta', 'glass', 'brick'],
            'redstone': ['redstone', 'repeater', 'comparator', 'piston', 'observer', 'hopper', 'dropper', 'dispenser', 'lever', 'button'],
            'misc': [] // Catch-all for uncategorized items
        };
    }

    /**
     * Execute chest management commands
     */
    async execute(command) {
        if (command.subAction === 'chests') {
            await this.sortNearestChest();
        } else if (command.subAction === 'transfer') {
            await this.transferItems(command.source, command.destination);
        } else {
            await this.sortNearestChest();
        }
    }

    /**
     * Find and sort the nearest chest
     */
    async sortNearestChest() {
        this.isActive = true;
        this.sendChat('Looking for a chest to sort...');

        try {
            // Find nearest chest
            const chestBlock = this.findNearestChest();

            if (!chestBlock) {
                this.sendChat('No chest found nearby!');
                this.isActive = false;
                return;
            }

            logger.info(`Found chest at ${chestBlock.position}`);
            this.sendChat(`Found chest at ${Math.floor(chestBlock.position.x)}, ${Math.floor(chestBlock.position.y)}, ${Math.floor(chestBlock.position.z)}`);

            // Navigate to the chest
            await this.navigateToBlock(chestBlock);

            // Sort the chest
            await this.sortChest(chestBlock);

        } catch (error) {
            logger.error(`Chest sorting error: ${error.message}`);
            this.sendChat(`Error sorting chest: ${error.message}`);
        }

        this.isActive = false;
    }

    /**
     * Sort items in a specific chest
     */
    async sortChest(chestBlock) {
        logger.info('Opening chest for sorting...');

        try {
            // Open the chest
            const chest = await this.bot.openContainer(chestBlock);
            this.currentChest = chest;

            await this.delay(500); // Wait for chest to fully open

            // Get all items from chest
            const chestItems = chest.containerItems();

            if (chestItems.length === 0) {
                this.sendChat('Chest is empty, nothing to sort!');
                chest.close();
                return;
            }

            this.sendChat(`Found ${chestItems.length} item stacks to sort...`);
            logger.info(`Chest contains ${chestItems.length} item stacks`);

            // Step 1: Take ALL items from chest to inventory
            this.sendChat('Taking items from chest...');
            const itemsTaken = [];

            for (const item of chestItems) {
                try {
                    await chest.withdraw(item.type, item.metadata, item.count);
                    itemsTaken.push({ name: item.name, count: item.count, type: item.type, metadata: item.metadata });
                    logger.debug(`Took ${item.count}x ${item.name}`);
                    await this.delay(100);
                } catch (e) {
                    logger.debug(`Could not take ${item.name}: ${e.message}`);
                }
            }

            logger.info(`Took ${itemsTaken.length} item types from chest`);

            // Step 2: Sort items by category
            const sortedItems = this.categorizeAndSortItems(itemsTaken);

            // Step 3: Put ALL items back in sorted order
            this.sendChat('Putting items back in sorted order...');

            for (const item of sortedItems) {
                try {
                    // Find item in inventory
                    const invItem = this.bot.inventory.items().find(i =>
                        i.type === item.type && i.metadata === item.metadata
                    );

                    if (invItem) {
                        await chest.deposit(invItem.type, invItem.metadata, invItem.count);
                        logger.debug(`Deposited ${invItem.count}x ${invItem.name}`);
                        await this.delay(100);
                    }
                } catch (e) {
                    logger.debug(`Could not deposit ${item.name}: ${e.message}`);
                }
            }

            // Step 4: VERIFY - Check if bot still has any items from the chest
            await this.delay(300);
            const remainingItems = this.checkRemainingChestItems(itemsTaken);

            if (remainingItems.length > 0) {
                this.sendChat(`Found ${remainingItems.length} items still in inventory, depositing...`);

                // Try to deposit remaining items
                for (const item of remainingItems) {
                    try {
                        const invItem = this.bot.inventory.items().find(i =>
                            i.type === item.type && i.metadata === item.metadata
                        );
                        if (invItem) {
                            await chest.deposit(invItem.type, invItem.metadata, invItem.count);
                            logger.info(`Deposited remaining: ${invItem.count}x ${invItem.name}`);
                            await this.delay(100);
                        }
                    } catch (e) {
                        logger.debug(`Could not deposit remaining ${item.name}: ${e.message}`);
                    }
                }

                // Final verification
                await this.delay(300);
                const finalRemaining = this.checkRemainingChestItems(itemsTaken);

                if (finalRemaining.length > 0) {
                    this.sendChat(`Warning: ${finalRemaining.length} items could not be deposited (chest may be full)`);
                    logger.warn(`Items not deposited: ${finalRemaining.map(i => i.name).join(', ')}`);
                } else {
                    this.sendChat('Chest sorted! All items returned successfully.');
                }
            } else {
                this.sendChat('Chest sorted! All items are back in the chest.');
            }

            // Close the chest
            chest.close();
            this.currentChest = null;

            logger.info('Chest sorting complete');

        } catch (error) {
            logger.error(`Error during chest sorting: ${error.message}`);
            this.sendChat(`Error: ${error.message}`);

            if (this.currentChest) {
                try {
                    this.currentChest.close();
                } catch (e) { }
                this.currentChest = null;
            }
        }
    }

    /**
     * Check if bot still has items that originated from the chest
     */
    checkRemainingChestItems(originalItems) {
        const remaining = [];
        const inventoryItems = this.bot.inventory.items();

        for (const original of originalItems) {
            const found = inventoryItems.find(inv =>
                inv.type === original.type && inv.metadata === original.metadata
            );

            if (found) {
                remaining.push({
                    name: found.name,
                    count: found.count,
                    type: found.type,
                    metadata: found.metadata
                });
            }
        }

        return remaining;
    }

    /**
     * Categorize and sort items by category then alphabetically
     */
    categorizeAndSortItems(items) {
        // Assign category to each item
        const categorizedItems = items.map(item => {
            const category = this.getItemCategory(item.name);
            return { ...item, category };
        });

        // Define category priority order
        const categoryOrder = ['valuables', 'weapons', 'armor', 'tools', 'food', 'ores', 'redstone', 'blocks', 'misc'];

        // Sort by category priority, then alphabetically by name
        categorizedItems.sort((a, b) => {
            const catIndexA = categoryOrder.indexOf(a.category);
            const catIndexB = categoryOrder.indexOf(b.category);

            if (catIndexA !== catIndexB) {
                return catIndexA - catIndexB;
            }

            // Same category, sort alphabetically
            return a.name.localeCompare(b.name);
        });

        logger.info(`Sorted ${categorizedItems.length} items into categories`);
        return categorizedItems;
    }

    /**
     * Get the category for an item
     */
    getItemCategory(itemName) {
        const lowerName = itemName.toLowerCase();

        for (const [category, keywords] of Object.entries(this.itemCategories)) {
            if (category === 'misc') continue;

            for (const keyword of keywords) {
                if (lowerName.includes(keyword)) {
                    return category;
                }
            }
        }

        return 'misc';
    }

    /**
     * Find the nearest chest block
     */
    findNearestChest() {
        const chestIds = [
            this.bot.registry.blocksByName.chest?.id,
            this.bot.registry.blocksByName.trapped_chest?.id,
            this.bot.registry.blocksByName.barrel?.id
        ].filter(id => id !== undefined);

        if (chestIds.length === 0) {
            logger.warn('No chest block types found in registry');
            return null;
        }

        const chests = this.bot.findBlocks({
            matching: chestIds,
            maxDistance: 32,
            count: 1
        });

        if (chests.length > 0) {
            return this.bot.blockAt(chests[0]);
        }

        return null;
    }

    /**
     * Navigate to a block
     */
    async navigateToBlock(block) {
        const { goals, Movements } = require('mineflayer-pathfinder');

        const movements = new Movements(this.bot);
        movements.canDig = false; // Don't break blocks to reach chest

        this.bot.pathfinder.setMovements(movements);

        const goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2);

        return new Promise((resolve, reject) => {
            this.bot.pathfinder.setGoal(goal);

            const timeout = setTimeout(() => {
                this.bot.pathfinder.setGoal(null);
                resolve(); // Continue anyway
            }, 10000);

            this.bot.once('goal_reached', () => {
                clearTimeout(timeout);
                resolve();
            });

            this.bot.once('path_update', (result) => {
                if (result.status === 'noPath') {
                    clearTimeout(timeout);
                    resolve(); // Continue anyway, might be close enough
                }
            });
        });
    }

    /**
     * Transfer items from one chest to another
     */
    async transferItems(sourcePos, destPos) {
        this.sendChat('Transferring items between chests...');

        try {
            // Find source chest
            const sourceBlock = this.bot.blockAt(this.bot.entity.position.offset(
                sourcePos.x - this.bot.entity.position.x,
                sourcePos.y - this.bot.entity.position.y,
                sourcePos.z - this.bot.entity.position.z
            ));

            // This feature would need more implementation
            this.sendChat('Transfer feature coming soon!');

        } catch (error) {
            logger.error(`Transfer error: ${error.message}`);
            this.sendChat(`Error: ${error.message}`);
        }
    }

    /**
     * Stop current operation
     */
    stop() {
        this.isActive = false;
        if (this.currentChest) {
            try {
                this.currentChest.close();
            } catch (e) { }
            this.currentChest = null;
        }
        logger.info('Chest manager stopped');
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Send chat message
     */
    sendChat(message) {
        try {
            this.bot.chat(message);
            logger.info(`[ChestManager] ${message}`);
        } catch (e) {
            logger.debug(`Chat error: ${e.message}`);
        }
    }
}

module.exports = ChestManager;
