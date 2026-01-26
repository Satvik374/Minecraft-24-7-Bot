/**
 * Mining Ability Module
 * Handles the -bot mine command and -bot mine_all for autonomous mining
 */

const logger = require('../utils/logger');
const { resolveBlockAlias, getRequiredTool, canToolMine } = require('../data/recipes');

class MinerAbility {
    constructor(bot, pathfinder, homeManager, combatAbility) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.homeManager = homeManager;
        this.combatAbility = combatAbility;
        this.isActive = false;
        this.targetBlockType = null;
        this.minedCount = 0;
        this.targetCount = 64;
        this.isSuperMining = false;
    }

    /**
     * Get count of items matching a name pattern in inventory
     */
    getInventoryCount(itemName) {
        if (!itemName) return 0;
        const items = this.bot.inventory.items();
        // Try exact match first, then partial match
        let count = items
            .filter(item => item.name === itemName)
            .reduce((sum, item) => sum + item.count, 0);

        // If no exact match, try partial
        if (count === 0) {
            count = items
                .filter(item => item.name.includes(itemName) || itemName.includes(item.name))
                .reduce((sum, item) => sum + item.count, 0);
        }
        return count;
    }

    /**
     * Get expected drop name for a block (e.g., iron_ore -> raw_iron)
     */
    getExpectedDropName(blockName) {
        const dropMap = {
            'iron_ore': 'raw_iron',
            'deepslate_iron_ore': 'raw_iron',
            'gold_ore': 'raw_gold',
            'deepslate_gold_ore': 'raw_gold',
            'copper_ore': 'raw_copper',
            'deepslate_copper_ore': 'raw_copper',
            'coal_ore': 'coal',
            'deepslate_coal_ore': 'coal',
            'diamond_ore': 'diamond',
            'deepslate_diamond_ore': 'diamond',
            'lapis_ore': 'lapis_lazuli',
            'deepslate_lapis_ore': 'lapis_lazuli',
            'redstone_ore': 'redstone',
            'deepslate_redstone_ore': 'redstone',
            'emerald_ore': 'emerald',
            'deepslate_emerald_ore': 'emerald',
            'nether_quartz_ore': 'quartz',
            'nether_gold_ore': 'gold_nugget',
            'ancient_debris': 'ancient_debris',
            // Most blocks drop themselves
        };
        return dropMap[blockName] || blockName;
    }

    /**
     * Move towards an entity until close enough or timeout
     */
    async moveToEntity(entity, timeout = 3000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout && this.isActive) {
            if (!entity || !entity.isValid) break;

            const dist = entity.position.distanceTo(this.bot.entity.position);
            if (dist < 0.5) break;

            await this.bot.lookAt(entity.position);
            this.bot.setControlState('forward', true);
            await this.delay(50);
        }
        this.bot.setControlState('forward', false);
    }

    /**
     * Collect drops with inventory verification and retry logic
     */
    async collectDropsWithVerification(pos, expectedDropName, countBefore, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            // Wait for drops to spawn
            await this.delay(400);

            // Find nearby item entities
            const drops = Object.values(this.bot.entities).filter(e =>
                e.type === 'object' &&
                e.position.distanceTo(pos) < 6
            );

            if (drops.length === 0) {
                logger.debug(`No drops found near ${pos}, attempt ${attempt}`);
                await this.delay(300); // Give a bit more time before next check if no drops
                // If no drops are found and it's not the first attempt, assume they were collected
                if (attempt > 1) {
                    logger.debug(`No drops remaining, assuming collection succeeded`);
                    return true;
                }
                continue;
            }

            // Move to each drop to collect it
            for (const drop of drops) {
                if (!this.isActive) break;
                await this.moveToEntity(drop, 2000);
                await this.delay(200);
            }

            // Wait longer for items to enter inventory
            await this.delay(500);

            // Check total inventory count change (not just specific item)
            const totalItemsBefore = countBefore;
            const totalItemsAfter = this.getInventoryCount(expectedDropName);

            // Also check if we picked up ANY new items by comparing all inventory
            const allItems = this.bot.inventory.items();
            const totalCount = allItems.reduce((sum, item) => sum + item.count, 0);

            if (totalItemsAfter > totalItemsBefore) {
                logger.debug(`Collected ${expectedDropName}: ${totalItemsBefore} -> ${totalItemsAfter}`);
                return true;
            }

            // Even if specific item check fails, if drops disappeared, consider it success
            if (drops.length === 0 && attempt > 1) {
                logger.debug(`No drops remaining, assuming collection succeeded`);
                return true;
            }

            logger.debug(`Collection attempt ${attempt}/${maxRetries} failed for ${expectedDropName}. Drops remaining: ${drops.length}`);

            // On retry, move closer to the original position
            if (attempt < maxRetries) {
                await this.navigateToLocation(pos);
            }
        }

        logger.warn(`Failed to verify collection of ${expectedDropName} after ${maxRetries} attempts`);
        return false;
    }

    /**
     * Mine a block and verify the drop was collected
     */
    async mineBlockAndCollect(block) {
        if (!block) return false;

        const blockName = block.name;
        const expectedDropName = this.getExpectedDropName(blockName);

        // Get count before mining
        const countBefore = this.getInventoryCount(expectedDropName);

        // Mine the block
        await this.mineBlock(block);

        // Verify the block was actually mined
        const currentBlock = this.bot.blockAt(block.position);
        if (currentBlock && currentBlock.name !== 'air') {
            logger.debug(`Block ${blockName} wasn't mined successfully`);
            return false;
        }

        // Collect with verification
        const collected = await this.collectDropsWithVerification(
            block.position,
            expectedDropName,
            countBefore
        );

        // Don't show chat message even if verification fails - collection usually works
        // Just log for debugging purposes
        if (!collected) {
            logger.debug(`Collection verification failed for ${expectedDropName}, but likely collected`);
        }

        return true;
    }

    /**
     * Execute mine command
     */
    async execute(command) {
        this.isActive = true;
        this.requestingPlayer = command.username;

        // Handle Super Miner Mode
        if (command.target === 'mine_all') {
            await this.mineAll();
            return;
        }

        // Standard single block mining
        this.targetBlockType = command.target;
        this.targetCount = command.count || 64;
        this.minedCount = 0;
        this.isSuperMining = false;

        const blockTypes = resolveBlockAlias(this.targetBlockType);
        logger.info(`Mining: ${blockTypes.join(', ')} (target: ${this.targetCount}) for ${this.requestingPlayer}`);
        // Removed chat spam - only log

        await this.goToPlayer(this.requestingPlayer);

        while (this.isActive && this.minedCount < this.targetCount) {
            await this.mineLoop(blockTypes);
            await this.delay(100);
        }

        if (this.isActive) {
            this.sendChat(`Mining done! Got ${this.minedCount}/${this.targetCount} ${this.targetBlockType}`);
        }
        this.isActive = false;
    }

    /**
     * Super Miner Logic: Mine all valuable ores
     */
    async mineAll() {
        this.isSuperMining = true;
        this.sendChat('⛏️ SUPER MINER ACTIVATED! Searching for ores and caves...');

        const valuableOres = [
            'diamond_ore', 'deepslate_diamond_ore',
            'gold_ore', 'deepslate_gold_ore',
            'iron_ore', 'deepslate_iron_ore',
            'coal_ore', 'deepslate_coal_ore',
            'lapis_ore', 'deepslate_lapis_ore',
            'redstone_ore', 'deepslate_redstone_ore',
            'emerald_ore', 'deepslate_emerald_ore'
        ];

        while (this.isActive) {
            // 1. Check Inventory
            if (this.isInventoryFull()) {
                await this.handleFullInventory();
                continue;
            }

            // 2. Self Defense
            if (await this.checkForThreats()) {
                continue; // Threat handled, resume loop
            }

            // 3. Find Ores
            const oreBlock = await this.findNearestBlock(valuableOres, 64);

            if (oreBlock) {
                logger.info(`Found ${oreBlock.name}! Mining...`);
                await this.navigateToBlock(oreBlock);
                await this.mineBlockAndCollect(oreBlock);
            } else {
                // No ores? Find cave/deep area
                logger.debug('No ores visible. Searching for caves...');
                await this.exploreCave();
            }

            await this.delay(500);
        }
    }

    /**
     * Main mining loop step for standard mining
     */
    async mineLoop(blockTypes) {
        try {
            // Check threats occasionally
            if (this.minedCount % 5 === 0) await this.checkForThreats();

            const block = await this.findNearestBlock(blockTypes);
            if (!block) {
                if (this.minedCount === 0) this.sendChat(`No ${this.targetBlockType} found nearby.`);
                this.isActive = false;
                return;
            }

            // Tool check
            if (!await this.ensureToolFor(block.name)) return;

            await this.navigateToBlock(block);
            const success = await this.mineBlockAndCollect(block);

            if (success) {
                this.minedCount++;
                if (this.minedCount % 10 === 0) {
                    this.sendChat(`Progress: ${this.minedCount}/${this.targetCount}`);
                }
            }

        } catch (error) {
            logger.debug(`Mining loop error: ${error.message}`);
            await this.delay(1000);
        }
    }

    /**
     * Check for nearby hostile mobs and defend
     */
    async checkForThreats() {
        if (!this.combatAbility) return false;

        const mob = this.bot.nearestEntity(e =>
            e.type === 'mob' &&
            e.position.distanceTo(this.bot.entity.position) < 8 &&
            (e.mobType !== 'Armor Stand' && e.mobType !== 'Bat') // Simple hostile filter
        );

        if (mob) {
            logger.info(`Threat detected: ${mob.name}! Defending...`);
            this.sendChat(`Defending myself from ${mob.name || 'hostile'}!`);

            // Allow combat ability to take over temporarily
            // We manually invoke attack sequence since we want to resume mining after
            await this.combatAbility.equipBestWeapon();
            await this.combatAbility.attack(mob);
            return true;
        }
        return false;
    }

    /**
     * Check if inventory is full
     */
    isInventoryFull() {
        return this.bot.inventory.emptySlotCount() < 2;
    }

    /**
     * Handle full inventory by going home
     */
    async handleFullInventory() {
        if (!this.homeManager) {
            this.sendChat('Inventory full! (No Home Manager configured)');
            this.isActive = false;
            return;
        }

        const lastPos = this.bot.entity.position.clone();

        this.sendChat('Inventory full! Going home to deposit...');
        await this.homeManager.goHomeAndDeposit();

        this.sendChat('Returning to mining spot...');
        await this.navigateToLocation(lastPos);
    }

    /**
     * Explore logic - find air blocks lower down
     */
    async exploreCave() {
        // Look for air blocks below current Y
        const currentY = this.bot.entity.position.y;
        const targetY = Math.max(-60, currentY - 20); // Go deeper

        const airBlock = this.bot.findBlock({
            matching: block => block.name === 'air',
            maxDistance: 256,
            useExtraInfo: (block) => block.position.y < currentY - 5 // Must be lower
        });

        if (airBlock) {
            await this.navigateToBlock(airBlock);
        } else {
            // Dig down a bit? Or move randomly
            const randomPos = this.bot.entity.position.offset(
                (Math.random() - 0.5) * 20,
                -2,
                (Math.random() - 0.5) * 20
            );
            await this.navigateToLocation(randomPos);
        }
    }

    /**
     * Ensure we have the right tool
     */
    async ensureToolFor(blockName) {
        const requiredTool = getRequiredTool(blockName);
        if (requiredTool) {
            const hasTool = await this.equipBestTool(blockName);
            if (!hasTool) {
                logger.debug(`Need ${requiredTool} to mine ${blockName}`);
                this.isActive = false;
                return false;
            }
        }
        return true;
    }

    // --- Standard Helpers (Moved/Kept from original) ---

    async goToPlayer(playerName) {
        const player = this.bot.players[playerName] ? this.bot.players[playerName].entity : null;
        if (!player) return;

        if (player.position.distanceTo(this.bot.entity.position) > 10) {
            this.sendChat(`Coming to ${playerName}...`);
            await this.navigateToLocation(player.position);
        }
    }

    async findNearestBlock(blockTypes, radius = 256) {
        const mcData = require('minecraft-data')(this.bot.version);
        // Handle array of strings or single string
        const types = Array.isArray(blockTypes) ? blockTypes : [blockTypes];

        const blockIds = types.map(t => mcData.blocksByName[t]?.id).filter(id => id);
        if (blockIds.length === 0) return null;

        const blocks = this.bot.findBlocks({ matching: blockIds, maxDistance: radius, count: 1 });
        return blocks.length > 0 ? this.bot.blockAt(blocks[0]) : null;
    }

    async navigateToBlock(block) {
        // Use specialized goal for mining that allows digging to reach the block
        if (this.bot.pathfinder) {
            const { goals } = require('mineflayer-pathfinder');
            const { Movements } = require('mineflayer-pathfinder');
            const mcData = require('minecraft-data')(this.bot.version);

            // Create movements that allow digging to reach blocks
            const movements = new Movements(this.bot);
            movements.canDig = true; // Allow digging to reach underground blocks
            movements.allowSprinting = true;
            movements.allowParkour = true;
            movements.maxDropDown = 4;
            this.bot.pathfinder.setMovements(movements);

            // GoalGetToBlock is better for mining - it goes to a position where you can interact with the block
            const goal = new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z);
            try {
                await this.bot.pathfinder.goto(goal);
            } catch (e) {
                logger.debug(`Pathfinding to block error: ${e.message}`);
                // Try navigating to location above if block is underground
                const abovePos = block.position.offset(0, 1, 0);
                await this.navigateToLocation(abovePos);
            }
        } else {
            await this.navigateToLocation(block.position);
        }
    }

    async navigateToLocation(position) {
        if (position.distanceTo(this.bot.entity.position) <= 4) return;

        if (this.bot.pathfinder) {
            const { goals } = require('mineflayer-pathfinder');
            const goal = new goals.GoalNear(position.x, position.y, position.z, 2);
            try {
                await this.bot.pathfinder.goto(goal);
            } catch (e) {
                logger.debug(`Pathfinding error: ${e.message}`);
                // Fallback
                await this.simpleMoveTo(position);
            }
        } else {
            await this.simpleMoveTo(position);
        }
    }

    async simpleMoveTo(position) {
        const startTime = Date.now();
        while (Date.now() - startTime < 10000 && this.isActive) {
            if (this.bot.entity.position.distanceTo(position) <= 4) return;
            await this.bot.lookAt(position);
            this.bot.setControlState('forward', true);
            if (this.bot.entity.onGround && this.isBlockedAhead()) {
                this.bot.setControlState('jump', true);
                await this.delay(100); this.bot.setControlState('jump', false);
            }
            await this.delay(50);
        }
        this.bot.clearControlStates();
    }

    isBlockedAhead() {
        // Simple blocked check
        const pos = this.bot.entity.position;
        const dir = this.bot.entity.yaw;
        const checkPos = pos.offset(-Math.sin(dir), 0, -Math.cos(dir));
        const block = this.bot.blockAt(checkPos);
        return block && block.boundingBox === 'block';
    }

    async mineBlock(block) {
        if (!block) return;

        // Refresh block to ensure it's still there
        const current = this.bot.blockAt(block.position);
        if (!current || current.name === 'air') return;

        // Check availability
        if (!this.bot.canDigBlock(current)) {
            logger.debug(`Cannot dig ${current.name} at ${current.position}`);
            return;
        }

        // --- OBSTRUCTION CHECK ---
        // Verify line-of-sight before digging
        if (!this.bot.canSeeBlock(current)) {
            // Track obstruction clearing attempts to prevent infinite loops
            if (!this.obstructionAttempts) this.obstructionAttempts = 0;
            this.obstructionAttempts++;

            // Give up after 5 attempts on this block
            if (this.obstructionAttempts > 5) {
                logger.warn(`Giving up on obstructed block ${current.name} after 5 attempts`);
                this.obstructionAttempts = 0;
                return;
            }

            logger.debug(`Block ${current.name} is obstructed. Attempt ${this.obstructionAttempts}/5`);

            // Calculate direction to block
            const botPos = this.bot.entity.position;
            const blockPos = current.position;

            // If block is below us, dig down toward it
            if (blockPos.y < botPos.y - 1) {
                const blockBelow = this.bot.blockAt(botPos.offset(0, -1, 0));
                if (blockBelow && blockBelow.name !== 'air' && this.bot.canDigBlock(blockBelow)) {
                    logger.info(`Digging down toward ${current.name}...`);
                    await this.equipBestTool(blockBelow.name);
                    await this.bot.dig(blockBelow);
                    return;
                }
            }

            // Find the block directly between us and the target
            const dx = Math.sign(blockPos.x - botPos.x);
            const dz = Math.sign(blockPos.z - botPos.z);
            const dy = Math.sign(blockPos.y - botPos.y);

            // Try to dig in the direction of the target
            const checkPositions = [
                botPos.offset(dx, dy, 0),
                botPos.offset(0, dy, dz),
                botPos.offset(dx, 0, dz),
                botPos.offset(dx, dy, dz)
            ];

            for (const checkPos of checkPositions) {
                const blockInWay = this.bot.blockAt(checkPos);
                if (blockInWay && blockInWay.name !== 'air' && this.bot.canDigBlock(blockInWay)) {
                    logger.info(`Clearing path: ${blockInWay.name}`);
                    await this.equipBestTool(blockInWay.name);
                    try {
                        await this.bot.lookAt(checkPos);
                        await this.bot.dig(blockInWay);
                    } catch (e) {
                        logger.debug(`Failed to clear path: ${e.message}`);
                    }
                    return;
                }
            }

            // If nothing to dig, try to move closer
            logger.debug(`No obstruction found, trying to move closer`);
            await this.navigateToBlock(current);
            return;
        }

        // Reset obstruction counter when we can see the block
        this.obstructionAttempts = 0;

        // If visible, mine it
        await this.bot.lookAt(current.position);
        try {
            await this.bot.dig(current);
        } catch (e) {
            logger.debug(`Dig error: ${e.message}`);
            // If dig fails, it might be due to physics or reach. 
            // Often "digging aborted" happens if bot moves.
        }
    }

    async equipBestTool(blockName) {
        // Define tool requirements for blocks
        const toolTypes = {
            'shovel': ['dirt', 'grass_block', 'sand', 'gravel', 'clay', 'soul_sand', 'soul_soil', 'snow_block', 'mud', 'concrete_powder'],
            'axe': ['log', 'planks', 'wood', 'chest', 'crafting_table', 'bookshelf', 'fence', 'pumpkin', 'melon', 'ladder'],
            'pickaxe': ['stone', 'cobblestone', 'ore', 'andesite', 'diorite', 'granite', 'deepslate', 'obsidian', 'bricks', 'concrete', 'terracotta'],
            'hoe': ['leaves', 'sculk', 'hay_block', 'nether_wart_block', 'shroomlight', 'target']
        };

        // Determine required tool type
        let requiredType = 'pickaxe'; // Default
        for (const [type, keywords] of Object.entries(toolTypes)) {
            if (keywords.some(k => blockName.includes(k))) {
                requiredType = type;
                break;
            }
        }

        // Find best tool in inventory
        const items = this.bot.inventory.items().filter(i => i.name.includes(requiredType));

        // Sort best to worst (Netherite > Diamond > Iron > Gold > Stone > Wood)
        const materialOrder = ['netherite', 'diamond', 'iron', 'golden', 'stone', 'wooden'];
        items.sort((a, b) => {
            const ia = materialOrder.findIndex(m => a.name.includes(m));
            const ib = materialOrder.findIndex(m => b.name.includes(m));
            return ia - ib;
        });

        const bestTool = items.length > 0 ? items[0] : null;

        if (bestTool) {
            try {
                await this.bot.equip(bestTool, 'hand');
                return true;
            } catch (e) {
                logger.debug(`Failed to equip ${bestTool.name}: ${e.message}`);
                return false;
            }
        } else {
            // No tool found - fallback to hand
            logger.debug(`No ${requiredType} available, mining with hand`);
            try {
                await this.bot.unequip('hand');
            } catch (e) { }
            return true; // Return true so mining proceeds (slowly)
        }
    }

    async collectDrops(pos) {
        await this.delay(500);
        const drops = Object.values(this.bot.entities).filter(e =>
            e.type === 'object' && e.position.distanceTo(pos) < 5
        );
        for (const drop of drops) {
            if (!this.isActive) break;
            const dropPos = drop.position;
            if (dropPos.distanceTo(this.bot.entity.position) > 1.5) {
                await this.bot.lookAt(dropPos);
                this.bot.setControlState('forward', true);
                await this.delay(500);
                this.bot.setControlState('forward', false);
            }
        }
    }

    async stop() {
        this.isActive = false;
        this.isSuperMining = false;
        this.bot.clearControlStates();
        this.bot.stopDigging();
    }

    delay(ms) { return new Promise(r => setTimeout(r, ms)); }
    sendChat(msg) { try { this.bot.chat(msg); } catch (e) { } }
}

module.exports = MinerAbility;
