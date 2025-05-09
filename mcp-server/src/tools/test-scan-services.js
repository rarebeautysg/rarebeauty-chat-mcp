// Test script for string-based service detection
require('dotenv').config();
const { createScanServicesTool } = require('./scanServices');

// Create a mock context for testing
const mockContext = {
  memory: {
    last_selected_services: ['service:123', 'service:456']  // Mock previous services
  },
  detectedServiceIds: []
};

// Create the scanServices tool
const scanTool = createScanServicesTool(mockContext, 'test-session');

// Test cases
const testCases = [
  {
    name: "Clear appointment history",
    text: "Here's the appointment history for Jane Doe. She had lashes full set on March 15th, and a facial on April 2nd. Her last visit was 3 weeks ago."
  },
  {
    name: "Service booking message",
    text: "I'd like to book a lashes full set and a facial for next Tuesday at 2pm."
  },
  {
    name: "Reuse previous services",
    text: "I want the same services as last time."
  },
  {
    name: "Table format history",
    text: "| Date | Service | Price |\n| 2023-05-15 | Lashes - Full Set | $75 |\n| 2023-06-20 | Facial - Radiance | $65 |"
  },
  {
    name: "Explicit service IDs",
    text: "I want to book service:123 and service:789"
  },
  {
    name: "Mixed history and booking",
    text: "Last time I had lashes, but now I want to try threading."
  },
  {
    name: "Partial service names",
    text: "I'm interested in full set lashes and maybe some threading."
  }
];

// Run the tests
async function runTests() {
  console.log('🧪 Testing scanServices string-based detection\n');
  
  // Run tests one at a time
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`Text: ${testCase.text.substring(0, 100)}${testCase.text.length > 100 ? '...' : ''}`);
    
    try {
      // Test analyzeOnly mode to prevent context modifications
      const result = await scanTool._call({
        message: testCase.text,
        analyzeOnly: true
      });
      
      console.log(`Result: ${JSON.stringify(result, null, 2)}`);
      
      // Wait a moment between calls
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (result.skippedDetection) {
        console.log(`✅ Detected as history content`);
      } else if (result.isReusing) {
        console.log(`✅ Detected intent to reuse previous services`);
        console.log(`Services to reuse: ${result.serviceMentions.map(s => s.serviceName).join(', ')}`);
      } else {
        console.log(`✅ Found ${result.serviceMentions?.length || 0} service mentions`);
        if (result.serviceMentions?.length > 0) {
          console.log('Services found:');
          result.serviceMentions.forEach(service => {
            console.log(`- ${service.serviceName} (${service.id}) - Match type: ${service.type}`);
          });
        }
      }
    } catch (error) {
      console.error(`❌ Error testing case "${testCase.name}":`, error);
    }
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n🧪 Test completed');
}

// Run the tests
runTests()
  .then(() => console.log('✅ All tests completed'))
  .catch(error => console.error('❌ Test error:', error)); 