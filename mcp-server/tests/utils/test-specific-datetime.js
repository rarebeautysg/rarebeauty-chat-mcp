const moment = require('moment-timezone');
const chrono = require('chrono-node');

// Set default timezone for Singapore
moment.tz.setDefault('Asia/Singapore');

// Test the specific datetime format that was failing
const datetimeToTest = '20250523T1100';

console.log(`Testing specifically: "${datetimeToTest}"`);

// Our combined approach
let momentDate;
let isValid = false;

// First, try natural language parsing with chrono
try {
  const chronoParsed = chrono.parseDate(datetimeToTest);
  if (chronoParsed) {
    console.log(`✅ Successfully parsed with chrono: ${chronoParsed.toISOString()}`);
    momentDate = moment(chronoParsed);
    isValid = momentDate.isValid();
  } else {
    console.log(`❌ Chrono could not parse this format`);
  }
} catch (e) {
  console.log(`❌ Error with chrono parsing: ${e.message}`);
}

// If chrono fails, try Moment's parsing
if (!isValid) {
  // Check if it's in YYYYMMDDTHHmm format
  if (/^\d{8}T\d{4}$/.test(datetimeToTest)) {
    momentDate = moment(datetimeToTest, "YYYYMMDD[T]HHmm");
    console.log(`✅ Matches YYYYMMDDTHHmm pattern`);
    console.log(`✅ Parsed with Moment using custom format: ${momentDate.format()}`);
    isValid = momentDate.isValid();
  } else {
    // Try standard Moment parsing
    momentDate = moment(datetimeToTest);
    console.log(`✅ Parsed with Moment standard parsing: ${momentDate.format()}`);
    isValid = momentDate.isValid();
  }
}

if (isValid) {
  console.log(`✅ Final result: Valid date`);
  console.log(`✅ Date and time: ${momentDate.format('dddd, MMMM D, YYYY [at] h:mm A')}`);
  console.log(`✅ Formatted for API: ${momentDate.format('YYYYMMDD[T]HHmm')}`);
  console.log(`✅ Is in the future: ${momentDate.isAfter(moment())}`);
} else {
  console.log(`❌ Final result: Invalid date`);
}

// Also test the original example from the error
console.log('\n-----------------------------------\n');
console.log(`Testing the original failing case:`);

const originalDateTime = '20250523T1100';
try {
  const parsed = moment(originalDateTime, "YYYYMMDD[T]HHmm");
  console.log(`✅ Successfully parsed: ${parsed.format()}`);
  console.log(`✅ Is valid: ${parsed.isValid()}`);
  console.log(`✅ Formatted: ${parsed.format('YYYYMMDD[T]HHmm')}`);
  console.log(`✅ JavaScript Date: ${parsed.toDate()}`);
  console.log(`✅ ISO String: ${parsed.toDate().toISOString()}`);
} catch (e) {
  console.log(`❌ Error: ${e.message}`);
} 