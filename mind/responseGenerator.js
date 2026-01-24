/**
 * Response Generator Module
 * Generates natural chat responses for the bot
 */

class ResponseGenerator {
    constructor(botName = 'Bot') {
        this.botName = botName;

        // Response templates organized by situation
        this.templates = {
            // Starting a task
            starting: {
                mine: [
                    "On it! Going to mine some {target} for you",
                    "Sure thing {username}! Mining {target} now",
                    "Got it, heading out to get {count} {target}",
                    "Alright! Let me grab some {target}",
                    "Mining time! Looking for {target}",
                ],
                make: [
                    "Crafting {target} for you now!",
                    "Got it {username}! Making {count} {target}",
                    "Let me craft that {target} for you",
                    "Sure! Working on your {target}",
                    "On it! Crafting {target}",
                ],
                come: [
                    "Coming to you {username}!",
                    "On my way!",
                    "Be there in a sec {username}!",
                    "Heading over to you now",
                ],
                go: [
                    "Going to those coordinates now",
                    "On my way!",
                    "Heading there now",
                ],
                kill: [
                    "Time to hunt! Looking for {target}",
                    "On it! Hunting {target} now",
                    "Going after those {target}",
                    "Let's get those {target}!",
                ],
                farm: [
                    "Starting to farm!",
                    "Farming mode activated",
                    "Let me do some farming",
                    "Time to harvest some crops!",
                ],
                stop: [
                    "Stopping what I was doing",
                    "Okay, stopping now",
                    "Alright, task cancelled",
                ],
                drop: [
                    "Dropping {count} {target}",
                    "Here, take this {target}",
                    "Tossing {target} to you",
                ],
            },

            // Completing a task
            completed: {
                mine: [
                    "Done! Got the {target} you wanted",
                    "All done mining {target}!",
                    "Finished getting {target}",
                    "Got your {target}!",
                ],
                make: [
                    "Done! Made your {target}",
                    "Finished crafting {target}!",
                    "Your {target} is ready!",
                    "Here's your {target}!",
                ],
                come: [
                    "I'm here!",
                    "Made it!",
                    "Arrived!",
                ],
                go: [
                    "Arrived at the destination!",
                    "I'm here!",
                    "Made it to the coords",
                ],
                kill: [
                    "Done hunting!",
                    "Finished off those {target}",
                    "No more {target} around",
                ],
                farm: [
                    "Farming complete!",
                    "Done harvesting",
                    "Finished farming",
                ],
            },

            // Errors/Unable to complete
            error: {
                notFound: [
                    "Can't find any {target} nearby",
                    "No {target} around here",
                    "I don't see any {target}",
                ],
                noRecipe: [
                    "I don't know how to make {target}",
                    "Can't craft {target}, no recipe",
                    "Not sure how to create {target}",
                ],
                missingItems: [
                    "I need more materials to make {target}",
                    "Don't have enough stuff for {target}",
                    "Missing ingredients for {target}",
                ],
                playerNotFound: [
                    "Can't find {target}",
                    "Where did {target} go?",
                    "{target} not around",
                ],
                failed: [
                    "Something went wrong with {target}",
                    "Couldn't complete that task",
                    "Had trouble with {target}",
                ],
            },

            // Already have the item
            alreadyHave: [
                "You already have {target}! Check your inventory",
                "I found {target} in inventory already",
                "We've got {target}, no need to make more",
            ],

            // Planning/thinking
            planning: [
                "Let me figure out how to do that...",
                "Thinking about the best approach...",
                "Planning the steps...",
            ],

            // Status updates
            status: {
                working: [
                    "Currently working on {task}",
                    "Busy with {task} right now",
                    "Still on it - {task}",
                ],
                idle: [
                    "Just chilling, waiting for tasks",
                    "Not doing anything right now",
                    "Ready for commands!",
                ],
            },

            // Help response
            help: [
                "I can mine, craft, come to you, kill mobs, and farm! Just tell me what you need naturally, like 'get me some iron' or 'make me a pickaxe'",
            ],

            // Acknowledgment
            acknowledge: [
                "Got it!",
                "Sure thing!",
                "On it!",
                "Understood!",
                "Okay!",
            ],

            // Not understood
            confused: [
                "Not sure what you mean, {username}",
                "Could you say that differently?",
                "I didn't quite catch that",
                "What do you need?",
            ],
        };
    }

    /**
     * Generate a response for starting a task
     */
    starting(action, context = {}) {
        const templates = this.templates.starting[action] || this.templates.acknowledge;
        return this.fillTemplate(this.pickRandom(templates), context);
    }

    /**
     * Generate a response for completing a task
     */
    completed(action, context = {}) {
        const templates = this.templates.completed[action] || this.templates.acknowledge;
        return this.fillTemplate(this.pickRandom(templates), context);
    }

    /**
     * Generate an error response
     */
    error(errorType, context = {}) {
        const templates = this.templates.error[errorType] || this.templates.error.failed;
        return this.fillTemplate(this.pickRandom(templates), context);
    }

    /**
     * Generate a response when we already have the item
     */
    alreadyHave(context = {}) {
        return this.fillTemplate(this.pickRandom(this.templates.alreadyHave), context);
    }

    /**
     * Generate a status response
     */
    status(isWorking, task = '', context = {}) {
        const templates = isWorking ? this.templates.status.working : this.templates.status.idle;
        return this.fillTemplate(this.pickRandom(templates), { ...context, task });
    }

    /**
     * Generate help response
     */
    help() {
        return this.pickRandom(this.templates.help);
    }

    /**
     * Generate acknowledgment
     */
    acknowledge() {
        return this.pickRandom(this.templates.acknowledge);
    }

    /**
     * Generate confused response
     */
    confused(context = {}) {
        return this.fillTemplate(this.pickRandom(this.templates.confused), context);
    }

    /**
     * Pick a random template from array
     */
    pickRandom(templates) {
        if (!templates || templates.length === 0) return '';
        return templates[Math.floor(Math.random() * templates.length)];
    }

    /**
     * Fill in template placeholders
     */
    fillTemplate(template, context = {}) {
        if (!template) return '';

        let result = template;
        for (const [key, value] of Object.entries(context)) {
            // Handle both {key} and {key} style placeholders
            result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
        }

        // Clean up any unfilled placeholders
        result = result.replace(/\{[^}]+\}/g, '');
        result = result.replace(/\s+/g, ' ').trim();

        return result;
    }
}

module.exports = ResponseGenerator;
