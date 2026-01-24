/**
 * Minecraft Crafting and Smelting Recipes Database
 * Contains all vanilla recipes for crafting automation
 */

// Crafting recipes - format: { output: { count, ingredients: { item: count }, needsTable: bool } }
const craftingRecipes = {
    // Wood processing
    'oak_planks': { count: 4, ingredients: { 'oak_log': 1 }, needsTable: false },
    'birch_planks': { count: 4, ingredients: { 'birch_log': 1 }, needsTable: false },
    'spruce_planks': { count: 4, ingredients: { 'spruce_log': 1 }, needsTable: false },
    'jungle_planks': { count: 4, ingredients: { 'jungle_log': 1 }, needsTable: false },
    'acacia_planks': { count: 4, ingredients: { 'acacia_log': 1 }, needsTable: false },
    'dark_oak_planks': { count: 4, ingredients: { 'dark_oak_log': 1 }, needsTable: false },
    'mangrove_planks': { count: 4, ingredients: { 'mangrove_log': 1 }, needsTable: false },
    'cherry_planks': { count: 4, ingredients: { 'cherry_log': 1 }, needsTable: false },

    // Basic items
    'stick': { count: 4, ingredients: { 'planks': 2 }, needsTable: false },
    'crafting_table': { count: 1, ingredients: { 'planks': 4 }, needsTable: false },
    'chest': { count: 1, ingredients: { 'planks': 8 }, needsTable: true },
    'furnace': { count: 1, ingredients: { 'cobblestone': 8 }, needsTable: true },
    'torch': { count: 4, ingredients: { 'coal': 1, 'stick': 1 }, needsTable: false },
    'charcoal_torch': { count: 4, ingredients: { 'charcoal': 1, 'stick': 1 }, needsTable: false },

    // Wooden tools
    'wooden_pickaxe': { count: 1, ingredients: { 'planks': 3, 'stick': 2 }, needsTable: true },
    'wooden_axe': { count: 1, ingredients: { 'planks': 3, 'stick': 2 }, needsTable: true },
    'wooden_shovel': { count: 1, ingredients: { 'planks': 1, 'stick': 2 }, needsTable: true },
    'wooden_sword': { count: 1, ingredients: { 'planks': 2, 'stick': 1 }, needsTable: true },
    'wooden_hoe': { count: 1, ingredients: { 'planks': 2, 'stick': 2 }, needsTable: true },

    // Stone tools
    'stone_pickaxe': { count: 1, ingredients: { 'cobblestone': 3, 'stick': 2 }, needsTable: true },
    'stone_axe': { count: 1, ingredients: { 'cobblestone': 3, 'stick': 2 }, needsTable: true },
    'stone_shovel': { count: 1, ingredients: { 'cobblestone': 1, 'stick': 2 }, needsTable: true },
    'stone_sword': { count: 1, ingredients: { 'cobblestone': 2, 'stick': 1 }, needsTable: true },
    'stone_hoe': { count: 1, ingredients: { 'cobblestone': 2, 'stick': 2 }, needsTable: true },

    // Iron tools
    'iron_pickaxe': { count: 1, ingredients: { 'iron_ingot': 3, 'stick': 2 }, needsTable: true },
    'iron_axe': { count: 1, ingredients: { 'iron_ingot': 3, 'stick': 2 }, needsTable: true },
    'iron_shovel': { count: 1, ingredients: { 'iron_ingot': 1, 'stick': 2 }, needsTable: true },
    'iron_sword': { count: 1, ingredients: { 'iron_ingot': 2, 'stick': 1 }, needsTable: true },
    'iron_hoe': { count: 1, ingredients: { 'iron_ingot': 2, 'stick': 2 }, needsTable: true },

    // Gold tools
    'golden_pickaxe': { count: 1, ingredients: { 'gold_ingot': 3, 'stick': 2 }, needsTable: true },
    'golden_axe': { count: 1, ingredients: { 'gold_ingot': 3, 'stick': 2 }, needsTable: true },
    'golden_shovel': { count: 1, ingredients: { 'gold_ingot': 1, 'stick': 2 }, needsTable: true },
    'golden_sword': { count: 1, ingredients: { 'gold_ingot': 2, 'stick': 1 }, needsTable: true },
    'golden_hoe': { count: 1, ingredients: { 'gold_ingot': 2, 'stick': 2 }, needsTable: true },

    // Diamond tools
    'diamond_pickaxe': { count: 1, ingredients: { 'diamond': 3, 'stick': 2 }, needsTable: true },
    'diamond_axe': { count: 1, ingredients: { 'diamond': 3, 'stick': 2 }, needsTable: true },
    'diamond_shovel': { count: 1, ingredients: { 'diamond': 1, 'stick': 2 }, needsTable: true },
    'diamond_sword': { count: 1, ingredients: { 'diamond': 2, 'stick': 1 }, needsTable: true },
    'diamond_hoe': { count: 1, ingredients: { 'diamond': 2, 'stick': 2 }, needsTable: true },

    // Netherite tools (need smithing table - special case)
    // Note: Netherite requires smithing, not crafting

    // Iron armor
    'iron_helmet': { count: 1, ingredients: { 'iron_ingot': 5 }, needsTable: true },
    'iron_chestplate': { count: 1, ingredients: { 'iron_ingot': 8 }, needsTable: true },
    'iron_leggings': { count: 1, ingredients: { 'iron_ingot': 7 }, needsTable: true },
    'iron_boots': { count: 1, ingredients: { 'iron_ingot': 4 }, needsTable: true },

    // Diamond armor
    'diamond_helmet': { count: 1, ingredients: { 'diamond': 5 }, needsTable: true },
    'diamond_chestplate': { count: 1, ingredients: { 'diamond': 8 }, needsTable: true },
    'diamond_leggings': { count: 1, ingredients: { 'diamond': 7 }, needsTable: true },
    'diamond_boots': { count: 1, ingredients: { 'diamond': 4 }, needsTable: true },

    // Leather armor
    'leather_helmet': { count: 1, ingredients: { 'leather': 5 }, needsTable: true },
    'leather_chestplate': { count: 1, ingredients: { 'leather': 8 }, needsTable: true },
    'leather_leggings': { count: 1, ingredients: { 'leather': 7 }, needsTable: true },
    'leather_boots': { count: 1, ingredients: { 'leather': 4 }, needsTable: true },

    // Blocks
    'iron_block': { count: 1, ingredients: { 'iron_ingot': 9 }, needsTable: true },
    'gold_block': { count: 1, ingredients: { 'gold_ingot': 9 }, needsTable: true },
    'diamond_block': { count: 1, ingredients: { 'diamond': 9 }, needsTable: true },
    'coal_block': { count: 1, ingredients: { 'coal': 9 }, needsTable: true },
    'lapis_block': { count: 1, ingredients: { 'lapis_lazuli': 9 }, needsTable: true },
    'redstone_block': { count: 1, ingredients: { 'redstone': 9 }, needsTable: true },
    'emerald_block': { count: 1, ingredients: { 'emerald': 9 }, needsTable: true },

    // Ingots from blocks (reverse)
    'iron_ingot_from_block': { count: 9, ingredients: { 'iron_block': 1 }, needsTable: false, output: 'iron_ingot' },
    'gold_ingot_from_block': { count: 9, ingredients: { 'gold_block': 1 }, needsTable: false, output: 'gold_ingot' },
    'diamond_from_block': { count: 9, ingredients: { 'diamond_block': 1 }, needsTable: false, output: 'diamond' },

    // Combat items
    'bow': { count: 1, ingredients: { 'stick': 3, 'string': 3 }, needsTable: true },
    'arrow': { count: 4, ingredients: { 'flint': 1, 'stick': 1, 'feather': 1 }, needsTable: true },
    'shield': { count: 1, ingredients: { 'planks': 6, 'iron_ingot': 1 }, needsTable: true },

    // Food
    'bread': { count: 1, ingredients: { 'wheat': 3 }, needsTable: true },
    'cake': { count: 1, ingredients: { 'wheat': 3, 'sugar': 2, 'egg': 1, 'milk_bucket': 3 }, needsTable: true },
    'cookie': { count: 8, ingredients: { 'wheat': 2, 'cocoa_beans': 1 }, needsTable: true },
    'golden_apple': { count: 1, ingredients: { 'apple': 1, 'gold_ingot': 8 }, needsTable: true },
    'golden_carrot': { count: 1, ingredients: { 'carrot': 1, 'gold_nugget': 8 }, needsTable: true },

    // Misc items
    'bucket': { count: 1, ingredients: { 'iron_ingot': 3 }, needsTable: true },
    'compass': { count: 1, ingredients: { 'iron_ingot': 4, 'redstone': 1 }, needsTable: true },
    'clock': { count: 1, ingredients: { 'gold_ingot': 4, 'redstone': 1 }, needsTable: true },
    'bed': { count: 1, ingredients: { 'planks': 3, 'wool': 3 }, needsTable: true },
    'ladder': { count: 3, ingredients: { 'stick': 7 }, needsTable: true },
    'fence': { count: 3, ingredients: { 'planks': 4, 'stick': 2 }, needsTable: true },
    'fence_gate': { count: 1, ingredients: { 'planks': 2, 'stick': 4 }, needsTable: true },
    'door': { count: 3, ingredients: { 'planks': 6 }, needsTable: true },
    'trapdoor': { count: 2, ingredients: { 'planks': 6 }, needsTable: true },
    'boat': { count: 1, ingredients: { 'planks': 5 }, needsTable: true },
    'minecart': { count: 1, ingredients: { 'iron_ingot': 5 }, needsTable: true },
    'rail': { count: 16, ingredients: { 'iron_ingot': 6, 'stick': 1 }, needsTable: true },
    'powered_rail': { count: 6, ingredients: { 'gold_ingot': 6, 'stick': 1, 'redstone': 1 }, needsTable: true },

    // Redstone
    'piston': { count: 1, ingredients: { 'planks': 3, 'cobblestone': 4, 'iron_ingot': 1, 'redstone': 1 }, needsTable: true },
    'sticky_piston': { count: 1, ingredients: { 'piston': 1, 'slime_ball': 1 }, needsTable: true },
    'observer': { count: 1, ingredients: { 'cobblestone': 6, 'redstone': 2, 'quartz': 1 }, needsTable: true },
    'hopper': { count: 1, ingredients: { 'iron_ingot': 5, 'chest': 1 }, needsTable: true },
    'dispenser': { count: 1, ingredients: { 'cobblestone': 7, 'bow': 1, 'redstone': 1 }, needsTable: true },
    'dropper': { count: 1, ingredients: { 'cobblestone': 7, 'redstone': 1 }, needsTable: true },
    'lever': { count: 1, ingredients: { 'stick': 1, 'cobblestone': 1 }, needsTable: false },
    'stone_button': { count: 1, ingredients: { 'stone': 1 }, needsTable: false },
    'wooden_button': { count: 1, ingredients: { 'planks': 1 }, needsTable: false },
    'pressure_plate': { count: 1, ingredients: { 'stone': 2 }, needsTable: true },

    // Brewing
    'brewing_stand': { count: 1, ingredients: { 'blaze_rod': 1, 'cobblestone': 3 }, needsTable: true },
    'cauldron': { count: 1, ingredients: { 'iron_ingot': 7 }, needsTable: true },
    'glass_bottle': { count: 3, ingredients: { 'glass': 3 }, needsTable: true },

    // Enchanting
    'enchanting_table': { count: 1, ingredients: { 'diamond': 2, 'obsidian': 4, 'book': 1 }, needsTable: true },
    'bookshelf': { count: 1, ingredients: { 'planks': 6, 'book': 3 }, needsTable: true },
    'book': { count: 1, ingredients: { 'paper': 3, 'leather': 1 }, needsTable: true },
    'paper': { count: 3, ingredients: { 'sugar_cane': 3 }, needsTable: true },

    // Anvil & Smithing
    'anvil': { count: 1, ingredients: { 'iron_block': 3, 'iron_ingot': 4 }, needsTable: true },
    'smithing_table': { count: 1, ingredients: { 'iron_ingot': 2, 'planks': 4 }, needsTable: true },

    // Decorative
    'glass_pane': { count: 16, ingredients: { 'glass': 6 }, needsTable: true },
    'iron_bars': { count: 16, ingredients: { 'iron_ingot': 6 }, needsTable: true },
    'painting': { count: 1, ingredients: { 'stick': 8, 'wool': 1 }, needsTable: true },
    'item_frame': { count: 1, ingredients: { 'stick': 8, 'leather': 1 }, needsTable: true },
    'sign': { count: 3, ingredients: { 'planks': 6, 'stick': 1 }, needsTable: true },

    // Blast furnace & Smoker
    'blast_furnace': { count: 1, ingredients: { 'iron_ingot': 5, 'furnace': 1, 'smooth_stone': 3 }, needsTable: true },
    'smoker': { count: 1, ingredients: { 'furnace': 1, 'oak_log': 4 }, needsTable: true },
};

