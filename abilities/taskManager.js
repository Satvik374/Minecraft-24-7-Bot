/**
 * Task Manager Module
 * Handles task queuing and complex multi-step goals
 */

const logger = require('../utils/logger');

class TaskManager {
    constructor(bot) {
        this.bot = bot;
        this.taskQueue = [];
        this.currentTask = null;
        this.isRunning = false;
        this.abilities = {};
    }

    /**
     * Register abilities for task execution
     */
    registerAbilities(abilities) {
        this.abilities = abilities;
    }

    /**
     * Add a task to the queue
     */
    addTask(task) {
        this.taskQueue.push({
            ...task,
            id: Date.now(),
            status: 'pending',
            createdAt: new Date()
        });

        logger.info(`Task added: ${task.action} ${task.target || ''}`);

        // Start processing if not already running
        if (!this.isRunning) {
            this.processQueue();
        }
    }

    /**
     * Create a task list from a complex goal
     * Example: making a diamond pickaxe creates tasks for mining, smelting, crafting
     */
    createTaskList(goal) {
        const tasks = [];

        switch (goal.action) {
            case 'make':
                tasks.push(...this.expandCraftingGoal(goal));
                break;
            case 'mine':
                tasks.push(goal);
                break;
            case 'gather':
                tasks.push(...this.expandGatheringGoal(goal));
                break;
            default:
                tasks.push(goal);
        }

        return tasks;
    }

    /**
     * Expand a crafting goal into subtasks
     */
    expandCraftingGoal(goal) {
        const tasks = [];
        const { getRecipe, getAllIngredients } = require('../data/recipes');

        const recipe = getRecipe(goal.target);
        if (!recipe) {
            return [goal]; // Just try to craft directly
        }

        // Add prerequisite gathering/crafting tasks
        for (const [ingredient, count] of Object.entries(recipe.ingredients)) {
            const ingredientRecipe = getRecipe(ingredient);

            if (ingredientRecipe) {
                // Need to craft this ingredient first
                tasks.push({
                    action: 'make',
                    target: ingredient,
                    count: count,
                    priority: 1
                });
            } else {
                // Need to gather this ingredient
                tasks.push({
                    action: 'gather',
                    target: ingredient,
                    count: count,
                    priority: 0
                });
            }
        }

        // Add the main crafting task
        tasks.push({
            ...goal,
            priority: 2
        });

        // Sort by priority
        tasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        return tasks;
    }

    /**
     * Expand a gathering goal
     */
    expandGatheringGoal(goal) {
        return [{
            action: 'mine',
            target: goal.target,
            count: goal.count || 64
        }];
    }

    /**
     * Process the task queue
     */
    async processQueue() {
        if (this.isRunning || this.taskQueue.length === 0) {
            return;
        }

        this.isRunning = true;

        while (this.taskQueue.length > 0) {
            this.currentTask = this.taskQueue.shift();
            this.currentTask.status = 'running';

            logger.info(`Executing task: ${this.currentTask.action}`);

            try {
                await this.executeTask(this.currentTask);
                this.currentTask.status = 'completed';
            } catch (error) {
                logger.error(`Task failed: ${error.message}`);
                this.currentTask.status = 'failed';
                this.currentTask.error = error.message;
            }

            await this.delay(500);
        }

        this.isRunning = false;
        this.currentTask = null;
    }

    /**
     * Execute a single task
     */
    async executeTask(task) {
        const ability = this.abilities[task.action];

        if (!ability) {
            throw new Error(`No ability for action: ${task.action}`);
        }

        await ability.execute({
            action: task.action,
            target: task.target,
            count: task.count,
            username: task.username || 'system'
        });
    }

    /**
     * Stop all tasks
     */
    async stopAll() {
        this.taskQueue = [];

        if (this.currentTask && this.abilities[this.currentTask.action]) {
            try {
                await this.abilities[this.currentTask.action].stop();
            } catch (e) {
                // Ignore
            }
        }

        this.currentTask = null;
        this.isRunning = false;
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            currentTask: this.currentTask,
            queueLength: this.taskQueue.length,
            isRunning: this.isRunning
        };
    }

    /**
     * Get current task info
     */
    getCurrentTask() {
        return this.currentTask;
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = TaskManager;
