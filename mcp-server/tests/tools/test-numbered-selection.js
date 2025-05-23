#!/usr/bin/env node

/**
 * Test script to verify numbered selection functionality in searchCustomers
 */

const { createSearchCustomersTool } = require('./src/tools/searchCustomers');

console.log('🧪 Testing Numbered Selection in SearchCustomers Tool');
console.log('====================================================\n');

async function testNumberedSelection() {
  // Create a mock context
  const mockContext = {
    memory: {
      tool_usage: {}
    },
    identity: {}
  };
  
  const sessionId = 'test-session-numbered';
  
  console.log('1️⃣ Creating searchCustomers tool instance...');
  const searchTool = createSearchCustomersTool(mockContext, sessionId);
  
  console.log('2️⃣ First search for "Anna" to get multiple results...');
  try {
    const searchResult = await searchTool._call({ name: 'Anna', limit: 10 });
    const parsedResult = JSON.parse(searchResult);
    
    if (parsedResult.success && parsedResult.results.length > 0) {
      console.log(`✅ Found ${parsedResult.results.length} customers:`);
      parsedResult.results.forEach((customer, index) => {
        console.log(`   ${index + 1}. ${customer.name} - ${customer.mobile}`);
      });
      
      // Check if results were stored in context
      const storedResults = mockContext.memory?.tool_usage?.searchCustomers_lastResults;
      console.log(`\n📋 Stored results in context: ${storedResults ? storedResults.length : 0} customers`);
      
      console.log('\n3️⃣ Testing numbered selection (selecting option 2)...');
      const selectionResult = await searchTool._call({ name: '2' });
      const parsedSelection = JSON.parse(selectionResult);
      
      if (parsedSelection.success) {
        console.log(`✅ Successfully selected: ${parsedSelection.selectedCustomer.name}`);
        console.log(`   Mobile: ${parsedSelection.selectedCustomer.mobile}`);
        console.log(`   ResourceName: ${parsedSelection.selectedCustomer.resourceName}`);
        
        // Check if user_info was updated in context
        if (mockContext.memory.user_info) {
          console.log(`✅ Context updated with customer: ${mockContext.memory.user_info.name}`);
        } else {
          console.log(`❌ Context NOT updated with customer info`);
        }
        
        // Check if previous results were cleared
        const remainingResults = mockContext.memory?.tool_usage?.searchCustomers_lastResults;
        console.log(`📋 Previous results cleared: ${!remainingResults ? 'Yes' : 'No'}`);
        
      } else {
        console.log(`❌ Selection failed: ${parsedSelection.message}`);
      }
      
      console.log('\n4️⃣ Testing invalid numbered selection (selecting option 99)...');
      // Restore results for this test
      mockContext.memory.tool_usage.searchCustomers_lastResults = parsedResult.results;
      
      const invalidResult = await searchTool._call({ name: '99' });
      const parsedInvalid = JSON.parse(invalidResult);
      
      if (!parsedInvalid.success) {
        console.log(`✅ Correctly rejected invalid selection: ${parsedInvalid.message}`);
      } else {
        console.log(`❌ Should have rejected invalid selection`);
      }
      
      console.log('\n5️⃣ Testing numbered selection without previous results...');
      // Clear previous results
      delete mockContext.memory.tool_usage.searchCustomers_lastResults;
      
      const noResultsTest = await searchTool._call({ name: '1' });
      const parsedNoResults = JSON.parse(noResultsTest);
      
      if (!parsedNoResults.success) {
        console.log(`✅ Correctly handled no previous results: ${parsedNoResults.message}`);
      } else {
        console.log(`❌ Should have handled no previous results error`);
      }
      
    } else {
      console.log(`❌ Search failed or no results: ${parsedResult.message}`);
    }
    
  } catch (error) {
    console.error(`❌ Test failed:`, error);
  }
}

async function runTests() {
  console.log('🚀 Starting numbered selection tests...\n');
  
  await testNumberedSelection();
  
  console.log('\n✨ Test completed!');
  console.log('\n🔧 Implementation Notes:');
  console.log('- Users can now type numbers (1, 2, 3, etc.) to select from search results');
  console.log('- Selected customer is automatically loaded into the context');
  console.log('- Previous search results are cleared after selection');
  console.log('- Invalid selections are handled gracefully');
  console.log('- Works for both admin and customer interfaces');
}

runTests().catch(console.error); 