/**
 * Navigation Ability Module
 * Handles the -bot come and -bot go commands
 */

const logger = require('../utils/logger');

class NavigationAbility {
    constructor(bot, pathfinder, homeManager) {
        this.bot = bot;
        this.homeManager = homeManager; // Injected
        this.pathfinder = pathfinder;
        this.isActive = false;
        this.targetPosition = null;
        this.targetPlayer = null;
    }

    /**
     * Execute navigation command (come or go)
     * @param {object} command - Parsed command
     */
    async execute(command) {
        this.isActive = true;

        if (command.action === 'come') {
            await this.comeToPlayer(command.target);
        } else if (command.action === 'go') {
            await this.goToCoordinates(command.target);
        }

        this.isActive = false;
    }

    /**
     * Navigate to a player
     */
    async comeToPlayer(playerName) {
        this.targetPlayer = playerName;

        // Find player entity
        const player = this.findPlayer(playerName);

        if (!player) {
            this.sendChat(`Player ${playerName} not found`);
            return;
        }

        this.sendChat(`Coming to ${playerName}!`);
        this.targetPosition = player.position.clone();

        await this.navigateTo(this.targetPosition, playerName);
    }

    /**
     * Navigate to coordinates
     */
    async goToCoordinates(coords) {
        const { x, y, z } = coords;
        this.sendChat(`Going to ${x}, ${y}, ${z}`);
        logger.info(`[Navigation] Going to ${x}, ${y}, ${z}`);

        try {
            const vec3 = require('vec3');
            this.targetPosition = vec3(x, y, z);
            logger.info(`[Navigation] Target set to ${this.targetPosition}`);
            await this.navigateTo(this.targetPosition);
        } catch (err) {
            logger.error(`[Navigation] Error setting target: ${err.message}`);
            this.sendChat(`Error: ${err.message}`);
        }
    }

    /**
     * Find a player by name
     */
    findPlayer(playerName) {
        const entities = Object.values(this.bot.entities);

        for (const entity of entities) {
            if (entity.type === 'player' && entity.username) {
                if (entity.username.toLowerCase() === playerName.toLowerCase()) {
                    return entity;
                }
            }
        }

        return null;
    }

    /**
     * Navigate to a target position
     */
    async navigateTo(position, followTarget = null) {
        const maxTime = 60000; // 1 minute max
        const startTime = Date.now();

        logger.info(`[Navigation] Starting navigation to ${position}`);

        // Use pathfinder if available
        if (this.pathfinder && this.pathfinder.goals && this.bot.pathfinder) {
            logger.info(`[Navigation] Using pathfinder...`);
            try {
                const goal = new this.pathfinder.goals.GoalNear(position.x, position.y, position.z, 2);
                await this.bot.pathfinder.goto(goal);
                this.sendChat(`Arrived!`);
                logger.info(`[Navigation] Pathfinder finished successfully`);
                return;
            } catch (error) {
                logger.warn(`[Navigation] Pathfinder error: ${error.message}, falling back to simple movement`);
            }
        } else {
            logger.warn(`[Navigation] Pathfinder NOT available (pathfinder=${!!this.pathfinder}, goals=${!!this.pathfinder?.goals}, bot.pathfinder=${!!this.bot.pathfinder})`);
        }

        // Simple movement fallback
        logger.info(`[Navigation] Starting simple movement loop...`);
        while (this.isActive && Date.now() - startTime < maxTime) {
            // Update target position if following a player
            if (followTarget) {
                const player = this.findPlayer(followTarget);
                if (player) {
                    position = player.position.clone();
                    this.targetPosition = position;
                }
            }

            const distance = this.bot.entity.position.distanceTo(position);

            // Check if arrived
            if (distance <= 3) {
                this.stopMovement();
                this.sendChat(`Arrived!`);
                logger.info(`[Navigation] Arrived at target (distance: ${distance})`);
                return;
            }

            await this.simpleMoveTo(position);
            await this.delay(100);
        }

        if (Date.now() - startTime >= maxTime) {
            this.sendChat(`Navigation timed out`);
            logger.warn(`[Navigation] Timed out`);
        } else if (!this.isActive) {
            logger.info(`[Navigation] Stopped (isActive=false)`);
        }

        this.stopMovement();
    }

