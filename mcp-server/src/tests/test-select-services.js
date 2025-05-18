// Test script for the enhanced selectServices tool
require('dotenv').config();

const { createSelectServicesTool } = require('../tools/selectServices');
const { initializeServicesCache } = require('../tools/listServices');

// Mock context for testing
const mockContext = {
  memory: {},
  detectedServiceIds: []
};

// Sample test cases
const testCases = [
  {
    name: "Using serviceIds",
    params: {
      serviceIds: ["service:1-2024", "service:17-2022"]
    }
  },
  {
    name: "Using selected array",
    params: {
      selected: [
        { id: "service:1-2024", name: "Lashes - Full Set - Natural" },
        { id: "service:17-2022", name: "Threading - Eyebrow" }
      ]
    }
  },
  {
    name: "Using serviceNames with exact names",
    params: {
      serviceNames: ["Lashes - Full Set - Natural", "Threading - Eyebrow"]
    }
  },
  {
    name: "Using serviceNames with misspelled names",
    params: {
      serviceNames: ["lshes natural", "faical treament", "eye threading"]
    }
  }
];

// Run the tests
async function run() {
  console.log('🧪 Testing enhanced selectServices tool\n');
  
  // Initialize the services cache first
  await initializeServicesCache();
  
  // Create test tool
  const selectTool = createSelectServicesTool(mockContext, 'test-session');
  
  // Run tests one at a time
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`Parameters: ${JSON.stringify(testCase.params, null, 2)}`);
    
    try {
      const result = await selectTool._call(testCase.params);
      
      console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
      
      if (result.selected && result.selected.length > 0) {
        console.log('\nSelected services:');
        result.selected.forEach(service => {
          console.log(`- ${service.name} (${service.id})`);
        });
      } else {
        console.log('\nNo services selected');
      }
      
      // Wait a moment between calls
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Error testing case "${testCase.name}":`, error);
    }
  }
  
  console.log('\n🧪 Test completed');
}

// Run the tests
run().catch(error => {
  console.error('❌ Test failed:', error);
}); 