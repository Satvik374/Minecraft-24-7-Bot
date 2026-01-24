#!/usr/bin/env node
/**
 * Test file for BotMind NLU and Goal Planner
 * Run with: node test-bot-mind.js
 */

console.log('='.repeat(60));
console.log('🧪 BotMind Test Suite');
console.log('='.repeat(60));
console.log('');

// Import modules
const NLUParser = require('./mind/nluParser');
const GoalPlanner = require('./mind/goalPlanner');
const ResponseGenerator = require('./mind/responseGenerator');
const { normalizeItem, normalizeAction, isCraftable, isGatherable } = require('./mind/knowledge');

// Test NLU Parser
console.log('📝 Testing NLU Parser...');
console.log('-'.repeat(40));

const nlu = new NLUParser();

const testMessages = [
    // Mining requests
    { msg: "can you get me some iron?", expected: "mine" },
    { msg: "mine 32 diamond ore", expected: "mine" },
    { msg: "I need some wood", expected: "mine" },
    { msg: "bring me coal please", expected: "mine" },
    { msg: "gather some cobblestone", expected: "mine" },

    // Crafting requests
    { msg: "make me a diamond pickaxe", expected: "make" },
    { msg: "craft 5 torches", expected: "make" },
    { msg: "I need a wooden sword", expected: "make" },
    { msg: "build me a furnace", expected: "make" },

    // Navigation requests
    { msg: "come here please", expected: "come" },
    { msg: "follow me", expected: "come" },
    { msg: "go to 100 64 200", expected: "go" },

    // Combat requests
    { msg: "kill all the zombies", expected: "kill" },
    { msg: "attack the skeleton", expected: "kill" },
    { msg: "hunt some animals", expected: "kill" },

    // Control commands
    { msg: "stop", expected: "stop" },
    { msg: "please stop what you're doing", expected: "stop" },

    // Farming
    { msg: "start farming", expected: "farm" },
    { msg: "harvest the wheat", expected: "farm" },
];

let passed = 0;
let failed = 0;

for (const test of testMessages) {
    const result = nlu.parse(test.msg, 'TestPlayer');
    const action = result ? result.action : null;
    const status = action === test.expected ? '✅' : '❌';

    if (action === test.expected) {
        passed++;
    } else {
        failed++;
    }

    console.log(`${status} "${test.msg}"`);
    console.log(`   Expected: ${test.expected}, Got: ${action}`);
    if (result) {
        console.log(`   Target: ${result.target}, Count: ${result.count}, Confidence: ${result.confidence}`);
    }
    console.log('');
}

console.log('-'.repeat(40));
console.log(`NLU Results: ${passed} passed, ${failed} failed out of ${testMessages.length}`);
console.log('');

// Test Knowledge Base
console.log('📚 Testing Knowledge Base...');
console.log('-'.repeat(40));

const itemTests = [
    { input: "wood", expected: "oak_log" },
    { input: "diamonds", expected: "diamond" },
    { input: "iron pick", expected: "iron_pickaxe" },
    { input: "stone sword", expected: "stone_sword" },
    { input: "table", expected: "crafting_table" },
];

for (const test of itemTests) {
    const result = normalizeItem(test.input);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`${status} "${test.input}" -> "${result}" (expected: "${test.expected}")`);
}
console.log('');

// Test craftable/gatherable detection
console.log('🔧 Testing Craftable/Gatherable detection...');
console.log('-'.repeat(40));

const craftTests = [
    { item: 'diamond_pickaxe', craftable: true, gatherable: false },
    { item: 'iron_ore', craftable: false, gatherable: true },
    { item: 'oak_log', craftable: false, gatherable: true },
    { item: 'crafting_table', craftable: true, gatherable: false },
    { item: 'torch', craftable: true, gatherable: false },
];

for (const test of craftTests) {
    const craft = isCraftable(test.item);
    const gather = isGatherable(test.item);
    const status = (craft === test.craftable && gather === test.gatherable) ? '✅' : '❌';
    console.log(`${status} ${test.item}: craftable=${craft}, gatherable=${gather}`);
}
console.log('');

// Test Response Generator
console.log('💬 Testing Response Generator...');
console.log('-'.repeat(40));

const responder = new ResponseGenerator('TestBot');

console.log('Starting mine:', responder.starting('mine', { username: 'Player1', target: 'iron ore', count: 32 }));
console.log('Completed make:', responder.completed('make', { target: 'pickaxe' }));
console.log('Error notFound:', responder.error('notFound', { target: 'diamonds' }));
console.log('Status working:', responder.status(true, 'mining iron'));
console.log('Status idle:', responder.status(false));
console.log('Help:', responder.help());
console.log('');

// Summary
console.log('='.repeat(60));
console.log('🧪 Test Complete!');
console.log('='.repeat(60));
console.log('');
console.log('To test in-game, run: node ai-bot.js <server> <port>');
console.log('Then send chat messages like:');
console.log('  - "can you get me some iron?"');
console.log('  - "make me a diamond pickaxe"');
console.log('  - "come here please"');
console.log('  - "kill all the zombies nearby"');