    /**
     * Simple movement towards a position
     */
    async simpleMoveTo(position) {
        // Look at target
        await this.bot.lookAt(position);

        // Move forward
        this.bot.setControlState('forward', true);

        const distance = this.bot.entity.position.distanceTo(position);

        // Sprint if far
        if (distance > 10) {
            this.bot.setControlState('sprint', true);
        }

        // Jump if stuck or need to climb
        if (this.bot.entity.onGround) {
            const blocked = this.isBlockedAhead();
            const needsJump = position.y > this.bot.entity.position.y + 0.5;

            if (blocked || needsJump) {
                this.bot.setControlState('jump', true);
                await this.delay(100);
                this.bot.setControlState('jump', false);
            }
        }
    }

    /**
     * Check if bot is blocked ahead
     */
    isBlockedAhead() {
        const ahead = this.bot.entity.position.offset(
            -Math.sin(this.bot.entity.yaw) * 1,
            0,
            -Math.cos(this.bot.entity.yaw) * 1
        );
        const blockAhead = this.bot.blockAt(ahead);
        const blockAbove = this.bot.blockAt(ahead.offset(0, 1, 0));

        return (blockAhead && blockAhead.name !== 'air') ||
            (blockAbove && blockAbove.name !== 'air');
    }

    /**
     * Stop navigation
     */
    async stop() {
        this.isActive = false;
        this.targetPosition = null;
        this.targetPlayer = null;
        this.stopMovement();

        if (this.bot.pathfinder) {
            try {
                this.bot.pathfinder.setGoal(null);
            } catch (e) {
                // Ignore
            }
        }
    }

    /**
     * Stop all movement
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
     * Collect all dropped items in radius
     */
    async collectAllItems(radius = 50) {
        this.isActive = true;
        this.sendChat(`Scanning for dropped items in ${radius} blocks...`);
        logger.info(`[Navigation] Starting collect all (radius ${radius})`);

        // Add event listener for collection feedback
        const onCollect = (collector, collected) => {
            if (collector === this.bot.entity) {
                // Chat removed to reduce spam
                logger.info(`Collected ${collected.displayName || 'item'}`);
            }
        };
        this.bot.on('playerCollect', onCollect);

        try {
            while (this.isActive) {
                // Find all dropped items (matching user's snippet logic + existing robustness)
                const drops = Object.values(this.bot.entities).filter(entity => {
                    const isItem = (entity.type === 'object' || entity.name === 'item');
                    const inRange = entity.position.distanceTo(this.bot.entity.position) < radius;
                    return isItem && inRange && entity.isValid;
                });

                // Auto-deposit check
                const emptySlots = this.bot.inventory.slots.filter(s => s === null).length;
                if (emptySlots <= 3 && this.homeManager) {
                    this.sendChat('Inventory nearly full. Looking for nearby chest...');
                    await this.homeManager.findNearbyChestAndDeposit(50);
                    // After deposit, re-scan
                    await this.delay(1000);
                    continue;
                }

                if (drops.length === 0) {
                    // No items found, wait and check again (24/7 mode)
                    await this.delay(1000);
                    continue;
                }

                this.sendChat(`Found ${drops.length} items. Collecting...`);

                // Sort by distance (closest first)
                drops.sort((a, b) =>
                    a.position.distanceTo(this.bot.entity.position) -
                    b.position.distanceTo(this.bot.entity.position)
                );

                let collected = 0;

                for (const drop of drops) {
                    if (!this.isActive) break;
                    if (!drop.isValid) continue; // Already picked up

                    try {
                        const distance = this.bot.entity.position.distanceTo(drop.position);

                        if (distance > 1.5) {
                            logger.info(`[Navigation] Collecting ${drop.name || 'item'} at ${Math.floor(distance)}m`);

                            // Use navigateTo for smarter movement, but with a timeout
                            // Pass false for followTarget since this is a static position
                            await this.navigateTo(drop.position, false);
                        }

                        // Wait a moment to ensure pickup
                        await this.delay(200);
                        collected++;

                    } catch (error) {
                        logger.debug(`[Navigation] Failed to collect item: ${error.message}`);
                    }
                }

                this.sendChat(`Collection run complete. Waiting for more items...`);
                // break; // REMOVED break for 24/7 mode
                await this.delay(1000);
            }
        } finally {
            // Remove event listener
            this.bot.removeListener('playerCollect', onCollect);
            this.stopMovement();
        }
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

module.exports = NavigationAbility;