/**
 * Structure Finder Ability Module
 * Handles the -bot find <structure_name> command
 * Uses Mineflayer's findBlocks to search for structure-specific blocks
 */

const logger = require('../utils/logger');

class StructureFinder {
    constructor(bot, pathfinder) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.isActive = false;
        this.searchRadius = 256; // Search radius in blocks

        // Structure definitions with their characteristic blocks
        // Each structure has multiple possible blocks to search for
        this.structureBlocks = {
            'village': ['bell', 'lectern', 'cartography_table', 'fletching_table', 'smithing_table', 'blast_furnace', 'smoker', 'composter', 'barrel', 'loom', 'stonecutter', 'grindstone'],
            'fortress': ['nether_bricks', 'nether_brick_stairs', 'nether_brick_fence', 'spawner'],
            'nether_fortress': ['nether_bricks', 'nether_brick_stairs', 'nether_brick_fence'],
            'stronghold': ['end_portal_frame', 'mossy_stone_bricks', 'cracked_stone_bricks', 'stone_bricks', 'iron_bars', 'spawner'],
            'monument': ['prismarine', 'prismarine_bricks', 'dark_prismarine', 'sea_lantern', 'sponge'],
            'ocean_monument': ['prismarine', 'prismarine_bricks', 'dark_prismarine', 'sea_lantern'],
            'mansion': ['dark_oak_planks', 'dark_oak_log', 'dark_oak_stairs', 'cobblestone', 'white_wool', 'birch_planks'],
            'woodland_mansion': ['dark_oak_planks', 'dark_oak_log', 'dark_oak_stairs', 'white_wool'],
            'mineshaft': ['rail', 'oak_fence', 'oak_planks', 'torch', 'cobweb'],
            'temple': ['sandstone', 'chiseled_sandstone', 'cut_sandstone', 'sandstone_stairs', 'tnt'],
            'desert_temple': ['sandstone', 'chiseled_sandstone', 'cut_sandstone', 'orange_terracotta', 'blue_terracotta'],
            'desert_pyramid': ['sandstone', 'chiseled_sandstone', 'cut_sandstone', 'orange_terracotta'],
            'jungle_temple': ['cobblestone', 'mossy_cobblestone', 'chiseled_stone_bricks', 'dispenser', 'tripwire_hook'],
            'jungle_pyramid': ['cobblestone', 'mossy_cobblestone', 'chiseled_stone_bricks', 'tripwire_hook'],
            'witch_hut': ['spruce_planks', 'spruce_stairs', 'cauldron', 'crafting_table', 'flower_pot'],
            'swamp_hut': ['spruce_planks', 'spruce_stairs', 'cauldron', 'flower_pot'],
            'igloo': ['snow_block', 'ice', 'packed_ice', 'white_carpet'],
            'pillager_outpost': ['dark_oak_log', 'dark_oak_planks', 'dark_oak_fence', 'cobblestone', 'birch_planks'],
            'outpost': ['dark_oak_log', 'dark_oak_planks', 'dark_oak_fence', 'cobblestone'],
            'bastion': ['blackstone', 'polished_blackstone', 'polished_blackstone_bricks', 'gilded_blackstone', 'gold_block'],
            'bastion_remnant': ['blackstone', 'polished_blackstone', 'polished_blackstone_bricks', 'gilded_blackstone'],
            'ruined_portal': ['obsidian', 'crying_obsidian', 'netherrack', 'magma_block', 'gold_block'],
            'portal': ['obsidian', 'crying_obsidian', 'netherrack'],
            'shipwreck': ['oak_planks', 'spruce_planks', 'dark_oak_planks', 'oak_log', 'spruce_log', 'chest', 'barrel'],
            'buried_treasure': ['chest'],
            'treasure': ['chest'],
            'ocean_ruin': ['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks', 'prismarine'],
            'end_city': ['purpur_block', 'purpur_pillar', 'purpur_stairs', 'end_stone_bricks', 'end_rod'],
            'ancient_city': ['deepslate_tiles', 'deepslate_bricks', 'sculk', 'sculk_sensor', 'sculk_shrieker', 'soul_lantern'],
            'trail_ruins': ['mud_bricks', 'packed_mud', 'terracotta', 'suspicious_gravel']
        };

