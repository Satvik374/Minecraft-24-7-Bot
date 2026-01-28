const logger = require('./logger');
const Vec3 = require('vec3');

class SimplePathfinding {
    constructor(bot) {
        this.bot = bot;
    }

    // Convert position to vec3 if needed
    toVec3(pos) {
        if (pos && typeof pos.floored === 'function') {
            return pos; // Already a vec3
        }
        // Convert plain object to vec3
        return new Vec3(pos.x, pos.y, pos.z);
    }

    // Simple pathfinding to avoid obstacles
    findSafePath(targetPosition, maxDistance = 10) {
        const start = this.bot.entity.position.floored();
        const target = this.toVec3(targetPosition).floored();

        // Simple A* pathfinding implementation
        const openSet = [{ pos: start, f: 0, g: 0, h: this.heuristic(start, target), parent: null }];
        const closedSet = new Set();
        const visited = new Map();

        while (openSet.length > 0) {
            // Find node with lowest f score
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();

            const key = `${current.pos.x},${current.pos.y},${current.pos.z}`;
            if (closedSet.has(key)) continue;

            closedSet.add(key);

            // Check if we reached the target
            if (current.pos.equals(target)) {
                return this.reconstructPath(current);
            }

            // Explore neighbors
            const neighbors = this.getNeighbors(current.pos);

            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.y},${neighbor.z}`;

                if (closedSet.has(neighborKey) || !this.isWalkable(neighbor)) {
                    continue;
                }

                const g = current.g + 1;
                const h = this.heuristic(neighbor, target);
                const f = g + h;

                // Skip if too far
                if (g > maxDistance) continue;

                const existing = visited.get(neighborKey);
                if (!existing || g < existing.g) {
                    const node = { pos: neighbor, f, g, h, parent: current };
                    visited.set(neighborKey, node);
                    openSet.push(node);
                }
            }
        }

        return null; // No path found
    }

    getNeighbors(position) {
        const neighbors = [];
        const directions = [
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 0, z: -1 },
            { x: 0, y: 1, z: 0 },  // Up
            { x: 0, y: -1, z: 0 }  // Down
        ];

        for (const dir of directions) {
            neighbors.push(position.offset(dir.x, dir.y, dir.z));
        }

        return neighbors;
    }

    isWalkable(position) {
        try {
            const block = this.bot.blockAt(position);
            const blockAbove = this.bot.blockAt(position.offset(0, 1, 0));
            const blockBelow = this.bot.blockAt(position.offset(0, -1, 0));

            // Position must be air or passable
            if (block && !this.isPassable(block)) {
                return false;
            }

            // Space above must be clear
            if (blockAbove && !this.isPassable(blockAbove)) {
                return false;
            }

            // Must have solid ground below (unless swimming/flying)
            if (!blockBelow || !this.isSolid(blockBelow)) {
                return false;
            }

            // Avoid dangerous blocks
            if (this.isDangerous(block) || this.isDangerous(blockBelow)) {
                return false;
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    isPassable(block) {
        if (!block) return true;

        const passableBlocks = [
            'air', 'grass', 'tall_grass', 'fern', 'large_fern',
            'dandelion', 'poppy', 'blue_orchid', 'allium',
            'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip',
            'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley',
            'water', 'flowing_water', 'seagrass', 'tall_seagrass',
            'kelp', 'kelp_plant'
        ];

        return passableBlocks.includes(block.name);
    }

    isSolid(block) {
        if (!block) return false;

        const nonSolidBlocks = [
            'air', 'water', 'flowing_water', 'lava', 'flowing_lava',
            'grass', 'tall_grass', 'fern', 'large_fern'
        ];

        return !nonSolidBlocks.includes(block.name);
    }

    isDangerous(block) {
        if (!block) return false;

        const dangerousBlocks = [
            'lava', 'flowing_lava', 'fire', 'magma_block',
            'sweet_berry_bush', 'cactus', 'wither_rose'
        ];

        return dangerousBlocks.includes(block.name);
    }

    heuristic(pos1, pos2) {
        // Manhattan distance
        return Math.abs(pos1.x - pos2.x) +
            Math.abs(pos1.y - pos2.y) +
            Math.abs(pos1.z - pos2.z);
    }

    reconstructPath(node) {
        const path = [];
        let current = node;

        while (current) {
            path.unshift(current.pos);
            current = current.parent;
        }

        return path;
    }
}

module.exports = SimplePathfinding;
