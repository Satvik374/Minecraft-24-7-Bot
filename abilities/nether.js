/**
 * Nether Portal Ability Module
 * Handles navigation to/through Nether portals with lava safety
 */

const logger = require('../utils/logger');

class NetherAbility {
    constructor(bot, pathfinder) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.isActive = false;
        this.lavaSafetyEnabled = false;
        this.safetyCheckInterval = null;
    }

    /**
     * Execute nether command
     */
    async execute(command) {
        this.isActive = true;

        try {
            // Enable lava safety mode
            this.enableLavaSafety();

            // Find nearest nether portal
            const portal = await this.findNetherPortal();

            if (!portal) {
                this.sendChat('No Nether portal found nearby (256 block range)');
                return { success: false, message: 'No portal found' };
            }

            this.sendChat(`Found Nether portal at X:${Math.round(portal.position.x)} Y:${Math.round(portal.position.y)} Z:${Math.round(portal.position.z)}`);

            // Navigate to the portal
            await this.navigateToPortal(portal);

            // Enter the portal
            await this.enterPortal(portal);

            return { success: true, message: 'Entered Nether portal' };

        } catch (error) {
            logger.error(`Nether ability error: ${error.message}`);
            this.sendChat(`Error: ${error.message}`);
            return { success: false, message: error.message };
        } finally {
            this.isActive = false;
        }
    }

    /**
     * Find nearest Nether portal block
     */
    async findNetherPortal() {
        const mcData = require('minecraft-data')(this.bot.version);
        const portalBlockId = mcData.blocksByName['nether_portal']?.id;

        if (!portalBlockId) {
            logger.warn('Nether portal block not found in mcData');
            return null;
        }

        const portals = this.bot.findBlocks({
            matching: portalBlockId,
            maxDistance: 256,
            count: 1
        });

        if (portals.length === 0) {
            return null;
        }

        return this.bot.blockAt(portals[0]);
    }

    /**
     * Navigate safely to the portal
     */
    async navigateToPortal(portal) {
        if (!this.bot.pathfinder) {
            // Simple movement fallback
            await this.simpleNavigate(portal.position);
            return;
        }

        const { goals, Movements } = require('mineflayer-pathfinder');
        const mcData = require('minecraft-data')(this.bot.version);

        // Configure safe movements - avoid lava!
        const movements = new Movements(this.bot);
        movements.canDig = true;
        movements.allowSprinting = true;
        movements.allowParkour = true;
        movements.maxDropDown = 3; // Be careful with drops

        // Avoid lava blocks
        const lavaId = mcData.blocksByName['lava']?.id;
        if (lavaId) {
            movements.blocksCantBreak.add(lavaId);
        }

        this.bot.pathfinder.setMovements(movements);

        // Navigate to portal
        const goal = new goals.GoalGetToBlock(portal.position.x, portal.position.y, portal.position.z);

        try {
            await this.bot.pathfinder.goto(goal);
            logger.info('Reached portal location');
        } catch (error) {
            logger.warn(`Pathfinder to portal failed: ${error.message}, using simple navigation`);
            await this.simpleNavigate(portal.position);
        }
    }

    /**
     * Enter the portal (stand inside it)
     */
    async enterPortal(portal) {
        this.sendChat('Entering Nether portal...');

        // Move into the portal block
        const portalCenter = portal.position.offset(0.5, 0, 0.5);

        // Look at the portal and walk into it
        await this.bot.lookAt(portalCenter);
        this.bot.setControlState('forward', true);

        // Wait for dimension change or timeout
        const startTime = Date.now();
        const timeout = 15000; // 15 seconds

        while (Date.now() - startTime < timeout && this.isActive) {
            await this.delay(500);

            // Check if we're in the portal (close to portal block)
            const dist = this.bot.entity.position.distanceTo(portal.position);
            if (dist < 1.5) {
                // We're in the portal, wait for teleport
                this.sendChat('In portal, waiting for teleport...');
                await this.delay(5000); // Portal animation takes a few seconds
                break;
            }
        }

        this.bot.setControlState('forward', false);

        // Check current dimension
        const dimension = this.bot.game?.dimension;
        logger.info(`Current dimension: ${dimension}`);

        if (dimension === 'the_nether' || dimension === 'minecraft:the_nether') {
            this.sendChat('Arrived in the Nether! Lava safety mode active.');
        } else if (dimension === 'overworld' || dimension === 'minecraft:overworld') {
            this.sendChat('Back in the Overworld!');
        }
    }

    /**
     * Enable lava safety mode - prevents bot from walking into lava or falling
     */
    enableLavaSafety() {
        if (this.lavaSafetyEnabled) return;

        this.lavaSafetyEnabled = true;
        logger.info('Lava safety mode ENABLED');

        // Start safety check interval
        this.safetyCheckInterval = setInterval(() => {
            this.checkDangers();
        }, 200); // Check every 200ms
    }

    /**
     * Disable lava safety mode
     */
    disableLavaSafety() {
        this.lavaSafetyEnabled = false;
        if (this.safetyCheckInterval) {
            clearInterval(this.safetyCheckInterval);
            this.safetyCheckInterval = null;
        }
        logger.info('Lava safety mode DISABLED');
    }

    /**
     * Check for lava and fall dangers
     */
    checkDangers() {
        if (!this.lavaSafetyEnabled || !this.bot.entity) return;

        const pos = this.bot.entity.position;

        // Check for lava nearby (in front, below, sides)
        const checkPositions = [
            pos.offset(0, -1, 0),  // Below
            pos.offset(0, -2, 0),  // 2 blocks below
            pos.offset(1, 0, 0),   // Right
            pos.offset(-1, 0, 0),  // Left
            pos.offset(0, 0, 1),   // Front
            pos.offset(0, 0, -1),  // Back
            pos.offset(1, -1, 0),  // Diagonal below
            pos.offset(-1, -1, 0),
            pos.offset(0, -1, 1),
            pos.offset(0, -1, -1),
        ];

        let lavaDetected = false;
        let fallDetected = false;

        for (const checkPos of checkPositions) {
            const block = this.bot.blockAt(checkPos);
            if (block) {
                if (block.name === 'lava' || block.name === 'flowing_lava') {
                    lavaDetected = true;
                    break;
                }
            }
        }

        // Check for dangerous drop (more than 4 blocks of air below)
        let airCount = 0;
        for (let y = 1; y <= 6; y++) {
            const blockBelow = this.bot.blockAt(pos.offset(0, -y, 0));
            if (blockBelow && blockBelow.name === 'air') {
                airCount++;
            } else {
                break;
            }
        }

        if (airCount >= 4) {
            fallDetected = true;
        }

        // React to dangers
        if (lavaDetected) {
            this.reactToLava();
        }

        if (fallDetected) {
            this.reactToFall();
        }
    }

    /**
     * React to lava danger - move backwards
     */
    reactToLava() {
        logger.warn('LAVA DANGER DETECTED! Moving back!');

        // Stop forward movement immediately
        this.bot.setControlState('forward', false);
        this.bot.setControlState('sprint', false);

        // Move backwards
        this.bot.setControlState('back', true);
        this.bot.setControlState('jump', true);

        // Stop after a short delay
        setTimeout(() => {
            this.bot.setControlState('back', false);
            this.bot.setControlState('jump', false);
        }, 500);
    }

    /**
     * React to fall danger - stop movement
     */
    reactToFall() {
        logger.warn('FALL DANGER DETECTED! Stopping!');

        // Stop all movement
        this.bot.setControlState('forward', false);
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('left', false);
        this.bot.setControlState('right', false);

        // Crouch to prevent falling
        this.bot.setControlState('sneak', true);

        // Move backwards slightly
        this.bot.setControlState('back', true);

        setTimeout(() => {
            this.bot.setControlState('back', false);
            this.bot.setControlState('sneak', false);
        }, 300);
    }

    /**
     * Simple navigation without pathfinder
     */
    async simpleNavigate(position) {
        const startTime = Date.now();
        const timeout = 30000;

        while (Date.now() - startTime < timeout && this.isActive) {
            const dist = this.bot.entity.position.distanceTo(position);

            if (dist < 2) {
                this.bot.clearControlStates();
                return;
            }

            await this.bot.lookAt(position);
            this.bot.setControlState('forward', true);

            // Jump if blocked
            if (this.bot.entity.onGround && this.isBlockedAhead()) {
                this.bot.setControlState('jump', true);
                await this.delay(100);
                this.bot.setControlState('jump', false);
            }

            await this.delay(100);
        }

        this.bot.clearControlStates();
    }

    /**
     * Check if blocked ahead
     */
    isBlockedAhead() {
        const pos = this.bot.entity.position;
        const yaw = this.bot.entity.yaw;
        const checkPos = pos.offset(-Math.sin(yaw), 0, -Math.cos(yaw));
        const block = this.bot.blockAt(checkPos);
        return block && block.boundingBox === 'block';
    }

    /**
     * Stop ability
     */
    stop() {
        this.isActive = false;
        this.bot.clearControlStates();
        this.disableLavaSafety();
        logger.info('Nether ability stopped');
    }

    /**
     * Send chat message
     */
    sendChat(msg) {
        try {
            this.bot.chat(msg);
        } catch (e) { }
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = NetherAbility;
