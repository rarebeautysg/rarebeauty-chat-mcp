# MCP Server Tests

This directory contains test files for the MCP Server components. The tests are organized by component type.

## Directory Structure

```
tests/
├── index.js        - Main test runner
├── tools/          - Tests for tool components
│   ├── index.js    - Tools test runner
│   ├── test-scan-services.js - Tests for scan services tool
│   └── test-update-appointment.js - Tests for update appointment tool
└── README.md       - This file
```

## Running Tests

The tests can be run using npm scripts defined in the package.json file:

```bash
# Run all tests
npm test

# Run only tool tests
npm run test:tools

# Run specific tool tests
npm run test:scan     # Run scan services test
npm run test:update   # Run update appointment test
```

## Adding New Tests

To add a new test file:

1. Create a new file in the appropriate directory (e.g., `tests/tools/test-new-tool.js`)
2. Structure your test file to export a `run` function that executes the test:

```javascript
// test-new-tool.js
require('dotenv').config();
const { createNewTool } = require('../../tools/newTool');

// Create a mock context for testing
const mockContext = {
  memory: {},
  detectedServiceIds: []
};

// Create the tool instance
const newTool = createNewTool(mockContext, 'test-session');

// Define test cases and test data
const testCase = {
  // Test parameters here
};

// Run the test
async function run() {
  console.log('🧪 Testing new tool\n');
  
  try {
    // Execute your test code here
    const result = await newTool._call(testCase);
    
    // Verify results
    console.log(`Result: ${JSON.stringify(result, null, 2)}`);
    
    // Additional assertions
  } catch (error) {
    console.error(`Error running test:`, error);
  }
  
  console.log('\n🧪 Test completed');
}

// If this file is run directly, execute the test
if (require.main === module) {
  run()
    .then(() => console.log('✅ All tests completed'))
    .catch(error => console.error('❌ Test error:', error));
}

module.exports = { run };
```

3. Add a new script to package.json if needed:

```json
"scripts": {
  "test:new": "node src/tests/tools/test-new-tool.js"
}
```

## Test Guidelines

- Each test file should be self-contained and not depend on the execution of other test files
- Use descriptive log messages to make it clear what is being tested
- Use mock contexts and data to avoid affecting production data
- Make sure all tests clean up after themselves if they modify external resources
- Include both success and failure test cases
- Design tests to be repeatable and idempotent 