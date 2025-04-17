import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export class LookupUserTool extends StructuredTool {
  constructor() {
    super();
    this.name = "lookupUser";
    this.description = "Find a user by Singapore phone number";
    this.schema = z.object({
      phoneNumber: z.string().describe("Singapore mobile number to lookup"),
    });
  }

  async _call({ phoneNumber }) {
    console.log(`🚨 LOOKUP TOOL TRIGGERED 🚨`);
    console.log(`📞 Looking up user by phone: ${phoneNumber}`);

    try {
      // Normalize the phone number
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      const lastEightDigits = normalizedPhone.slice(-8);

      console.log(`📱 Original phone: "${phoneNumber}"`);
      console.log(`📱 Normalized: "${normalizedPhone}"`);
      console.log(`📱 Last 8 digits: "${lastEightDigits}"`);
      
      // Get the base URL
      let baseUrl = '';
      if (typeof window !== 'undefined') {
        baseUrl = window.location.origin;
      } else {
        baseUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
      }
      
      // Call our contacts API
      const apiUrl = `${baseUrl}/api/contacts?phone=${encodeURIComponent(phoneNumber)}`;
      console.log(`🔄 Making contacts API call to ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        console.log(`❌ No contact found for phone: ${phoneNumber}`);
        
        // Simply return the error without creating a new contact
        return JSON.stringify({ 
          error: "No contact found with the provided phone number",
          message: "Please ensure the phone number is correct or contact support to add this customer to the system."
        });
      }
      
      // Return the contact information
      const contact = data.contact;
      console.log(`✅ Found contact: ${contact.name} (${contact.mobile})`);
      
      return JSON.stringify({
        resourceName: contact.resourceName,
        name: contact.name,
        mobile: contact.mobile
      });
    } catch (error) {
      console.error('❌ Error in lookupUser tool:', error);
      return JSON.stringify({
        error: "Failed to lookup user",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
}