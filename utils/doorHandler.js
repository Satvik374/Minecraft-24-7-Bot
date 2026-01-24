/**
 * Door Interaction Utility
 * Handles opening doors, fence gates, and trapdoors
 */

const logger = require('./logger');

class DoorHandler {
    constructor(bot) {
        this.bot = bot;
        this.doorBlocks = new Set([
            'oak_door', 'spruce_door', 'birch_door', 'jungle_door',
            'acacia_door', 'dark_oak_door', 'crimson_door', 'warped_door',
            'mangrove_door', 'cherry_door', 'bamboo_door'
        ]);
        this.fenceGates = new Set([
            'oak_fence_gate', 'spruce_fence_gate', 'birch_fence_gate',
            'jungle_fence_gate', 'acacia_fence_gate', 'dark_oak_fence_gate',
            'crimson_fence_gate', 'warped_fence_gate', 'mangrove_fence_gate',
            'cherry_fence_gate', 'bamboo_fence_gate'
        ]);
        this.trapdoors = new Set([
            'oak_trapdoor', 'spruce_trapdoor', 'birch_trapdoor',
            'jungle_trapdoor', 'acacia_trapdoor', 'dark_oak_trapdoor',
            'crimson_trapdoor', 'warped_trapdoor', 'mangrove_trapdoor',
            'cherry_trapdoor', 'bamboo_trapdoor', 'iron_trapdoor'
        ]);

        // Start checking for doors periodically
        this.checkInterval = null;
    }

    /**
     * Start auto-opening doors when bot is near
     */
    startAutoOpen() {
        if (this.checkInterval) return;

        this.checkInterval = setInterval(() => {
            this.checkAndOpenNearbyDoors();
        }, 250); // Check every 250ms for fast response

        logger.debug('Door handler started');
    }

    /**
     * Stop auto-opening doors
     */
    stopAutoOpen() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Check for nearby doors/gates and open them
     */
    async checkAndOpenNearbyDoors() {
        if (!this.bot || !this.bot.entity) return;

        const pos = this.bot.entity.position;
        const yaw = this.bot.entity.yaw;

        // Calculate direction bot is facing
        const dirX = -Math.sin(yaw);
        const dirZ = -Math.cos(yaw);

        // First, check blocks directly ahead (priority)
        for (let dist = 1; dist <= 3; dist++) {
            const aheadPos = pos.offset(dirX * dist, 0, dirZ * dist);

            // Check at feet level and head level
            for (let dy = 0; dy <= 1; dy++) {
                const block = this.bot.blockAt(aheadPos.offset(0, dy, 0));
                if (!block) continue;

                if (this.isDoor(block.name) || this.isFenceGate(block.name) || this.isTrapdoor(block.name)) {
                    await this.openIfClosed(block);
                }
            }
        }

        // Then check all blocks within 2 block radius
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -1; dy <= 2; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const blockPos = pos.offset(dx, dy, dz);
                    const block = this.bot.blockAt(blockPos);

                    if (!block) continue;

                    // Check if it's a door, gate, or trapdoor
                    if (this.isDoor(block.name) || this.isFenceGate(block.name) || this.isTrapdoor(block.name)) {
                        await this.openIfClosed(block);
                    }
                }
            }
        }
    }

    /**
     * Check if block is a door
     */
    isDoor(blockName) {
        return this.doorBlocks.has(blockName);
    }

    /**
     * Check if block is a fence gate
     */
    isFenceGate(blockName) {
        return this.fenceGates.has(blockName);
    }

    /**
     * Check if block is a trapdoor
     */
    isTrapdoor(blockName) {
        return this.trapdoors.has(blockName);
    }

    /**
     * Open a door/gate if it's closed
     */
    async openIfClosed(block) {
        try {
            // Check block state - doors/gates have an 'open' property
            const state = block.getProperties ? block.getProperties() : {};

            // If already open, skip
            if (state.open === 'true' || state.open === true) {
                return;
            }

            // Skip iron doors (need redstone)
            if (block.name === 'iron_door' || block.name === 'iron_trapdoor') {
                return;
            }

            // Activate (right-click) to open
            await this.bot.activateBlock(block);
            logger.debug(`Opened ${block.name} at ${block.position}`);

        } catch (error) {
            // Silently fail - door might already be open or out of reach
        }
    }

    /**
     * Manually open a specific door/gate
     */
    async openDoor(block) {
        if (!block) return false;

        if (this.isDoor(block.name) || this.isFenceGate(block.name) || this.isTrapdoor(block.name)) {
            await this.openIfClosed(block);
            return true;
        }

        return false;
    }
}

module.exports = DoorHandler;
