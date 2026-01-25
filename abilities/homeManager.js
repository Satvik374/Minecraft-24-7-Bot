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

        if (command.action === 'sort') {
            // Handle different sort subActions
            if (command.subAction === 'chests') {
                await this.sortAllChests();
            } else if (command.subAction === 'transfer') {
                await this.moveChestItems(command.source, command.destination);
            } else {
                // Default: deposit to nearby chest (legacy behavior)
                const range = command.range || 50;
                const res = await this.findNearbyChestAndDeposit(range);
                if (!res) this.sendChat('Could not sort items (no chest or path failed)');
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

    /**
     * Categorize an item for sorting
     * @param {object} item - The item to categorize
     * @returns {string} - Category name
     */
    categorizeItem(item) {
        const name = item.name.toLowerCase();

        // Ores and minerals
        if (name.includes('ore') || name.includes('diamond') || name.includes('emerald') ||
            name.includes('gold') || name.includes('iron') || name.includes('coal') ||
            name.includes('lapis') || name.includes('redstone') || name.includes('copper') ||
            name.includes('ingot') || name.includes('nugget') || name.includes('raw_')) {
            return 'ores';
        }

        // Tools
        if (name.includes('pickaxe') || name.includes('axe') || name.includes('shovel') ||
            name.includes('hoe') || name.includes('shears') || name.includes('flint_and_steel') ||
            name.includes('fishing_rod') || name.includes('compass') || name.includes('clock') ||
            name.includes('bucket') || name.includes('spyglass')) {
            return 'tools';
        }

        // Weapons and armor
        if (name.includes('sword') || name.includes('bow') || name.includes('arrow') ||
            name.includes('crossbow') || name.includes('trident') || name.includes('shield') ||
            name.includes('helmet') || name.includes('chestplate') || name.includes('leggings') ||
            name.includes('boots') || name.includes('armor')) {
            return 'combat';
        }

        // Food
        if (name.includes('beef') || name.includes('pork') || name.includes('chicken') ||
            name.includes('mutton') || name.includes('rabbit') || name.includes('fish') ||
            name.includes('bread') || name.includes('apple') || name.includes('carrot') ||
            name.includes('potato') || name.includes('melon') || name.includes('pumpkin_pie') ||
            name.includes('cookie') || name.includes('cake') || name.includes('stew') ||
            name.includes('cooked') || name.includes('golden_apple') || name.includes('food')) {
            return 'food';
        }

        // Building blocks
        if (name.includes('stone') || name.includes('dirt') || name.includes('grass') ||
            name.includes('cobblestone') || name.includes('wood') || name.includes('plank') ||
            name.includes('log') || name.includes('brick') || name.includes('glass') ||
            name.includes('sand') || name.includes('gravel') || name.includes('concrete') ||
            name.includes('terracotta') || name.includes('wool') || name.includes('slab') ||
            name.includes('stair') || name.includes('fence') || name.includes('wall')) {
            return 'blocks';
        }

        // Seeds and farming
        if (name.includes('seed') || name.includes('wheat') || name.includes('beetroot') ||
            name.includes('bone_meal') || name.includes('egg') || name.includes('leather')) {
            return 'farming';
        }

        return 'misc';
    }

    /**
     * Sort all nearby chests by categorizing items
     */
    async sortAllChests() {
        this.sendChat('Starting chest sorting...');

        const mcData = require('minecraft-data')(this.bot.version);
        const chestId = mcData.blocksByName['chest']?.id;
        const trappedChestId = mcData.blocksByName['trapped_chest']?.id;

        if (!chestId) {
            this.sendChat('Could not find chest block type');
            return;
        }

        // Find all nearby chests
        const chestIds = [chestId];
        if (trappedChestId) chestIds.push(trappedChestId);

        const chestBlocks = this.bot.findBlocks({
            matching: chestIds,
            maxDistance: 50,
            count: 100
        });

        if (chestBlocks.length === 0) {
            this.sendChat('No chests found nearby!');
            return;
        }

        this.sendChat(`Found ${chestBlocks.length} chest(s). Collecting and sorting items...`);

        // Collect all items from all chests
        const allItems = [];
        const chestPositions = [];

        for (const pos of chestBlocks) {
            const block = this.bot.blockAt(pos);
            if (!block) continue;

            try {
                // Go to chest
                await this.goToPosition(pos.x, pos.y, pos.z, 2);

                const chest = await this.bot.openChest(block);
                chestPositions.push({ position: pos, block });

                // Collect all items from this chest
                const items = chest.containerItems();
                for (const item of items) {
                    allItems.push({
                        type: item.type,
                        name: item.name,
                        count: item.count,
                        metadata: item.metadata,
                        nbt: item.nbt,
                        category: this.categorizeItem(item)
                    });
                    // Withdraw item to bot's inventory
                    try {
                        await chest.withdraw(item.type, null, item.count);
                    } catch (e) {
                        logger.debug(`Could not withdraw ${item.name}: ${e.message}`);
                    }
                }

                await chest.close();
                await new Promise(r => setTimeout(r, 300)); // Small delay

            } catch (error) {
                logger.debug(`Error accessing chest at ${pos}: ${error.message}`);
            }
        }

        if (allItems.length === 0) {
            this.sendChat('No items found in chests!');
            return;
        }

        this.sendChat(`Collected ${allItems.length} item stacks. Sorting by category...`);

        // Group items by category
        const categorizedItems = {};
        for (const item of allItems) {
            if (!categorizedItems[item.category]) {
                categorizedItems[item.category] = [];
            }
            categorizedItems[item.category].push(item);
        }

        // Distribute items back to chests - one category per chest (if possible)
        const categories = Object.keys(categorizedItems);
        let chestIndex = 0;

        for (const category of categories) {
            if (chestIndex >= chestPositions.length) {
                chestIndex = 0; // Wrap around if more categories than chests
            }

            const targetChest = chestPositions[chestIndex];
            const items = categorizedItems[category];

            try {
                await this.goToPosition(targetChest.position.x, targetChest.position.y, targetChest.position.z, 2);

                const chest = await this.bot.openChest(targetChest.block);

                for (const item of items) {
                    // Find item in bot's inventory
                    const invItem = this.bot.inventory.items().find(i =>
                        i.type === item.type && i.name === item.name
                    );

                    if (invItem) {
                        try {
                            await chest.deposit(invItem.type, null, Math.min(invItem.count, item.count));
                        } catch (e) {
                            logger.debug(`Could not deposit ${item.name}: ${e.message}`);
                        }
                    }
                }

                await chest.close();
                logger.info(`Deposited ${category} items to chest at ${targetChest.position}`);

            } catch (error) {
                logger.debug(`Error depositing to chest: ${error.message}`);
            }

            chestIndex++;
        }

        // Deposit any remaining items in bot's inventory to the first chest
        const remainingItems = this.bot.inventory.items();
        if (remainingItems.length > 0 && chestPositions.length > 0) {
            try {
                const firstChest = chestPositions[0];
                await this.goToPosition(firstChest.position.x, firstChest.position.y, firstChest.position.z, 2);

                const chest = await this.bot.openChest(firstChest.block);
                for (const item of remainingItems) {
                    try {
                        await chest.deposit(item.type, null, item.count);
                    } catch (e) {
                        // Ignore - chest might be full
                    }
                }
                await chest.close();
            } catch (e) {
                logger.debug(`Could not deposit remaining items: ${e.message}`);
            }
        }

        this.sendChat('Chest sorting complete!');
    }

    /**
     * Move all items from source chest to destination chest
     * @param {object} source - Source chest coordinates {x, y, z}
     * @param {object} destination - Destination chest coordinates {x, y, z}
     */
    async moveChestItems(source, destination) {
        this.sendChat(`Moving items from (${Math.floor(source.x)}, ${Math.floor(source.y)}, ${Math.floor(source.z)}) to (${Math.floor(destination.x)}, ${Math.floor(destination.y)}, ${Math.floor(destination.z)})...`);

        // Go to source chest
        try {
            await this.goToPosition(source.x, source.y, source.z, 2);
        } catch (error) {
            this.sendChat(`Cannot reach source chest: ${error.message}`);
            return;
        }

        // Find the source chest block
        const sourceBlock = this.bot.blockAt({ x: Math.floor(source.x), y: Math.floor(source.y), z: Math.floor(source.z) });
        if (!sourceBlock || !sourceBlock.name.includes('chest')) {
            this.sendChat('No chest found at source coordinates!');
            return;
        }

        // Collect items from source chest
        let collectedItems = [];
        try {
            const chest = await this.bot.openChest(sourceBlock);
            const items = chest.containerItems();

            for (const item of items) {
                try {
                    await chest.withdraw(item.type, null, item.count);
                    collectedItems.push({ type: item.type, name: item.name, count: item.count });
                } catch (e) {
                    logger.debug(`Could not withdraw ${item.name}: ${e.message}`);
                }
            }

            await chest.close();
            this.sendChat(`Collected ${collectedItems.length} item stacks from source chest.`);

        } catch (error) {
            this.sendChat(`Error accessing source chest: ${error.message}`);
            return;
        }

        if (collectedItems.length === 0) {
            this.sendChat('Source chest is empty!');
            return;
        }

        // Go to destination chest
        try {
            await this.goToPosition(destination.x, destination.y, destination.z, 2);
        } catch (error) {
            this.sendChat(`Cannot reach destination chest: ${error.message}`);
            return;
        }

        // Find the destination chest block
        const destBlock = this.bot.blockAt({ x: Math.floor(destination.x), y: Math.floor(destination.y), z: Math.floor(destination.z) });
        if (!destBlock || !destBlock.name.includes('chest')) {
            this.sendChat('No chest found at destination coordinates!');
            return;
        }

        // Deposit items to destination chest
        try {
            const chest = await this.bot.openChest(destBlock);
            let depositedCount = 0;

            for (const item of this.bot.inventory.items()) {
                try {
                    await chest.deposit(item.type, null, item.count);
                    depositedCount++;
                } catch (e) {
                    logger.debug(`Could not deposit ${item.name}: ${e.message}`);
                }
            }

            await chest.close();
            this.sendChat(`Successfully moved ${depositedCount} item stacks to destination chest!`);

        } catch (error) {
            this.sendChat(`Error depositing to destination chest: ${error.message}`);
        }
    }

    /**
     * Navigate to a position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @param {number} range - How close to get (default 2)
     */
    async goToPosition(x, y, z, range = 2) {
        if (this.pathfinder && this.bot.pathfinder) {
            const { goals } = require('mineflayer-pathfinder');
            const goal = new goals.GoalNear(x, y, z, range);
            await this.bot.pathfinder.goto(goal);
        } else {
            // Fallback: simple movement
            await this.bot.lookAt({ x, y, z });
            this.bot.setControlState('forward', true);
            await new Promise(r => setTimeout(r, 2000));
            this.bot.setControlState('forward', false);
        }
    }
}

module.exports = HomeManager;
