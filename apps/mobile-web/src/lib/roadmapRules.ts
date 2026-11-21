import type { NodeVisualStatus } from './graphLayout';

/**
 * Evaluates the visual status for a node given its user status and prerequisite satisfaction.
 * PRD Section 8.1 & 11.3:
 * A node is 'available' if all prerequisites are satisfied (known/completed/archived);
 * otherwise it is 'locked'.
 */
export function computeNodeVisualStatus(
  rawStatus: string,
  prereqIds: string[],
  userNodeMap: Map<string, { status: string }>,
): NodeVisualStatus {
  if (rawStatus === 'archived') return 'archived';
  if (rawStatus === 'completed') return 'completed';
  if (rawStatus === 'known') return 'completed'; // PRD treats known as satisfied
  if (rawStatus === 'in_progress') return 'in_progress';

  // For 'todo' nodes, check if all direct prerequisites are satisfied
  const allPrereqsSatisfied = prereqIds.every((predId) => {
    const pred = userNodeMap.get(predId);
    if (!pred) return false;
    return pred.status === 'known' || pred.status === 'completed' || pred.status === 'archived';
  });

  return allPrereqsSatisfied ? 'available' : 'locked';
}

/**
 * Validates whether a status transition is permitted.
 * PRD 11.3: Completing a locked node is blocked (prerequisites must be met first).
 */
export function canTransitionToStatus(
  targetStatus: string,
  visualStatus: NodeVisualStatus,
  prereqNames: string[],
): { allowed: boolean; reason?: string } {
  if (visualStatus === 'locked' && (targetStatus === 'completed' || targetStatus === 'in_progress')) {
    return {
      allowed: false,
      reason: `Cannot start or complete this node yet. Outstanding prerequisites: ${
        prereqNames.length > 0 ? prereqNames.join(', ') : 'Unmet foundational skills'
      }.`,
    };
  }
  return { allowed: true };
}
