import { NextResponse } from 'next/server';

// Define the contact interface
interface Contact {
  resourceName: string;
  name: string;
  mobile: string;
  email?: string;
  display?: string;
  createdAt?: string;
  updatedAt?: string;
}

// In-memory storage (in a real app, this would be a database)
let contactsCache: Contact[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache duration

// Helper to normalize phone numbers
function normalizePhone(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // For Singapore numbers, we want the last 8 digits
  if (digits.length >= 8) {
    return digits.slice(-8);
  }
  
  return digits;
}

// Function to fetch contacts from the SOHO API
async function fetchContactsFromSoho(): Promise<Contact[]> {
  console.log('📞 Fetching contacts from SOHO API...');
  
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN || '';
  
  if (!authToken) {
    console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
    return [];
  }
  
  try {
    const query = `{"query":"{contacts{name,mobile,display,resourceName}}"}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: query,
    });
    
    if (!response.ok) {
      console.error(`❌ SOHO API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.data || !data.data.contacts) {
      console.error('❌ Invalid response format from SOHO API:', data);
      return [];
    }
    
    console.log(`✅ Successfully fetched ${data.data.contacts.length} contacts from SOHO API`);
    return data.data.contacts;
    
  } catch (error) {
    console.error('❌ Error fetching contacts from SOHO API:', error);
    return [];
  }
}

// Function to refresh cache if needed and return all contacts
async function getContacts(): Promise<Contact[]> {
  const now = Date.now();
  
  // Check if cache is empty or expired
  if (contactsCache.length === 0 || (now - lastFetchTime > CACHE_DURATION)) {
    console.log('🔄 Cache empty or expired, refreshing contacts from SOHO API');
    
    const contacts = await fetchContactsFromSoho();
    
    if (contacts.length > 0) {
      contactsCache = contacts;
      lastFetchTime = now;
      console.log(`✅ Updated contacts cache with ${contacts.length} records`);
    } else {
      console.warn('⚠️ No contacts returned from SOHO API');
    }
  } else {
    console.log(`📋 Using cached contacts (${contactsCache.length} records, updated ${Math.round((now - lastFetchTime) / 1000 / 60)} minutes ago)`);
  }
  
  return contactsCache;
}

// GET /api/contacts?phone=123456789
export async function GET(request: Request) {
  try {
    // Ensure contacts are loaded
    await getContacts();
    
    // If cache is still empty after trying to load, return an error
    if (contactsCache.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No contacts available - SOHO API may be unavailable' },
        { status: 503 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const resourceName = searchParams.get('resourceName');
    
    // Check if resource name is provided (this takes precedence over phone)
    if (resourceName) {
      console.log(`🔍 Looking up contact with resourceName: "${resourceName}"`);
      const contact = contactsCache.find(c => c.resourceName === resourceName);
      
      if (contact) {
        console.log(`✅ Found resourceName match: ${contact.name}`);
        return NextResponse.json({
          success: true,
          contact
        });
      } else {
        console.log(`❌ No contact found with resourceName: ${resourceName}`);
        return NextResponse.json(
          { success: false, error: 'Contact not found' },
          { status: 404 }
        );
      }
    }
    
    // If no parameters provided, return all contacts
    if (!phone && !resourceName) {
      return NextResponse.json({
        success: true,
        contacts: contactsCache
      });
    }
    
    // Normalize the phone number for comparison
    const normalizedInput = normalizePhone(phone || '');
    const lastEightDigits = normalizedInput.slice(-8);
    
    console.log(`🔍 Looking up contact with normalized phone: "${normalizedInput}", last 8: "${lastEightDigits}"`);
    
    // Try multiple matching strategies
    // 1. Exact match
    let contact = contactsCache.find(c => c.mobile === phone);
    if (contact) {
      console.log(`✅ Found exact match: ${contact.name}`);
      return NextResponse.json({
        success: true,
        contact
      });
    }
    
    // 2. Match after normalizing
    contact = contactsCache.find(c => {
      const contactNormalized = normalizePhone(c.mobile);
      return contactNormalized === normalizedInput;
    });
    
    if (contact) {
      console.log(`✅ Found normalized match: ${contact.name}`);
      return NextResponse.json({
        success: true,
        contact
      });
    }
    
    // 3. Match by last 8 digits (common for Singapore numbers)
    contact = contactsCache.find(c => {
      const contactNormalized = normalizePhone(c.mobile);
      const contactLastEight = contactNormalized.slice(-8);
      return contactLastEight === lastEightDigits;
    });
    
    if (contact) {
      console.log(`✅ Found last-8-digits match: ${contact.name}`);
      return NextResponse.json({
        success: true,
        contact
      });
    }
    
    // No match found
    console.log(`❌ No contact found with phone: ${phone}`);
    return NextResponse.json(
      { success: false, error: 'Contact not found' },
      { status: 404 }
    );
    
  } catch (error) {
    console.error('❌ Error in contacts GET API:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST endpoint - Update to call the SOHO API instead of adding to local cache
export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.name || !data.mobile) {
      return NextResponse.json(
        { success: false, error: 'Name and mobile are required fields' },
        { status: 400 }
      );
    }
    
    console.log(`⚠️ Creating a new contact in the SOHO API is not implemented`);
    console.log(`⚠️ To create real contacts, please use the SOHO dashboard`);
    
    // Return an error to indicate that direct contact creation is not supported
    return NextResponse.json(
      { 
        success: false, 
        error: 'Creating contacts directly via API is not supported',
        message: 'Please use the SOHO dashboard to create new contacts' 
      },
      { status: 501 }
    );
  } catch (error) {
    console.error('❌ Error in contacts POST API:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/contacts - Clear contacts cache
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    
    // Require force parameter for safety
    if (!force) {
      return NextResponse.json(
        { success: false, error: 'Add ?force=true to clear contacts cache' },
        { status: 400 }
      );
    }
    
    // Clear cache
    const count = contactsCache.length;
    contactsCache = [];
    lastFetchTime = 0;
    
    console.log(`🧹 Cleared contacts cache (${count} contacts removed)`);
    
    // Optionally refresh the cache immediately
    const refresh = searchParams.get('refresh') === 'true';
    if (refresh) {
      await getContacts();
      console.log('🔄 Refreshed contacts cache');
    }
    
    return NextResponse.json({
      success: true,
      message: `Contacts cache cleared (${count} removed)${refresh ? ', cache refreshed' : ''}`,
      contactCount: refresh ? contactsCache.length : 0
    });
    
  } catch (error) {
    console.error('❌ Error in contacts DELETE API:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Warm the cache on startup
getContacts().catch(err => console.error('Failed to warm contacts cache:', err));