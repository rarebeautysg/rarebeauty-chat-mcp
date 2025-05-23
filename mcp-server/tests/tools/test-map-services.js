// Test script for the mapServices tool
require('dotenv').config();

const { createMapServicesTool } = require('../tools/mapServices');
const { initializeServicesCache } = require('../tools/listServices');

// Mock context for testing
const mockContext = {
  memory: {},
  detectedServiceIds: []
};

// Sample service names with misspellings
const testCases = [
  {
    name: "Misspelled Services",
    serviceNames: ["lshes natural", "faical treament", "eye threading"]
  },
  {
    name: "Correctly Spelled Services",
    serviceNames: ["Lashes - Full Set - Natural", "Facial - Treatment", "Threading - Eyebrow"]
  },
  {
    name: "Mixed Spelling",
    serviceNames: ["Lashes Natural", "facial tretment", "brow thread"]
  }
];

// Run the tests
async function run() {
  console.log('🧪 Testing mapServices tool\n');
  
  // Initialize the services cache first
  await initializeServicesCache();
  
  // Create test tool
  const mapTool = createMapServicesTool(mockContext, 'test-session');
  
  // Run tests one at a time
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`Service Names: ${testCase.serviceNames.join(', ')}`);
    
    try {
      const result = await mapTool._call({
        serviceNames: testCase.serviceNames
      });
      
      console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
      
      if (result.mappedServices.length > 0) {
        console.log('\nSuccessfully mapped services:');
        result.mappedServices.forEach(service => {
          console.log(`- "${service.originalName}" → "${service.matchedName}" (${service.serviceId})`);
        });
      }
      
      if (result.unmappedServices.length > 0) {
        console.log('\nFailed to map services:');
        result.unmappedServices.forEach(name => {
          console.log(`- "${name}"`);
        });
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