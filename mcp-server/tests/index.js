#!/usr/bin/env node

/**
 * Main test runner for all MCP server tests
 * Runs tests organized in subdirectories by category
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Test categories and their directories
const testCategories = {
  'Prompt Tests': 'prompts',
  'Tool Tests': 'tools', 
  'Integration Tests': 'integration',
  'Utility Tests': 'utils'
};

/**
 * Get all test files in a directory
 */
function getTestFiles(directory) {
  const fullPath = path.join(__dirname, directory);
  
  if (!fs.existsSync(fullPath)) {
    return [];
  }
  
  return fs.readdirSync(fullPath)
    .filter(file => file.startsWith('test-') && file.endsWith('.js'))
    .map(file => path.join(directory, file));
}

/**
 * Run a single test file
 */
function runTest(testFile) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(__dirname, testFile);
    const child = spawn('node', [fullPath], {
      stdio: 'inherit',
      cwd: path.dirname(path.dirname(__dirname)) // Set cwd to mcp-server directory
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ file: testFile, success: true });
      } else {
        resolve({ file: testFile, success: false, code });
      }
    });
    
    child.on('error', (error) => {
      reject({ file: testFile, error: error.message });
    });
  });
}

/**
 * Run all tests in a category
 */
async function runCategoryTests(categoryName, directory) {
  console.log(`\n🏷️  ${categoryName}`);
  console.log('='.repeat(50));
  
  const testFiles = getTestFiles(directory);
  
  if (testFiles.length === 0) {
    console.log(`📝 No tests found in ${directory}/`);
    return { passed: 0, failed: 0, total: 0 };
  }
  
  const results = {
    passed: 0,
    failed: 0,
    total: testFiles.length
  };
  
  for (const testFile of testFiles) {
    console.log(`\n📋 Running ${testFile}...`);
    console.log('-'.repeat(30));
    
    try {
      const result = await runTest(testFile);
      
      if (result.success) {
        console.log(`✅ ${testFile} - PASSED`);
        results.passed++;
      } else {
        console.log(`❌ ${testFile} - FAILED (exit code: ${result.code})`);
        results.failed++;
      }
    } catch (error) {
      console.log(`💥 ${testFile} - ERROR: ${error.error}`);
      results.failed++;
    }
  }
  
  return results;
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🧪 MCP Server Test Suite');
  console.log('=' .repeat(50));
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  
  const overallResults = {
    passed: 0,
    failed: 0,
    total: 0
  };
  
  // Run tests for each category
  for (const [categoryName, directory] of Object.entries(testCategories)) {
    const categoryResults = await runCategoryTests(categoryName, directory);
    
    overallResults.passed += categoryResults.passed;
    overallResults.failed += categoryResults.failed;
    overallResults.total += categoryResults.total;
    
    console.log(`\n📊 ${categoryName} Summary: ${categoryResults.passed}/${categoryResults.total} passed`);
  }
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('🎯 FINAL RESULTS');
  console.log('='.repeat(50));
  console.log(`📊 Total Tests: ${overallResults.total}`);
  console.log(`✅ Passed: ${overallResults.passed}`);
  console.log(`❌ Failed: ${overallResults.failed}`);
  console.log(`📈 Success Rate: ${overallResults.total > 0 ? Math.round((overallResults.passed / overallResults.total) * 100) : 0}%`);
  console.log(`📅 Completed at: ${new Date().toISOString()}`);
  
  if (overallResults.failed > 0) {
    console.log('\n❌ Some tests failed. Please check the output above for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('💥 Test runner error:', error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  runCategoryTests,
  getTestFiles
}; 