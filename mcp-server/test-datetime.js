const moment = require('moment-timezone');
const chrono = require('chrono-node');

// Set default timezone for Singapore
moment.tz.setDefault('Asia/Singapore');

// Test function to see how we parse different datetime formats
function testDatetimeParsing(input) {
  console.log(`\nTesting: "${input}"`);
  
  let parsedDate;
  let isNaturalLanguage = false;

  // Check if it's a natural language date expression
  try {
    const chronoParsed = chrono.parseDate(input);
    if (chronoParsed) {
      console.log(`Parsed with chrono: ${chronoParsed.toISOString()}`);
      parsedDate = moment(chronoParsed);
      isNaturalLanguage = true;
    }
  } catch (e) {
    console.log(`Failed to parse with chrono: ${e.message}`);
  }
  
  // If not natural language, try Moment's parsing
  if (!isNaturalLanguage) {
    // Check if the date follows YYYYMMDDTHHmm pattern
    if (/^\d{8}T\d{4}$/.test(input)) {
      console.log(`Matches YYYYMMDDTHHmm pattern`);
      parsedDate = moment(input, 'YYYYMMDD[T]HHmm');
    } else {
      // Try other formats with Moment
      parsedDate = moment(input);
    }
  }
  
  console.log(`Parsed result: ${parsedDate.format('YYYY-MM-DD HH:mm:ss')}`);
  console.log(`Is valid: ${parsedDate.isValid()}`);
  console.log(`Formatted as YYYYMMDDTHHmm: ${parsedDate.format('YYYYMMDD[T]HHmm')}`);
  console.log(`Is in the future: ${parsedDate.isAfter(moment())}`);
}

// Test a variety of datetime formats
const testInputs = [
  '20250523T1100',       // Future date in YYYYMMDDTHHmm format
  '20230523T1100',       // Past date in YYYYMMDDTHHmm format
  'tomorrow 2pm',        // Natural language future
  'tomorrow at 2:30pm',  // Natural language with specific time
  'next Monday at noon', // Natural language day of week
  'May 23rd at 11am',    // Natural language with month and day
  'May 23, 2025 11am',   // Future date with time
  '2023-05-23T11:00:00', // ISO format past
  '2025-05-23T11:00:00', // ISO format future
  'invalid date',        // Invalid input
  '33250523T1100',       // Invalid year in similar format
  '20251330T1100',       // Invalid month
  '20250532T1100',       // Invalid day
  '20250523T2500',       // Invalid hour
];

// Run tests
console.log('===== DATETIME PARSING TESTS =====');
testInputs.forEach(testDatetimeParsing);
console.log('\n===== END OF TESTS ====='); 