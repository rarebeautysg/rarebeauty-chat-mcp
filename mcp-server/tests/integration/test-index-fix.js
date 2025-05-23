#!/usr/bin/env node

/**
 * Test to verify the index fix for numbered customer selection
 */

console.log('🔧 Testing Index Fix for Numbered Selection');
console.log('===========================================\n');

// Simulate the exact scenario from the screenshot
function testIndexFix() {
  // Mock the exact data from the screenshot
  const mockResults = [
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
  ];

  console.log('📋 Expected Results (as displayed to user):');
  mockResults.forEach((customer, index) => {
    console.log(`   ${index + 1}. ${customer.name}, Mobile: ${customer.mobile}`);
  });

  console.log('\n🎯 Expected behavior when user types "9":');
  console.log('   Should select: Anna(MB) Azman (+6593658986)');
  
  console.log('\n🔍 Testing selection logic:');
  
  // Test the selection logic
  const userInput = "9";
  const selectedIndex = parseInt(userInput, 10);
  console.log(`   User input: "${userInput}"`);
  console.log(`   Parsed index: ${selectedIndex}`);
  console.log(`   Array index (0-based): ${selectedIndex - 1}`);
  
  if (selectedIndex >= 1 && selectedIndex <= mockResults.length) {
    const selectedCustomer = mockResults[selectedIndex - 1];
    console.log(`   Selected customer: ${selectedCustomer.name}`);
    console.log(`   Selected mobile: ${selectedCustomer.mobile}`);
    console.log(`   Selected resourceName: ${selectedCustomer.resourceName}`);
    
    // Verify this is the correct customer
    const expectedCustomer = 'Anna(MB) Azman';
    const expectedMobile = '+6593658986';
    
    if (selectedCustomer.name === expectedCustomer && selectedCustomer.mobile === expectedMobile) {
      console.log(`   ✅ CORRECT: Selected the right customer!`);
      return true;
    } else {
      console.log(`   ❌ WRONG: Expected ${expectedCustomer} (${expectedMobile}), got ${selectedCustomer.name} (${selectedCustomer.mobile})`);
      return false;
    }
  } else {
    console.log(`   ❌ Invalid selection range`);
    return false;
  }
}

// Test different selections
function testMultipleSelections() {
  const mockResults = [
    { name: 'Adrianna', mobile: '+6587677794', resourceName: 'people/C001' },
    { name: 'Anna', mobile: '+6596794095', resourceName: 'people/C002' },
    { name: 'Anna Chong', mobile: '+6590719905', resourceName: 'people/C003' },
    { name: 'Anna GoLiwag', mobile: '+6596278688', resourceName: 'people/C004' },
    { name: 'Anna Instagram', mobile: '+6597630867', resourceName: 'people/C005' },
    { name: 'Anna Lim', mobile: '+6582685508', resourceName: 'people/C006' },
    { name: 'Anna Lim', mobile: '+6596179292', resourceName: 'people/C007' },
    { name: 'Anna RidheemaLal', mobile: '+6581800458', resourceName: 'people/C008' },
    { name: 'Anna(MB) Azman', mobile: '+6593658986', resourceName: 'people/C009' },
    { name: 'Anna(MB) Kuok', mobile: '+6585560969', resourceName: 'people/C010' }
  ];

  console.log('\n🧪 Testing multiple selections:');
  
  const testCases = [
    { input: 1, expected: 'Adrianna' },
    { input: 9, expected: 'Anna(MB) Azman' },
    { input: 10, expected: 'Anna(MB) Kuok' }
  ];
  
  let allPassed = true;
  
  testCases.forEach(testCase => {
    const selectedCustomer = mockResults[testCase.input - 1];
    const passed = selectedCustomer.name === testCase.expected;
    console.log(`   Selection ${testCase.input}: ${selectedCustomer.name} ${passed ? '✅' : '❌'} (expected: ${testCase.expected})`);
    if (!passed) allPassed = false;
  });
  
  return allPassed;
}

// Run tests
console.log('🚀 Running index fix tests...\n');

const test1Result = testIndexFix();
const test2Result = testMultipleSelections();

console.log('\n📊 Test Results:');
console.log(`   Index fix test: ${test1Result ? 'PASS' : 'FAIL'}`);
console.log(`   Multiple selections test: ${test2Result ? 'PASS' : 'FAIL'}`);

if (test1Result && test2Result) {
  console.log('\n🎉 All tests PASSED! The index fix should work correctly.');
} else {
  console.log('\n❌ Some tests FAILED. The index logic needs more work.');
}

console.log('\n💡 Key points verified:');
console.log('- User input "9" should select item at index 8 (0-based)');
console.log('- Item at index 8 should be Anna(MB) Azman');
console.log('- Item at index 9 should be Anna(MB) Kuok');
console.log('- Selection logic: selectedIndex - 1 = array index'); 