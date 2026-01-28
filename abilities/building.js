/**
 * Building Ability Module
 * Builds various structures: houses, farms, XP farms, etc.
 * Features:
 * - Multiple building blueprints (small house, survival house, modern house, etc.)
 * - Automatic area finding and clearing
 * - Material checking and optional gathering
 * - Step-by-step building execution
 */

const logger = require('../utils/logger');
const Vec3 = require('vec3');

class BuildingAbility {
    constructor(bot, pathfinder, minerAbility = null) {
        this.bot = bot;
        this.pathfinder = pathfinder;
        this.minerAbility = minerAbility;
        this.isActive = false;
        this.currentBuild = null;

        // Building blueprints - each is a 3D array of blocks
        // Format: { name, size: {x, y, z}, materials: {blockName: count}, layers: [...] }
        this.blueprints = this.initializeBlueprints();
    }

    /**
     * Initialize all building blueprints
     */
    initializeBlueprints() {
        return {
            // ============== SMALL SURVIVAL HOUSE (Improved!) ==============
            'small_house': {
                name: 'Small Survival House',
                description: 'A cozy 7x7 wooden house with sloped roof, porch, and windows',
                size: { x: 7, y: 7, z: 7 },
                materials: {
                    'oak_planks': 80,
                    'oak_log': 16,
                    'stripped_oak_log': 8,
                    'oak_stairs': 28,
                    'cobblestone': 49,
                    'glass_pane': 12,
                    'oak_door': 1,
                    'oak_fence': 6,
                    'torch': 6,
                    'crafting_table': 1,
                    'chest': 1,
                    'lantern': 2
                },
                // Each layer is y-level from bottom (0 = foundation)
                layers: [
                    // Layer 0 - Foundation (cobblestone base)
                    [
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone']
                    ],
                    // Layer 1 - Floor
                    [
                        ['stripped_oak_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_oak_log'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['stripped_oak_log', 'oak_planks', 'oak_planks', 'oak_door', 'oak_planks', 'oak_planks', 'stripped_oak_log']
                    ],
                    // Layer 2 - Walls (bottom) with windows
                    [
                        ['stripped_oak_log', 'oak_planks', 'glass_pane', 'oak_planks', 'glass_pane', 'oak_planks', 'stripped_oak_log'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['stripped_oak_log', 'oak_planks', 'oak_fence', 'air', 'oak_fence', 'oak_planks', 'stripped_oak_log']
                    ],
                    // Layer 3 - Walls (top) with windows
                    [
                        ['stripped_oak_log', 'oak_planks', 'glass_pane', 'oak_planks', 'glass_pane', 'oak_planks', 'stripped_oak_log'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['stripped_oak_log', 'oak_planks', 'oak_fence', 'air', 'oak_fence', 'oak_planks', 'stripped_oak_log']
                    ],
                    // Layer 4 - Roof edge / Wall top
                    [
                        ['oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs']
                    ],
                    // Layer 5 - Roof middle
                    [
                        ['air', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'air'],
                        ['air', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'air'],
                        ['air', 'oak_planks', 'air', 'air', 'air', 'oak_planks', 'air'],
                        ['air', 'oak_planks', 'air', 'air', 'air', 'oak_planks', 'air'],
                        ['air', 'oak_planks', 'air', 'air', 'air', 'oak_planks', 'air'],
                        ['air', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'air'],
                        ['air', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'air']
                    ],
                    // Layer 6 - Roof peak
                    [
                        ['air', 'air', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'air', 'air'],
                        ['air', 'air', 'oak_planks', 'oak_planks', 'oak_planks', 'air', 'air'],
                        ['air', 'air', 'oak_planks', 'oak_planks', 'oak_planks', 'air', 'air'],
                        ['air', 'air', 'oak_planks', 'oak_planks', 'oak_planks', 'air', 'air'],
                        ['air', 'air', 'oak_planks', 'oak_planks', 'oak_planks', 'air', 'air'],
                        ['air', 'air', 'oak_planks', 'oak_planks', 'oak_planks', 'air', 'air'],
                        ['air', 'air', 'oak_stairs', 'oak_stairs', 'oak_stairs', 'air', 'air']
                    ]
                ]
            },

            // ============== COZY COTTAGE ==============
            'cozy_cottage': {
                name: 'Cozy Cottage',
                description: 'A rustic 9x9 cottage with chimney, flower boxes, and lanterns',
                size: { x: 9, y: 8, z: 9 },
                materials: {
                    'spruce_planks': 100,
                    'spruce_log': 20,
                    'stripped_spruce_log': 12,
                    'spruce_stairs': 36,
                    'cobblestone': 81,
                    'bricks': 24,
                    'glass_pane': 16,
                    'spruce_door': 1,
                    'spruce_trapdoor': 4,
                    'lantern': 6,
                    'flower_pot': 4,
                    'poppy': 2,
                    'dandelion': 2,
                    'crafting_table': 1,
                    'chest': 2,
                    'furnace': 1
                },
                layers: [
                    // Layer 0 - Foundation
                    [
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
                        ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone']
                    ],
                    // Layer 1 - Floor
                    [
                        ['stripped_spruce_log', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'stripped_spruce_log'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['stripped_spruce_log', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_door', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'stripped_spruce_log']
                    ],
                    // Layer 2 - Walls bottom with windows and flower trapdoors
                    [
                        ['stripped_spruce_log', 'spruce_planks', 'glass_pane', 'spruce_trapdoor', 'glass_pane', 'spruce_trapdoor', 'glass_pane', 'spruce_planks', 'stripped_spruce_log'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'spruce_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'spruce_planks'],
                        ['stripped_spruce_log', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'stripped_spruce_log']
                    ],
                    // Layer 3 - Walls top with windows
                    [
                        ['stripped_spruce_log', 'spruce_planks', 'glass_pane', 'spruce_planks', 'glass_pane', 'spruce_planks', 'glass_pane', 'spruce_planks', 'stripped_spruce_log'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'spruce_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'spruce_planks'],
                        ['stripped_spruce_log', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'stripped_spruce_log']
                    ],
                    // Layer 4 - Roof edge
                    [
                        ['spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'spruce_planks'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'bricks'],
                        ['spruce_planks', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'spruce_planks'],
                        ['spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks'],
                        ['spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs']
                    ],
                    // Layer 5 - Roof middle
                    [
                        ['air', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'air'],
                        ['air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'air'],
                        ['air', 'spruce_planks', 'air', 'air', 'air', 'air', 'air', 'spruce_planks', 'air'],
                        ['air', 'spruce_planks', 'air', 'air', 'air', 'air', 'air', 'bricks', 'air'],
                        ['air', 'spruce_planks', 'air', 'air', 'air', 'air', 'air', 'bricks', 'air'],
                        ['air', 'spruce_planks', 'air', 'air', 'air', 'air', 'air', 'bricks', 'air'],
                        ['air', 'spruce_planks', 'air', 'air', 'air', 'air', 'air', 'spruce_planks', 'air'],
                        ['air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'air'],
                        ['air', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'air']
                    ],
                    // Layer 6 - Roof peak
                    [
                        ['air', 'air', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'air', 'air'],
                        ['air', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'air', 'air'],
                        ['air', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'air', 'air'],
                        ['air', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'bricks', 'air', 'air'],
                        ['air', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'bricks', 'air', 'air'],
                        ['air', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'bricks', 'air', 'air'],
                        ['air', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'air', 'air'],
                        ['air', 'air', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'air', 'air'],
                        ['air', 'air', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'air', 'air']
                    ],
                    // Layer 7 - Chimney top
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'bricks', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'bricks', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'bricks', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ]
                ]
            },


            // ============== BIG MODERN MANSION (Fully Furnished) ==============
            'modern_mansion': {
                name: 'Modern Cube Mansion',
                description: 'A luxurious 2-story modern house with floor-to-ceiling windows, a balcony, and a fully equipped kitchen and bedroom.',
                size: { x: 11, y: 10, z: 11 },
                materials: {
                    'white_concrete': 200,
                    'gray_concrete': 64,
                    'cyan_stained_glass_pane': 80,
                    'dark_oak_planks': 120,
                    'quartz_stairs': 20, // For sofas/chairs
                    'sea_lantern': 8,    // Modern lighting
                    'iron_door': 2,
                    'stone_button': 2,
                    'black_carpet': 4,   // TV screen
                    'flower_pot': 2,
                    'painting': 1,
                    'bookshelf': 8,
                    'brewing_stand': 1,
                    'bed': 2
                },
                layers: [
                    // Layer 0 - Foundation (Gray Concrete)
                    [
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete']
                    ],
                    // Layer 1 - Ground Floor (Dark Oak) & Interior Layout
                    // Features: Kitchen counters (iron blocks), Living room Sofa (quartz stairs), TV area
                    [
                        ['white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'smoker', 'furnace', 'barrel', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'quartz_stairs', 'quartz_stairs', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'air', 'air', 'barrel', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'quartz_stairs', 'quartz_stairs', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'air', 'air', 'cauldron', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'black_carpet', 'black_carpet', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'flower_pot', 'dark_oak_planks', 'dark_oak_planks', 'ladder', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'ladder', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'white_concrete'],
                        ['white_concrete', 'dark_oak_planks', 'dark_oak_planks', 'iron_door', 'dark_oak_planks', 'ladder', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'white_concrete'],
                        ['white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete']
                    ],
                    // Layer 2 - Ground Walls (High windows)
                    [
                        ['white_concrete', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'white_concrete', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'white_concrete'],
                        ['cyan_stained_glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['cyan_stained_glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['cyan_stained_glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'white_concrete'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'painting', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'ladder', 'air', 'air', 'air', 'air', 'white_concrete'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'ladder', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'air', 'air', 'iron_door', 'air', 'ladder', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete']
                    ],
                    // Layer 3 - Ground Walls Upper
                    [
                        ['white_concrete', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'white_concrete', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'white_concrete'],
                        ['cyan_stained_glass_pane', 'air', 'air', 'air', 'sea_lantern', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['cyan_stained_glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['cyan_stained_glass_pane', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'white_concrete'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'ladder', 'air', 'air', 'air', 'air', 'white_concrete'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'ladder', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'air', 'air', 'air', 'air', 'ladder', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete']
                    ],
                    // Layer 4 - 2nd Floor Base / Ceiling of Ground
                    // Features: Balcony Area (Gray concrete) vs Bedroom Area (Dark Oak)
                    [
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'bookshelf', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'bookshelf', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'bed', 'bookshelf', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'dark_oak_planks', 'ladder', 'dark_oak_planks', 'dark_oak_planks', 'bed', 'bookshelf', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'dark_oak_planks', 'ladder', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'enchanting_table', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'dark_oak_planks', 'ladder', 'dark_oak_planks', 'brewing_stand', 'chest', 'chest', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete']
                    ],
                    // Layer 5 - 2nd Floor Walls
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'white_concrete', 'cyan_stained_glass_pane', 'iron_door', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'white_concrete'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'white_concrete'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'ladder', 'air', 'air', 'air', 'air', 'white_concrete'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'ladder', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'ladder', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete']
                    ],
                    // Layer 6 - 2nd Floor Upper Walls
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'white_concrete', 'cyan_stained_glass_pane', 'iron_door', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'cyan_stained_glass_pane', 'white_concrete'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'air', 'air', 'sea_lantern', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'air', 'air', 'air', 'air', 'air', 'white_concrete'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'ladder', 'air', 'air', 'air', 'air', 'white_concrete'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'ladder', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['air', 'air', 'air', 'white_concrete', 'air', 'ladder', 'air', 'air', 'air', 'air', 'cyan_stained_glass_pane'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete']
                    ],
                    // Layer 7 - Roof (Flat Modern Roof)
                    [
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete', 'gray_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'sea_lantern', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'ladder', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'trapdoor', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
                        ['gray_concrete', 'gray_concrete', 'gray_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete', 'white_concrete']
                    ]
                ]
            },

            // ============== EXPANDED SURVIVAL HOUSE (With Roof Overhangs) ==============
            'expanded_house': {
                name: 'Expanded Survival House',
                description: 'A 9x9 footprint structure (7x7 interior) with proper roof overhangs and taller walls.',
                // NOTE: Size is now 9x9 to allow for the roof to hang off the sides!
                size: { x: 9, y: 10, z: 9 },
                materials: {
                    'stone_bricks': 49,     // Foundation
                    'stripped_spruce_log': 20, // Pillars
                    'oak_planks': 100,      // Walls/Floor
                    'cobblestone_stairs': 60,  // Roof Trim
                    'spruce_stairs': 40,       // Roof Fill
                    'glass_pane': 12,
                    'oak_door': 1,
                    'torch': 4,
                    'lantern': 2
                },
                layers: [
                    // Layer 0 - Foundation (7x7 Centered in the 9x9 grid)
                    // "air" is used on the edges so the foundation is 7x7, but the grid handles the 9x9 roof later.
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'air'],
                        ['air', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'air'],
                        ['air', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'air'],
                        ['air', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'air'],
                        ['air', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'air'],
                        ['air', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'air'],
                        ['air', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ],
                    // Layer 1 - Floor & Pillars
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'air'],
                        ['air', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'air'],
                        ['air', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'air'],
                        ['air', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'air'],
                        ['air', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_door', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ],
                    // Layer 2 - Walls (Lower)
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'glass_pane', 'oak_planks', 'glass_pane', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'air'],
                        ['air', 'glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane', 'air'],
                        ['air', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'air'],
                        ['air', 'glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane', 'air'],
                        ['air', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'air', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ],
                    // Layer 3 - Walls (Upper - Extra height added!)
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'oak_planks', 'torch', 'air', 'air', 'air', 'torch', 'oak_planks', 'air'],
                        ['air', 'glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane', 'air'],
                        ['air', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'air'],
                        ['air', 'glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane', 'air'],
                        ['air', 'oak_planks', 'torch', 'air', 'air', 'air', 'torch', 'oak_planks', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ],
                    // Layer 4 - Ceiling / Roof Support
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log', 'air'],
                        ['air', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ],
                    // Layer 5 - Roof Base (THE OVERHANG LAYER - 9x9)
                    [
                        ['cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs']
                    ],
                    // Layer 6 - Roof Mid (7x7)
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'air', 'air', 'air', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'air', 'air', 'air', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'air', 'air', 'air', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ],
                    // Layer 7 - Roof Upper (5x5)
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ],
                    // Layer 8 - Roof Peak (3x3)
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ],
                    // Layer 9 - Roof Top (1x1)
                    [
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'cobblestone_stairs', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'air', 'air', 'air', 'air', 'air', 'air']
                    ]
                ]
            },

            // ============== SURVIVAL STARTER HOUSE ==============
            'survival_house': {
                name: 'Survival Starter House',
                description: 'A 7x7 house with bed, crafting, and storage',
                size: { x: 7, y: 5, z: 7 },
                materials: {
                    'cobblestone': 80,
                    'oak_planks': 50,
                    'oak_log': 12,
                    'glass_pane': 8,
                    'oak_door': 1,
                    'torch': 8,
                    'crafting_table': 1,
                    'furnace': 1,
                    'chest': 2,
                    'white_bed': 1
                },
                layers: this.generateSurvivalHouseLayers()
            },

            // ============== MODERN HOUSE ==============
            'modern_house': {
                name: 'Modern House',
                description: 'A sleek 9x9 modern house with quartz and glass',
                size: { x: 9, y: 6, z: 9 },
                materials: {
                    'quartz_block': 120,
                    'black_concrete': 60,
                    'glass': 40,
                    'glowstone': 12,
                    'iron_door': 1,
                    'oak_planks': 30,
                    'white_bed': 1,
                    'chest': 2
                },
                layers: this.generateModernHouseLayers()
            },

            // ============== VINTAGE/MEDIEVAL HOUSE ==============
            'vintage_house': {
                name: 'Vintage Medieval House',
                description: 'A rustic 7x7 medieval style house',
                size: { x: 7, y: 6, z: 7 },
                materials: {
                    'cobblestone': 70,
                    'oak_log': 30,
                    'stripped_oak_log': 20,
                    'oak_planks': 50,
                    'glass_pane': 6,
                    'oak_door': 1,
                    'lantern': 6,
                    'oak_fence': 8,
                    'oak_stairs': 20
                },
                layers: this.generateVintageHouseLayers()
            },

            // ============== LARGE MANSION ==============
            'large_house': {
                name: 'Large Mansion',
                description: 'A grand 15x15 mansion with multiple rooms',
                size: { x: 15, y: 8, z: 15 },
                materials: {
                    'stone_bricks': 300,
                    'oak_planks': 200,
                    'oak_log': 40,
                    'glass_pane': 30,
                    'oak_door': 3,
                    'torch': 20,
                    'white_bed': 4,
                    'chest': 6,
                    'crafting_table': 2,
                    'furnace': 2
                },
                layers: this.generateLargeMansionLayers()
            },

            // ============== SIMPLE FARM ==============
            'farm': {
                name: 'Simple Farm',
                description: 'A 9x9 wheat farm with water',
                size: { x: 9, y: 2, z: 9 },
                materials: {
                    'oak_fence': 32,
                    'oak_fence_gate': 1,
                    'water_bucket': 1,
                    'wheat_seeds': 64,
                    'torch': 4
                },
                layers: this.generateFarmLayers()
            },

            // ============== MOB XP FARM (Simple) ==============
            'xp_farm': {
                name: 'Simple XP Farm',
                description: 'A basic mob spawner trap (9x9)',
                size: { x: 9, y: 8, z: 9 },
                materials: {
                    'cobblestone': 200,
                    'water_bucket': 4,
                    'sign': 8,
                    'torch': 0, // Dark inside
                    'trapdoor': 16,
                    'hopper': 4,
                    'chest': 2
                },
                layers: this.generateXPFarmLayers()
            },

            // ============== TINY SHELTER ==============
            'tiny_shelter': {
                name: 'Tiny Emergency Shelter',
                description: 'A 3x3 emergency shelter for first night',
                size: { x: 3, y: 3, z: 3 },
                materials: {
                    'dirt': 20,
                    'torch': 1
                },
                layers: [
                    // Floor
                    [
                        ['dirt', 'dirt', 'dirt'],
                        ['dirt', 'dirt', 'dirt'],
                        ['dirt', 'dirt', 'dirt']
                    ],
                    // Walls
                    [
                        ['dirt', 'dirt', 'dirt'],
                        ['dirt', 'air', 'dirt'],
                        ['dirt', 'air', 'dirt']
                    ],
                    // Roof
                    [
                        ['dirt', 'dirt', 'dirt'],
                        ['dirt', 'dirt', 'dirt'],
                        ['dirt', 'dirt', 'dirt']
                    ]
                ]
            },

            // ============== WATCHTOWER ==============
            'watchtower': {
                name: 'Watchtower',
                description: 'A tall observation tower',
                size: { x: 5, y: 12, z: 5 },
                materials: {
                    'cobblestone': 100,
                    'oak_planks': 40,
                    'oak_fence': 20,
                    'ladder': 12,
                    'torch': 8
                },
                layers: this.generateWatchtowerLayers()
            },

            // ============== REINFORCED OUTPOST HOUSE ==============
            'reinforced_outpost': {
                name: 'Reinforced Outpost',
                description: 'A sturdy 7x7 two-story cabin with stone brick foundation, spruce log supports, and a functional interior.',
                size: { x: 7, y: 9, z: 7 },
                materials: {
                    'stone_bricks': 49,
                    'stripped_spruce_log': 20, // Pillars
                    'oak_planks': 64,          // Walls/Floor
                    'cobblestone_stairs': 40,  // Roof Trim
                    'spruce_stairs': 24,       // Roof Fill
                    'glass_pane': 8,
                    'spruce_door': 1,
                    'torch': 4,
                    'crafting_table': 1,
                    'furnace': 2,
                    'chest': 2,
                    'bed': 1,
                    'ladder': 4
                },
                // Each layer is y-level from bottom (0 = foundation)
                layers: [
                    // Layer 0 - Foundation (Stone Bricks for sturdiness)
                    [
                        ['stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks'],
                        ['stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks'],
                        ['stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks'],
                        ['stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks'],
                        ['stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks'],
                        ['stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks'],
                        ['stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks']
                    ],
                    // Layer 1 - Floor & Structural Pillars (Corners are Logs)
                    [
                        ['stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'bed', 'oak_planks', 'chest', 'chest', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'crafting_table', 'oak_planks', 'furnace', 'furnace', 'oak_planks'],
                        ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
                        ['stripped_spruce_log', 'oak_planks', 'oak_planks', 'spruce_door', 'oak_planks', 'oak_planks', 'stripped_spruce_log']
                    ],
                    // Layer 2 - Walls Lower (Windows and Interior Air)
                    [
                        ['stripped_spruce_log', 'oak_planks', 'glass_pane', 'oak_planks', 'glass_pane', 'oak_planks', 'stripped_spruce_log'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['oak_planks', 'air', 'ladder', 'air', 'air', 'air', 'oak_planks'],
                        ['stripped_spruce_log', 'oak_planks', 'oak_planks', 'air', 'oak_planks', 'oak_planks', 'stripped_spruce_log']
                    ],
                    // Layer 3 - Walls Upper (High Windows)
                    [
                        ['stripped_spruce_log', 'oak_planks', 'glass_pane', 'oak_planks', 'glass_pane', 'oak_planks', 'stripped_spruce_log'],
                        ['oak_planks', 'torch', 'air', 'air', 'air', 'torch', 'oak_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['oak_planks', 'air', 'air', 'air', 'air', 'air', 'oak_planks'],
                        ['glass_pane', 'air', 'air', 'air', 'air', 'air', 'glass_pane'],
                        ['oak_planks', 'air', 'ladder', 'air', 'air', 'air', 'oak_planks'],
                        ['stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log']
                    ],
                    // Layer 4 - Ceiling / Attic Floor (Ring of logs for support visual)
                    [
                        ['stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log'],
                        ['stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log'],
                        ['stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log'],
                        ['stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log'],
                        ['stripped_spruce_log', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log'],
                        ['stripped_spruce_log', 'oak_planks', 'ladder', 'oak_planks', 'oak_planks', 'oak_planks', 'stripped_spruce_log'],
                        ['stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log', 'stripped_spruce_log']
                    ],
                    // Layer 5 - Roof Base (Cobblestone stairs outline, Spruce stairs fill)
                    [
                        ['cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'air', 'air', 'air', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'air', 'air', 'air', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'air', 'air', 'air', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'cobblestone_stairs'],
                        ['cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs']
                    ],
                    // Layer 6 - Roof Mid
                    [
                        ['air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'air', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'air', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'air', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'spruce_stairs', 'spruce_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air'],
                        ['air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air']
                    ],
                    // Layer 7 - Roof Upper
                    [
                        ['air', 'air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'spruce_stairs', 'cobblestone_stairs', 'air', 'air'],
                        ['air', 'air', 'cobblestone_stairs', 'cobblestone_stairs', 'cobblestone_stairs', 'air', 'air']
                    ],
                    // Layer 8 - Roof Peak
                    [
                        ['air', 'air', 'air', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'air', 'air', 'air'],
                        ['air', 'air', 'air', 'cobblestone_stairs', 'air', 'air', 'air']
                    ]
                ]
            }
        };
    }

    /**
     * Generate survival house layers (placeholder - actual implementation)
     */
    generateSurvivalHouseLayers() {
        // Simplified 7x7 house
        const floor = Array(7).fill(null).map(() => Array(7).fill('cobblestone'));
        const wallBottom = this.generateWallLayer(7, 'cobblestone', 'oak_log');
        const wallTop = this.generateWallLayer(7, 'cobblestone', 'oak_log', true);
        const roof = Array(7).fill(null).map(() => Array(7).fill('oak_planks'));

        return [floor, wallBottom, wallTop, wallTop, roof];
    }

    /**
     * Generate modern house layers (placeholder)
     */
    generateModernHouseLayers() {
        const floor = Array(9).fill(null).map(() => Array(9).fill('quartz_block'));
        const walls = this.generateWallLayer(9, 'quartz_block', 'black_concrete');
        const roof = Array(9).fill(null).map(() => Array(9).fill('quartz_block'));

        return [floor, walls, walls, walls, walls, roof];
    }

    /**
     * Generate vintage house layers (placeholder)
     */
    generateVintageHouseLayers() {
        const floor = Array(7).fill(null).map(() => Array(7).fill('cobblestone'));
        const walls = this.generateWallLayer(7, 'oak_planks', 'oak_log');
        const roof = Array(7).fill(null).map(() => Array(7).fill('oak_planks'));

        return [floor, walls, walls, walls, walls, roof];
    }

    /**
     * Generate large mansion layers (placeholder)
     */
    generateLargeMansionLayers() {
        const floor = Array(15).fill(null).map(() => Array(15).fill('stone_bricks'));
        const walls = this.generateWallLayer(15, 'stone_bricks', 'oak_log');
        const roof = Array(15).fill(null).map(() => Array(15).fill('oak_planks'));

        return [floor, walls, walls, walls, walls, walls, walls, roof];
    }

    /**
     * Generate farm layers
     */
    generateFarmLayers() {
        // 9x9 farm with water in center
        const base = Array(9).fill(null).map(() => Array(9).fill('farmland'));
        base[4][4] = 'water'; // Water source in center

        const fence = Array(9).fill(null).map((_, i) =>
            Array(9).fill(null).map((_, j) =>
                (i === 0 || i === 8 || j === 0 || j === 8) ? 'oak_fence' : 'air'
            )
        );
        fence[4][0] = 'oak_fence_gate'; // Gate

        return [base, fence];
    }

    /**
     * Generate XP farm layers (simplified)
     */
    generateXPFarmLayers() {
        const layers = [];
        // 8 layers of cobblestone walls forming a dark chamber
        for (let y = 0; y < 8; y++) {
            const layer = Array(9).fill(null).map((_, i) =>
                Array(9).fill(null).map((_, j) => {
                    if (i === 0 || i === 8 || j === 0 || j === 8) return 'cobblestone';
                    if (y === 0 || y === 7) return 'cobblestone';
                    return 'air';
                })
            );
            layers.push(layer);
        }
        return layers;
    }

    /**
     * Generate watchtower layers (simplified)
     */
    generateWatchtowerLayers() {
        const layers = [];
        for (let y = 0; y < 12; y++) {
            const layer = Array(5).fill(null).map((_, i) =>
                Array(5).fill(null).map((_, j) => {
                    // Corners are pillars
                    if ((i === 0 || i === 4) && (j === 0 || j === 4)) return 'cobblestone';
                    // Floor at bottom and top
                    if (y === 0 || y === 11) return 'oak_planks';
                    // Fence at top level
                    if (y === 10 && (i === 0 || i === 4 || j === 0 || j === 4)) return 'oak_fence';
                    return 'air';
                })
            );
            layers.push(layer);
        }
        return layers;
    }

    /**
     * Generate a wall layer with corners and door
     */
    generateWallLayer(size, wallBlock, cornerBlock, hasWindows = false) {
        const layer = Array(size).fill(null).map((_, i) =>
            Array(size).fill(null).map((_, j) => {
                // Corners
                if ((i === 0 || i === size - 1) && (j === 0 || j === size - 1)) {
                    return cornerBlock;
                }
                // Walls
                if (i === 0 || i === size - 1 || j === 0 || j === size - 1) {
                    // Door position (middle of one wall)
                    if (i === size - 1 && j === Math.floor(size / 2)) return 'oak_door';
                    // Windows
                    if (hasWindows && (j === 2 || j === size - 3)) return 'glass_pane';
                    return wallBlock;
                }
                return 'air';
            })
        );
        return layer;
    }

    /**
     * Execute build command
     * Supports: -bot build <type>, -bot build <type> gather, -bot build <type> creative
     * Also supports custom sizes: -bot build 15x20 [creative] (up to 50x50)
     */
    async execute(command) {
        const buildType = command.target || 'small_house';
        const gatherMaterials = command.gather || false;
        const creativeMode = command.creative || false;
        const customWidth = command.customWidth || null;
        const customLength = command.customLength || null;

        // Check if this is a custom size build
        if (customWidth && customLength) {
            await this.buildCustomHouse(customWidth, customLength, creativeMode);
        } else {
            await this.build(buildType, gatherMaterials, creativeMode);
        }
    }

    /**
     * Generate and build a custom-sized house dynamically
     * @param {number} width - Width of the house (X dimension, 5-50)
     * @param {number} length - Length of the house (Z dimension, 5-50)
     * @param {boolean} creativeMode - Whether to use /give commands
     */
    async buildCustomHouse(width, length, creativeMode = false) {
        // Clamp dimensions to valid range
        width = Math.max(5, Math.min(50, width));
        length = Math.max(5, Math.min(50, length));

        const wallHeight = Math.min(6, Math.max(3, Math.floor(Math.max(width, length) / 5))); // Scale height with size
        const totalHeight = wallHeight + 3; // Walls + foundation + roof layers

        this.isActive = true;
        this.sendChat(`🏗️ Generating custom ${width}x${length} house (height: ${wallHeight} walls)...`);

        // Calculate materials needed
        const materials = this.calculateCustomHouseMaterials(width, length, wallHeight);

        // Generate blueprint dynamically
        const blueprint = {
            name: `Custom House ${width}x${length}`,
            description: `A dynamically generated ${width}x${length} house with ${wallHeight}-high walls`,
            size: { x: width, y: totalHeight, z: length },
            materials: materials,
            layers: this.generateCustomHouseLayers(width, length, wallHeight)
        };

        this.currentBuild = {
            type: 'custom',
            blueprint,
            startTime: Date.now(),
            blocksPlaced: 0
        };

        this.sendChat(`Starting to build: ${blueprint.name}`);
        logger.info(`Building custom house: ${width}x${length}x${totalHeight}`);

        try {
            // Creative mode: Get materials via /give
            if (creativeMode) {
                this.sendChat('🎨 Creative mode: Getting all materials via /give commands...');
                await this.giveMaterials(blueprint.materials);
                await this.delay(1000);
            }

            // Check materials
            const missingMaterials = this.checkMaterials(blueprint.materials);
            if (missingMaterials.length > 0) {
                if (creativeMode) {
                    for (const material of missingMaterials) {
                        this.bot.chat(`/give ${this.bot.username} ${material.name} ${material.count}`);
                        await this.delay(200);
                    }
                    await this.delay(1000);
                } else {
                    this.sendChat(`Missing materials: ${missingMaterials.map(m => `${m.count}x ${m.name}`).join(', ')}`);
                    this.sendChat('Use creative mode: -bot build <size> creative');
                    this.isActive = false;
                    return;
                }
            }

            // Find building area
            this.sendChat('Finding a suitable building area...');
            const buildPosition = await this.findBuildingArea(blueprint.size);
            const startPos = buildPosition || this.bot.entity.position.offset(5, 0, 5);

            this.sendChat(`Building at ${Math.floor(startPos.x)}, ${Math.floor(startPos.y)}, ${Math.floor(startPos.z)}`);

            // Navigate and build
            await this.navigateToBuildSite(startPos);
            await this.buildStructure(blueprint, startPos);

            const duration = Math.floor((Date.now() - this.currentBuild.startTime) / 1000);
            this.sendChat(`✅ Completed ${blueprint.name}! Placed ${this.currentBuild.blocksPlaced} blocks in ${duration}s`);

        } catch (error) {
            logger.error(`Build error: ${error.message}`);
            this.sendChat(`Build failed: ${error.message}`);
        } finally {
            this.isActive = false;
            this.currentBuild = null;
        }
    }

    /**
     * Calculate materials needed for a custom house
     */
    calculateCustomHouseMaterials(width, length, wallHeight) {
        const floorArea = width * length;
        const perimeter = (width + length) * 2;
        const wallBlocks = perimeter * wallHeight;
        const windowCount = Math.floor(perimeter / 4);

        return {
            'stone_bricks': floorArea,                    // Foundation
            'oak_planks': floorArea + wallBlocks,         // Floor + walls
            'stripped_oak_log': 4 + Math.floor(perimeter / 8), // Corners + pillars
            'glass_pane': windowCount,
            'oak_door': 1,
            'torch': Math.max(4, Math.floor(floorArea / 16)),
            'oak_stairs': perimeter + 8,                  // Roof edges
            'crafting_table': 1,
            'furnace': Math.max(1, Math.floor(width / 10)),
            'chest': Math.max(2, Math.floor(length / 10))
        };
    }

    /**
     * Generate layers for a custom-sized house
     */
    generateCustomHouseLayers(width, length, wallHeight) {
        const layers = [];

        // Layer 0: Foundation (stone bricks)
        const foundation = Array(length).fill(null).map(() =>
            Array(width).fill('stone_bricks')
        );
        layers.push(foundation);

        // Layer 1: Floor with corners and door
        const floor = Array(length).fill(null).map((_, z) =>
            Array(width).fill(null).map((_, x) => {
                // Corners are log pillars
                if ((x === 0 || x === width - 1) && (z === 0 || z === length - 1)) {
                    return 'stripped_oak_log';
                }
                // Door in middle of front wall
                if (z === length - 1 && x === Math.floor(width / 2)) {
                    return 'oak_door';
                }
                return 'oak_planks';
            })
        );
        layers.push(floor);

        // Wall layers (2 to wallHeight+1)
        for (let h = 0; h < wallHeight; h++) {
            const wallLayer = Array(length).fill(null).map((_, z) =>
                Array(width).fill(null).map((_, x) => {
                    // Corners - log pillars
                    if ((x === 0 || x === width - 1) && (z === 0 || z === length - 1)) {
                        return 'stripped_oak_log';
                    }
                    // Walls
                    if (x === 0 || x === width - 1 || z === 0 || z === length - 1) {
                        // Door opening (bottom 2 layers)
                        if (z === length - 1 && x === Math.floor(width / 2) && h < 2) {
                            return 'air';
                        }
                        // Windows at height 1-2, spaced every 3-4 blocks
                        if (h >= 1 && h <= 2) {
                            const isWindowPos = (x % 4 === 2 || z % 4 === 2);
                            if (isWindowPos && x > 0 && x < width - 1 && z > 0 && z < length - 1) {
                                return 'glass_pane';
                            }
                        }
                        return 'oak_planks';
                    }
                    // Interior - add torches on walls at certain positions
                    if (h === 1) {
                        if ((x === 1 && z === 1) || (x === width - 2 && z === 1) ||
                            (x === 1 && z === length - 2) || (x === width - 2 && z === length - 2)) {
                            return 'torch';
                        }
                    }
                    return 'air';
                })
            );
            layers.push(wallLayer);
        }

        // Ceiling layer
        const ceiling = Array(length).fill(null).map((_, z) =>
            Array(width).fill(null).map((_, x) => {
                // Edge is log ring
                if (x === 0 || x === width - 1 || z === 0 || z === length - 1) {
                    return 'stripped_oak_log';
                }
                return 'oak_planks';
            })
        );
        layers.push(ceiling);

        // Roof layer 1 - stairs around the edge
        const roof1 = Array(length).fill(null).map((_, z) =>
            Array(width).fill(null).map((_, x) => {
                if (x === 0 || x === width - 1 || z === 0 || z === length - 1) {
                    return 'oak_stairs';
                }
                return 'oak_planks';
            })
        );
        layers.push(roof1);

        // Roof layer 2 - smaller (if space permits)
        if (width > 6 && length > 6) {
            const roof2 = Array(length).fill(null).map((_, z) =>
                Array(width).fill(null).map((_, x) => {
                    if (x <= 1 || x >= width - 2 || z <= 1 || z >= length - 2) {
                        return 'air';
                    }
                    if (x === 2 || x === width - 3 || z === 2 || z === length - 3) {
                        return 'oak_stairs';
                    }
                    return 'oak_planks';
                })
            );
            layers.push(roof2);
        }

        return layers;
    }

    /**
     * Main build function
     * @param {string} buildType - Type of building to construct
     * @param {boolean} gatherMaterials - Whether to gather missing materials in survival
     * @param {boolean} creativeMode - Whether to use /give commands to get all materials
     */
    async build(buildType, gatherMaterials = false, creativeMode = false) {
        this.isActive = true;

        const blueprint = this.blueprints[buildType];
        if (!blueprint) {
            this.sendChat(`Unknown build type: ${buildType}. Available: ${Object.keys(this.blueprints).join(', ')}, or use custom size like 15x20`);
            this.isActive = false;
            return;
        }

        this.currentBuild = {
            type: buildType,
            blueprint,
            startTime: Date.now(),
            blocksPlaced: 0
        };

        this.sendChat(`Starting to build: ${blueprint.name}`);
        this.sendChat(blueprint.description);
        logger.info(`Building: ${blueprint.name} (${blueprint.size.x}x${blueprint.size.y}x${blueprint.size.z})`);

        try {
            // Creative mode: Use /give commands to get all materials automatically
            if (creativeMode) {
                this.sendChat('🎨 Creative mode: Getting all materials via /give commands...');
                await this.giveMaterials(blueprint.materials);
                await this.delay(1000); // Wait for items to arrive in inventory
            }

            // Step 1: Check materials
            const missingMaterials = this.checkMaterials(blueprint.materials);

            if (missingMaterials.length > 0) {
                if (creativeMode) {
                    // In creative mode, try giving materials again for any still missing
                    this.sendChat('Some materials still missing, retrying /give...');
                    for (const material of missingMaterials) {
                        this.bot.chat(`/give ${this.bot.username} ${material.name} ${material.count}`);
                        await this.delay(200);
                    }
                    await this.delay(1000);
                } else if (gatherMaterials) {
                    this.sendChat('Missing materials! Will try to gather them...');
                    await this.gatherMaterials(missingMaterials);
                } else {
                    this.sendChat(`Missing materials: ${missingMaterials.map(m => `${m.count}x ${m.name}`).join(', ')}`);
                    this.sendChat('Use "-bot build <type> gather" to auto-gather, or "-bot build <type> creative" for /give.');
                    this.isActive = false;
                    return;
                }
            }

            // Step 2: Find or clear a building area
            this.sendChat('Finding a suitable building area...');
            const buildPosition = await this.findBuildingArea(blueprint.size);

            if (!buildPosition) {
                this.sendChat('Could not find a suitable area. Clearing space...');
                const clearedPos = await this.clearArea(blueprint.size);
                if (!clearedPos) {
                    this.sendChat('Failed to prepare building area!');
                    this.isActive = false;
                    return;
                }
            }

            const startPos = buildPosition || this.bot.entity.position.offset(5, 0, 5);
            this.sendChat(`Building at ${Math.floor(startPos.x)}, ${Math.floor(startPos.y)}, ${Math.floor(startPos.z)}`);

            // Step 3: Navigate to build site
            await this.navigateToBuildSite(startPos);

            // Step 4: Build layer by layer
            await this.buildStructure(blueprint, startPos);

            // Step 5: Completion
            const duration = Math.floor((Date.now() - this.currentBuild.startTime) / 1000);
            this.sendChat(`✅ Completed ${blueprint.name}! Placed ${this.currentBuild.blocksPlaced} blocks in ${duration}s`);
            logger.info(`Build complete: ${blueprint.name}`);

        } catch (error) {
            logger.error(`Build error: ${error.message}`);
            this.sendChat(`Build failed: ${error.message}`);
        } finally {
            this.isActive = false;
            this.currentBuild = null;
        }
    }

    /**
     * Check if we have all required materials
     */
    checkMaterials(requiredMaterials) {
        const missing = [];
        const inventory = this.bot.inventory.items();

        for (const [material, count] of Object.entries(requiredMaterials)) {
            if (material === 'air') continue;

            // Sum up ALL stacks of this material (not just the first one!)
            const haveCount = inventory
                .filter(item => item.name === material || item.name.includes(material))
                .reduce((total, item) => total + item.count, 0);

            if (haveCount < count) {
                missing.push({ name: material, count: count - haveCount });
            }
        }

        return missing;
    }

    /**
     * Gather missing materials (simplified)
     */
    async gatherMaterials(missingMaterials) {
        for (const material of missingMaterials) {
            this.sendChat(`Gathering ${material.count}x ${material.name}...`);

            // Try to mine the material if it's a block
            if (this.minerAbility) {
                try {
                    const blockName = this.getBlockNameForMaterial(material.name);
                    if (blockName) {
                        await this.minerAbility.execute({
                            action: 'mine',
                            target: blockName,
                            count: material.count
                        });
                    }
                } catch (e) {
                    logger.debug(`Could not gather ${material.name}: ${e.message}`);
                }
            }

            await this.delay(1000);
        }
    }

    /**
     * Give all materials using /give commands (Creative Mode)
     * @param {object} requiredMaterials - Object with material names as keys and counts as values
     */
    async giveMaterials(requiredMaterials) {
        const username = this.bot.username;

        for (const [material, count] of Object.entries(requiredMaterials)) {
            if (material === 'air') continue;

            // Skip items that can't be /give'd or have special handling
            if (material === 'water_bucket') {
                // Give water bucket specifically
                this.bot.chat(`/give ${username} water_bucket ${count}`);
            } else {
                // Standard /give command
                this.bot.chat(`/give ${username} ${material} ${count}`);
            }

            logger.info(`[Creative] /give ${username} ${material} ${count}`);
            await this.delay(150); // Small delay to prevent spam kicks
        }

        this.sendChat(`Gave ${Object.keys(requiredMaterials).length} different materials!`);
    }

    /**
     * Get block name for mining from material name
     */
    getBlockNameForMaterial(materialName) {
        const mappings = {
            'cobblestone': 'stone',
            'oak_log': 'oak_log',
            'oak_planks': 'oak_log', // Need to craft
            'stone_bricks': 'stone',
            'dirt': 'dirt',
            'sand': 'sand'
        };
        return mappings[materialName] || null;
    }

    /**
     * Find a flat area suitable for building
     */
    async findBuildingArea(size) {
        const pos = this.bot.entity.position;
        const searchRadius = 50;

        // Search in expanding circles
        for (let r = 5; r < searchRadius; r += 5) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                const checkX = Math.floor(pos.x + Math.cos(angle) * r);
                const checkZ = Math.floor(pos.z + Math.sin(angle) * r);

                // Find ground level
                let groundY = null;
                for (let y = pos.y + 10; y > pos.y - 20; y--) {
                    const block = this.bot.blockAt(this.bot.entity.position.offset(
                        checkX - pos.x, y - pos.y, checkZ - pos.z
                    ));
                    if (block && block.boundingBox === 'block') {
                        groundY = y + 1;
                        break;
                    }
                }

                if (groundY && this.isAreaFlat(checkX, groundY, checkZ, size)) {
                    return { x: checkX, y: groundY, z: checkZ };
                }
            }
        }

        return null;
    }

    /**
     * Check if an area is flat enough for building
     */
    isAreaFlat(startX, startY, startZ, size) {
        const tolerance = 2; // Allow 2 blocks height difference
        let minY = startY, maxY = startY;

        for (let x = 0; x < size.x; x++) {
            for (let z = 0; z < size.z; z++) {
                // Find ground at this position
                let groundY = startY;
                for (let y = startY + 5; y > startY - 10; y--) {
                    const block = this.bot.blockAt(new Vec3(startX + x, y, startZ + z));
                    if (block && block.boundingBox === 'block') {
                        groundY = y;
                        break;
                    }
                }

                minY = Math.min(minY, groundY);
                maxY = Math.max(maxY, groundY);

                if (maxY - minY > tolerance) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Clear an area for building
     */
    async clearArea(size) {
        const pos = this.bot.entity.position;
        const clearX = Math.floor(pos.x) + 10;
        const clearZ = Math.floor(pos.z) + 10;
        const clearY = Math.floor(pos.y);

        this.sendChat(`Clearing area: ${size.x}x${size.z} blocks...`);

        // Clear blocks above ground
        for (let y = clearY; y < clearY + size.y + 2; y++) {
            for (let x = 0; x < size.x; x++) {
                for (let z = 0; z < size.z; z++) {
                    if (!this.isActive) return null;

                    const block = this.bot.blockAt(new Vec3(clearX + x, y, clearZ + z));
                    if (block && block.name !== 'air' && block.name !== 'bedrock') {
                        try {
                            await this.bot.dig(block);
                            await this.delay(50);
                        } catch (e) {
                            logger.debug(`Could not break block: ${e.message}`);
                        }
                    }
                }
            }
        }

        return { x: clearX, y: clearY, z: clearZ };
    }

    /**
     * Navigate to build site
     */
    async navigateToBuildSite(position) {
        if (this.bot.pathfinder) {
            const { goals } = require('mineflayer-pathfinder');
            const goal = new goals.GoalNear(position.x, position.y, position.z, 3);

            try {
                await this.bot.pathfinder.goto(goal);
            } catch (e) {
                logger.debug(`Navigation error: ${e.message}`);
            }
        }
    }

    /**
     * Build the structure layer by layer with improved technique
     */
    async buildStructure(blueprint, startPos) {
        const { layers } = blueprint;
        const failedBlocks = []; // Track blocks that failed to place
        let scaffoldBlocks = []; // Track scaffolding blocks to remove later

        for (let y = 0; y < layers.length; y++) {
            if (!this.isActive) break;

            this.sendChat(`Building layer ${y + 1}/${layers.length}...`);
            const layer = layers[y];
            const layerFailedBlocks = [];
            const currentLayerY = startPos.y + y;

            // Position bot for this layer height
            await this.positionBotForLayer(startPos, y, blueprint.size);

            // Build from edges inward in a spiral pattern for better reference blocks
            const buildOrder = this.getSpiralBuildOrder(layer);

            // First pass - try to place all blocks in this layer
            for (const { x, z } of buildOrder) {
                if (!this.isActive) break;

                const blockName = layer[x][z];
                if (!blockName || blockName === 'air') continue;

                const placePos = new Vec3(
                    startPos.x + x,
                    currentLayerY,
                    startPos.z + z
                );

                // Check if we need to move closer (both horizontal AND vertical)
                const botPos = this.bot.entity.position;
                const horizontalDist = Math.sqrt(
                    Math.pow(botPos.x - placePos.x, 2) +
                    Math.pow(botPos.z - placePos.z, 2)
                );
                const verticalDist = Math.abs(botPos.y - placePos.y);

                // Move closer if too far horizontally or vertically
                if (horizontalDist > 4 || verticalDist > 3) {
                    await this.moveCloserToBlock(placePos, currentLayerY);
                }

                const success = await this.placeBlock(blockName, placePos);
                if (!success) {
                    layerFailedBlocks.push({ blockName, position: placePos, retries: 0 });
                }
            }

            // Retry failed blocks in this layer (up to 3 passes)
            let retryPass = 0;
            while (layerFailedBlocks.length > 0 && retryPass < 3) {
                retryPass++;
                logger.info(`Retrying ${layerFailedBlocks.length} blocks (pass ${retryPass})...`);

                const stillFailed = [];
                for (const failedBlock of layerFailedBlocks) {
                    if (!this.isActive) break;

                    await this.moveCloserToBlock(failedBlock.position, currentLayerY);
                    await this.delay(250);

                    const success = await this.placeBlock(failedBlock.blockName, failedBlock.position);
                    if (!success) {
                        failedBlock.retries++;
                        stillFailed.push(failedBlock);
                    }
                }
                layerFailedBlocks.length = 0;
                layerFailedBlocks.push(...stillFailed);
            }

            // Add remaining failed blocks to global list for final retry
            failedBlocks.push(...layerFailedBlocks);
        }

        // Final retry pass for all remaining failed blocks
        if (failedBlocks.length > 0 && this.isActive) {
            this.sendChat(`Final pass: retrying ${failedBlocks.length} remaining blocks...`);
            for (const failedBlock of failedBlocks) {
                if (!this.isActive) break;
                await this.moveCloserToBlock(failedBlock.position, failedBlock.position.y);
                await this.delay(300);
                await this.placeBlock(failedBlock.blockName, failedBlock.position);
            }
        }
    }

    /**
     * Get spiral build order (edges first, then inward) for better reference blocks
     */
    getSpiralBuildOrder(layer) {
        const order = [];
        const height = layer.length;
        const width = layer[0] ? layer[0].length : 0;

        // Simple: just do a standard order but prioritize corners and edges
        // First: corners
        const corners = [
            { x: 0, z: 0 },
            { x: height - 1, z: 0 },
            { x: 0, z: width - 1 },
            { x: height - 1, z: width - 1 }
        ];
        for (const c of corners) {
            if (c.x < height && c.z < width) order.push(c);
        }

        // Second: edges
        for (let x = 0; x < height; x++) {
            for (let z = 0; z < width; z++) {
                if (x === 0 || x === height - 1 || z === 0 || z === width - 1) {
                    // Skip corners already added
                    if (!corners.some(c => c.x === x && c.z === z)) {
                        order.push({ x, z });
                    }
                }
            }
        }

        // Third: interior
        for (let x = 1; x < height - 1; x++) {
            for (let z = 1; z < width - 1; z++) {
                order.push({ x, z });
            }
        }

        return order;
    }

    /**
     * Position bot appropriately for building a specific layer
     */
    async positionBotForLayer(startPos, layerY, size) {
        const targetY = startPos.y + layerY;
        const botPos = this.bot.entity.position;

        // If layer is too high above us, we need to scaffold up
        if (targetY > botPos.y + 2) {
            // Try to find a spot on the edge of the build to scaffold up
            const scaffoldX = startPos.x - 1;
            const scaffoldZ = startPos.z + Math.floor(size.z / 2);

            // Move to scaffold position first
            await this.moveToPosition(scaffoldX, botPos.y, scaffoldZ);

            // Tower up using dirt or cobblestone
            await this.towerUp(targetY - 1);
        } else if (targetY < botPos.y - 5) {
            // Too high, need to get down
            // Simply jump down or find a safe path
            try {
                if (this.bot.pathfinder) {
                    const { goals } = require('mineflayer-pathfinder');
                    const goal = new goals.GoalNear(startPos.x, targetY, startPos.z, 3);
                    await this.bot.pathfinder.goto(goal);
                }
            } catch (e) {
                logger.debug(`Couldn't pathfind down: ${e.message}`);
            }
        }
    }

    /**
     * Tower up to reach a target Y level
     */
    async towerUp(targetY) {
        const scaffoldMaterials = ['dirt', 'cobblestone', 'netherrack', 'stone', 'oak_planks'];
        let scaffoldItem = null;

        // Find a scaffold material in inventory
        for (const mat of scaffoldMaterials) {
            scaffoldItem = this.bot.inventory.items().find(i => i.name === mat || i.name.includes(mat));
            if (scaffoldItem) break;
        }

        if (!scaffoldItem) {
            logger.debug('No scaffold materials available for towering');
            return;
        }

        try {
            await this.bot.equip(scaffoldItem, 'hand');

            while (this.bot.entity.position.y < targetY && this.isActive) {
                // Jump and place block below
                this.bot.setControlState('jump', true);
                await this.delay(150);

                const blockBelowPos = this.bot.entity.position.offset(0, -1, 0).floored();
                const blockBelow = this.bot.blockAt(blockBelowPos);

                if (blockBelow && blockBelow.name === 'air') {
                    try {
                        // Look straight down
                        await this.bot.look(0, -Math.PI / 2, true);
                        await this.delay(50);

                        // Find the block to place against (floor)
                        const floorBlock = this.bot.blockAt(blockBelowPos.offset(0, -1, 0));
                        if (floorBlock && floorBlock.boundingBox === 'block') {
                            await this.bot.placeBlock(floorBlock, new Vec3(0, 1, 0));
                        }
                    } catch (e) {
                        // Ignore placement errors during towering
                    }
                }

                this.bot.setControlState('jump', false);
                await this.delay(100);
            }
        } catch (e) {
            logger.debug(`Tower error: ${e.message}`);
        }
    }

    /**
     * Move to a specific position
     */
    async moveToPosition(x, y, z) {
        try {
            if (this.bot.pathfinder) {
                const { goals } = require('mineflayer-pathfinder');
                const goal = new goals.GoalNear(x, y, z, 2);
                await this.bot.pathfinder.goto(goal);
            }
        } catch (e) {
            logger.debug(`Move to position error: ${e.message}`);
        }
    }

    /**
     * Move closer to a block position, considering height
     */
    async moveCloserToBlock(targetPos, targetY) {
        try {
            if (this.bot.pathfinder) {
                const { goals } = require('mineflayer-pathfinder');

                // Try to get to a position where we can place the block
                // Should be within 4 blocks horizontally and within 2 blocks vertically
                const goal = new goals.GoalNear(targetPos.x, targetY, targetPos.z, 3);

                // Set a timeout for pathfinding
                const pathPromise = this.bot.pathfinder.goto(goal);
                const timeoutPromise = this.delay(3000).then(() => {
                    throw new Error('Pathfinding timeout');
                });

                await Promise.race([pathPromise, timeoutPromise]);
            } else {
                // Simple walk towards target
                const dir = targetPos.minus(this.bot.entity.position).normalize();
                this.bot.setControlState('forward', true);
                await this.delay(300);
                this.bot.setControlState('forward', false);
            }
        } catch (e) {
            logger.debug(`Move error: ${e.message}`);
        }
    }

    /**
     * Move closer to a position for block placement
     */
    async moveCloserTo(targetPos) {
        try {
            if (this.bot.pathfinder) {
                const { goals } = require('mineflayer-pathfinder');
                const goal = new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 3);
                await this.bot.pathfinder.goto(goal);
            } else {
                // Simple walk towards target
                const dir = targetPos.minus(this.bot.entity.position).normalize();
                this.bot.setControlState('forward', true);
                await this.delay(500);
                this.bot.setControlState('forward', false);
            }
        } catch (e) {
            logger.debug(`Move error: ${e.message}`);
        }
    }

    /**
     * Place a single block
     */
    async placeBlock(blockName, position) {
        try {
            // Check if block already exists at this position
            const existingBlock = this.bot.blockAt(position);
            if (existingBlock && existingBlock.name !== 'air' && existingBlock.name !== 'water') {
                // Block already placed
                return true;
            }

            // Find the block in inventory - try exact match first, then partial
            let item = this.bot.inventory.items().find(i => i.name === blockName);
            if (!item) {
                // Try partial match
                item = this.bot.inventory.items().find(i =>
                    i.name.includes(blockName.split('_')[0]) ||
                    blockName.includes(i.name.split('_')[0])
                );
            }

            if (!item) {
                logger.debug(`No ${blockName} in inventory`);
                return false;
            }

            // Equip the block
            await this.bot.equip(item, 'hand');
            await this.delay(150);

            // Find a reference block to place against
            const refPos = this.findReferenceBlock(position);
            if (!refPos) {
                logger.debug(`No reference block for placement at ${JSON.stringify(position)}`);
                return false;
            }

            const refBlock = this.bot.blockAt(refPos);
            if (refBlock && refBlock.boundingBox === 'block') {
                // Look at the reference block for accurate placement
                await this.bot.lookAt(new Vec3(refPos.x + 0.5, refPos.y + 0.5, refPos.z + 0.5));
                await this.delay(100);

                const faceVector = new Vec3(
                    position.x - refPos.x,
                    position.y - refPos.y,
                    position.z - refPos.z
                );

                await this.bot.placeBlock(refBlock, faceVector);
                this.currentBuild.blocksPlaced++;
                await this.delay(150);
                return true;
            }
        } catch (error) {
            logger.debug(`Failed to place ${blockName}: ${error.message}`);
        }

        return false;
    }

    /**
     * Find a reference block to place against
     */
    findReferenceBlock(position) {
        const offsets = [
            { x: 0, y: -1, z: 0 }, // Below
            { x: -1, y: 0, z: 0 }, // West
            { x: 1, y: 0, z: 0 },  // East
            { x: 0, y: 0, z: -1 }, // North
            { x: 0, y: 0, z: 1 },  // South
            { x: 0, y: 1, z: 0 }   // Above
        ];

        for (const offset of offsets) {
            const checkPos = new Vec3(
                position.x + offset.x,
                position.y + offset.y,
                position.z + offset.z
            );

            const block = this.bot.blockAt(checkPos);
            if (block && block.boundingBox === 'block') {
                return checkPos;
            }
        }

        return null;
    }

    /**
     * Get list of available builds
     */
    getAvailableBuilds() {
        return Object.entries(this.blueprints).map(([key, bp]) => ({
            id: key,
            name: bp.name,
            description: bp.description,
            size: bp.size
        }));
    }

    /**
     * Stop building
     */
    stop() {
        this.isActive = false;
        if (this.currentBuild) {
            this.sendChat(`Stopped building ${this.currentBuild.blueprint.name}`);
        }
        this.currentBuild = null;
    }

    /**
     * Send chat message
     */
    sendChat(message) {
        try {
            this.bot.chat(message);
            logger.info(`[Builder] ${message}`);
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

module.exports = BuildingAbility;
