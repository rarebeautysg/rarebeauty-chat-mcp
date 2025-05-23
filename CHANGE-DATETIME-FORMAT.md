# Changes to createAppointment Tool Schema

## What Changed
The schema for the `createAppointment` tool has been updated to use a single `datetime` parameter instead of separate `date` and `time` parameters.

## Why the Change
The previous implementation was failing when the LLM passed natural language date and time values like "today" and "10am". The tool wasn't able to properly parse these values, resulting in "Invalid time value" errors.

## New Format
- **Old format:** `date: "today", time: "10:00"`
- **New format:** `datetime: "20231015T1000"` (YYYYMMDDTHHmm)

## Benefits
1. The LLM is better at converting natural language time expressions to structured formats
2. Cleaner implementation in the backend
3. Reduced errors when booking appointments

## Implementation Details
1. Updated the schema to use a single `datetime` field
2. Modified the tool to directly accept the datetime string
3. Added parsing logic to handle both YYYYMMDDTHHmm format and standard JavaScript Date formats
4. Updated all references to the old date/time fields throughout the code

## Testing
Please test by:
1. Making appointments using natural language time expressions
2. Verifying bookings are created correctly in the system

## What to Update in Your Code
If you have any code calling the createAppointment tool directly, update it to use the new `datetime` parameter instead of separate `date` and `time` parameters. 