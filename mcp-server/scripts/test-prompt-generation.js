/**
 * Test script for dynamic prompt generation
 * This demonstrates how the system prompt changes as the context evolves
 */
const { createSystemPrompt, createAdminSystemPrompt } = require('../src/utils/promptUtils');
const MCPContext = require('../src/models/MCPContext');

// Test different context scenarios
function testPromptGeneration() {
  // Scenario 1: Empty context
  const emptyContext = new MCPContext();
  console.log('====== EMPTY CONTEXT ======');
  console.log(createSystemPrompt(emptyContext.toJSON()));
  console.log('\n');
  
  // Scenario 2: With customer info
  const customerContext = new MCPContext();
  customerContext.setCustomer({
    name: 'Alice Tan',
    mobile: '+6591234567'
  });
  console.log('====== WITH CUSTOMER INFO ======');
  console.log(createSystemPrompt(customerContext.toJSON()));
  console.log('\n');
  
  // Scenario 3: With customer and services
  const servicesContext = new MCPContext(customerContext.toJSON());
  servicesContext.setSelectedServices(['lashes_full_set_dense']);
  console.log('====== WITH CUSTOMER AND SERVICES ======');
  console.log(createSystemPrompt(servicesContext.toJSON()));
  console.log('\n');
  
  // Scenario 4: With date and time
  const dateTimeContext = new MCPContext(servicesContext.toJSON());
  dateTimeContext.setAppointmentDateTime('2025-05-21', '10:00');
  console.log('====== WITH DATE AND TIME ======');
  console.log(createSystemPrompt(dateTimeContext.toJSON()));
  console.log('\n');
  
  // Scenario 5: With appointment ID (created)
  const appointmentContext = new MCPContext(dateTimeContext.toJSON());
  appointmentContext.setAppointmentId('appt:123456');
  console.log('====== WITH APPOINTMENT ID ======');
  console.log(createSystemPrompt(appointmentContext.toJSON()));
  console.log('\n');
  
  // Scenario 6: Admin context
  const adminContext = new MCPContext(appointmentContext.toJSON());
  adminContext.admin_mode = true;
  console.log('====== ADMIN MODE ======');
  console.log(createAdminSystemPrompt(adminContext.toJSON()));
  console.log('\n');
  
  // Scenario 7: Show how context evolves during a conversation
  console.log('====== EVOLVING CONTEXT DEMO ======');
  
  // Step 1: Start with empty context
  let context = new MCPContext({ admin_mode: true });
  console.log('STEP 1: Initial admin prompt');
  console.log(createAdminSystemPrompt(context.toJSON()));
  console.log('\n');
  
  // Step 2: Customer provides their name
  context.setCustomer({ name: 'Bob Johnson', mobile: '+6599887766' });
  console.log('STEP 2: After customer provides name');
  console.log(createAdminSystemPrompt(context.toJSON()));
  console.log('\n');
  
  // Step 3: Admin selects services
  context.setSelectedServices(['lashes_full_set_natural', 'eye_mask']);
  console.log('STEP 3: After selecting services');
  console.log(createAdminSystemPrompt(context.toJSON()));
  console.log('\n');
  
  // Step 4: Admin sets date and time
  context.setAppointmentDateTime('2025-06-15', '14:30');
  console.log('STEP 4: After setting date and time');
  console.log(createAdminSystemPrompt(context.toJSON()));
  console.log('\n');
  
  // Step 5: Appointment is created
  context.setAppointmentId('appt:987654');
  console.log('STEP 5: After appointment creation');
  console.log(createAdminSystemPrompt(context.toJSON()));
  console.log('\n');
}

// Run the tests
testPromptGeneration(); 