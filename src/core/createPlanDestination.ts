import path from 'node:path';

import type { AICreationPlan } from './aiService.js';

/**
 * Make the plan shown to the user name the destination the controller will
 * actually mutate. Workspace plans retain their proposed new name. Project
 * plans replace the model's unused workspace suggestion with the active
 * selected workspace identity.
 */
export function bindCreatePlanDestination(
  plan: AICreationPlan,
  selection: { workspacePath?: string; workspaceName?: string }
): AICreationPlan {
  if (plan.type === 'workspace') {
    return plan;
  }
  const workspacePath = selection.workspacePath?.trim();
  if (!workspacePath) {
    throw new Error('Project creation requires an active selected workspace.');
  }
  const selectedName = selection.workspaceName?.trim();
  return {
    ...plan,
    workspaceName: selectedName || path.basename(path.normalize(workspacePath)),
  };
}
