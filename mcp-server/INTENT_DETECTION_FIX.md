# Intent Detection & Service Mapping Fixes

## 🚨 **Issues Resolved**

### 1. **Intent Detection Problem**
**Issue**: When user said "book for monday 26th Jan at 10am", the system treated it as an UPDATE instead of a NEW BOOKING because `current_appointment_id` existed in memory from previous lookups.

**Root Cause**: Multiple tools (`lookupAndHistory`, `updateAppointment`, `getAppointment`) automatically set `current_appointment_id` in memory, but there was no mechanism to clear it when a new booking intent was detected.

**Solution**: Added `clearAppointmentContextForNewBooking()` function that:
- Detects explicit booking intent ("book for", "schedule", etc.)
- Clears `current_appointment_id`, `current_appointment`, and `last_appointment` from memory
- Preserves customer info for the new booking
- Prioritizes booking intent over existing appointment context

### 2. **Service Mapping Problem**
**Issue**: The `updateAppointment` tool received service **names** like `"Lashes - Full Set - Dense,Lashes - Eye Mask"` instead of proper service **IDs** like `"service:123,service:456"`, causing GraphQL errors.

**Root Cause**: The system was passing service names directly to the GraphQL API which expects service IDs in `service:XXX` format.

**Solution**: Enhanced `updateAppointment` tool with intelligent service name mapping:
- Detects when input looks like service names vs service IDs
- Automatically maps service names to proper service IDs using `getAllFormattedServices()`
- Uses fuzzy matching (case-insensitive, partial match) to find services
- Falls back gracefully with clear error messages

## ✅ **Technical Implementation**

### Intent Detection Flow (Fixed)
```javascript
// NEW Priority Order:
1. Cancel intent → Use CANCEL prompt
2. Booking intent → Clear context + Use CREATE prompt  
3. Update intent (with appointment ID) → Use UPDATE prompt
4. No customer → Use WELCOME prompt  
5. Default → Use CREATE prompt
```

### Service Mapping Enhancement
```javascript
// Before (Broken)
serviceIds: "Lashes - Full Set - Dense,Lashes - Eye Mask"  // ❌ Names
→ GraphQL Error: Cannot read properties of undefined (reading 'index')

// After (Fixed)  
serviceIds: "Lashes - Full Set - Dense,Lashes - Eye Mask"  // Input names
→ Auto-mapped to: ["service:1-2024", "service:2-2024"]    // ✅ Proper IDs
→ Successful GraphQL mutation
```

### Context Clearing Logic
```javascript
function clearAppointmentContextForNewBooking(context) {
  if (appointmentId) {
    console.log(`🧹 Clearing appointment context due to new booking intent (was: ${appointmentId})`);
    delete context.memory.current_appointment_id;
    delete context.memory.current_appointment;  
    delete context.memory.last_appointment;
    // Keep user_info for same customer booking
  }
}
```

## 🎯 **Test Results**

### Modular Prompt Test
```
📋 Test 5: Booking Intent with Existing Appointment ID
🔄 Intent detection - Booking: true, Update: false, Cancel: false
🔄 Using CREATE prompt due to explicit booking intent
🧹 Clearing appointment context due to new booking intent (was: appt:abc123)
✅ Cleared appointment context while preserving customer info
```

### Expected Behavior Now
1. **User says**: "book for monday 26th Jan at 10am"
2. **System detects**: Booking intent = true
3. **System clears**: Previous appointment context
4. **System uses**: CREATE prompt (not UPDATE)
5. **Service mapping**: Automatic name → ID conversion
6. **Result**: New appointment created successfully

## 🔧 **Files Modified**

1. **`src/prompts/admin/index.js`**
   - Added `clearAppointmentContextForNewBooking()` function
   - Modified `determinePromptType()` to prioritize booking intent
   - Added context clearing when booking intent detected

2. **`src/tools/updateAppointment.js`**  
   - Enhanced service ID processing with name mapping
   - Added fuzzy service name matching using `getAllFormattedServices()`
   - Better error handling for service mapping failures

## 🎉 **Benefits Achieved**

1. **Accurate Intent Recognition**: "book for" now correctly triggers new bookings
2. **Automatic Context Management**: Old appointment context is cleared appropriately  
3. **Robust Service Mapping**: Handles both service names and IDs seamlessly
4. **Better Error Messages**: Clear feedback when service mapping fails
5. **Preserved Customer Context**: User info is kept for the new booking

The system now correctly distinguishes between:
- **New bookings**: "book for monday" → Creates new appointment
- **Updates**: "update the appointment to 3pm" → Updates existing appointment
- **Service flexibility**: Accepts both "Lashes - Full Set" and "service:123" 