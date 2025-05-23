#!/usr/bin/env node

/**
 * Test script to verify dynamic welcome messages
 */

const { getAdminWelcomeMessage } = require('./src/prompts/systemPrompt-admin');
const { getCustomerWelcomeMessage } = require('./src/prompts/systemPrompt-customer');

console.log('🧪 Testing Dynamic Welcome Messages');
console.log('=====================================\n');

// Test date info
const dateInfo = {
  formattedDate: new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  }),
  todayStatus: new Date().getDay() === 0 ? "Today is Sunday and we are CLOSED." : "We are OPEN today."
};

console.log('📅 Date Info:', dateInfo.formattedDate);
console.log('🏪 Status:', dateInfo.todayStatus);
console.log('');

// Test scenarios
console.log('🔍 Test Scenarios:');
console.log('==================\n');

// 1. New admin session
console.log('1️⃣ New Admin Session (no customer loaded):');
const newAdminWelcome = getAdminWelcomeMessage({}, dateInfo);
console.log(`   Message: "${newAdminWelcome}"`);
console.log(`   ✅ Should ask for mobile number or name: ${newAdminWelcome.includes('mobile number or name') ? 'PASS' : 'FAIL'}`);
console.log('');

// 2. Admin with customer loaded
console.log('2️⃣ Admin Session with Customer Loaded:');
const customerLoadedContext = {
  memory: {
    user_info: {
      name: 'Alice Tan',
      mobile: '+6591234567',
      resourceName: 'people/C001'
    }
  }
};
const adminWithCustomerWelcome = getAdminWelcomeMessage(customerLoadedContext, dateInfo);
console.log(`   Message: "${adminWithCustomerWelcome}"`);
console.log(`   ✅ Should mention customer name: ${adminWithCustomerWelcome.includes('Alice Tan') ? 'PASS' : 'FAIL'}`);
console.log('');

// 3. Admin with appointment loaded
console.log('3️⃣ Admin Session with Appointment Loaded:');
const appointmentContext = {
  memory: {
    user_info: {
      name: 'Bob Wilson',
      mobile: '+6598765432'
    },
    current_appointment_id: 'appt:12345'
  }
};
const adminWithAppointmentWelcome = getAdminWelcomeMessage(appointmentContext, dateInfo);
console.log(`   Message: "${adminWithAppointmentWelcome}"`);
console.log(`   ✅ Should mention appointment: ${adminWithAppointmentWelcome.includes('appointment') ? 'PASS' : 'FAIL'}`);
console.log('');

// 4. New customer session
console.log('4️⃣ New Customer Session:');
const newCustomerWelcome = getCustomerWelcomeMessage({}, dateInfo);
console.log(`   Message: "${newCustomerWelcome}"`);
console.log(`   ✅ Should ask for mobile number: ${newCustomerWelcome.includes('mobile number') ? 'PASS' : 'FAIL'}`);
console.log('');

// 5. Returning customer session
console.log('5️⃣ Returning Customer Session:');
const returningCustomerContext = {
  memory: {
    user_info: {
      name: 'Sarah Johnson',
      mobile: '+6593456789'
    }
  }
};
const returningCustomerWelcome = getCustomerWelcomeMessage(returningCustomerContext, dateInfo);
console.log(`   Message: "${returningCustomerWelcome}"`);
console.log(`   ✅ Should welcome by name: ${returningCustomerWelcome.includes('Sarah Johnson') ? 'PASS' : 'FAIL'}`);
console.log('');

console.log('✨ All tests completed!');
console.log('');
console.log('🔧 Implementation Notes:');
console.log('- Welcome messages are now generated dynamically by MCP server');
console.log('- Messages adapt based on context (customer loaded, appointment loaded, etc.)');
console.log('- No more hardcoded welcome messages in the chat server');
console.log('- Both server.js and src/index.js implementations updated'); 