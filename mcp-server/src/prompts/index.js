// Export system prompt creators from one centralized file
const { createSystemPrompt: createAdminSystemPrompt } = require('./systemPrompt-admin');
const { createSystemPrompt: createCustomerSystemPrompt } = require('./systemPrompt-customer');

module.exports = {
  createAdminSystemPrompt,
  createCustomerSystemPrompt
}; 