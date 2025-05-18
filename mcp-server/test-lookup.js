// Simple test script for the lookupUser tool
const axios = require('axios');
require('dotenv').config(); // Load environment variables

// Print out environment variables (without sensitive content)
console.log('Environment variables:');
console.log('- SOHO_API_URL:', process.env.SOHO_API_URL || 'https://api.soho.sg/graphql');
console.log('- SOHO_AUTH_TOKEN:', process.env.SOHO_AUTH_TOKEN ? '[Set]' : '[Not Set]');

// Test connection to SOHO API
async function testSohoConnection() {
  console.log('\nTesting connection to SOHO API...');
  
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN || '';
  
  if (!authToken) {
    console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
    return false;
  }

  try {
    // Simple query to test connection
    const query = `{"query":"{contacts{name}}"}`;
    
    console.log('Sending request to:', apiUrl);
    
    const response = await axios.post(apiUrl, 
      JSON.parse(query),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        }
      }
    );
    
    console.log('Response status:', response.status);
    
    if (response.status !== 200) {
      console.error(`❌ SOHO API error: ${response.status}`);
      return false;
    }
    
    const data = response.data;
    console.log('Response data structure:', Object.keys(data));
    
    if (!data.data || !data.data.contacts) {
      console.error('❌ Invalid response format from SOHO API:', JSON.stringify(data, null, 2));
      return false;
    }
    
    console.log(`✅ Successfully connected to SOHO API and fetched ${data.data.contacts.length} contacts`);
    
    // Show a sample of the contacts (first 3)
    if (data.data.contacts.length > 0) {
      console.log('\nSample contacts:');
      data.data.contacts.slice(0, 3).forEach((contact, i) => {
        console.log(`${i+1}. Name: ${contact.name}`);
      });
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Error connecting to SOHO API:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error message:', error.message);
    }
    return false;
  }
}

// Run the test
testSohoConnection()
  .then(success => {
    console.log('\nTest completed. Connection successful:', success ? 'Yes' : 'No');
    if (!success) {
      console.log('\nTroubleshooting suggestions:');
      console.log('1. Check that the SOHO_AUTH_TOKEN is set correctly in your .env file');
      console.log('2. Verify that the SOHO API server is running and accessible');
      console.log('3. Check network connectivity between your server and the SOHO API');
      console.log('4. If using a VPN or proxy, ensure it\'s not blocking the connection');
    }
  })
  .catch(err => {
    console.error('Unexpected error during test:', err);
  }); 