// Smelting recipes - format: { input: output }
const smeltingRecipes = {
    // Ores
    'iron_ore': 'iron_ingot',
    'deepslate_iron_ore': 'iron_ingot',
    'gold_ore': 'gold_ingot',
    'deepslate_gold_ore': 'gold_ingot',
    'copper_ore': 'copper_ingot',
    'deepslate_copper_ore': 'copper_ingot',
    'ancient_debris': 'netherite_scrap',

    // Raw ores
    'raw_iron': 'iron_ingot',
    'raw_gold': 'gold_ingot',
    'raw_copper': 'copper_ingot',

    // Stone variants
    'cobblestone': 'stone',
    'stone': 'smooth_stone',
    'sandstone': 'smooth_sandstone',
    'red_sandstone': 'smooth_red_sandstone',
    'quartz_block': 'smooth_quartz',

    // Clay & Glass
    'clay_ball': 'brick',
    'clay': 'terracotta',
    'sand': 'glass',
    'red_sand': 'red_stained_glass',
    'netherrack': 'nether_brick',

    // Food
    'raw_beef': 'cooked_beef',
    'raw_porkchop': 'cooked_porkchop',
    'raw_chicken': 'cooked_chicken',
    'raw_mutton': 'cooked_mutton',
    'raw_rabbit': 'cooked_rabbit',
    'raw_cod': 'cooked_cod',
    'raw_salmon': 'cooked_salmon',
    'potato': 'baked_potato',
    'kelp': 'dried_kelp',

    // Misc
    'wet_sponge': 'sponge',
    'oak_log': 'charcoal',
    'birch_log': 'charcoal',
    'spruce_log': 'charcoal',
    'jungle_log': 'charcoal',
    'acacia_log': 'charcoal',
    'dark_oak_log': 'charcoal',
    'cactus': 'green_dye',
    'sea_pickle': 'lime_dye',
    'chorus_fruit': 'popped_chorus_fruit',
};

