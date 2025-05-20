// Test script for appointment update flow
require('dotenv').config();
const { createUpdateAppointmentTool } = require('../../tools/updateAppointment');
const { createGetCustomerAppointmentsTool } = require('../tools/getCustomerAppointments');

// Test customer data
const testCustomer = {
  name: "Test Customer",
  mobile: "+6591234567",
  resourceName: "people/c1985802935104040951"
};

// Create a mock context for testing
const mockContext = {
  memory: {},
  detectedServiceIds: []
};

// Create the tools
const updateTool = createUpdateAppointmentTool(mockContext, 'test-session');
const appointmentsTool = createGetCustomerAppointmentsTool(mockContext, 'test-session');

async function run() {
  console.log('🧪 Testing appointment update flow\n');
  
  try {
    // Step 1: Get customer's appointments
    console.log(`📋 Step 1: Retrieving appointments for ${testCustomer.name}`);
    const appointmentsResult = await appointmentsTool._call({
      resourceName: testCustomer.resourceName,
      limit: 2
    });
    
    const appointmentsData = JSON.parse(appointmentsResult);
    console.log(`\n✅ Retrieved ${appointmentsData.appointments?.length || 0} appointments`);
    
    if (!appointmentsData.appointments || appointmentsData.appointments.length === 0) {
      console.log('❌ No appointments found to update, ending test');
      return;
    }
    
    // Display the appointments
    appointmentsData.appointments.forEach((appt, index) => {
      console.log(`\n📅 Appointment ${index + 1}:`);
      console.log(`ID: ${appt.id}`);
      console.log(`Date: ${appt.date}`);
      console.log(`Time: ${appt.time}`);
      console.log(`Service: ${appt.serviceNames}`);
    });
    
    // Step 2: Update the first appointment
    const appointmentToUpdate = appointmentsData.appointments[0];
    console.log(`\n📋 Step 2: Updating appointment ${appointmentToUpdate.id}`);
    
    // Calculate a new date (2 days later)
    const currentDate = new Date(appointmentToUpdate.date);
    currentDate.setDate(currentDate.getDate() + 2);
    const newDate = currentDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    console.log(`\nChanging appointment from ${appointmentToUpdate.date} to ${newDate}`);
    
    // Extract service IDs if available, or use dummy service ID
    const serviceIds = appointmentToUpdate.serviceIds || ["service:3-2024"];
    
    // Call the update appointment tool
    const updateResult = await updateTool._call({
      appointmentId: appointmentToUpdate.id,
      name: testCustomer.name,
      mobile: testCustomer.mobile,
      resourceName: testCustomer.resourceName,
      date: newDate,
      time: appointmentToUpdate.time,
      serviceIds: serviceIds,
      duration: appointmentToUpdate.duration || 60
    });
    
    // Display the result
    console.log(`\n📝 Update result: ${updateResult}`);
    
    const parsedResult = JSON.parse(updateResult);
    
    if (parsedResult.success) {
      console.log(`\n✅ Appointment successfully updated!`);
      console.log(`New date: ${parsedResult.details.datetime.date}`);
      console.log(`Time: ${parsedResult.details.datetime.time}`);
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