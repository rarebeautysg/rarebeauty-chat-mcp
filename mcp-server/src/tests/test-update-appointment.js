// Test script for updateAppointment tool
require('dotenv').config();
const { createUpdateAppointmentTool } = require('../../tools/updateAppointment');

// Create a mock context for testing
const mockContext = {
  memory: {},
  detectedServiceIds: []
};

// Create the updateAppointment tool
const updateTool = createUpdateAppointmentTool(mockContext, 'test-session');

// Test case data
const testCase = {
  appointmentId: "44928f80-2caf-11f0-9a54-83f76a1ab281",
  name: "Shreedhee Sajeev",
  mobile: "+6597234176",
  resourceName: "people/c1985802935104040951",
  date: "2025-06-09",
  time: "15:30",
  serviceIds: ["service:3-2024"],
  duration: 80,
  totalAmount: 85,
  additional: 0,
  discount: 0,
  deposit: 0,
  toBeInformed: true
};

// Run the test
async function run() {
  console.log('🧪 Testing updateAppointment tool\n');
  
  console.log(`\n📋 Test: Update appointment ${testCase.appointmentId}`);
  console.log(`Customer: ${testCase.name} (${testCase.mobile})`);
  console.log(`New date/time: ${testCase.date} at ${testCase.time}`);
  console.log(`Services: ${JSON.stringify(testCase.serviceIds)}`);
  
  try {
    // Call the updateAppointment tool with test data
    const result = await updateTool._call(testCase);
    
    console.log(`\n📝 Result: ${result}`);
    
    // Parse the result
    const parsedResult = JSON.parse(result);
    
    if (parsedResult.success) {
      console.log(`\n✅ Appointment updated successfully!`);
      console.log(`Appointment ID: ${parsedResult.appointmentId}`);
      console.log(`Customer: ${parsedResult.details.customer.name} (${parsedResult.details.customer.mobile})`);
      console.log(`Date: ${parsedResult.details.datetime.date}`);
      console.log(`Time: ${parsedResult.details.datetime.time}`);
      console.log(`Services: ${parsedResult.details.services.join(', ')}`);
      
      if (parsedResult.details.transaction) {
        console.log(`Total amount: $${parsedResult.details.transaction.totalAmount}`);
      }
    } else {
      console.log(`\n❌ Failed to update appointment`);
      console.log(`Error: ${parsedResult.error}`);
      console.log(`Message: ${parsedResult.message}`);
    }
  } catch (error) {
    console.error(`\n❌ Error running test:`, error);
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