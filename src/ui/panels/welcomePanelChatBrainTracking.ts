/**
 * Chat brain request tracking state management helpers.
 * These helpers manage in-flight and completed request tracking with pure state transitions.
 */

/**
 * Initialize or get the set of in-flight request IDs.
 * Returns a copy to prevent external mutation.
 *
 * @param inFlightRequestIds - Current in-flight set
 * @returns Copy of current in-flight set
 */
export function getInFlightRequestIds(inFlightRequestIds: Set<string>): Set<string> {
  return new Set(inFlightRequestIds);
}

/**
 * Initialize or get the set of completed request IDs.
 * Returns a copy to prevent external mutation.
 *
 * @param completedRequestIds - Current completed set
 * @returns Copy of current completed set
 */
export function getCompletedRequestIds(completedRequestIds: Set<string>): Set<string> {
  return new Set(completedRequestIds);
}

/**
 * Track the start of a chat brain request.
 * Returns true if request was added to in-flight tracking, false if already tracked.
 *
 * @param requestId - The request ID to track (optional)
 * @param inFlightRequestIds - Current in-flight tracking set (mutated by this function)
 * @returns true if request was newly added to tracking, false if undefined or already tracked
 */
export function trackChatBrainRequestStart(
  requestId: string | undefined,
  inFlightRequestIds: Set<string>
): boolean {
  if (!requestId || inFlightRequestIds.has(requestId)) {
    return false;
  }
  inFlightRequestIds.add(requestId);
  return true;
}

/**
 * Track the completion of a chat brain request.
 * Moves request from in-flight to completed tracking.
 *
 * @param requestId - The request ID to mark as completed (optional)
 * @param inFlightRequestIds - Current in-flight tracking set (mutated by this function)
 * @param completedRequestIds - Current completed tracking set (mutated by this function)
 */
export function trackChatBrainRequestComplete(
  requestId: string | undefined,
  inFlightRequestIds: Set<string>,
  completedRequestIds: Set<string>
): void {
  if (!requestId) {
    return;
  }
  inFlightRequestIds.delete(requestId);
  completedRequestIds.add(requestId);
}

/**
 * Check if a request is currently in-flight (not yet completed).
 *
 * @param requestId - The request ID to check
 * @param inFlightRequestIds - Current in-flight tracking set
 * @returns true if request is in-flight
 */
export function isRequestInFlight(requestId: string, inFlightRequestIds: Set<string>): boolean {
  return inFlightRequestIds.has(requestId);
}

/**
 * Check if a request has been completed.
 *
 * @param requestId - The request ID to check
 * @param completedRequestIds - Current completed tracking set
 * @returns true if request is completed
 */
export function isRequestCompleted(requestId: string, completedRequestIds: Set<string>): boolean {
  return completedRequestIds.has(requestId);
}
