// Test script for looking up a specific phone number
const axios = require('axios');
require('dotenv').config(); // Load environment variables

// Phone number to test with
const testPhoneNumber = '93663631';

// Function to normalize phone numbers (copied from lookupUser.js)
function normalizePhone(phone) {
  if (!phone) {
    console.warn('⚠️ Received empty phone number in normalizePhone');
    return '';
  }
  
  const phoneStr = String(phone);
  const digits = phoneStr.replace(/\D/g, '');
  
  if (digits.length >= 8) {
    return digits.slice(-8);
  }
  
  return digits;
}

// Test SOHO API and lookup specific number
async function testSpecificLookup(phoneNumber) {
  console.log(`Testing lookup for phone number: ${phoneNumber}`);
  console.log(`Normalized phone: ${normalizePhone(phoneNumber)}`);
  
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN || '';
  
  if (!authToken) {
    console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
    return;
  }

  try {
    // Query to get all contacts with their phone numbers
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
      return;
    }
    
    const data = response.data;
    
    if (!data.data || !data.data.contacts) {
      console.error('❌ Invalid response format from SOHO API');
      return;
    }
    
    const contacts = data.data.contacts;
    console.log(`✅ Successfully fetched ${contacts.length} contacts from SOHO API`);
    
    // Check for null or undefined entries in the contacts array
    const nullContacts = contacts.filter(c => c === null || c === undefined).length;
    if (nullContacts > 0) {
      console.warn(`⚠️ Found ${nullContacts} null/undefined entries in contacts array`);
    }
    
    // Check for contacts missing mobile field
    const missingMobile = contacts.filter(c => c && !c.mobile).length;
    if (missingMobile > 0) {
      console.warn(`⚠️ Found ${missingMobile} contacts without mobile field`);
    }
    
    // Normalize the phone number for comparison
    const normalizedInput = normalizePhone(phoneNumber);
    const lastEightDigits = normalizedInput.slice(-8);
    
    console.log('\nTrying lookup strategies:');
    
    // 1. Try exact match
    console.log('\n1. Exact match:');
    let contact = contacts.find(c => c && c.mobile === phoneNumber);
    if (contact) {
      console.log(`✅ Found exact match: ${JSON.stringify(contact, null, 2)}`);
    } else {
      console.log('❌ No exact match found');
    }
    
    // 2. Try normalized match
    console.log('\n2. Normalized match:');
    contact = contacts.find(c => {
      if (!c || !c.mobile) return false;
      const contactNormalized = normalizePhone(c.mobile);
      return contactNormalized === normalizedInput;
    });
    
    if (contact) {
      console.log(`✅ Found normalized match: ${JSON.stringify(contact, null, 2)}`);
    } else {
      console.log('❌ No normalized match found');
    }
    
    // 3. Try last 8 digits match
    console.log('\n3. Last 8 digits match:');
    contact = contacts.find(c => {
      if (!c || !c.mobile) return false;
      const contactNormalized = normalizePhone(c.mobile);
      const contactLastEight = contactNormalized.slice(-8);
      return contactLastEight === lastEightDigits;
    });
    
    if (contact) {
      console.log(`✅ Found last-8-digits match: ${JSON.stringify(contact, null, 2)}`);
    } else {
      console.log('❌ No last-8-digits match found');
    }
    
    // 4. Try partial match (debug only)
    console.log('\n4. Partial match (for debugging):');
    const partialMatches = contacts.filter(c => {
      if (!c || !c.mobile) return false;
      return c.mobile.includes(lastEightDigits.slice(-4));
    }).slice(0, 5); // Limit to first 5 matches
    
    if (partialMatches.length > 0) {
      console.log(`✅ Found ${partialMatches.length} partial matches containing last 4 digits`);
      partialMatches.forEach((match, i) => {
        console.log(`Match ${i+1}: ${match.name}, Mobile: ${match.mobile}`);
      });
    } else {
      console.log('❌ No partial matches found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testSpecificLookup(testPhoneNumber); 