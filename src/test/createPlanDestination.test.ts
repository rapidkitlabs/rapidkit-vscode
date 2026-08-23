import { describe, expect, it } from 'vitest';

import type { AICreationPlan } from '../core/aiService.js';
import { bindCreatePlanDestination } from '../core/createPlanDestination.js';

const workspacePlan: AICreationPlan = {
  type: 'workspace',
  workspaceName: 'product-platform-wsp',
  profile: 'node-only',
  installMethod: 'auto',
  framework: 'nextjs',
  kit: 'frontend.nextjs',
  projectName: 'product-dashboard',
  suggestedModules: [],
  description: 'Product dashboard.',
};

describe('Create plan destination', () => {
  it('preserves the proposed destination for a new workspace', () => {
    expect(
      bindCreatePlanDestination(workspacePlan, {
        workspacePath: '$ACTIVE_WORKSPACE',
        workspaceName: 'unrelated-active-workspace',
      })
    ).toBe(workspacePlan);
  });

  it('replaces an unused model suggestion with the selected project destination', () => {
    expect(
      bindCreatePlanDestination(
        { ...workspacePlan, type: 'project', workspaceName: 'unused-model-suggestion-wsp' },
        { workspacePath: '$ACTIVE_WORKSPACE', workspaceName: 'workspai' }
      )
    ).toMatchObject({ type: 'project', workspaceName: 'workspai' });
  });

  it('fails before approval when a project has no selected destination', () => {
    expect(() => bindCreatePlanDestination({ ...workspacePlan, type: 'project' }, {})).toThrow(
      'requires an active selected workspace'
    );
  });
});
