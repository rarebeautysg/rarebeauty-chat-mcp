/**
 * Represents the result of a tool execution
 */
export interface ToolResult {
  /**
   * Whether the tool execution was successful
   */
  success?: boolean;
  
  /**
   * Error message if the tool execution failed
   */
  error?: string;
  
  /**
   * User resource name, if available from lookup tool
   */
  resourceName?: string;
  
  /**
   * User name, if available from lookup tool
   */
  name?: string;
  
  /**
   * User mobile number, if available from lookup tool
   */
  mobile?: string;
  
  /**
   * Booking ID, if available from booking tool
   */
  bookingId?: string;
  
  /**
   * Success message, if available from booking tool
   */
  message?: string;
  
  /**
   * Any additional properties returned by the tool
   */
  [key: string]: any;
} 