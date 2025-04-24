import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const CreateContactSchema = z.object({
  first: z.string().describe("Customer's first name"),
  last: z.string().optional().describe("Customer's last name (optional)"),
  mobile: z.string().describe("Customer's mobile number (with or without country code)")
});

export class CreateContactTool extends StructuredTool {
  constructor() {
    super();
    this.name = "createContact";
    this.description = "Create a new customer contact when their mobile number is not found in the system";
    this.schema = CreateContactSchema;
  }

  async _call(inputs) {
    const { first, last, mobile } = inputs;

    // Format the mobile number (ensure it starts with +65 for Singapore)
    let formattedMobile = mobile;
    if (mobile.startsWith("8") || mobile.startsWith("9")) {
      formattedMobile = `+65${mobile}`;
    } else if (mobile.startsWith("65")) {
      formattedMobile = `+${mobile}`;
    } else if (!mobile.startsWith("+")) {
      formattedMobile = `+${mobile}`;
    }

    console.log(`📝 Creating new contact: ${first} ${last || ''} (${formattedMobile})`);

    try {
      // Prepare the GraphQL mutation
      const mutation = {
        query: `
          mutation CreateNewContact($first: String!, $last: String, $mobile: String!) {
            createContact(
              first: $first
              last: $last
              mobile: $mobile
            ) {
              name
              mobile
              resourceName
            }
          }
        `,
        variables: {
          first,
          last: last || null,
          mobile: formattedMobile
        }
      };

      // Get the SOHO API URL and auth token from environment variables
      const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
      const authToken = process.env.SOHO_AUTH_TOKEN;

      if (!authToken) {
        console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
        return JSON.stringify({
          success: false,
          error: 'Missing authentication token for SOHO API'
        });
      }

      // Call the SOHO GraphQL API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
          'X-Api-Key': process.env.SOHO_API_KEY || ''
        },
        body: JSON.stringify(mutation)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ SOHO API error: ${response.status} - ${errorText}`);
        return JSON.stringify({
          success: false,
          error: `API error: ${response.status}`,
          details: errorText
        });
      }

      const result = await response.json();

      // Check for GraphQL errors
      if (result.errors) {
        console.error('❌ GraphQL errors:', result.errors);
        return JSON.stringify({
          success: false,
          error: 'GraphQL errors',
          details: result.errors.map(e => e.message).join(', ')
        });
      }

      // Check if the contact was created successfully
      if (!result.data || !result.data.createContact) {
        console.error('❌ Failed to create contact:', result);
        return JSON.stringify({
          success: false,
          error: 'Failed to create contact',
          details: 'No data returned from API'
        });
      }

      const contact = result.data.createContact;
      console.log(`✅ Contact created successfully:`, contact);

      // Create a custom response object that won't be mistaken for template variables
      // Format the JSON with unique prefixes to avoid template variable issues
      return `CONTACT_CREATED|Name:${contact.name}|Mobile:${contact.mobile}|ResourceName:${contact.resourceName}`;
    } catch (error) {
      console.error('❌ Error creating contact:', error);
      return `ERROR|Message:${error.message}`;
    }
  }
} 