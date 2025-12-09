/**
 * Console-specific types shared across multiple components
 */

/**
 * Log message interface representing a logged interaction
 * Used by console components and hooks for consistent data handling
 */
export interface LogMessage {
  id: string;
  request?: any;
  response?: any;
}