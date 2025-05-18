/**
 * Test runner for MCP Server tools components
 */

const path = require('path');
const fs = require('fs');

/**
 * Run all tools tests
 */
async function runToolTests() {
  console.log('🧪 Running tools tests...\n');
  
  try {
    // Get all test files in this directory
    const testDir = __dirname;
    const files = fs.readdirSync(testDir);
    const testFiles = files.filter(file => 
      file !== 'index.js' && 
      (file.startsWith('test-') || file.endsWith('.test.js'))
    );
    
    console.log(`Found ${testFiles.length} test files`);
    
    // Run each test file
    for (const testFile of testFiles) {
      console.log(`\n📋 Running test: ${testFile}`);
      try {
        const testModule = require(path.join(testDir, testFile));
        
        // If the test exports a run function, call it
        if (typeof testModule.run === 'function') {
          await testModule.run();
        } else {
          console.log(`⚠️ Test ${testFile} doesn't export a run function`);
        }
      } catch (error) {
        console.error(`❌ Error running test ${testFile}:`, error);
      }
    }
    
    console.log('\n✅ All tools tests completed');
  } catch (error) {
    console.error('\n❌ Error running tools tests:', error);
    throw error;
  }
}

// If this file is run directly, execute all tools tests
if (require.main === module) {
  runToolTests()
    .then(() => console.log('✅ All tests completed'))
    .catch(error => {
      console.error('❌ Test error:', error);
      process.exit(1);
    });
}

module.exports = {
  runToolTests
}; 