# Numbered Customer Selection Feature

## Overview

The `searchCustomers` tool now supports numbered selection, allowing users to easily select a specific customer from search results by typing a number (1, 2, 3, etc.) instead of having to type the full name again.

## How It Works

### 1. Initial Search
When a user searches for customers by name (e.g., "Anna"), the tool returns a numbered list of matching customers:

```
I found multiple customers with the name "Anna". Could you please provide more details or the customer's mobile number? Here are the customers I found:

1. Adrianna, Mobile: +6587677794
2. Anna, Mobile: +6596794095
3. Anna Chong, Mobile: +6590719905
4. Anna GoLiwag, Mobile: +6596278688
5. Anna Instagram, Mobile: +6597630867
6. Anna Lim, Mobile: +6582685508
7. Anna Lim, Mobile: +6596179292
8. Anna RidheemaLal, Mobile: +6581800458
9. Anna(MB) Azman, Mobile: +6593658986
10. Anna(MB) Kuok, Mobile: +6585560969

Please specify which customer you are referring to.
```

### 2. Numbered Selection
The user can then type just the number (e.g., "9") to select Anna(MB) Azman. The tool will:

- ✅ Detect that the input is a number
- ✅ Validate that the number is within the valid range (1-10 in this example)
- ✅ Select the corresponding customer
- ✅ Automatically load the customer into the session context
- ✅ Clear the previous search results
- ✅ Confirm the selection

## Technical Implementation

### Context Storage
Search results are stored in the session context under:
```javascript
context.memory.tool_usage.searchCustomers_lastResults = [
  { name, mobile, resourceName, display },
  // ... more results
]
```

### Selection Logic
1. **Number Detection**: Uses regex `/^\d+$/` to detect if input is purely numeric
2. **Validation**: Checks if the number is between 1 and the number of available results
3. **Context Update**: Automatically updates `context.memory.user_info` and `context.identity`
4. **Cleanup**: Removes the stored results after successful selection

### Error Handling
- **Invalid Range**: "Please select a number between 1 and X"
- **No Previous Results**: "No previous search results found. Please search for a customer by name first"
- **Non-numeric Input**: Treats as a new search term

## API Response Format

### Successful Selection
```json
{
  "success": true,
  "message": "Selected customer: Anna(MB) Azman",
  "selectedCustomer": {
    "name": "Anna(MB) Azman",
    "mobile": "+6593658986",
    "resourceName": "people/C009",
    "display": "Anna(MB) Azman"
  },
  "action": "customer_selected"
}
```

### Invalid Selection
```json
{
  "success": false,
  "error": "Invalid selection",
  "message": "Please select a number between 1 and 10, or search for a different customer.",
  "availableOptions": 10,
  "results": []
}
```

## User Experience Benefits

### For Admins
- **Faster Customer Selection**: No need to type long names or mobile numbers
- **Reduced Errors**: Eliminates typos when selecting customers
- **Clear Visual Reference**: Numbered list makes it easy to track options

### For Customers
- **Simplified Interaction**: Just type a number to select
- **Immediate Confirmation**: Clear feedback on selection
- **Error Recovery**: Helpful messages for invalid selections

## Integration with Chat Flow

The numbered selection integrates seamlessly with the existing chat flow:

1. **Search Phase**: `searchCustomers` returns numbered results
2. **Selection Phase**: User types number, customer is loaded automatically
3. **Booking Phase**: System proceeds with the selected customer context
4. **Confirmation**: Admin/customer can proceed with appointment booking

## Example Conversation Flow

```
Admin: Anna
Bot: I found multiple customers with the name "Anna"... [shows numbered list]
Admin: 9
Bot: Selected customer: Anna(MB) Azman (+6593658986). How can I assist you with this customer today?
Admin: Book facial appointment
Bot: [proceeds with booking flow using Anna(MB) Azman's details]
```

## Code Structure

### Main Implementation
- **File**: `src/tools/searchCustomers.js`
- **Function**: `_call({ name, limit })` 
- **Logic**: Detects numbers vs. names and handles accordingly

### Testing
- **Mock Test**: `test-numbered-selection-mock.js`
- **Integration Test**: `test-numbered-selection.js` (requires API)

### Documentation Updates
- **Admin Prompt**: Updated to mention numbered selection capability
- **Tool Description**: Enhanced to explain the numbered selection feature

## Future Enhancements

Potential improvements for this feature:
- **Range Selection**: Allow "1-3" to select multiple customers
- **Fuzzy Selection**: Handle typos in numbers (e.g., "9o" → "9")
- **Recent Selections**: Remember recently selected customers across sessions
- **Keyboard Shortcuts**: Add quick selection via keyboard shortcuts in the UI 