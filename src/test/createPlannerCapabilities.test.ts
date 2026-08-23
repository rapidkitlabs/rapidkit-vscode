import { describe, expect, it } from 'vitest';
import {
  listExecutableCreateTargets,
  resolveCreateCapabilityFromPrompt,
  resolveCreatePlannerCapability,
} from '../contracts/createPlannerCapabilities';

describe('create planner capabilities contract', () => {
  it('keeps native Workspai kits in the native lane', () => {
    expect(resolveCreatePlannerCapability({ kitId: 'fastapi.standard' })).toMatchObject({
      lane: 'native',
      status: 'available',
      canExecuteCreate: true,
      resolved: 'fastapi.standard',
    });
  });

  it('routes official frontend generators through the available official lane', () => {
    expect(resolveCreatePlannerCapability({ kitId: 'frontend.vite-react' })).toMatchObject({
      lane: 'official',
      status: 'available',
      canExecuteCreate: true,
      resolved: 'frontend.vite-react',
    });
  });

  it('keeps WordPress planned and routes Laravel to the executable official lane', () => {
    expect(resolveCreateCapabilityFromPrompt('Create a WordPress site for commerce')).toMatchObject(
      {
        lane: 'official',
        status: 'planned',
        canExecuteCreate: false,
        resolved: 'wordpress-site',
        fallbackLane: 'existing',
      }
    );

    expect(
      resolveCreateCapabilityFromPrompt('Build a Laravel project management portal')
    ).toMatchObject({
      lane: 'official',
      status: 'available',
      canExecuteCreate: true,
      resolved: 'php.laravel',
    });
  });

  it('routes generic PHP to existing without matching unrelated words', () => {
    expect(resolveCreateCapabilityFromPrompt('Create a PHP application')).toMatchObject({
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
      resolved: 'php',
    });

    expect(resolveCreateCapabilityFromPrompt('Build a shopping app')).toBeUndefined();
  });

  it('does not treat existing runtime signals as an adopt/import allowlist', () => {
    expect(resolveCreatePlannerCapability({ runtime: 'zig' })).toMatchObject({
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
    });
  });

  it('projects only executable targets for model-driven Create routing', () => {
    const targets = listExecutableCreateTargets();

    expect(targets).toContain('fastapi');
    expect(targets).toContain('go');
    expect(targets).toContain('rust');
    expect(targets).toContain('nextjs');
    expect(targets).toContain('vscode-extension');
    expect(targets).not.toContain('gofiber');
    expect(targets).not.toContain('axum');
    expect(targets).not.toContain('wordpress');
    expect(targets).not.toContain('symfony');
    expect(new Set(targets).size).toBe(targets.length);
  });
});
