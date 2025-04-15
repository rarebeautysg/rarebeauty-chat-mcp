/**
 * Time parsing utility functions
 */

interface ParsedTime {
  hours: number;
  minutes: number;
}

/**
 * Parse a time string like "3pm" or "15:00" into hours and minutes
 */
export function parseTime(timeStr: string): ParsedTime | null {
  try {
    // Handle different time formats
    if (!timeStr) return null;
    
    const timeLower = timeStr.toLowerCase().trim();
    let hours = 0;
    let minutes = 0;

    // Format like "3pm" or "3:30pm"
    if (timeLower.includes('am') || timeLower.includes('pm')) {
      const isPM = timeLower.includes('pm');
      const timeValue = timeLower.replace('am', '').replace('pm', '').trim();
      
      if (timeValue.includes(':')) {
        const [h, m] = timeValue.split(':');
        hours = parseInt(h, 10);
        minutes = parseInt(m, 10);
      } else {
        hours = parseInt(timeValue, 10);
        minutes = 0;
      }
      
      // Adjust hours for PM
      if (isPM && hours < 12) {
        hours += 12;
      } else if (!isPM && hours === 12) {
        hours = 0;
      }
    } 
    // Format like "15:00"
    else if (timeLower.includes(':')) {
      const [h, m] = timeLower.split(':');
      hours = parseInt(h, 10);
      minutes = parseInt(m, 10);
    } 
    // Format like "15" (just hours)
    else {
      hours = parseInt(timeLower, 10);
      minutes = 0;
    }

    // Validate the parsed values
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return { hours, minutes };
  } catch (error) {
    console.error('Error parsing time:', error);
    return null;
  }
}

/**
 * Format a date and time into a friendly string
 */
export function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
} 