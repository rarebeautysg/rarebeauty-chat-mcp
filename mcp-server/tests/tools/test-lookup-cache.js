// Test script to debug the contacts cache initialization in the lookupUser tool
const axios = require('axios');
require('dotenv').config(); // Load environment variables

// Import the fetchContactsFromSoho function
// But we'll reimplement it since we can't directly import it
async function fetchContactsFromSoho() {
  console.log('📞 Fetching contacts from SOHO API...');
  
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN || '';
  
  if (!authToken) {
    console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
    return [];
  }

  try {
    const query = `{"query":"{contacts{name,mobile,display,resourceName}}"}`;
    
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
    
    if (response.status !== 200) {
      console.error(`❌ SOHO API error: ${response.status}`);
      return [];
    }
    
    const data = response.data;
    
    if (!data.data || !data.data.contacts) {
      console.error('❌ Invalid response format from SOHO API:', data);
      return [];
    }
    
    console.log(`✅ Successfully fetched ${data.data.contacts.length} contacts from SOHO API`);
    return data.data.contacts;
    
  } catch (error) {
    console.error('❌ Error fetching contacts from SOHO API:', error);
    console.log('Error details:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Headers:', error.response.headers);
      console.log('Data:', error.response.data);
    } else if (error.request) {
      console.log('No response received');
    } else {
      console.log('Error message:', error.message);
    }
    if (error.code) {
      console.log('Error code:', error.code);
    }
    return [];
  }
}

// Simulate the cache initialization process
async function simulateContactsCacheInit() {
  console.log('Simulating contacts cache initialization...');
  
  // First, check environment variables
  console.log('\n== Environment Variables ==');
  console.log('SOHO_API_URL:', process.env.SOHO_API_URL || 'https://api.soho.sg/graphql');
  console.log('SOHO_AUTH_TOKEN present:', process.env.SOHO_AUTH_TOKEN ? 'Yes' : 'No');
  
  // Test the connection with setTimeout to simulate what happens in the tool
  console.log('\n== API Connection Test with setTimeout (warm-up) ==');
  
  // Simulate the warm-up call that happens in the constructor
  const warmupPromise = fetchContactsFromSoho().catch(err => {
    console.error('Failed to warm contacts cache:', err);
    return [];
  });
  
  // Wait for 2 seconds to simulate what happens during server startup
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Now try the "real" call that would happen when a user makes a request
  console.log('\n== Actual API Call Simulation ==');
  try {
    const contacts = await fetchContactsFromSoho();
    if (contacts.length > 0) {
      console.log(`✅ Cache would be populated with ${contacts.length} contacts`);
      
      // Check if our test phone number is in the contacts
      const testPhoneNumber = '93663631';
      const normalizedTest = testPhoneNumber.replace(/\D/g, '');
      
      console.log(`\nLooking for test phone number: ${testPhoneNumber}`);
      
      // Try exact match
      const exactMatch = contacts.find(c => c && c.mobile === testPhoneNumber);
      if (exactMatch) {
        console.log(`✅ Found exact match: ${exactMatch.name}, ${exactMatch.mobile}`);
      } else {
        console.log('❌ No exact match found');
      }
      
      // Try with country code
      const withCountryCode = contacts.find(c => c && c.mobile === `+65${testPhoneNumber}`);
      if (withCountryCode) {
        console.log(`✅ Found with country code: ${withCountryCode.name}, ${withCountryCode.mobile}`);
      } else {
        console.log('❌ No match with country code found');
      }
      
      // Try normalized
      const normalizedMatch = contacts.find(c => {
        if (!c || !c.mobile) return false;
        const contactDigits = c.mobile.replace(/\D/g, '');
        const lastEight = contactDigits.slice(-8);
        return lastEight === normalizedTest;
      });
      
      if (normalizedMatch) {
        console.log(`✅ Found normalized match: ${normalizedMatch.name}, ${normalizedMatch.mobile}`);
      } else {
        console.log('❌ No normalized match found');
      }
    } else {
      console.error('❌ API returned empty contact list, cache would be empty');
    }
  } catch (error) {
    console.error('❌ Error fetching contacts:', error);
  }
  
  // Check the warmup result
  console.log('\n== Warmup Result ==');
  try {
    const warmupContacts = await warmupPromise;
    console.log(`Warmup call returned ${warmupContacts.length} contacts`);
  } catch (error) {
    console.error('Warmup call failed:', error);
  }
}

// Run the simulation
simulateContactsCacheInit(); 