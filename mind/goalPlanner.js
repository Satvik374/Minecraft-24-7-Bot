/**
 * Goal Planner Module
 * Breaks high-level intents into executable step-by-step plans
 */

const { getRecipe, getAllIngredients, resolveBlockAlias } = require('../data/recipes');
const { isCraftable, isGatherable, normalizeItem } = require('./knowledge');
const logger = require('../utils/logger');

class GoalPlanner {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Create a plan from an intent
     * @param {object} intent - Parsed intent from NLU
     * @returns {object} - Plan with steps to execute
     */
    createPlan(intent) {
        if (!intent || !intent.action) {
            return { steps: [], error: 'No valid intent provided' };
        }

        logger.info(`GoalPlanner: Creating plan for ${intent.action} -> ${intent.target}`);

        switch (intent.action) {
            case 'mine':
                return this.planMining(intent);
            case 'make':
                return this.planCrafting(intent);
            case 'come':
                return this.planNavigation(intent);
            case 'go':
                return this.planNavigation(intent);
            case 'kill':
                return this.planCombat(intent);
            case 'farm':
                return this.planFarming(intent);
            case 'stop':
                return this.planStop(intent);
            case 'drop':
                return this.planDrop(intent);
            case 'status':
            case 'help':
                return { steps: [{ type: intent.action }], simple: true };
            default:
                return { steps: [], error: `Unknown action: ${intent.action}` };
        }
    }

    /**
     * Plan mining/gathering operations
     */
    planMining(intent) {
        const steps = [];
        let target = intent.target;

        // Check if this needs to be crafted instead of mined
        if (isCraftable(target) && !isGatherable(target)) {
            logger.debug(`GoalPlanner: ${target} is craftable, switching to craft plan`);
            return this.planCrafting({ ...intent, action: 'make' });
        }

        // Resolve block aliases (e.g., "iron" -> "iron_ore")
        const blockTypes = resolveBlockAlias(target);

        // Check if we need a better tool
        const toolNeeded = this.checkToolRequirement(blockTypes[0]);
        if (toolNeeded) {
            steps.push({
                type: 'ensure_tool',
                tool: toolNeeded,
                description: `Need ${toolNeeded} to mine ${target}`,
            });
        }

        // Main mining step
        steps.push({
            type: 'mine',
            target: blockTypes[0],
            blockTypes: blockTypes,
            count: intent.count || 64,
            description: `Mine ${intent.count || 64} ${target}`,
        });

        return {
            steps,
            intent,
            description: `Mining ${intent.count || 64} ${target}`,
        };
    }

    /**
     * Plan crafting operations with dependency resolution
     */
    planCrafting(intent) {
        const steps = [];
        const target = normalizeItem(intent.target);
        const count = intent.count || 1;

        // Check if we already have the item
        const currentCount = this.countInventoryItem(target);
        if (currentCount >= count) {
            return {
                steps: [],
                alreadyHave: true,
                description: `Already have ${currentCount} ${target}`,
            };
        }

        // Get recipe and required ingredients
        const recipe = getRecipe(target);
        if (!recipe) {
            // If no recipe, try to mine it
            if (isGatherable(target)) {
                return this.planMining({ ...intent, action: 'mine' });
            }
            return { steps: [], error: `Don't know how to make ${target}` };
        }

        // Calculate what we need
        const needed = count - currentCount;
        const craftsNeeded = Math.ceil(needed / recipe.count);

        // Check each ingredient
        for (const [ingredient, amountPerCraft] of Object.entries(recipe.ingredients)) {
            const totalNeeded = amountPerCraft * craftsNeeded;
            const have = this.countInventoryItem(ingredient);
            const shortage = totalNeeded - have;

            if (shortage > 0) {
                // Need to acquire this ingredient
                const ingredientRecipe = getRecipe(ingredient);

                if (ingredientRecipe) {
                    // Need to craft this ingredient
                    steps.push({
                        type: 'craft',
                        target: ingredient,
                        count: shortage,
                        description: `Craft ${shortage} ${ingredient}`,
                    });
                } else {
                    // Need to gather this ingredient
                    const blockTypes = resolveBlockAlias(ingredient);
                    steps.push({
                        type: 'gather',
                        target: ingredient,
                        blockTypes: blockTypes,
                        count: shortage,
                        description: `Gather ${shortage} ${ingredient}`,
                    });
                }
            }
        }

        // Ensure we have a crafting table if needed
        if (recipe.needsTable) {
            steps.push({
                type: 'ensure_crafting_table',
                description: 'Ensure crafting table is available',
            });
        }

        // Final crafting step
        steps.push({
            type: 'craft',
            target: target,
            count: needed,
            recipe: recipe,
            description: `Craft ${needed} ${target}`,
        });

        return {
            steps,
            intent,
            description: `Crafting ${count} ${target}`,
        };
    }