// Block names for mining - maps common names to actual block IDs
const blockAliases = {
    'wood': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
    'log': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
    'planks': ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks'],
    'ore': ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore', 'lapis_ore', 'redstone_ore', 'copper_ore'],
    'stone': ['stone', 'cobblestone', 'deepslate', 'andesite', 'diorite', 'granite'],
    'dirt': ['dirt', 'grass_block', 'coarse_dirt', 'podzol'],
    'sand': ['sand', 'red_sand'],
    'gravel': ['gravel'],
    'coal': ['coal_ore', 'deepslate_coal_ore'],
    'iron': ['iron_ore', 'deepslate_iron_ore'],
    'gold': ['gold_ore', 'deepslate_gold_ore'],
    'diamond': ['diamond_ore', 'deepslate_diamond_ore'],
    'emerald': ['emerald_ore', 'deepslate_emerald_ore'],
    'redstone': ['redstone_ore', 'deepslate_redstone_ore'],
    'lapis': ['lapis_ore', 'deepslate_lapis_ore'],
    'copper': ['copper_ore', 'deepslate_copper_ore'],
    'netherite': ['ancient_debris'],
    'wheat': ['wheat'],
    'carrots': ['carrots'],
    'potatoes': ['potatoes'],
    'beetroots': ['beetroots'],
    'crops': ['wheat', 'carrots', 'potatoes', 'beetroots'],
    'glass': ['glass'],
    'leaves': ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves'],
};

