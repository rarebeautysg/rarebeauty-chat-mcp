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

      // Call your backend API
      console.log(`🔄 Making API call to /api/contacts with phoneNumber: ${phoneNumber}`);
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber }),
      });

      console.log(`🔄 API response status: ${response.status}`);
      const result = await response.json();
      console.log(`🔄 API response body:`, result);

      if (!response.ok) {
        console.error(`❌ API error: ${response.status}`, result);
        throw new Error(result.error || `API error: ${response.status}`);
      }

      if (result.error) {
        console.log(`❌ No contact found for phone: ${phoneNumber}`);
        return JSON.stringify({ error: result.error });
      }

      console.log(`✅ Found contact: ${result.name} (${result.mobile}) ${result.resourceName}`);
      return JSON.stringify({
        resourceName: result.resourceName,
        name: result.name,
        mobile: result.mobile,
        display: result.display || result.name
      });

    } catch (error) {
      console.error('❌ Error in lookupUser tool:', error);
      return JSON.stringify({
        error: "Failed to lookup user",
        message: error.message
      });
    }
  }
}
