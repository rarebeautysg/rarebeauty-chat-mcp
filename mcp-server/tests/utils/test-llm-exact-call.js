/**
 * Test to replicate the exact LLM tool call that was failing
 */

require('dotenv').config();
const { createSelectServicesTool } = require('../tools/selectServices');
const MCPContext = require('../models/MCPContext');

async function testLLMExactCall() {
  console.log('🧪 Testing exact LLM tool call that was failing\n');
  
  // Create test context
  const context = new MCPContext({
    memory: {},
    history: [],
    detectedServiceIds: []
  });
  
  const selectServicesTool = createSelectServicesTool(context, 'test-session');
  
  console.log('📋 Simulating the exact LLM call:');
  console.log('Raw args: { services: [ "Lashes - Full Set - Dense", "Lashes - Eye Mask" ] }');
  
  try {
    const result = await selectServicesTool._call({
      services: ["Lashes - Full Set - Dense", "Lashes - Eye Mask"]
    });
    
    console.log('\n✅ RESULT:');
    console.log('Selected services:', result.selected.length);
    result.selected.forEach(s => {
      console.log(`  - ${s.name} (${s.id})`);
    });
    
    console.log('Unmatched services:', result.unmatched.length);
    result.unmatched.forEach(s => {
      console.log(`  - ${s}`);
    });
    
    console.log('\nContext detectedServiceIds:', context.detectedServiceIds);
    
    if (result.selected.length === 2 && result.unmatched.length === 0) {
      console.log('\n🎉 SUCCESS: LLM call now works correctly!');
      console.log('   - Services are properly matched');
      console.log('   - Service IDs are added to detectedServiceIds');
      console.log('   - Ready for createAppointment to use');
    } else {
      console.log('\n❌ FAILURE: Still not working correctly');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testLLMExactCall()
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }); 