// Mob aliases for killing
const mobAliases = {
    'zombie': ['zombie', 'zombie_villager', 'husk', 'drowned'],
    'skeleton': ['skeleton', 'stray', 'wither_skeleton'],
    'spider': ['spider', 'cave_spider'],
    'creeper': ['creeper'],
    'enderman': ['enderman'],
    'pig': ['pig'],
    'cow': ['cow', 'mooshroom'],
    'sheep': ['sheep'],
    'chicken': ['chicken'],
    'wolf': ['wolf'],
    'hostile': ['zombie', 'skeleton', 'spider', 'creeper', 'witch', 'enderman', 'slime', 'phantom'],
    'passive': ['pig', 'cow', 'sheep', 'chicken', 'rabbit', 'horse', 'donkey', 'llama'],
};

// Tool requirements for mining certain blocks
const toolRequirements = {
    'stone': 'wooden_pickaxe',
    'cobblestone': 'wooden_pickaxe',
    'iron_ore': 'stone_pickaxe',
    'deepslate_iron_ore': 'stone_pickaxe',
    'gold_ore': 'iron_pickaxe',
    'deepslate_gold_ore': 'iron_pickaxe',
    'diamond_ore': 'iron_pickaxe',
    'deepslate_diamond_ore': 'iron_pickaxe',
    'emerald_ore': 'iron_pickaxe',
    'deepslate_emerald_ore': 'iron_pickaxe',
    'redstone_ore': 'iron_pickaxe',
    'deepslate_redstone_ore': 'iron_pickaxe',
    'obsidian': 'diamond_pickaxe',
    'ancient_debris': 'diamond_pickaxe',
};

