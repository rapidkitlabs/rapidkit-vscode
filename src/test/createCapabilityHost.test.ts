import { describe, expect, it, vi } from 'vitest';

import {
  CREATE_CAPABILITY_TOOL_NAMES,
  CREATE_CAPABILITY_TOOLS,
  runCreateCapabilityPlanning,
  type CreateCapabilityModelAction,
} from '../core/createCapabilityHost.js';

function tool(toolName: string, input: Record<string, unknown> = {}): CreateCapabilityModelAction {
  return {
    type: 'tool',
    provider: 'test-model',
    callId: `call-${toolName}-${nextCallId++}`,
    toolName,
    input,
  };
}

let nextCallId = 0;

const submittedPlan = {
  workspaceName: 'shop-platform-wsp',
  profile: 'node-only',
  installMethod: 'auto',
  framework: 'nextjs',
  kit: 'frontend.nextjs',
  projectName: 'shop-app',
  suggestedModules: [],
  description: 'A reviewable storefront workspace with conservative defaults.',
  secondaryProject: {
    framework: 'nestjs',
    kit: 'nestjs.standard',
    projectName: 'shop-api',
  },
};

describe('Create capability host', () => {
  it('requires portable context and canonical capabilities before accepting a plan', async () => {
    const actions = [
      tool(CREATE_CAPABILITY_TOOL_NAMES.inspectContext),
      tool(CREATE_CAPABILITY_TOOL_NAMES.listCapabilities),
      tool(CREATE_CAPABILITY_TOOL_NAMES.recommendArchitecture, {
        outcome: 'Create a web app for my shop.',
        shape: 'full-stack',
      }),
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, submittedPlan),
    ];
    const callModel = vi.fn(async () => actions.shift()!);

    const result = await runCreateCapabilityPlanning({
      context: {
        request: 'Create a web app for my shop.',
        selectedTarget: 'workspace',
        stackFocus: 'Any stack',
        workspaceAvailable: false,
      },
      callModel,
    });

    expect(result).toMatchObject({
      status: 'submitted',
      provider: 'test-model',
      draft: submittedPlan,
      turns: 4,
    });
    expect(callModel).toHaveBeenCalledTimes(4);
  });

  it('teaches the model that delegated full-stack topology should remain node-only', async () => {
    const actions = [
      tool(CREATE_CAPABILITY_TOOL_NAMES.inspectContext),
      tool(CREATE_CAPABILITY_TOOL_NAMES.listCapabilities),
      tool(CREATE_CAPABILITY_TOOL_NAMES.recommendArchitecture, {
        outcome: 'I want to create a shop.',
        shape: 'full-stack',
      }),
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, submittedPlan),
    ];
    const observations: string[] = [];

    await runCreateCapabilityPlanning({
      context: {
        request: 'I want to create a shop.',
        selectedTarget: 'workspace',
        workspaceAvailable: false,
      },
      callModel: async (messages) => {
        const latest = messages.at(-1);
        if (latest && 'toolResult' in latest) {
          observations.push(latest.toolResult.content);
        }
        return actions.shift()!;
      },
    });

    expect(observations.some((entry) => entry.includes('Full-stack topology does not imply'))).toBe(
      true
    );
  });

  it('rejects premature submission and returns the missing capability observations', async () => {
    const actions = [
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, submittedPlan),
      tool(CREATE_CAPABILITY_TOOL_NAMES.inspectContext),
      tool(CREATE_CAPABILITY_TOOL_NAMES.listCapabilities),
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, submittedPlan),
    ];
    const observations: string[] = [];

    const result = await runCreateCapabilityPlanning({
      context: {
        request: 'Create a storefront.',
        selectedTarget: 'workspace',
        workspaceAvailable: false,
      },
      callModel: async (messages) => {
        const latest = messages[messages.length - 1];
        if (latest && 'toolResult' in latest) {
          observations.push(latest.toolResult.content);
        }
        return actions.shift()!;
      },
    });

    expect(result.status).toBe('submitted');
    expect(observations[0]).toContain('Required capability observations are missing');
    expect(observations[0]).toContain('inspect-create-context');
    expect(observations[0]).toContain('list-create-capabilities');
  });

  it('is bounded and falls back when a model repeats a tool without progress', async () => {
    const result = await runCreateCapabilityPlanning({
      context: {
        request: 'Create an API.',
        selectedTarget: 'project',
        workspaceName: 'platform',
        workspaceAvailable: true,
      },
      callModel: async () => tool(CREATE_CAPABILITY_TOOL_NAMES.inspectContext),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      reason: expect.stringContaining('repeated inspect-create-context'),
      turns: 3,
    });
  });

  it('rejects mismatched framework and kit proposals before controller approval', async () => {
    const actions = [
      tool(CREATE_CAPABILITY_TOOL_NAMES.inspectContext),
      tool(CREATE_CAPABILITY_TOOL_NAMES.listCapabilities),
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, {
        ...submittedPlan,
        framework: 'go',
        kit: 'frontend.nextjs',
      }),
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, submittedPlan),
    ];
    const results: string[] = [];

    const result = await runCreateCapabilityPlanning({
      context: {
        request: 'Create a storefront.',
        selectedTarget: 'workspace',
        workspaceAvailable: false,
      },
      callModel: async (messages) => {
        const latest = messages.at(-1);
        if (latest && 'toolResult' in latest) {
          results.push(latest.toolResult.content);
        }
        return actions.shift()!;
      },
    });

    expect(result.status).toBe('submitted');
    expect(results.some((entry) => entry.includes('does not belong to framework go'))).toBe(true);
  });

  it('rejects model-selected host installers and requires automatic runtime policy', async () => {
    const actions = [
      tool(CREATE_CAPABILITY_TOOL_NAMES.inspectContext),
      tool(CREATE_CAPABILITY_TOOL_NAMES.listCapabilities),
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, {
        ...submittedPlan,
        installMethod: 'pipx',
      }),
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, submittedPlan),
    ];
    const results: string[] = [];

    const result = await runCreateCapabilityPlanning({
      context: {
        request: 'Create a storefront.',
        selectedTarget: 'workspace',
        workspaceAvailable: false,
      },
      callModel: async (messages) => {
        const latest = messages.at(-1);
        if (latest && 'toolResult' in latest) {
          results.push(latest.toolResult.content);
        }
        return actions.shift()!;
      },
    });

    expect(result.status).toBe('submitted');
    expect(results.some((entry) => entry.includes('Unsupported install method: pipx'))).toBe(true);
  });

  it('fails closed when a model reuses a tool call identifier', async () => {
    const action = tool(CREATE_CAPABILITY_TOOL_NAMES.inspectContext);
    const result = await runCreateCapabilityPlanning({
      context: {
        request: 'Create an API.',
        selectedTarget: 'project',
        workspaceAvailable: true,
      },
      callModel: async () => action,
    });

    expect(result).toMatchObject({
      status: 'fallback',
      reason: expect.stringContaining('repeated Create capability call identifier'),
      turns: 2,
    });
  });

  it('publishes only read-only planning tools and one non-mutating proposal tool', () => {
    expect(CREATE_CAPABILITY_TOOLS.map((entry) => entry.name)).toEqual([
      'inspect-create-context',
      'list-create-capabilities',
      'recommend-create-architecture',
      'submit-create-plan',
    ]);
    expect(CREATE_CAPABILITY_TOOLS[3]?.description).toContain('non-mutating');
    expect(CREATE_CAPABILITY_TOOLS.map((entry) => entry.name)).not.toContain('execute-create-plan');
  });

  it('returns canonical framework-to-kit pairs instead of runtime-internal aliases', async () => {
    const actions = [
      tool(CREATE_CAPABILITY_TOOL_NAMES.inspectContext),
      tool(CREATE_CAPABILITY_TOOL_NAMES.listCapabilities),
      tool(CREATE_CAPABILITY_TOOL_NAMES.submitPlan, submittedPlan),
    ];
    const results: string[] = [];

    await runCreateCapabilityPlanning({
      context: {
        request: 'Create a storefront.',
        selectedTarget: 'workspace',
        workspaceAvailable: false,
      },
      callModel: async (messages) => {
        const latest = messages.at(-1);
        if (latest && 'toolResult' in latest) {
          results.push(latest.toolResult.content);
        }
        return actions.shift()!;
      },
    });

    const capabilities = JSON.parse(results[1] ?? '{}') as {
      executablePairs?: Array<{ framework: string; kits: string[] }>;
    };
    expect(capabilities.executablePairs).toContainEqual({
      framework: 'go',
      kits: ['gofiber.standard', 'gogin.standard'],
    });
    expect(capabilities.executablePairs?.some((entry) => entry.framework === 'gofiber')).toBe(
      false
    );
  });
});
