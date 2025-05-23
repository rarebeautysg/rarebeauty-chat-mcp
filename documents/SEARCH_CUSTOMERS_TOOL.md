# SearchCustomers Tool

## Overview

The `SearchCustomers` tool allows you to search for customers by name using the SOHO API. This tool is designed to help both admins and customers find customer records based on partial or full name matches.

## New Feature: Numbered Selection

**Important**: This tool now supports **numbered selection**! When multiple customers are found, users can type a number (1, 2, 3, etc.) to select a specific customer from the list.

### Example Usage
1. Search: Type "Anna" → Get numbered list of customers
2. Select: Type "9" → Automatically select customer #9 from the list
3. Proceed: Continue with booking for the selected customer

## Features

- **Name-based search**: Search customers using partial or full names
- **Numbered selection**: Select customers by typing their list number
- **Case-insensitive matching**: Searches are not case-sensitive
- **Configurable limits**: Control the number of results returned
- **Comprehensive error handling**: Robust error messages for various failure scenarios
- **Usage tracking**: Tracks search usage in the session context
- **Index consistency**: Ensures displayed and stored results are in the same order

## API Integration

The tool integrates with the SOHO API at `api.soho.sg` and uses the following GraphQL query:

```graphql
{
  contacts {
    name
    mobile
    resourceName
  }
}
```

**Note**: The `display` field has been excluded from the query because some contacts have `null` values for this field, which causes GraphQL errors since it's marked as non-nullable in the schema. The tool uses the `name` field as the display value instead.

## Index Fix (v2.0)

**Fixed Issue**: Previously, there was a potential index mismatch between displayed results and stored results. This has been resolved by:

- Using identical mapping logic for both display and storage
- Adding comprehensive debug logging to track result ordering
- Ensuring consistent array ordering between what users see and what gets selected

### Debug Logging

The tool now includes detailed logging for troubleshooting:

```
📋 Storing result 1: Adrianna - +6587677794
📋 Storing result 2: Anna - +6596794095
...
📋 Storing result 9: Anna(MB) Azman - +6593658986
📋 Storing result 10: Anna(MB) Kuok - +6585560969

🔢 Detected numbered selection: 9
✅ User selected index 9, accessing array index 8
✅ Selected customer: Anna(MB) Azman (+6593658986)
```

## Parameters

- **name** (required): Customer's name or partial name to search for (minimum 2 characters)
- **limit** (optional): Maximum number of results to return (default: 10)

## Response Format

### Successful Response
```json
{
  "success": true,
  "message": "Found 3 customers matching \"john\"",
  "resultsCount": 3,
  "totalMatches": 5,
  "searchTerm": "john",
  "results": [
    {
      "name": "John Smith",
      "mobile": "+6591234567",
      "display": "John Smith",
      "resourceName": "people/abc123"
    }
  ]
}
```

### Error Response
```json
{
  "success": false,
  "error": "Search query too short",
  "message": "Please provide at least 2 characters to search for customers.",
  "results": []
}
```

## Usage Examples

### Basic Search
```javascript
const searchTool = createSearchCustomersTool(context, sessionId);
const result = await searchTool._call({ name: "john" });
```

### Search with Limit
```javascript
const result = await searchTool._call({ 
  name: "mary", 
  limit: 5 
});
```

## Error Handling

The tool handles various error scenarios:

1. **Short search queries**: Requires minimum 2 characters
2. **API authentication errors**: Missing or invalid SOHO_AUTH_TOKEN
3. **Network errors**: Connection issues with the SOHO API
4. **GraphQL errors**: API-level errors from the SOHO service
5. **Invalid response format**: Unexpected API response structure

## Environment Variables

Required environment variables:
- `SOHO_API_URL`: The SOHO GraphQL API endpoint (default: https://api.soho.sg/graphql)
- `SOHO_AUTH_TOKEN`: Authentication token for the SOHO API
- `SOHO_API_KEY`: Optional API key for additional authentication

## Integration

The tool is automatically registered in the MCP system when the server starts. It's available to both admin and customer users and can be invoked through the chat interface.

### Tool Registration

The tool is registered in `/src/tools/index.js` and included in the MCP context tools list in `/server.js`.

## Testing

Run the test script to verify the tool functionality:

```bash
node test-search-customers.js
```

The test script will:
1. Check environment variables
2. Create a tool instance
3. Run various search scenarios
4. Display results and error handling

## Performance Considerations

- The tool fetches all contacts from the SOHO API and performs client-side filtering
- Consider implementing server-side search in the future for better performance with large datasets
- Results are limited to prevent overwhelming the client interface

## Security

- All API calls are authenticated using the SOHO_AUTH_TOKEN
- Input validation prevents excessively short search queries
- Error messages are sanitized to avoid exposing sensitive information 