        // Structure name aliases for user convenience
        this.structureAliases = {
            'village': 'village',
            'town': 'village',
            'fortress': 'fortress',
            'nether_fortress': 'fortress',
            'stronghold': 'stronghold',
            'end_portal': 'stronghold',
            'monument': 'monument',
            'ocean_monument': 'monument',
            'guardian': 'monument',
            'mansion': 'mansion',
            'woodland_mansion': 'mansion',
            'mineshaft': 'mineshaft',
            'mine': 'mineshaft',
            'temple': 'desert_temple',
            'desert_temple': 'desert_temple',
            'desert_pyramid': 'desert_temple',
            'pyramid': 'desert_temple',
            'jungle_temple': 'jungle_temple',
            'jungle_pyramid': 'jungle_temple',
            'witch_hut': 'witch_hut',
            'swamp_hut': 'witch_hut',
            'witch': 'witch_hut',
            'igloo': 'igloo',
            'pillager_outpost': 'outpost',
            'outpost': 'outpost',
            'pillager': 'outpost',
            'bastion': 'bastion',
            'bastion_remnant': 'bastion',
            'ruined_portal': 'ruined_portal',
            'portal': 'ruined_portal',
            'shipwreck': 'shipwreck',
            'ship': 'shipwreck',
            'buried_treasure': 'treasure',
            'treasure': 'treasure',
            'ocean_ruin': 'ocean_ruin',
            'ruins': 'ocean_ruin',
            'end_city': 'end_city',
            'ancient_city': 'ancient_city',
            'warden': 'ancient_city',
            'trail_ruins': 'trail_ruins'
        };
    }

    /**
     * Execute the find command
     * @param {object} command - Parsed command with structure target
     */
    async execute(command) {
        const structureName = command.target;

        if (!structureName) {
            this.sendChat('Please specify a structure. Example: -bot find village');
            return;
        }

        // Resolve alias to actual structure name
        const resolvedName = this.structureAliases[structureName.toLowerCase()] || structureName.toLowerCase();
        const blocks = this.structureBlocks[resolvedName];

        if (!blocks) {
            const available = Object.keys(this.structureAliases).slice(0, 10).join(', ');
            this.sendChat(`Unknown structure: ${structureName}. Try: ${available}...`);
            return;
        }

        this.isActive = true;
        logger.info(`Structure Finder: Looking for ${resolvedName}`);
        this.sendChat(`Searching for ${resolvedName} (radius: ${this.searchRadius} blocks)...`);

        try {
            const foundLocation = await this.searchForStructure(resolvedName, blocks);

            if (foundLocation) {
                const distance = Math.round(this.bot.entity.position.distanceTo(foundLocation));
                this.sendChat(`Found ${resolvedName} at X:${Math.round(foundLocation.x)} Y:${Math.round(foundLocation.y)} Z:${Math.round(foundLocation.z)} (${distance} blocks away)! Going there...`);
                await this.navigateToStructure(foundLocation);
            } else {
                this.sendChat(`Could not find ${resolvedName} within ${this.searchRadius} blocks. Try moving to a different area.`);
            }
        } catch (error) {
            logger.error(`Structure Finder error: ${error.message}`);
            this.sendChat(`Error finding ${resolvedName}: ${error.message}`);
        } finally {
            this.isActive = false;
        }
    }

    /**
     * Search for structure-specific blocks
     * @param {string} structureName - Name of structure
     * @param {string[]} blockNames - Array of block names to search for
     * @returns {Promise<{x: number, y: number, z: number}|null>}
     */
    async searchForStructure(structureName, blockNames) {
        const mcData = require('minecraft-data')(this.bot.version);

        // Get block IDs for all structure blocks
        const blockIds = [];
        for (const blockName of blockNames) {
            const block = mcData.blocksByName[blockName];
            if (block) {
                blockIds.push(block.id);
            }
        }

        if (blockIds.length === 0) {
            logger.warn(`No valid block IDs found for structure: ${structureName}`);
            return null;
        }

        logger.debug(`Searching for blocks: ${blockNames.join(', ')} (IDs: ${blockIds.join(', ')})`);

        // Search for blocks
        const foundBlocks = this.bot.findBlocks({
            matching: blockIds,
            maxDistance: this.searchRadius,
            count: 100 // Find multiple to cluster and identify structure center
        });

        if (foundBlocks.length === 0) {
            logger.info(`No ${structureName} blocks found within ${this.searchRadius} blocks`);
            return null;
        }

        logger.info(`Found ${foundBlocks.length} potential ${structureName} blocks`);

        // Find the cluster center (average position of found blocks)
        // This helps locate the center of the structure
        let sumX = 0, sumY = 0, sumZ = 0;
        for (const pos of foundBlocks) {
            sumX += pos.x;
            sumY += pos.y;
            sumZ += pos.z;
        }

        const centerX = Math.round(sumX / foundBlocks.length);
        const centerY = Math.round(sumY / foundBlocks.length);
        const centerZ = Math.round(sumZ / foundBlocks.length);

        // Return the first found block position (closest to bot)
        // or the center of the cluster for better targeting
        const nearestBlock = foundBlocks[0];

        // Use nearest block for smaller structures, cluster center for larger ones
        if (foundBlocks.length > 10) {
            return { x: centerX, y: centerY, z: centerZ };
        } else {
            return nearestBlock;
        }
    }

    /**
     * Navigate to the structure location
     * @param {object} coords - {x, y, z} coordinates
     */
    async navigateToStructure(coords) {
        if (!this.pathfinder || !this.pathfinder.goals) {
            this.sendChat(`Navigate to X:${Math.round(coords.x)} Y:${Math.round(coords.y)} Z:${Math.round(coords.z)} manually`);
            return;
        }

        const { goals } = this.pathfinder;
        const goal = new goals.GoalNear(coords.x, coords.y, coords.z, 3);

        try {
            this.bot.pathfinder.setGoal(goal);

            // Wait for arrival or timeout
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.bot.pathfinder.setGoal(null);
                    reject(new Error('Navigation taking too long'));
                }, 120000); // 2 minute navigation timeout

                const onGoalReached = () => {
                    clearTimeout(timeout);
                    this.bot.removeListener('goal_reached', onGoalReached);
                    this.bot.removeListener('path_update', onPathUpdate);
                    resolve();
                };

                const onPathUpdate = (result) => {
                    if (result.status === 'noPath') {
                        clearTimeout(timeout);
                        this.bot.removeListener('goal_reached', onGoalReached);
                        this.bot.removeListener('path_update', onPathUpdate);
                        reject(new Error('No path found to structure'));
                    }
                };

                this.bot.on('goal_reached', onGoalReached);
                this.bot.on('path_update', onPathUpdate);
            });

            const pos = this.bot.entity.position;
            this.sendChat(`Arrived at structure! Location: X:${Math.round(pos.x)} Y:${Math.round(pos.y)} Z:${Math.round(pos.z)}`);

        } catch (error) {
            logger.error(`Navigation error: ${error.message}`);
            this.sendChat(`Navigation stopped: ${error.message}`);
        }
    }

    /**
     * Stop the structure finder
     */
    stop() {
        this.isActive = false;
        if (this.bot.pathfinder) {
            this.bot.pathfinder.setGoal(null);
        }
        this.sendChat('Structure search stopped');
    }

    /**
     * Get list of supported structures
     */
    getSupportedStructures() {
        return Object.keys(this.structureBlocks);
    }

    /**
     * Send chat message
     */
    sendChat(message) {
        try {
            this.bot.chat(message);
            logger.info(`Structure Finder: ${message}`);
        } catch (error) {
            logger.debug(`Failed to send chat: ${error.message}`);
        }
    }
}

module.exports = StructureFinder;
