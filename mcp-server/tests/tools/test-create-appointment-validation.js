/**
 * Test the createAppointment tool's service ID validation
 */

require('dotenv').config();
const { createCreateAppointmentTool } = require('../tools/createAppointment');
const MCPContext = require('../models/MCPContext');

async function testServiceIdValidation() {
  console.log('🧪 Testing createAppointment service ID validation\n');
  
  // Create a test context
  const context = new MCPContext({
    memory: {
      user_info: {
        name: "Test Customer",
        mobile: "+6591234567",
        resourceName: "people/c1985802935104040951"
      }
    },
    history: [],
    detectedServiceIds: [] // Empty initially - this is the key test
  });
  
  const sessionId = 'test-validation-session';
  const createAppointmentTool = createCreateAppointmentTool(context, sessionId);
  
  console.log('📋 Test 1: Invalid service ID format (should fail)');
  console.log('Testing with serviceIds: ["lashes-dense", "facial-treatment"]');
  
  try {
    const result1 = await createAppointmentTool._call({
      serviceIds: ["lashes-dense", "facial-treatment"],
      datetime: "20250523T1200",
      name: "Test Customer",
      mobile: "+6591234567",
      resourceName: "people/c1985802935104040951"
    });
    
    const parsed1 = JSON.parse(result1);
    console.log('Result:', parsed1);
    
    if (!parsed1.success && parsed1.error === 'Invalid service ID format') {
      console.log('✅ Test 1 PASSED: Invalid service ID format correctly detected\n');
    } else {
      console.log('❌ Test 1 FAILED: Should have rejected invalid service ID format\n');
    }
  } catch (error) {
    console.log('❌ Test 1 ERROR:', error.message, '\n');
  }
  
  console.log('📋 Test 2: Valid service ID format but not in context (should fail)');
  console.log('Testing with serviceIds: ["service:999-2024"]');
  
  try {
    const result2 = await createAppointmentTool._call({
      serviceIds: ["service:999-2024"],
      datetime: "20250523T1200", 
      name: "Test Customer",
      mobile: "+6591234567",
      resourceName: "people/c1985802935104040951"
    });
    
    const parsed2 = JSON.parse(result2);
    console.log('Result:', parsed2);
    
    if (!parsed2.success && parsed2.error === 'Service IDs not found in context') {
      console.log('✅ Test 2 PASSED: Valid format but missing from context correctly detected\n');
    } else {
      console.log('❌ Test 2 FAILED: Should have rejected service ID not in context\n');
    }
  } catch (error) {
    console.log('❌ Test 2 ERROR:', error.message, '\n');
  }
  
  console.log('📋 Test 3: Add valid service ID to context and test (should work)');
  console.log('Adding service:1-2024 to detectedServiceIds and testing');
  
  // Initialize detectedServiceIds if it doesn't exist
  if (!context.detectedServiceIds) {
    context.detectedServiceIds = [];
  }
  
  // Add a valid service ID to the context
  context.detectedServiceIds.push('service:1-2024');
  console.log('Context detectedServiceIds:', context.detectedServiceIds);
  
  try {
    const result3 = await createAppointmentTool._call({
      serviceIds: ["service:1-2024"],
      datetime: "20250523T1200",
      name: "Test Customer", 
      mobile: "+6591234567",
      resourceName: "people/c1985802935104040951"
    });
    
    const parsed3 = JSON.parse(result3);
    console.log('Result summary:', {
      success: parsed3.success,
      error: parsed3.error,
      message: parsed3.message?.substring(0, 100) + (parsed3.message?.length > 100 ? '...' : '')
    });
    
    if (parsed3.success) {
      console.log('✅ Test 3 PASSED: Valid service ID with context worked\n');
    } else {
      console.log('❌ Test 3 FAILED: Valid service ID should have worked\n');
      console.log('Full error:', parsed3);
    }
  } catch (error) {
    console.log('❌ Test 3 ERROR:', error.message, '\n');
  }
  
  console.log('🧪 Service ID validation test completed');
}

// Run the test
testServiceIdValidation()
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }); 