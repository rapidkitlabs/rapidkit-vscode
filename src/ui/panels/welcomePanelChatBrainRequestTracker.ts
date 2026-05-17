export function trackChatBrainRequestStart(
  requestId: string | undefined,
  inFlightRequestIds: Set<string>,
  completedRequestIds: string[]
): boolean {
  if (!requestId) {
    return true;
  }
  if (inFlightRequestIds.has(requestId) || completedRequestIds.includes(requestId)) {
    return false;
  }

  inFlightRequestIds.add(requestId);
  return true;
}

export function trackChatBrainRequestComplete(
  requestId: string | undefined,
  inFlightRequestIds: Set<string>,
  completedRequestIds: string[],
  maxCompletedHistory = 240
): void {
  if (!requestId) {
    return;
  }

  inFlightRequestIds.delete(requestId);
  if (!completedRequestIds.includes(requestId)) {
    completedRequestIds.push(requestId);
    if (completedRequestIds.length > maxCompletedHistory) {
      completedRequestIds.splice(0, completedRequestIds.length - maxCompletedHistory);
    }
  }
}
