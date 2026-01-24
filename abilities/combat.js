/**
 * Combat Ability Module
 * Handles the -bot kill command for attacking mobs
 */

const logger = require('../utils/logger');
const { resolveMobAlias } = require('../data/recipes');

class CombatAbility {
    constructor(bot, pathfinder) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.isActive = false;
        this.targetMobType = null;
        this.currentTarget = null;
        this.attackInterval = null;
    }

    /**
     * Execute kill command
     * @param {object} command - Parsed command with target mob type
     */
    async execute(command) {
        this.isActive = true;
        this.targetMobType = command.target;

        const mobTypes = resolveMobAlias(this.targetMobType);
        logger.info(`Hunting: ${mobTypes.join(', ')}`);
        this.sendChat(`Hunting ${this.targetMobType}...`);

        while (this.isActive) {
            try {
                // Find nearest matching mob
                const target = this.findNearestMob(mobTypes);

                if (!target) {
                    this.sendChat(`No ${this.targetMobType} found nearby`);
                    break;
                }

                this.currentTarget = target;

                // Equip best weapon
                await this.equipBestWeapon();

                // Chase and attack
                await this.chaseAndAttack(target);

                // Small delay before finding next target
                await this.delay(500);

            } catch (error) {
                logger.debug(`Combat error: ${error.message}`);
                await this.delay(1000);
            }
        }

        this.isActive = false;
        this.currentTarget = null;
        this.killCount = 0;
    }

    /**
     * Find the nearest mob of specified types
     */
    findNearestMob(mobTypes) {
        const entities = Object.values(this.bot.entities);

        let nearestMob = null;
        let nearestDistance = Infinity;

        for (const entity of entities) {
            // Skip self and non-living entities
            if (!entity || entity === this.bot.entity) continue;
            if (!entity.position) continue;

            // Get entity name - try multiple properties
            const entityName = (entity.name || entity.mobType || entity.displayName || '').toLowerCase();

            // Skip if no name or if it's a player
            if (!entityName || entity.type === 'player') continue;

            // Debug: log what we're seeing
            const distance = this.bot.entity.position.distanceTo(entity.position);
            if (distance < 10) {
                logger.debug(`Nearby entity: ${entityName}, type: ${entity.type}, distance: ${distance.toFixed(1)}`);
            }

            // Check if mob name matches any target type
            const matches = mobTypes.some(type => {
                const targetType = type.toLowerCase();
                return entityName === targetType ||
                    entityName.includes(targetType) ||
                    targetType.includes(entityName);
            });

            if (!matches) continue;

            // Check distance (within 48 blocks)
            if (distance < nearestDistance && distance < 48) {
                nearestDistance = distance;
                nearestMob = entity;
                logger.debug(`Found target: ${entityName} at distance ${distance.toFixed(1)}`);
            }
        }

        return nearestMob;
    }

    /**
     * Chase and attack a target
     */
    async chaseAndAttack(target) {
        const maxTime = 30000; // 30 seconds max per target
        const startTime = Date.now();
        let lastKnownPosition = target.position ? target.position.clone() : this.bot.entity.position;

        while (this.isActive && Date.now() - startTime < maxTime) {
            // Check if target still exists
            const currentTarget = this.bot.entities[target.id];

            // Target despawned or died
            if (!currentTarget) {
                logger.info(`Target eliminated: ${target.name || target.mobType}`);
                this.killCount++;
                // Collect dropped items at last known position
                await this.collectDrops(lastKnownPosition);
                return true;
            }

            // Update last known position
            if (currentTarget.position) {
                lastKnownPosition = currentTarget.position.clone();
            }

            // Check if target is dead (health <= 0)
            if (currentTarget.health !== undefined && currentTarget.health <= 0) {
                logger.info(`Target killed: ${target.name || target.mobType}`);
                this.killCount++;
                await this.collectDrops(lastKnownPosition);
                return true;
            }

            const distance = this.bot.entity.position.distanceTo(currentTarget.position);

            // Target is too far - give up
            if (distance > 48) {
                logger.debug(`Target escaped: ${target.name || target.mobType}`);
                return false;
            }

            // Look at target
            await this.bot.lookAt(currentTarget.position.offset(0, currentTarget.height * 0.5, 0));

            if (distance <= 3.5) {
                // In attack range - attack!
                this.stopMovement();
                await this.attack(currentTarget);
                await this.delay(500); // Attack cooldown
            } else {
                // Move towards target
                await this.moveTowards(currentTarget.position);
            }

            await this.delay(50);
        }

        return false; // Timed out
    }

    /**
     * Attack a target entity
     */
    async attack(target) {
        try {
            await this.bot.attack(target);
            logger.debug(`Attacked ${target.name || target.mobType}`);
        } catch (error) {
            logger.debug(`Attack failed: ${error.message}`);
        }
    }

    /**
     * Move towards a position
     */
    async moveTowards(position) {
        // Use pathfinder if available
        if (this.pathfinder && this.bot.pathfinder) {
            try {
                const { goals } = require('mineflayer-pathfinder');
                const goal = new goals.GoalNear(position.x, position.y, position.z, 2);
                this.bot.pathfinder.setGoal(goal);
                return;
            } catch (error) {
                // Fall through to simple movement
            }
        }

        // Simple movement fallback
        await this.bot.lookAt(position);
        this.bot.setControlState('forward', true);
        this.bot.setControlState('sprint', true);

        // Jump if needed
        if (this.bot.entity.onGround && this.isBlockedAhead()) {
            this.bot.setControlState('jump', true);
            await this.delay(100);
            this.bot.setControlState('jump', false);
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
        return blockAhead && blockAhead.name !== 'air';
    }

    /**
     * Equip the best available weapon
     */
    async equipBestWeapon() {
        const inventory = this.bot.inventory.items();

        // Weapon priority (best first)
        const weaponPriority = [
            'netherite_sword', 'diamond_sword', 'iron_sword', 'golden_sword', 'stone_sword', 'wooden_sword',
            'netherite_axe', 'diamond_axe', 'iron_axe', 'golden_axe', 'stone_axe', 'wooden_axe'
        ];

        for (const weaponName of weaponPriority) {
            const weapon = inventory.find(item => item.name === weaponName);
            if (weapon) {
                try {
                    await this.bot.equip(weapon, 'hand');
                    logger.debug(`Equipped ${weaponName}`);
                    return true;
                } catch (error) {
                    logger.debug(`Failed to equip ${weaponName}: ${error.message}`);
                }
            }
        }

        return false;
    }

    /**
     * Stop combat
     */
    async stop() {
        this.isActive = false;
        this.currentTarget = null;
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
     * Collect drops near a position
     */
    async collectDrops(position) {
        // Wait briefly for server to spawn drops
        await this.delay(300);

        // Find items within 5 blocks
        const drops = Object.values(this.bot.entities).filter(entity =>
            entity.type === 'object' &&
            entity.position &&
            entity.position.distanceTo(position) < 5
        );

        if (drops.length === 0) return;

        logger.debug(`Found ${drops.length} drops to collect`);
        this.sendChat(`Collecting ${drops.length} dropped items...`);

        for (const drop of drops) {
            if (!this.isActive) break;

            // Move to drop if it's a bit far
            const distance = this.bot.entity.position.distanceTo(drop.position);
            if (distance > 1.5) {
                await this.bot.lookAt(drop.position);
                this.bot.setControlState('forward', true);

                // Move for a bit or until close
                const startTime = Date.now();
                while (drop.position && this.bot.entity.position.distanceTo(drop.position) > 1.5 && Date.now() - startTime < 2000) {
                    await this.delay(50);
                }

                this.bot.setControlState('forward', false);
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

module.exports = CombatAbility;