    /**
     * Plan navigation
     */
    planNavigation(intent) {
        const steps = [];

        if (intent.action === 'come') {
            steps.push({
                type: 'navigate_to_player',
                target: intent.target,
                description: `Go to player ${intent.target}`,
            });
        } else if (intent.action === 'go') {
            steps.push({
                type: 'navigate_to_coords',
                target: intent.target,
                description: `Go to ${intent.target.x}, ${intent.target.y}, ${intent.target.z}`,
            });
        }

        return {
            steps,
            intent,
            description: intent.action === 'come' ?
                `Coming to ${intent.target}` :
                `Going to coordinates`,
        };
    }

    /**
     * Plan combat
     */
    planCombat(intent) {
        const steps = [];

        // Ensure we have a weapon
        steps.push({
            type: 'ensure_weapon',
            description: 'Equip best available weapon',
        });

        // Combat step
        steps.push({
            type: 'kill',
            target: intent.target,
            count: intent.count || 10,
            description: `Kill ${intent.count || 10} ${intent.target}`,
        });

        return {
            steps,
            intent,
            description: `Hunting ${intent.target}`,
        };
    }

    /**
     * Plan farming
     */
    planFarming(intent) {
        return {
            steps: [{
                type: 'farm',
                continuous: true,
                description: 'Start continuous farming',
            }],
            intent,
            description: 'Starting farming operations',
        };
    }

    /**
     * Plan stop action
     */
    planStop(intent) {
        return {
            steps: [{
                type: 'stop',
                description: 'Stop current activity',
            }],
            intent,
            description: 'Stopping current task',
        };
    }

    /**
     * Plan drop action
     */
    planDrop(intent) {
        return {
            steps: [{
                type: 'drop',
                target: intent.target,
                count: intent.count || 1,
                description: `Drop ${intent.count || 1} ${intent.target}`,
            }],
            intent,
            description: `Dropping ${intent.target}`,
        };
    }

    /**
     * Check what tool is required for mining a block
     */
    checkToolRequirement(blockName) {
        const toolReqs = {
            'iron_ore': 'stone_pickaxe',
            'deepslate_iron_ore': 'stone_pickaxe',
            'gold_ore': 'iron_pickaxe',
            'deepslate_gold_ore': 'iron_pickaxe',
            'diamond_ore': 'iron_pickaxe',
            'deepslate_diamond_ore': 'iron_pickaxe',
            'emerald_ore': 'iron_pickaxe',
            'deepslate_emerald_ore': 'iron_pickaxe',
            'redstone_ore': 'iron_pickaxe',
            'obsidian': 'diamond_pickaxe',
            'ancient_debris': 'diamond_pickaxe',
        };

        const required = toolReqs[blockName];
        if (!required) return null;

        // Check if we have a good enough tool
        if (this.hasTool(required)) return null;

        return required;
    }

    /**
     * Check if bot has a tool of required tier or better
     */
    hasTool(toolName) {
        if (!this.bot || !this.bot.inventory) return false;

        const items = this.bot.inventory.items();
        const tiers = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite'];

        // Extract tool type and tier from required tool
        const toolType = toolName.replace(/wooden_|stone_|iron_|golden_|diamond_|netherite_/, '');
        const requiredTier = tiers.findIndex(t => toolName.includes(t));

        // Check if we have this tool type at required tier or better
        for (const item of items) {
            if (item.name.includes(toolType)) {
                const itemTier = tiers.findIndex(t => item.name.includes(t));
                if (itemTier >= requiredTier) return true;
            }
        }

        return false;
    }

    /**
     * Count how many of an item we have in inventory
     */
    countInventoryItem(itemName) {
        if (!this.bot || !this.bot.inventory) return 0;

        const items = this.bot.inventory.items();
        let count = 0;

        for (const item of items) {
            // Exact match
            if (item.name === itemName) {
                count += item.count;
            }
            // Partial match for generic names (e.g., "planks" matches "oak_planks")
            else if (itemName === 'planks' && item.name.includes('planks')) {
                count += item.count;
            }
            else if (itemName === 'log' && item.name.includes('log')) {
                count += item.count;
            }
        }

        return count;
    }
}

module.exports = GoalPlanner;
