/**
 * Crafting Ability Module
 * Handles the -bot make command for crafting any item
 * Includes auto-crafting table creation and recursive material gathering
 */

const logger = require('../utils/logger');
const { getRecipe, resolveBlockAlias, craftingRecipes } = require('../data/recipes');

class CraftingAbility {
    constructor(bot, pathfinder) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.isActive = false;
        this.craftingTablePos = null;
    }

    /**
     * Execute make command
     * @param {object} command - Parsed command with target item
     */
    async execute(command) {
        this.isActive = true;
        const itemName = this.normalizeItemName(command.target);
        const count = command.count || 1;

        logger.info(`Crafting: ${itemName} x${count}`);

        // Build the to-do list
        this.todoList = [];
        this.buildTodoList(itemName, count, 0);

        // Check if we already have the item
        if (this.todoList.length === 0) {
            const currentCount = this.countInventoryItem(itemName);
            if (currentCount >= count) {
                this.sendChat(`Already have ${itemName} x${currentCount}!`);
                this.isActive = false;
                return;
            } else {
                this.sendChat(`Cannot craft ${itemName} - unknown recipe or missing materials`);
                this.isActive = false;
                return;
            }
        }

        // Log the to-do list (without spamming chat)
        logger.info(`Crafting plan for ${itemName}: ${this.todoList.length} steps`);
        for (let i = 0; i < this.todoList.length; i++) {
            const task = this.todoList[i];
            logger.info(`  Step ${i + 1}: ${task.action} ${task.item} x${task.count}`);
        }

        try {
            for (let i = 0; i < this.todoList.length; i++) {
                if (!this.isActive) break;

                const task = this.todoList[i];

                // Check if we already have this item (skip silently)
                const currentCount = this.countInventoryItem(task.item);
                if (currentCount >= task.count) {
                    logger.info(`Step ${i + 1}: SKIP - Already have ${task.item} (${currentCount})`);
                    task.status = 'skipped';
                    continue;
                }

                logger.info(`Step ${i + 1}: ${task.action} ${task.item}...`);

                // Execute the task
                const success = await this.executeTask(task);

                if (success) {
                    task.status = 'done';
                    logger.info(`Step ${i + 1}: DONE - ${task.item}`);
                } else {
                    task.status = 'failed';
                    this.sendChat(`Failed to get ${task.item}`);
                    break;
                }

                await this.delay(200);
            }

            // Check if final item was crafted
            const finalCount = this.countInventoryItem(itemName);
            if (finalCount >= count) {
                this.sendChat(`🎉 Crafted ${itemName} x${count}!`);
            } else {
                this.sendChat(`Could not complete crafting ${itemName}`);
            }

        } catch (error) {
            logger.error(`Crafting error: ${error.message}`);
            this.sendChat(`Crafting failed: ${error.message}`);
        }

        this.isActive = false;
    }

    /**
     * Build a to-do list for crafting an item
     */
    buildTodoList(itemName, count, depth) {
        logger.info(`[buildTodoList] Item: ${itemName}, Count: ${count}, Depth: ${depth}`);

        if (depth > 10) {
            logger.warn(`[buildTodoList] Max depth reached for ${itemName}`);
            return;
        }

        // Check if we already have enough
        const currentCount = this.countInventoryItem(itemName);
        logger.info(`[buildTodoList] ${itemName}: have ${currentCount}, need ${count}`);

        if (currentCount >= count) {
            logger.info(`[buildTodoList] Already have enough ${itemName}, skipping`);
            return;
        }

        const needed = count - currentCount;
        logger.info(`[buildTodoList] ${itemName}: need to get ${needed} more`);

        // Special handling for generic ingredient names
        // 'planks' - needs logs to craft
        if (itemName === 'planks') {
            logger.info(`[buildTodoList] PLANKS special handling triggered`);
            // Check if we have any planks already
            const planksHave = this.findPlanksInInventory();
            const planksCount = planksHave ? planksHave.count : 0;
            logger.info(`[buildTodoList] Planks in inventory: ${planksCount}, needed: ${needed}`);

            if (planksCount >= needed) {
                logger.info(`[buildTodoList] Already have enough planks`);
                return;
            }

            const planksNeeded = needed - planksCount;
            const logsNeeded = Math.ceil(planksNeeded / 4);
            logger.info(`[buildTodoList] Need ${planksNeeded} planks, ${logsNeeded} logs`);

            // Add log gathering task
            this.todoList.push({
                action: 'gather',
                item: 'oak_log',
                count: logsNeeded,
                status: 'pending'
            });

            // Add planks crafting task  
            this.todoList.push({
                action: 'craft',
                item: 'planks',
                count: planksNeeded,
                status: 'pending'
            });
            return;
        }

        // 'stick' - needs planks to craft
        if (itemName === 'stick') {
            logger.info(`[buildTodoList] STICK special handling triggered`);
            const sticksHave = this.countInventoryItem('stick');
            if (sticksHave >= count) {
                logger.info(`[buildTodoList] Already have enough sticks`);
                return;
            }

            const sticksNeeded = count - sticksHave;
            const planksNeeded = Math.ceil(sticksNeeded / 2);
            logger.info(`[buildTodoList] Need ${sticksNeeded} sticks, ${planksNeeded} planks`);

            // Ensure we have planks first
            this.buildTodoList('planks', planksNeeded, depth + 1);

            // Add sticks crafting task
            this.todoList.push({
                action: 'craft',
                item: 'stick',
                count: sticksNeeded,
                status: 'pending'
            });
            return;
        }

        // Get the recipe
        const recipe = this.findRecipe(itemName);
        logger.info(`[buildTodoList] Recipe for ${itemName}: ${recipe ? 'found' : 'NOT FOUND'}`);

        if (!recipe) {
            // This is a raw material - need to mine/gather it
            logger.info(`[buildTodoList] Adding GATHER task for ${itemName} x${needed}`);
            this.todoList.push({
                action: 'gather',
                item: itemName,
                count: needed,
                status: 'pending'
            });
            return;
        }

        // First, ensure we have crafting table if needed
        if (recipe.needsTable) {
            const hasTable = this.countInventoryItem('crafting_table') > 0 ||
                this.findNearbyCraftingTableSync();
            if (!hasTable) {
                // Need crafting table - add its dependencies first
                this.buildTodoList('crafting_table', 1, depth + 1);
            }
        }

        // Add ingredient tasks (recursively)
        if (recipe.ingredients) {
            for (const [ingredient, amount] of Object.entries(recipe.ingredients)) {
                const ingredientNeeded = amount * Math.ceil(needed / (recipe.count || 1));
                this.buildTodoList(ingredient, ingredientNeeded, depth + 1);
            }
        }

        // Add the crafting task itself
        this.todoList.push({
            action: 'craft',
            item: itemName,
            count: needed,
            recipe: recipe,
            status: 'pending'
        });
    }

    /**
     * Synchronous check for nearby crafting table
     */
    findNearbyCraftingTableSync() {
        try {
            const mcData = require('minecraft-data')(this.bot.version);
            const tableId = mcData.blocksByName['crafting_table']?.id;
            if (!tableId) return false;

            const blocks = this.bot.findBlocks({
                matching: [tableId],
                maxDistance: 32,
                count: 1
            });

            return blocks.length > 0;
        } catch (e) {
            return false;
        }
    }

    /**
     * Execute a single task from the to-do list
     */
    async executeTask(task) {
        if (task.action === 'gather') {
            return await this.gatherItem(task.item, task.count);
        } else if (task.action === 'craft') {
            return await this.craftSingleItem(task.item, task.count, task.recipe);
        }
        return false;
    }

    /**
     * Gather/mine a raw material
     */
    async gatherItem(itemName, count) {
        // Handle special cases
        if (itemName === 'planks' || itemName.endsWith('_planks')) {
            return await this.ensurePlanks(count);
        }
        if (itemName === 'stick') {
            return await this.ensureSticks(count);
        }
        if (itemName.includes('log')) {
            return await this.ensureLogs(count);
        }

        // General mining
        return await this.mineIngredient(itemName, count);
    }

    /**
     * Ensure we have enough planks
     */
    async ensurePlanks(count) {
        let planks = this.findPlanksInInventory();
        if (planks && planks.count >= count) return true;

        // Get logs and convert
        const logsNeeded = Math.ceil(count / 4);
        if (await this.ensureLogs(logsNeeded)) {
            await this.convertLogsToPlanks();
            planks = this.findPlanksInInventory();
            return planks && planks.count >= count;
        }
        return false;
    }

    /**
     * Ensure we have enough sticks
     */
    async ensureSticks(count) {
        if (this.countInventoryItem('stick') >= count) return true;

        // Ensure planks first
        const planksNeeded = Math.ceil(count / 2);
        await this.ensurePlanks(planksNeeded);

        // Craft sticks
        return await this.craftSticks(count);
    }

    /**
     * Craft a single item (without recursive dependency checking)
     */
    async craftSingleItem(itemName, count, recipe) {
        // Special handling for generic items that don't have direct recipes
        if (itemName === 'planks') {
            return await this.ensurePlanks(count);
        }
        if (itemName === 'stick') {
            return await this.craftSticks(count);
        }

        if (!recipe) {
            recipe = this.findRecipe(itemName);
        }

        if (!recipe) {
            logger.debug(`No recipe found for ${itemName}`);
            return false;
        }

        // Ensure crafting table if needed
        if (recipe.needsTable) {
            const hasTable = await this.ensureCraftingTable();
            if (!hasTable) return false;
        }

        // Perform the craft
        return await this.performCraft(itemName, recipe, count);
    }

    /**
     * Normalize item name to match recipe database
     */
    normalizeItemName(name) {
        let normalized = name.toLowerCase().replace(/-/g, '_');

        // Common aliases
        const aliases = {
            'pickaxe': 'wooden_pickaxe',
            'axe': 'wooden_axe',
            'sword': 'wooden_sword',
            'shovel': 'wooden_shovel',
            'table': 'crafting_table',
            'workbench': 'crafting_table',
            'sticks': 'stick',
            'plank': 'oak_planks',
            'planks': 'oak_planks',
            'torch': 'torch',
            'bed': 'bed',
            'chest': 'chest',
            'furnace': 'furnace',
        };

        return aliases[normalized] || normalized;
    }

    /**
     * Main crafting function - handles recursive material gathering
     */
    async craftItem(itemName, count = 1) {
        if (!this.isActive) return false;

        // Get the recipe
        const recipe = this.findRecipe(itemName);

        if (!recipe) {
            this.sendChat(`Unknown recipe: ${itemName}`);
            return false;
        }

        logger.info(`Recipe for ${itemName}: ${JSON.stringify(recipe.ingredients)}`);

        // Check if we need a crafting table
        if (recipe.needsTable) {
            const hasTable = await this.ensureCraftingTable();
            if (!hasTable) {
                this.sendChat(`Need crafting table for ${itemName}`);
                return false;
            }
        }

        // Check and gather materials
        const hasIngredients = await this.ensureIngredients(recipe.ingredients, count);
        if (!hasIngredients) {
            return false;
        }

        // Perform the craft
        return await this.performCraft(itemName, recipe, count);
    }

    /**
     * Find recipe for an item (checking multiple variants)
     */
    findRecipe(itemName) {
        // Try direct match
        let recipe = getRecipe(itemName);
        if (recipe) return recipe;

        // Try with _planks suffix variants
        const plankTypes = ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak'];

        // If recipe requires "planks", any planks type works
        for (const [name, r] of Object.entries(craftingRecipes)) {
            if (name === itemName || r.output === itemName) {
                return { ...r, name };
            }
        }

        return null;
    }

    /**
     * Ensure we have a crafting table available
     */
    async ensureCraftingTable() {
        // Check inventory first
        const tableInInventory = this.bot.inventory.items().find(
            item => item.name === 'crafting_table'
        );

        if (tableInInventory) {
            // Place the crafting table
            return await this.placeCraftingTable(tableInInventory);
        }

        // Find nearby crafting table
        this.craftingTablePos = await this.findNearbyCraftingTable();
        if (this.craftingTablePos) {
            return true;
        }

        // Need to craft a crafting table first
        logger.info('Crafting a crafting table first...');

        // Check for planks
        const planks = this.findPlanksInInventory();
        if (planks && planks.count >= 4) {
            // Craft the table
            const success = await this.craftCraftingTable();
            if (success) {
                const tableItem = this.bot.inventory.items().find(
                    item => item.name === 'crafting_table'
                );
                if (tableItem) {
                    return await this.placeCraftingTable(tableItem);
                }
            }
        }

        // Need to get logs first
        const hasLogs = await this.ensureLogs(4);
        if (!hasLogs) return false;

        // Convert logs to planks
        await this.convertLogsToPlanks();

        // Now craft the table
        const success = await this.craftCraftingTable();
        if (success) {
            const tableItem = this.bot.inventory.items().find(
                item => item.name === 'crafting_table'
            );
            if (tableItem) {
                return await this.placeCraftingTable(tableItem);
            }
        }

        return false;
    }

    /**
     * Find any planks type in inventory
     */
    findPlanksInInventory() {
        const plankTypes = ['oak_planks', 'birch_planks', 'spruce_planks',
            'jungle_planks', 'acacia_planks', 'dark_oak_planks',
            'mangrove_planks', 'cherry_planks'];

        for (const plankType of plankTypes) {
            const planks = this.bot.inventory.items().find(item => item.name === plankType);
            if (planks) return planks;
        }
        return null;
    }

    /**
     * Find logs in inventory
     */
    findLogsInInventory() {
        const logTypes = ['oak_log', 'birch_log', 'spruce_log',
            'jungle_log', 'acacia_log', 'dark_oak_log',
            'mangrove_log', 'cherry_log'];

        for (const logType of logTypes) {
            const logs = this.bot.inventory.items().find(item => item.name === logType);
            if (logs) return logs;
        }
        return null;
    }

    /**
     * Ensure we have logs (mine if needed)
     */
    async ensureLogs(count) {
        let logs = this.findLogsInInventory();
        if (logs && logs.count >= count) return true;

        logger.info('Getting wood...');

        // Mine some trees
        const logBlocks = resolveBlockAlias('log');
        const mcData = require('minecraft-data')(this.bot.version);

        const blockIds = logBlocks
            .map(name => mcData.blocksByName[name]?.id)
            .filter(id => id !== undefined);

        const blocks = this.bot.findBlocks({
            matching: blockIds,
            maxDistance: 32,
            count: count
        });

        for (const blockPos of blocks) {
            if (!this.isActive) return false;

            const block = this.bot.blockAt(blockPos);
            if (!block) continue;

            try {
                await this.bot.lookAt(blockPos);

                // Move closer if needed
                const distance = this.bot.entity.position.distanceTo(blockPos);
                if (distance > 4) {
                    await this.moveToBlock(block);
                }

                await this.bot.dig(block);
                await this.delay(200);

                logs = this.findLogsInInventory();
                if (logs && logs.count >= count) return true;

            } catch (error) {
                logger.debug(`Failed to mine log: ${error.message}`);
            }
        }

        logs = this.findLogsInInventory();
        return logs && logs.count >= count;
    }

    /**
     * Convert logs to planks
     */
    async convertLogsToPlanks() {
        const logs = this.findLogsInInventory();
        if (!logs) return false;

        const plankType = logs.name.replace('_log', '_planks');

        try {
            const mcData = require('minecraft-data')(this.bot.version);
            const plankId = mcData.itemsByName[plankType]?.id;

            if (!plankId) return false;

            const recipes = this.bot.recipesFor(plankId, null, 1, null);
            if (recipes.length > 0) {
                await this.bot.craft(recipes[0], 1);
                logger.info('Converted logs to planks');
                return true;
            }
        } catch (error) {
            logger.debug(`Failed to craft planks: ${error.message}`);
        }

        return false;
    }

    /**
     * Craft a crafting table (2x2 recipe)
     */
    async craftCraftingTable() {
        try {
            const mcData = require('minecraft-data')(this.bot.version);
            const tableId = mcData.itemsByName['crafting_table']?.id;

            if (!tableId) return false;

            const recipes = this.bot.recipesFor(tableId, null, 1, null);
            if (recipes.length > 0) {
                await this.bot.craft(recipes[0], 1);
                logger.info('Crafted crafting table');
                return true;
            }
        } catch (error) {
            logger.debug(`Failed to craft crafting table: ${error.message}`);
        }

        return false;
    }

    /**
     * Find a nearby crafting table
     */
    async findNearbyCraftingTable() {
        const mcData = require('minecraft-data')(this.bot.version);
        const tableId = mcData.blocksByName['crafting_table']?.id;

        if (!tableId) return null;

        const blocks = this.bot.findBlocks({
            matching: [tableId],
            maxDistance: 32,
            count: 1
        });

        if (blocks.length > 0) {
            return blocks[0];
        }

        return null;
    }

    /**
     * Place a crafting table from inventory
     */
    /**
     * Place a crafting table from inventory
     */
    async placeCraftingTable(tableItem) {
        try {
            await this.bot.equip(tableItem, 'hand');

            // Find a suitable spot to place it (solid block with air on top)
            const botPos = this.bot.entity.position;
            const mcData = require('minecraft-data')(this.bot.version);

            // Search in a small radius around bot
            const offsets = [
                { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
                { x: 1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: 1 }, { x: -1, z: -1 }
            ];

            for (const offset of offsets) {
                // Check blocks at this offset
                const targetPos = botPos.offset(offset.x, 0, offset.z).floored();

                // We want to place on top of ground-level block (y-1)
                const groundPos = targetPos.offset(0, -1, 0);
                const groundBlock = this.bot.blockAt(groundPos);
                const spaceBlock = this.bot.blockAt(targetPos);

                // Check if ground is solid and space is air
                if (groundBlock && groundBlock.boundingBox === 'block' &&
                    spaceBlock && spaceBlock.name === 'air') {

                    // Found a spot!
                    logger.info(`Placing crafting table at ${targetPos}`);
                    try {
                        await this.bot.placeBlock(groundBlock, { x: 0, y: 1, z: 0 });
                        this.craftingTablePos = targetPos;
                        return true;
                    } catch (err) {
                        logger.debug(`Failed to place at ${targetPos}: ${err.message}`);
                        // Continue searching
                    }
                }
            }

            logger.warn('Could not find suitable spot for crafting table');
            return false;

        } catch (error) {
            logger.debug(`Failed to place crafting table: ${error.message}`);
        }

        return false;
    }

    /**
     * Ensure we have all ingredients for a recipe
     */
    async ensureIngredients(ingredients, multiplier = 1) {
        for (const [ingredient, amount] of Object.entries(ingredients)) {
            const needed = amount * multiplier;
            const have = this.countInventoryItem(ingredient);

            if (have < needed) {
                // Try to craft or gather the ingredient
                const acquired = await this.acquireIngredient(ingredient, needed - have);
                if (!acquired) {
                    this.sendChat(`Missing: ${ingredient} (need ${needed - have} more)`);
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Try to acquire an ingredient (craft or gather)
     */
    async acquireIngredient(ingredient, count) {
        // Handle "planks" generic ingredient
        if (ingredient === 'planks') {
            const planks = this.findPlanksInInventory();
            if (planks && planks.count >= count) return true;

            // Get logs and convert
            const logsNeeded = Math.ceil(count / 4);
            if (await this.ensureLogs(logsNeeded)) {
                await this.convertLogsToPlanks();
                return this.findPlanksInInventory()?.count >= count;
            }
            return false;
        }

        // Handle "stick" crafting
        if (ingredient === 'stick') {
            if (this.countInventoryItem('stick') >= count) return true;

            // Ensure we have planks
            const planksNeeded = Math.ceil(count / 2);
            await this.acquireIngredient('planks', planksNeeded);

            // Craft sticks
            return await this.craftSticks(count);
        }

        // Check if we can craft it
        const recipe = this.findRecipe(ingredient);
        if (recipe) {
            return await this.craftItem(ingredient, count);
        }

        // Otherwise try to mine it
        return await this.mineIngredient(ingredient, count);
    }

    /**
     * Craft sticks
     */
    async craftSticks(count) {
        try {
            const mcData = require('minecraft-data')(this.bot.version);
            const stickId = mcData.itemsByName['stick']?.id;

            if (!stickId) return false;

            const recipes = this.bot.recipesFor(stickId, null, 1, null);
            if (recipes.length > 0) {
                const craftCount = Math.ceil(count / 4);
                await this.bot.craft(recipes[0], craftCount);
                return true;
            }
        } catch (error) {
            logger.debug(`Failed to craft sticks: ${error.message}`);
        }
        return false;
    }

    /**
     * Mine an ingredient
     */
    async mineIngredient(ingredient, count) {
        const blockNames = resolveBlockAlias(ingredient);
        const mcData = require('minecraft-data')(this.bot.version);

        const blockIds = blockNames
            .map(name => mcData.blocksByName[name]?.id)
            .filter(id => id !== undefined);

        if (blockIds.length === 0) return false;

        const blocks = this.bot.findBlocks({
            matching: blockIds,
            maxDistance: 48,
            count: count
        });

        let mined = 0;
        for (const blockPos of blocks) {
            if (!this.isActive || mined >= count) break;

            const block = this.bot.blockAt(blockPos);
            if (!block) continue;

            try {
                await this.moveToBlock(block);
                await this.bot.dig(block);
                mined++;
                await this.delay(200);
            } catch (error) {
                logger.debug(`Failed to mine ${ingredient}: ${error.message}`);
            }
        }

        return mined > 0;
    }

    /**
     * Perform the actual crafting
     */
    async performCraft(itemName, recipe, count) {
        try {
            const mcData = require('minecraft-data')(this.bot.version);
            const itemId = mcData.itemsByName[itemName]?.id;

            if (!itemId) {
                logger.debug(`Unknown item ID for ${itemName}`);
                return false;
            }

            // Get crafting table block if needed
            let craftingTable = null;
            if (recipe.needsTable && this.craftingTablePos) {
                craftingTable = this.bot.blockAt(this.craftingTablePos);

                // Move to the crafting table
                if (craftingTable) {
                    const distance = this.bot.entity.position.distanceTo(this.craftingTablePos);
                    if (distance > 4) {
                        await this.moveToBlock(craftingTable);
                    }
                }
            }

            const recipes = this.bot.recipesFor(itemId, null, 1, craftingTable);

            if (recipes.length === 0) {
                logger.debug(`No recipes found for ${itemName}`);
                return false;
            }

            const craftCount = Math.ceil(count / recipe.count);
            await this.bot.craft(recipes[0], craftCount, craftingTable);

            logger.info(`Crafted ${itemName} x${craftCount * recipe.count}`);
            return true;

        } catch (error) {
            logger.error(`Craft error: ${error.message}`);
            return false;
        }
    }

    /**
     * Count how many of an item we have
     */
    countInventoryItem(itemName) {
        const items = this.bot.inventory.items();
        let count = 0;

        for (const item of items) {
            if (item.name === itemName) {
                count += item.count;
            }
            // Handle generic planks
            if (itemName === 'planks' && item.name.endsWith('_planks')) {
                count += item.count;
            }
        }

        return count;
    }

    /**
     * Move to a block
     */
    /**
     * Move to a block using pathfinder if available
     */
    async moveToBlock(block) {
        if (!block) return;
        const position = block.position;

        // Use pathfinder if available (much better)
        if (this.bot.pathfinder) {
            const { goals } = require('mineflayer-pathfinder');
            const goal = new goals.GoalNear(position.x, position.y, position.z, 3); // Get within 3 blocks
            try {
                await this.bot.pathfinder.goto(goal);
                return;
            } catch (err) {
                logger.debug(`Pathfinding failed: ${err.message}, falling back to basic move`);
            }
        }

        // Fallback basic movement
        const maxTime = 10000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxTime && this.isActive) {
            const distance = this.bot.entity.position.distanceTo(position);

            if (distance <= 4) {
                this.stopMovement();
                return;
            }

            await this.bot.lookAt(position);
            this.bot.setControlState('forward', true);

            if (this.bot.entity.onGround && this.isBlockedAhead()) {
                this.bot.setControlState('jump', true);
                await this.delay(100);
                this.bot.setControlState('jump', false);
            }

            await this.delay(100);
        }

        this.stopMovement();
    }

    /**
     * Check if blocked ahead
     */
    isBlockedAhead() {
        const ahead = this.bot.entity.position.offset(
            -Math.sin(this.bot.entity.yaw) * 1,
            0,
            -Math.cos(this.bot.entity.yaw) * 1
        );
        const blockAhead = this.bot.blockAt(ahead);
        return blockAhead && blockAhead.name !== 'air';
    }

    /**
     * Stop crafting
     */
    async stop() {
        this.isActive = false;
        this.stopMovement();
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

module.exports = CraftingAbility;
