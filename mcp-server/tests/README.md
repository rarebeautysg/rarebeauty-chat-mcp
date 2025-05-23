# Tests Directory

This directory contains all test files for the MCP server, organized by category for better maintainability.

## Structure

```
tests/
├── prompts/               # Prompt-related tests
│   ├── test-modular-prompts.js     # Tests for modular prompt system
│   └── test-dynamic-welcome.js     # Tests for dynamic welcome messages
├── tools/                 # Tool-specific tests
│   ├── test-service-matching.js    # Tests for service matching functionality
│   ├── test-select-services.js     # Tests for service selection tool
│   ├── test-map-services.js        # Tests for service mapping
│   ├── test-create-appointment-validation.js  # Appointment creation validation
│   ├── test-update-appointment.js  # Tests for appointment updates
│   ├── test-lookup*.js             # Various lookup tool tests
│   ├── test-search-customers.js    # Customer search tests
│   └── test-numbered-selection*.js # Numbered selection tests
├── integration/           # Integration and flow tests
│   ├── test-appointment-flow.js    # Full appointment booking flow
│   └── test-index-fix.js          # Index and integration fixes
├── utils/                 # Utility and helper tests
│   ├── test-datetime.js           # DateTime parsing tests
│   ├── test-specific-datetime.js  # Specific datetime scenarios
│   └── test-llm-exact-call.js     # LLM call precision tests
├── README.md              # This file
└── index.js               # Test runner and utilities
```

## Running Tests

### Individual Tests
Run specific test files:
```bash
# Prompt tests
node tests/prompts/test-modular-prompts.js
node tests/prompts/test-dynamic-welcome.js

# Tool tests
node tests/tools/test-service-matching.js
node tests/tools/test-lookup.js

# Integration tests
node tests/integration/test-appointment-flow.js

# Utility tests
node tests/utils/test-datetime.js
```

### Category Tests
Run all tests in a category:
```bash
# Run all prompt tests
find tests/prompts -name "test-*.js" -exec node {} \;

# Run all tool tests
find tests/tools -name "test-*.js" -exec node {} \;

# Run all integration tests
find tests/integration -name "test-*.js" -exec node {} \;

# Run all utility tests
find tests/utils -name "test-*.js" -exec node {} \;
```

### All Tests
Run all tests:
```bash
node tests/index.js
```

## Test Categories

### 📝 Prompts Tests
- **Modular Prompts**: Tests the new modular prompt system with intent detection
- **Dynamic Welcome**: Tests dynamic welcome message generation

### 🛠️ Tools Tests
- **Service Management**: Service matching, selection, and mapping
- **Customer Management**: Lookup, search, and customer operations
- **Appointment Management**: Creation, validation, and updates
- **Selection Interfaces**: Numbered selection and UI interactions

### 🔄 Integration Tests
- **Appointment Flow**: End-to-end appointment booking scenarios
- **System Integration**: Component interaction and data flow

### 🔧 Utils Tests
- **DateTime Processing**: Date/time parsing and validation
- **LLM Interactions**: Language model call precision and formatting

## Adding New Tests

1. Create a new file in the appropriate category directory:
   ```bash
   # Tool test
   touch tests/tools/test-new-tool.js
   
   # Prompt test
   touch tests/prompts/test-new-prompt.js
   
   # Integration test
   touch tests/integration/test-new-flow.js
   
   # Utility test
   touch tests/utils/test-new-util.js
   ```

2. Use the standard test structure:
   ```javascript
   #!/usr/bin/env node
   
   /**
    * Test description
    */
   
   console.log('🧪 Testing [Feature Name]\n');
   
   // Test implementation
   
   async function runTests() {
     try {
       // Test cases
       console.log('✅ All tests passed!');
     } catch (error) {
       console.error('❌ Test failed:', error.message);
       process.exit(1);
     }
   }
   
   runTests();
   ```

3. Update this README if adding a new category or significant functionality.

## Notes

- All tests should be self-contained and not require external setup
- Use descriptive console output with emoji indicators (🧪 ✅ ❌)
- Tests should clean up after themselves
- Mock external dependencies when possible
- Follow the existing naming convention: `test-[feature-name].js` 