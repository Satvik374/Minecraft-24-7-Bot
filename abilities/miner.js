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
        this.sendChat(`Mining ${this.targetBlockType} x${this.targetCount}...`);

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
                this.sendChat(`Found ${oreBlock.name}! Mining...`);
                await this.navigateToBlock(oreBlock);
                await this.mineBlock(oreBlock);
                await this.collectDrops(oreBlock.position);
            } else {
                // 4. No ores? Find cave/deep area
                this.sendChat('No ores visible. Searching for caves...');
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
            await this.mineBlock(block);
            await this.collectDrops(block.position);

            this.minedCount++;
            if (this.minedCount % 10 === 0) {
                this.sendChat(`Progress: ${this.minedCount}/${this.targetCount}`);
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
            maxDistance: 32,
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
                this.sendChat(`Need ${requiredTool} to mine ${blockName}`);
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

    async findNearestBlock(blockTypes, radius = 64) {
        const mcData = require('minecraft-data')(this.bot.version);
        // Handle array of strings or single string
        const types = Array.isArray(blockTypes) ? blockTypes : [blockTypes];

        const blockIds = types.map(t => mcData.blocksByName[t]?.id).filter(id => id);
        if (blockIds.length === 0) return null;

        const blocks = this.bot.findBlocks({ matching: blockIds, maxDistance: radius, count: 1 });
        return blocks.length > 0 ? this.bot.blockAt(blocks[0]) : null;
    }

    async navigateToBlock(block) {
        await this.navigateToLocation(block.position);
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
        const current = this.bot.blockAt(block.position);
        if (!current || current.name === 'air') return;

        await this.bot.lookAt(block.position);
        try {
            await this.bot.dig(current);
        } catch (e) {
            logger.debug(`Dig error: ${e.message}`);
        }
    }

    async equipBestTool(blockName) {
        const required = getRequiredTool(blockName);
        if (!required) return true;

        const items = this.bot.inventory.items().filter(i => i.name.includes('pickaxe'));
        // Sort best to worst
        const order = ['netherite', 'diamond', 'iron', 'golden', 'stone', 'wooden'];
        items.sort((a, b) => {
            const ia = order.findIndex(t => a.name.includes(t));
            const ib = order.findIndex(t => b.name.includes(t));
            return ia - ib;
        });

        for (const item of items) {
            if (canToolMine(item.name, required)) {
                try {
                    await this.bot.equip(item, 'hand');
                    return true;
                } catch (e) { }
            }
        }
        return false;
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
