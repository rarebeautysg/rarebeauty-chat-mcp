#!/usr/bin/env node

/**
 * Test the new modular admin prompt structure
 */

const { createSystemPrompt, determinePromptType, detectIntent, getAdminWelcomeMessage } = require('../../src/prompts/admin');

// Mock date info
const dateInfo = {
  formattedDate: 'Tuesday, January 21, 2025',
  todayStatus: 'Today is a regular business day.'
};

console.log('🧪 Testing Modular Admin Prompts\n');

// Test 1: Welcome scenario (no customer)
console.log('📋 Test 1: Welcome Scenario (No Customer)');
const welcomeContext = {
  memory: {},
  history: []
};

const welcomePromptType = determinePromptType(welcomeContext);
console.log(`Prompt type: ${welcomePromptType}`);

const welcomeMessage = getAdminWelcomeMessage(welcomeContext, dateInfo);
console.log(`Welcome message: "${welcomeMessage}"`);
console.log('---\n');

// Test 2: Booking scenario (customer loaded, booking intent)
console.log('📋 Test 2: Booking Scenario');
const bookingContext = {
  memory: {
    user_info: {
      name: 'Jane Doe',
      mobile: '+6591234567',
      resourceName: 'people/c123456789'
    }
  },
  history: [
    { role: 'user', content: 'book for monday at 10am' }
  ]
};

const bookingPromptType = determinePromptType(bookingContext);
console.log(`Prompt type: ${bookingPromptType}`);

const bookingIntent = detectIntent(bookingContext);
console.log(`Intent detection:`, bookingIntent);

const bookingMessage = getAdminWelcomeMessage(bookingContext, dateInfo);
console.log(`Welcome message: "${bookingMessage}"`);
console.log('---\n');

// Test 3: Update scenario (customer loaded, appointment ID, update intent)
console.log('📋 Test 3: Update Scenario');
const updateContext = {
  memory: {
    user_info: {
      name: 'Jane Doe',
      mobile: '+6591234567',
      resourceName: 'people/c123456789'
    },
    current_appointment_id: 'appt:abc123',
    current_appointment: {
      id: 'appt:abc123',
      date: '2025-01-27',
      time: '14:00',
      services: [{ name: 'Lashes - Full Set' }]
    }
  },
  history: [
    { role: 'user', content: 'update the appointment to 3pm' }
  ]
};

const updatePromptType = determinePromptType(updateContext);
console.log(`Prompt type: ${updatePromptType}`);

const updateIntent = detectIntent(updateContext);
console.log(`Intent detection:`, updateIntent);

const updateMessage = getAdminWelcomeMessage(updateContext, dateInfo);
console.log(`Welcome message: "${updateMessage}"`);
console.log('---\n');

// Test 4: Cancel scenario
console.log('📋 Test 4: Cancel Scenario');
const cancelContext = {
  memory: {
    user_info: {
      name: 'Jane Doe',
      mobile: '+6591234567',
      resourceName: 'people/c123456789'
    },
    current_appointment_id: 'appt:abc123'
  },
  history: [
    { role: 'user', content: 'cancel the appointment' }
  ]
};

const cancelPromptType = determinePromptType(cancelContext);
console.log(`Prompt type: ${cancelPromptType}`);

const cancelIntent = detectIntent(cancelContext);
console.log(`Intent detection:`, cancelIntent);
console.log('---\n');

// Test 5: Edge case - booking intent with appointment ID (should still book new)
console.log('📋 Test 5: Booking Intent with Existing Appointment ID');
const edgeContext = {
  memory: {
    user_info: {
      name: 'Jane Doe',
      mobile: '+6591234567',
      resourceName: 'people/c123456789'
    },
    current_appointment_id: 'appt:abc123' // This exists but user wants to book new
  },
  history: [
    { role: 'user', content: 'book a new appointment for friday' }
  ]
};

const edgePromptType = determinePromptType(edgeContext);
console.log(`Prompt type: ${edgePromptType}`);

const edgeIntent = detectIntent(edgeContext);
console.log(`Intent detection:`, edgeIntent);
console.log('---\n');

console.log('✅ All tests completed!\n');

// Test actual prompt generation
console.log('📋 Testing Actual Prompt Generation...\n');

async function testPromptGeneration() {
  try {
    const welcomePrompt = await createSystemPrompt(welcomeContext, dateInfo);
    console.log(`✅ Welcome prompt generated (${welcomePrompt.length} chars)`);
    
    const bookingPrompt = await createSystemPrompt(bookingContext, dateInfo);
    console.log(`✅ Booking prompt generated (${bookingPrompt.length} chars)`);
    
    const updatePrompt = await createSystemPrompt(updateContext, dateInfo);
    console.log(`✅ Update prompt generated (${updatePrompt.length} chars)`);
    
    const cancelPrompt = await createSystemPrompt(cancelContext, dateInfo);
    console.log(`✅ Cancel prompt generated (${cancelPrompt.length} chars)`);
    
    console.log('\n🎉 All prompt generation tests passed!');
  } catch (error) {
    console.error('❌ Error generating prompts:', error.message);
  }
}

testPromptGeneration(); 