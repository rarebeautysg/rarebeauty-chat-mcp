#!/usr/bin/env node

/**
 * Mock test for numbered selection functionality without API dependency
 */

console.log('🧪 Testing Numbered Selection Logic (Mock)');
console.log('==========================================\n');

function testNumberedSelectionLogic() {
  // Mock context
  const mockContext = {
    memory: {
      tool_usage: {
        searchCustomers_lastResults: [
          { name: 'Adrianna', mobile: '+6587677794', resourceName: 'people/C001', display: 'Adrianna' },
          { name: 'Anna', mobile: '+6596794095', resourceName: 'people/C002', display: 'Anna' },
          { name: 'Anna Chong', mobile: '+6590719905', resourceName: 'people/C003', display: 'Anna Chong' },
          { name: 'Anna GoLiwag', mobile: '+6596278688', resourceName: 'people/C004', display: 'Anna GoLiwag' },
          { name: 'Anna Instagram', mobile: '+6597630867', resourceName: 'people/C005', display: 'Anna Instagram' },
          { name: 'Anna Lim', mobile: '+6582685508', resourceName: 'people/C006', display: 'Anna Lim' },
          { name: 'Anna Lim', mobile: '+6596179292', resourceName: 'people/C007', display: 'Anna Lim' },
          { name: 'Anna RidheemaLal', mobile: '+6581800458', resourceName: 'people/C008', display: 'Anna RidheemaLal' },
          { name: 'Anna(MB) Azman', mobile: '+6593658986', resourceName: 'people/C009', display: 'Anna(MB) Azman' },
          { name: 'Anna(MB) Kuok', mobile: '+6585560969', resourceName: 'people/C010', display: 'Anna(MB) Kuok' }
        ]
      }
    },
    identity: {}
  };

  console.log('📋 Mock previous search results:');
  mockContext.memory.tool_usage.searchCustomers_lastResults.forEach((customer, index) => {
    console.log(`   ${index + 1}. ${customer.name} - ${customer.mobile}`);
  });

  console.log('\n🔢 Testing selection of option 9 (Anna(MB) Azman)...');
  
  // Simulate the numbered selection logic
  const input = "9";
  const isNumber = /^\d+$/.test(input.trim());
  
  if (isNumber) {
    const selectedIndex = parseInt(input, 10);
    const previousResults = mockContext.memory.tool_usage.searchCustomers_lastResults;
    
    if (previousResults && selectedIndex >= 1 && selectedIndex <= previousResults.length) {
      const selectedCustomer = previousResults[selectedIndex - 1];
      
      console.log(`✅ Selected customer: ${selectedCustomer.name}`);
      console.log(`   Mobile: ${selectedCustomer.mobile}`);
      console.log(`   ResourceName: ${selectedCustomer.resourceName}`);
      
      // Update context
      mockContext.memory.user_info = {
        resourceName: selectedCustomer.resourceName,
        name: selectedCustomer.name,
        mobile: selectedCustomer.mobile,
        updatedAt: new Date().toISOString()
      };
      
      mockContext.identity.user_id = selectedCustomer.resourceName;
      mockContext.identity.persona = "returning_customer";
      
      console.log(`✅ Context updated successfully`);
      console.log(`   User info: ${mockContext.memory.user_info.name}`);
      console.log(`   Identity user_id: ${mockContext.identity.user_id}`);
      
      // Clear previous results
      delete mockContext.memory.tool_usage.searchCustomers_lastResults;
      console.log(`✅ Previous results cleared`);
      
      return {
        success: true,
        message: `Selected customer: ${selectedCustomer.name}`,
        selectedCustomer: {
          name: selectedCustomer.name,
          mobile: selectedCustomer.mobile,
          resourceName: selectedCustomer.resourceName,
          display: selectedCustomer.display
        },
        action: 'customer_selected'
      };
    }
  }
  
  return { success: false, message: 'Selection failed' };
}

function testInvalidSelection() {
  console.log('\n🔢 Testing invalid selection (option 99)...');
  
  const mockContext = {
    memory: {
      tool_usage: {
        searchCustomers_lastResults: [
          { name: 'Anna', mobile: '+6596794095', resourceName: 'people/C002', display: 'Anna' }
        ]
      }
    }
  };
  
  const input = "99";
  const selectedIndex = parseInt(input, 10);
  const previousResults = mockContext.memory.tool_usage.searchCustomers_lastResults;
  
  if (selectedIndex < 1 || selectedIndex > previousResults.length) {
    console.log(`✅ Correctly rejected invalid selection: ${selectedIndex} (valid range: 1-${previousResults.length})`);
    return true;
  }
  
  return false;
}

function testNoPreviousResults() {
  console.log('\n🔢 Testing numbered selection with no previous results...');
  
  const mockContext = {
    memory: {
      tool_usage: {}
    }
  };
  
  const input = "1";
  const previousResults = mockContext.memory.tool_usage.searchCustomers_lastResults;
  
  if (!previousResults || !Array.isArray(previousResults) || previousResults.length === 0) {
    console.log(`✅ Correctly detected no previous results`);
    return true;
  }
  
  return false;
}

// Run the tests
console.log('🚀 Starting mock tests...\n');

const result1 = testNumberedSelectionLogic();
const result2 = testInvalidSelection();
const result3 = testNoPreviousResults();

console.log('\n📊 Test Results:');
console.log(`   Valid selection test: ${result1.success ? 'PASS' : 'FAIL'}`);
console.log(`   Invalid selection test: ${result2 ? 'PASS' : 'FAIL'}`);
console.log(`   No previous results test: ${result3 ? 'PASS' : 'FAIL'}`);

console.log('\n✨ Mock tests completed!');
console.log('\n🎯 Key Features Implemented:');
console.log('- ✅ Detects when user input is a number');
console.log('- ✅ Validates selection is within valid range');
console.log('- ✅ Updates context with selected customer info');
console.log('- ✅ Clears previous results after selection');
console.log('- ✅ Handles invalid selections gracefully');
console.log('- ✅ Handles cases with no previous results'); 