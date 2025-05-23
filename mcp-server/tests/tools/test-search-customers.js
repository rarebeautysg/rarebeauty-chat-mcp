const dotenv = require('dotenv');
const { createSearchCustomersTool } = require('./src/tools/searchCustomers');

// Load environment variables
dotenv.config();

console.log('🔍 Testing SearchCustomers Tool');
console.log('================================');

// Check environment variables
console.log('\n🔧 Environment Check:');
console.log('SOHO_API_URL:', process.env.SOHO_API_URL || 'https://api.soho.sg/graphql');
console.log('SOHO_AUTH_TOKEN present:', process.env.SOHO_AUTH_TOKEN ? 'Yes' : 'No');

if (!process.env.SOHO_AUTH_TOKEN) {
  console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
  process.exit(1);
}

async function testSearchCustomers() {
  console.log('\n🧪 Creating SearchCustomers Tool Instance...');
  
  // Create a mock context
  const mockContext = {
    memory: {
      tool_usage: {}
    }
  };
  
  const mockSessionId = 'test-session-123';
  
  // Create the tool instance
  const searchTool = createSearchCustomersTool(mockContext, mockSessionId);
  
  console.log(`✅ Tool created: ${searchTool.name}`);
  console.log(`📝 Description: ${searchTool.description}`);
  
  // Test cases
  const testCases = [
    { name: 'john', limit: 5 },
    { name: 'mary', limit: 3 },
    { name: 'test', limit: 10 },
    { name: 'a', limit: 5 }, // Should fail due to minimum length
  ];
  
  for (const testCase of testCases) {
    console.log(`\n🔍 Testing search with name: "${testCase.name}", limit: ${testCase.limit}`);
    console.log('---');
    
    try {
      const result = await searchTool._call(testCase);
      const parsedResult = JSON.parse(result);
      
      if (parsedResult.success) {
        console.log(`✅ Search successful!`);
        console.log(`📊 Results count: ${parsedResult.resultsCount}`);
        console.log(`📊 Total matches: ${parsedResult.totalMatches}`);
        console.log(`🔍 Search term: ${parsedResult.searchTerm}`);
        
        if (parsedResult.results && parsedResult.results.length > 0) {
          console.log('\n📋 Sample results:');
          parsedResult.results.slice(0, 3).forEach((customer, i) => {
            console.log(`  ${i + 1}. ${customer.name} - ${customer.mobile} (${customer.resourceName})`);
          });
        }
      } else {
        console.log(`❌ Search failed: ${parsedResult.error}`);
        console.log(`💬 Message: ${parsedResult.message}`);
        if (parsedResult.details) {
          console.log(`📄 Details: ${parsedResult.details}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error during test: ${error.message}`);
    }
  }
}

// Run the test
testSearchCustomers()
  .then(() => {
    console.log('\n🎉 Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }); 