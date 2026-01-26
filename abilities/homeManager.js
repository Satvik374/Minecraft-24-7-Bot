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
     * Sort all nearby chests by categorizing items and moving them between chests
     * Each chest gets assigned to specific categories, then items are redistributed
     */
    async sortAllChests() {
        this.sendChat('Starting smart chest sorting...');

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

        this.sendChat(`Found ${chestBlocks.length} chest(s). Analyzing contents...`);

        // Define all possible categories and assign to chests
        const allCategories = ['ores', 'tools', 'combat', 'food', 'blocks', 'farming', 'misc'];

        // Map categories to chest indices (cycle if more categories than chests)
        const categoryToChest = {};
        const chestToCategories = {};

        for (let i = 0; i < allCategories.length; i++) {
            const chestIdx = i % chestBlocks.length;
            categoryToChest[allCategories[i]] = chestIdx;

            if (!chestToCategories[chestIdx]) {
                chestToCategories[chestIdx] = [];
            }
            chestToCategories[chestIdx].push(allCategories[i]);
        }

        // Build a list of chest data with positions and blocks
        const chestData = [];
        for (const pos of chestBlocks) {
            const block = this.bot.blockAt(pos);
            if (block) {
                chestData.push({ position: pos, block });
            }
        }

        // Announce category assignments
        for (let i = 0; i < chestData.length; i++) {
            const categories = chestToCategories[i] || ['misc'];
            const pos = chestData[i].position;
            logger.info(`Chest ${i} at (${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}): ${categories.join(', ')}`);
        }

        this.sendChat(`Assigned categories to ${chestData.length} chests. Now sorting items...`);

        // Phase 1: Scan all chests and collect misplaced items
        const itemsToMove = []; // {item, fromChestIdx, toChestIdx}

        for (let chestIdx = 0; chestIdx < chestData.length; chestIdx++) {
            const { position, block } = chestData[chestIdx];
            const assignedCategories = chestToCategories[chestIdx] || ['misc'];

            try {
                await this.goToPosition(position.x, position.y, position.z, 2);
                const chest = await this.bot.openChest(block);
                const items = chest.containerItems();

                for (const item of items) {
                    const itemCategory = this.categorizeItem(item);

                    // Check if this item belongs in this chest
                    if (!assignedCategories.includes(itemCategory)) {
                        // Item is misplaced - mark for moving
                        const correctChestIdx = categoryToChest[itemCategory];
                        itemsToMove.push({
                            type: item.type,
                            name: item.name,
                            count: item.count,
                            category: itemCategory,
                            fromChestIdx: chestIdx,
                            toChestIdx: correctChestIdx
                        });
                    }
                }

                await chest.close();
                await new Promise(r => setTimeout(r, 200));

            } catch (error) {
                logger.debug(`Error scanning chest ${chestIdx}: ${error.message}`);
            }
        }

        if (itemsToMove.length === 0) {
            this.sendChat('All items are already sorted correctly!');
            return;
        }

        this.sendChat(`Found ${itemsToMove.length} misplaced item stacks. Moving items between chests...`);

        // Phase 2: Move items from wrong chests to correct chests
        // Group by source chest to minimize trips
        const movesBySource = {};
        for (const move of itemsToMove) {
            if (!movesBySource[move.fromChestIdx]) {
                movesBySource[move.fromChestIdx] = [];
            }
            movesBySource[move.fromChestIdx].push(move);
        }

        let totalMoved = 0;

        for (const sourceIdx of Object.keys(movesBySource)) {
            const moves = movesBySource[sourceIdx];
            const sourceChest = chestData[parseInt(sourceIdx)];

            // Go to source chest and withdraw misplaced items
            try {
                await this.goToPosition(sourceChest.position.x, sourceChest.position.y, sourceChest.position.z, 2);
                const chest = await this.bot.openChest(sourceChest.block);

                for (const move of moves) {
                    try {
                        await chest.withdraw(move.type, null, move.count);
                        logger.info(`Withdrew ${move.name} x${move.count} from chest ${sourceIdx}`);
                    } catch (e) {
                        logger.debug(`Could not withdraw ${move.name}: ${e.message}`);
                    }
                }

                await chest.close();
                await new Promise(r => setTimeout(r, 200));

            } catch (error) {
                logger.debug(`Error withdrawing from chest ${sourceIdx}: ${error.message}`);
                continue;
            }

            // Group items in inventory by destination chest
            const itemsByDest = {};
            for (const move of moves) {
                if (!itemsByDest[move.toChestIdx]) {
                    itemsByDest[move.toChestIdx] = [];
                }
                itemsByDest[move.toChestIdx].push(move);
            }

            // Deposit to each destination chest
            for (const destIdx of Object.keys(itemsByDest)) {
                const destMoves = itemsByDest[destIdx];
                const destChest = chestData[parseInt(destIdx)];

                try {
                    await this.goToPosition(destChest.position.x, destChest.position.y, destChest.position.z, 2);
                    const chest = await this.bot.openChest(destChest.block);

                    for (const move of destMoves) {
                        let remainingToDeposit = move.count;
                        let attempts = 0;

                        // Loop until we deposited everything or ran out of items (max 5 loops prevent inf loop)
                        while (remainingToDeposit > 0 && attempts < 10) {
                            attempts++;
                            // Find any matching item in inventory
                            const invItem = this.bot.inventory.items().find(i =>
                                i.type === move.type && i.name === move.name
                            );

                            if (!invItem) break; // No more items found

                            try {
                                const splitAmount = Math.min(invItem.count, remainingToDeposit);
                                await chest.deposit(invItem.type, null, splitAmount);
                                remainingToDeposit -= splitAmount;

                                if (remainingToDeposit > 0) {
                                    // Wait a tick for inventory update
                                    await new Promise(r => setTimeout(r, 50));
                                }
                            } catch (e) {
                                logger.debug(`Could not deposit ${move.name}: ${e.message}`);
                                break; // Stop trying this move if deposit fails
                            }
                        }

                        if (remainingToDeposit === 0) {
                            totalMoved++;
                            logger.info(`Deposited ${move.name} (Total: ${move.count}) to chest ${destIdx}`);
                        }
                    }

                    await chest.close();
                    await new Promise(r => setTimeout(r, 200));

                } catch (error) {
                    logger.debug(`Error depositing to chest ${destIdx}: ${error.message}`);
                }
            }
        }

        // Deposit any remaining items in bot's inventory
        const remainingItems = this.bot.inventory.items();
        if (remainingItems.length > 0 && chestData.length > 0) {
            this.sendChat('Depositing remaining items...');

            for (const item of remainingItems) {
                const category = this.categorizeItem(item);
                const targetChestIdx = categoryToChest[category];
                const targetChest = chestData[targetChestIdx];

                try {
                    await this.goToPosition(targetChest.position.x, targetChest.position.y, targetChest.position.z, 2);
                    const chest = await this.bot.openChest(targetChest.block);

                    try {
                        await chest.deposit(item.type, null, item.count);
                        totalMoved++;
                    } catch (e) {
                        // Try first chest as fallback
                        logger.debug(`Could not deposit ${item.name}: ${e.message}`);
                    }

                    await chest.close();
                } catch (e) {
                    logger.debug(`Error depositing remaining item: ${e.message}`);
                }
            }
        }

        this.sendChat(`Chest sorting complete! Moved ${totalMoved} item stacks to correct chests.`);
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
