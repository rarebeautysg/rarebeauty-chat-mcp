/**
 * Test service matching for specific terms like "lashes dense" and "eye mask"
 */

require('dotenv').config();
const { createSelectServicesTool } = require('../tools/selectServices');
const { getAllFormattedServices } = require('../tools/listServices');
const MCPContext = require('../models/MCPContext');

async function testServiceMatching() {
  console.log('🧪 Testing service matching for "lashes dense" and "eye mask"\n');
  
  // First, let's see what services are actually available
  console.log('📋 Step 1: Getting all available services...');
  try {
    const allServices = await getAllFormattedServices();
    console.log(`✅ Found ${allServices.length} services total`);
    
    // Look for lashes services
    const lashesServices = allServices.filter(s => 
      s.name.toLowerCase().includes('lashes') || 
      s.category?.toLowerCase() === 'lashes'
    );
    console.log(`📋 Lashes services (${lashesServices.length}):`);
    lashesServices.forEach(s => {
      console.log(`  - ${s.name} (${s.id})`);
    });
    
    // Look for facial/eye services  
    const facialServices = allServices.filter(s => 
      s.name.toLowerCase().includes('eye') || 
      s.name.toLowerCase().includes('mask') ||
      s.name.toLowerCase().includes('facial')
    );
    console.log(`📋 Eye/Mask/Facial services (${facialServices.length}):`);
    facialServices.forEach(s => {
      console.log(`  - ${s.name} (${s.id})`);
    });
    
    console.log('\n📋 Step 2: Testing selectServices with "lashes dense, eye mask"');
    
    // Create test context
    const context = new MCPContext({
      memory: {},
      history: [],
      detectedServiceIds: []
    });
    
    const selectServicesTool = createSelectServicesTool(context, 'test-session');
    
    // Test the exact input from the user
    const result = await selectServicesTool._call({
      serviceNames: ["lashes dense", "eye mask"]
    });
    
    console.log('Result:', result);
    
    if (result.selected.length === 0 && result.unmatched.length === 0) {
      console.log('❌ Both selected and unmatched are empty - this suggests the tool received no input');
    } else if (result.selected.length === 0 && result.unmatched.length > 0) {
      console.log('⚠️ No matches found, but unmatched services were recorded:', result.unmatched);
    } else {
      console.log('✅ Services matched:', result.selected.map(s => s.name));
    }
    
    console.log('\n📋 Step 3: Testing individual service names');
    
    // Test "lashes dense" specifically
    console.log('Testing "lashes dense":');
    const result1 = await selectServicesTool._call({
      serviceNames: ["lashes dense"]
    });
    console.log('Result for "lashes dense":', result1);
    
    // Test "dense" only
    console.log('Testing "dense":');
    const result2 = await selectServicesTool._call({
      serviceNames: ["dense"]
    });
    console.log('Result for "dense":', result2);
    
    // Test "eye mask"
    console.log('Testing "eye mask":');
    const result3 = await selectServicesTool._call({
      serviceNames: ["eye mask"]
    });
    console.log('Result for "eye mask":', result3);
    
    // Test manual partial matching
    console.log('\n📋 Step 4: Manual matching test');
    const denseMatches = allServices.filter(s => 
      s.name.toLowerCase().includes('dense')
    );
    console.log('Services containing "dense":', denseMatches.map(s => `${s.name} (${s.id})`));
    
    const eyeMatches = allServices.filter(s => 
      s.name.toLowerCase().includes('eye') ||
      s.name.toLowerCase().includes('mask')
    );
    console.log('Services containing "eye" or "mask":', eyeMatches.map(s => `${s.name} (${s.id})`));
    
    // Test the exact parameter format that the LLM is using
    console.log('\n📋 Step 5: Testing with "services" parameter (LLM format)');
    const result4 = await selectServicesTool._call({
      services: ["Lashes - Full Set - Dense", "Lashes - Eye Mask"]
    });
    console.log('Result with "services" parameter:', result4);
    
    if (result4.selected.length > 0) {
      console.log('✅ "services" parameter works correctly');
    } else {
      console.log('❌ "services" parameter still not working');
    }
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
  
  console.log('\n🧪 Service matching test completed');
}

// Run the test
testServiceMatching()
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }); 