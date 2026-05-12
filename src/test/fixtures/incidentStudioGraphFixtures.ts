export type IncidentStudioSupportedKitFixture = {
  framework:
    | 'fastapi'
    | 'django'
    | 'flask'
    | 'nestjs'
    | 'express'
    | 'koa'
    | 'gofiber'
    | 'gogin'
    | 'echo'
    | 'rails'
    | 'dotnet'
    | 'springboot';
  kit?:
    | 'fastapi.standard'
    | 'nestjs.standard'
    | 'gofiber.standard'
    | 'gogin.standard'
    | 'springboot.standard';
  workspacePath: string;
  workspaceName: string;
  projectPath: string;
  projectName: string;
  projectType:
    | 'fastapi'
    | 'django'
    | 'flask'
    | 'nestjs'
    | 'express'
    | 'koa'
    | 'gofiber'
    | 'gogin'
    | 'echo'
    | 'rails'
    | 'dotnet'
    | 'springboot';
  modules: string[];
};

export const INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES: IncidentStudioSupportedKitFixture[] = [
  {
    framework: 'fastapi',
    kit: 'fastapi.standard',
    workspacePath: '/tmp/fixtures/fastapi-wsp',
    workspaceName: 'fastapi-wsp',
    projectPath: '/tmp/fixtures/fastapi-wsp/orders-api',
    projectName: 'orders-api',
    projectType: 'fastapi',
    modules: ['api', 'worker'],
  },
  {
    framework: 'django',
    workspacePath: '/tmp/fixtures/django-wsp',
    workspaceName: 'django-wsp',
    projectPath: '/tmp/fixtures/django-wsp/admin-api',
    projectName: 'admin-api',
    projectType: 'django',
    modules: ['users', 'admin'],
  },
  {
    framework: 'flask',
    workspacePath: '/tmp/fixtures/flask-wsp',
    workspaceName: 'flask-wsp',
    projectPath: '/tmp/fixtures/flask-wsp/gateway-api',
    projectName: 'gateway-api',
    projectType: 'flask',
    modules: ['gateway', 'auth'],
  },
  {
    framework: 'nestjs',
    kit: 'nestjs.standard',
    workspacePath: '/tmp/fixtures/nest-wsp',
    workspaceName: 'nest-wsp',
    projectPath: '/tmp/fixtures/nest-wsp/catalog-api',
    projectName: 'catalog-api',
    projectType: 'nestjs',
    modules: ['auth', 'catalog'],
  },
  {
    framework: 'express',
    workspacePath: '/tmp/fixtures/express-wsp',
    workspaceName: 'express-wsp',
    projectPath: '/tmp/fixtures/express-wsp/edge-api',
    projectName: 'edge-api',
    projectType: 'express',
    modules: ['routes', 'middleware'],
  },
  {
    framework: 'koa',
    workspacePath: '/tmp/fixtures/koa-wsp',
    workspaceName: 'koa-wsp',
    projectPath: '/tmp/fixtures/koa-wsp/session-api',
    projectName: 'session-api',
    projectType: 'koa',
    modules: ['session', 'http'],
  },
  {
    framework: 'gofiber',
    kit: 'gofiber.standard',
    workspacePath: '/tmp/fixtures/gofiber-wsp',
    workspaceName: 'gofiber-wsp',
    projectPath: '/tmp/fixtures/gofiber-wsp/checkout-api',
    projectName: 'checkout-api',
    projectType: 'gofiber',
    modules: ['http', 'jobs'],
  },
  {
    framework: 'gogin',
    kit: 'gogin.standard',
    workspacePath: '/tmp/fixtures/gogin-wsp',
    workspaceName: 'gogin-wsp',
    projectPath: '/tmp/fixtures/gogin-wsp/shipping-api',
    projectName: 'shipping-api',
    projectType: 'gogin',
    modules: ['transport', 'queue'],
  },
  {
    framework: 'echo',
    workspacePath: '/tmp/fixtures/echo-wsp',
    workspaceName: 'echo-wsp',
    projectPath: '/tmp/fixtures/echo-wsp/notify-api',
    projectName: 'notify-api',
    projectType: 'echo',
    modules: ['notify', 'transport'],
  },
  {
    framework: 'rails',
    workspacePath: '/tmp/fixtures/rails-wsp',
    workspaceName: 'rails-wsp',
    projectPath: '/tmp/fixtures/rails-wsp/payments-api',
    projectName: 'payments-api',
    projectType: 'rails',
    modules: ['payments', 'jobs'],
  },
  {
    framework: 'dotnet',
    workspacePath: '/tmp/fixtures/dotnet-wsp',
    workspaceName: 'dotnet-wsp',
    projectPath: '/tmp/fixtures/dotnet-wsp/inventory-api',
    projectName: 'inventory-api',
    projectType: 'dotnet',
    modules: ['inventory', 'contracts'],
  },
  {
    framework: 'springboot',
    kit: 'springboot.standard',
    workspacePath: '/tmp/fixtures/spring-wsp',
    workspaceName: 'spring-wsp',
    projectPath: '/tmp/fixtures/spring-wsp/billing-api',
    projectName: 'billing-api',
    projectType: 'springboot',
    modules: ['billing', 'health'],
  },
];

export function getIncidentFixtureSupportedTopology(
  fixture: IncidentStudioSupportedKitFixture
): string {
  return fixture.kit ?? fixture.framework;
}

export function buildIncidentWorkspaceGraphFixture(fixture: IncidentStudioSupportedKitFixture) {
  return {
    snapshotVersion: 'v1',
    workspace: {
      path: ` ${fixture.workspacePath} `,
      name: ` ${fixture.workspaceName} `,
    },
    project: {
      framework: fixture.framework,
      kit: fixture.kit ?? fixture.framework,
      selectedProject: {
        path: ` ${fixture.projectPath} `,
        name: ` ${fixture.projectName} `,
        type: ` ${fixture.projectType} `,
      },
    },
    topology: {
      modulesCount: fixture.modules.length,
      topModules: fixture.modules,
    },
    doctor: {
      hasEvidence: true,
      generatedAt: '2026-04-27T12:00:00.000Z',
      health: {
        passed: 5,
        warnings: 1,
        errors: 0,
        total: 6,
        percent: 83,
      },
    },
    git: {
      diffStat: '2 files changed',
      hasDiffContext: true,
    },
    memory: {
      context: `${fixture.projectName} follows strict workspace conventions.`,
      conventionsCount: 2,
      decisionsCount: 1,
      hasMemory: true,
    },
    telemetry: {
      totalEvents: 14,
      lastCommand: 'workspai.studio.loop_started',
      onboardingFollowupClickThroughRate: 42,
    },
    evidence: {
      hasDoctorEvidence: true,
      hasGitDiff: true,
      hasWorkspaceMemory: true,
      projectScoped: true,
    },
    completeness: 'fresh' as const,
    lastUpdatedAt: 123,
  };
}