// Tool material tiers
const toolTiers = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite'];

/**
 * Get recipe for an item
 */
function getRecipe(itemName) {
    // Normalize item name
    const normalized = itemName.toLowerCase().replace(/-/g, '_');

    // Check direct match
    if (craftingRecipes[normalized]) {
        return { ...craftingRecipes[normalized], name: normalized };
    }

    // Check for recipes with alternate output names
    for (const [recipeName, recipe] of Object.entries(craftingRecipes)) {
        if (recipe.output === normalized) {
            return { ...recipe, name: recipeName };
        }
    }

    return null;
}

/**
 * Get smelting result for an item
 */
function getSmeltingResult(itemName) {
    const normalized = itemName.toLowerCase().replace(/-/g, '_');
    return smeltingRecipes[normalized] || null;
}

/**
 * Resolve block aliases to actual block names
 */
function resolveBlockAlias(blockName) {
    const normalized = blockName.toLowerCase().replace(/-/g, '_');
    return blockAliases[normalized] || [normalized];
}

/**
 * Resolve mob aliases to actual mob names
 */
function resolveMobAlias(mobName) {
    const normalized = mobName.toLowerCase().replace(/-/g, '_');
    return mobAliases[normalized] || [normalized];
}

/**
 * Get required tool for mining a block
 */
function getRequiredTool(blockName) {
    const normalized = blockName.toLowerCase().replace(/-/g, '_');
    return toolRequirements[normalized] || null;
}

/**
 * Check if a tool can mine a block (tier comparison)
 */
function canToolMine(toolName, requiredTool) {
    if (!requiredTool) return true; // No requirement

    const toolTierIndex = (name) => {
        for (let i = 0; i < toolTiers.length; i++) {
            if (name && name.includes(toolTiers[i])) return i;
        }
        return -1;
    };

    return toolTierIndex(toolName) >= toolTierIndex(requiredTool);
}

/**
 * Get all ingredients needed for an item (recursive)
 */
function getAllIngredients(itemName, count = 1) {
    const recipe = getRecipe(itemName);
    if (!recipe) return null;

    const needed = {};
    const multiplier = Math.ceil(count / recipe.count);

    for (const [ingredient, amount] of Object.entries(recipe.ingredients)) {
        const totalAmount = amount * multiplier;

        // Check if ingredient itself needs to be crafted
        const subRecipe = getRecipe(ingredient);
        if (subRecipe) {
            const subIngredients = getAllIngredients(ingredient, totalAmount);
            if (subIngredients) {
                for (const [subItem, subAmount] of Object.entries(subIngredients)) {
                    needed[subItem] = (needed[subItem] || 0) + subAmount;
                }
            } else {
                needed[ingredient] = (needed[ingredient] || 0) + totalAmount;
            }
        } else {
            needed[ingredient] = (needed[ingredient] || 0) + totalAmount;
        }
    }

    return needed;
}

module.exports = {
    craftingRecipes,
    smeltingRecipes,
    blockAliases,
    mobAliases,
    toolRequirements,
    toolTiers,
    getRecipe,
    getSmeltingResult,
    resolveBlockAlias,
    resolveMobAlias,
    getRequiredTool,
    canToolMine,
    getAllIngredients
};
