/**
 * Canonical scaffold kit surface, aligned with Workspai CLI runtime contracts.
 */

import createContract from '../contracts/create-planner-capabilities.v1.json';

export type BackendScaffoldFramework =
  | 'fastapi'
  | 'nestjs'
  | 'go'
  | 'springboot'
  | 'dotnet'
  | 'rust'
  | 'laravel';

export type FrontendScaffoldFramework =
  | 'nextjs'
  | 'remix'
  | 'vite-react'
  | 'vite-vue'
  | 'vite-svelte'
  | 'vite-solid'
  | 'vite-vanilla'
  | 'nuxt'
  | 'angular'
  | 'astro'
  | 'sveltekit';

export type DesktopScaffoldFramework = 'tauri' | 'electron';
export type ExtensionScaffoldFramework = 'vscode-extension';

export type ScaffoldFramework =
  | BackendScaffoldFramework
  | FrontendScaffoldFramework
  | DesktopScaffoldFramework
  | ExtensionScaffoldFramework;

export type ScaffoldRuntimeFamily = 'node' | 'python' | 'go' | 'java' | 'dotnet' | 'rust' | 'php';
export type ScaffoldWorkspaceProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'dotnet-only'
  | 'polyglot'
  | 'enterprise';

/**
 * Runtime ownership for every executable Create lane. This map is intentionally
 * independent from workspace profiles: topology (one or two projects) does not
 * imply runtime heterogeneity.
 */
type ContractCreateEntry = {
  id: string;
  category: string;
  plannerFramework: string;
  runtime: string;
  runtimeCandidates?: string[];
  canExecuteCreate?: boolean;
  workspacePythonEngine: 'required' | 'optional' | 'none';
};

const EXECUTABLE_CREATE_ENTRIES: ContractCreateEntry[] = [
  ...(createContract.nativeCreate as ContractCreateEntry[]),
  ...(createContract.officialCreate as ContractCreateEntry[]).filter(
    (entry) => entry.canExecuteCreate
  ),
];

export const BACKEND_SCAFFOLD_KIT_IDS = EXECUTABLE_CREATE_ENTRIES.filter(
  (entry) => entry.category === 'backend'
).map((entry) => entry.id);

export const SCAFFOLD_FRAMEWORK_RUNTIME = Object.freeze(
  Object.fromEntries(
    EXECUTABLE_CREATE_ENTRIES.map((entry) => [entry.plannerFramework, entry.runtime])
  ) as Record<ScaffoldFramework, ScaffoldRuntimeFamily>
);

export function scaffoldRuntimeForFramework(framework: ScaffoldFramework): ScaffoldRuntimeFamily {
  return SCAFFOLD_FRAMEWORK_RUNTIME[framework];
}

export function defaultWorkspaceProfileForFramework(
  framework: ScaffoldFramework
): ScaffoldWorkspaceProfile {
  const runtimes = scaffoldRuntimeCandidatesForFramework(framework);
  if (runtimes.length > 1) {
    return 'polyglot';
  }
  const runtime = runtimes[0] ?? scaffoldRuntimeForFramework(framework);
  return (
    (
      {
        python: 'python-only',
        node: 'node-only',
        go: 'go-only',
        java: 'java-only',
        dotnet: 'dotnet-only',
      } as Partial<Record<ScaffoldRuntimeFamily, ScaffoldWorkspaceProfile>>
    )[runtime] ?? 'minimal'
  );
}

/**
 * Canonical executable framework-to-kit map shared by model planning,
 * validation, and runtime execution. Consumer prompts must project this map
 * instead of maintaining their own framework lists.
 */
export const SCAFFOLD_FRAMEWORK_KITS = Object.freeze(
  EXECUTABLE_CREATE_ENTRIES.reduce<Record<string, string[]>>((entries, entry) => {
    (entries[entry.plannerFramework] ??= []).push(entry.id);
    return entries;
  }, {}) as Record<ScaffoldFramework, readonly string[]>
);

const CREATE_ENTRY_BY_KIT = new Map(EXECUTABLE_CREATE_ENTRIES.map((entry) => [entry.id, entry]));

export function workspacePythonEngineForKit(
  kit: string
): 'required' | 'optional' | 'none' | undefined {
  return CREATE_ENTRY_BY_KIT.get(kit)?.workspacePythonEngine;
}

export function scaffoldRuntimeCandidatesForFramework(
  framework: ScaffoldFramework
): ScaffoldRuntimeFamily[] {
  const entry = EXECUTABLE_CREATE_ENTRIES.find(
    (candidate) => candidate.plannerFramework === framework
  );
  return [...new Set(entry?.runtimeCandidates ?? (entry ? [entry.runtime] : []))].filter(
    (runtime): runtime is ScaffoldRuntimeFamily =>
      runtime === 'node' ||
      runtime === 'python' ||
      runtime === 'go' ||
      runtime === 'java' ||
      runtime === 'dotnet' ||
      runtime === 'rust' ||
      runtime === 'php'
  );
}

export function listExecutableScaffoldFrameworks(): ScaffoldFramework[] {
  return Object.keys(SCAFFOLD_FRAMEWORK_KITS) as ScaffoldFramework[];
}

export function listExecutableScaffoldKits(): string[] {
  return [...new Set(Object.values(SCAFFOLD_FRAMEWORK_KITS).flatMap((kits) => [...kits]))];
}

export function scaffoldKitsForFramework(framework: ScaffoldFramework): readonly string[] {
  return SCAFFOLD_FRAMEWORK_KITS[framework];
}

export function defaultScaffoldKitForFramework(framework: ScaffoldFramework): string {
  const kit = scaffoldKitsForFramework(framework)[0];
  if (!kit) {
    throw new Error(`No executable Workspai Create kit is contracted for ${framework}.`);
  }
  return kit;
}

export interface OfficialScaffoldKitDefinition<TFramework extends ScaffoldFramework> {
  kitId: string;
  framework: TFramework;
  displayName: string;
  description: string;
  tags: string[];
}

export interface FrontendScaffoldKitDefinition {
  kitId: `frontend.${FrontendScaffoldFramework}`;
  framework: FrontendScaffoldFramework;
  displayName: string;
  description: string;
  tags: string[];
}

export const DESKTOP_SCAFFOLD_KITS: Array<OfficialScaffoldKitDefinition<DesktopScaffoldFramework>> =
  [
    {
      kitId: 'desktop.tauri',
      framework: 'tauri',
      displayName: 'Tauri',
      description: 'Official Tauri desktop app with a TypeScript frontend.',
      tags: ['desktop', 'tauri', 'rust', 'typescript'],
    },
    {
      kitId: 'desktop.electron',
      framework: 'electron',
      displayName: 'Electron Forge',
      description: 'Official Electron Forge desktop app with Vite and TypeScript.',
      tags: ['desktop', 'electron', 'vite', 'typescript'],
    },
  ];

export const EXTENSION_SCAFFOLD_KITS: Array<
  OfficialScaffoldKitDefinition<ExtensionScaffoldFramework>
> = [
  {
    kitId: 'extension.vscode',
    framework: 'vscode-extension',
    displayName: 'VS Code Extension',
    description: 'Official VS Code extension generator with TypeScript and esbuild.',
    tags: ['extension', 'vscode', 'typescript'],
  },
];

export const FRONTEND_SCAFFOLD_KITS: FrontendScaffoldKitDefinition[] = [
  {
    kitId: 'frontend.nextjs',
    framework: 'nextjs',
    displayName: 'Next.js',
    description: 'Official Next.js app via create-next-app.',
    tags: ['frontend', 'react', 'nextjs'],
  },
  {
    kitId: 'frontend.remix',
    framework: 'remix',
    displayName: 'React Router',
    description: 'Official React Router app via create-react-router.',
    tags: ['frontend', 'react', 'react-router'],
  },
  {
    kitId: 'frontend.vite-react',
    framework: 'vite-react',
    displayName: 'React + Vite',
    description: 'Vite React TypeScript starter.',
    tags: ['frontend', 'react', 'vite'],
  },
  {
    kitId: 'frontend.vite-vue',
    framework: 'vite-vue',
    displayName: 'Vue + Vite',
    description: 'Vite Vue TypeScript starter.',
    tags: ['frontend', 'vue', 'vite'],
  },
  {
    kitId: 'frontend.vite-svelte',
    framework: 'vite-svelte',
    displayName: 'Svelte + Vite',
    description: 'Vite Svelte TypeScript starter.',
    tags: ['frontend', 'svelte', 'vite'],
  },
  {
    kitId: 'frontend.vite-solid',
    framework: 'vite-solid',
    displayName: 'Solid + Vite',
    description: 'Vite Solid TypeScript starter.',
    tags: ['frontend', 'solid', 'vite'],
  },
  {
    kitId: 'frontend.vite-vanilla',
    framework: 'vite-vanilla',
    displayName: 'Vite',
    description: 'Vite vanilla TypeScript starter.',
    tags: ['frontend', 'vite', 'vanilla'],
  },
  {
    kitId: 'frontend.nuxt',
    framework: 'nuxt',
    displayName: 'Nuxt',
    description: 'Official Nuxt app via nuxi init.',
    tags: ['frontend', 'vue', 'nuxt'],
  },
  {
    kitId: 'frontend.angular',
    framework: 'angular',
    displayName: 'Angular',
    description: 'Official Angular app via @angular/cli.',
    tags: ['frontend', 'angular', 'typescript'],
  },
  {
    kitId: 'frontend.astro',
    framework: 'astro',
    displayName: 'Astro',
    description: 'Official Astro app via create astro.',
    tags: ['frontend', 'astro'],
  },
  {
    kitId: 'frontend.sveltekit',
    framework: 'sveltekit',
    displayName: 'SvelteKit',
    description: 'Official SvelteKit app via sv create.',
    tags: ['frontend', 'sveltekit', 'svelte'],
  },
];

export const SCAFFOLD_KIT_IDS = EXECUTABLE_CREATE_ENTRIES.map((entry) => entry.id);

export type ScaffoldKitId = (typeof SCAFFOLD_KIT_IDS)[number];

export function isFrontendScaffoldKit(kit: string | undefined): kit is `frontend.${string}` {
  return typeof kit === 'string' && kit.startsWith('frontend.');
}

export function isFrontendScaffoldFramework(
  framework: string | undefined
): framework is FrontendScaffoldFramework {
  return FRONTEND_SCAFFOLD_KITS.some((kit) => kit.framework === framework);
}

export function isBackendScaffoldFramework(
  framework: string | undefined
): framework is BackendScaffoldFramework {
  return (
    framework === 'fastapi' ||
    framework === 'nestjs' ||
    framework === 'go' ||
    framework === 'springboot' ||
    framework === 'dotnet' ||
    framework === 'rust' ||
    framework === 'laravel'
  );
}

export function isDesktopScaffoldFramework(
  framework: string | undefined
): framework is DesktopScaffoldFramework {
  return DESKTOP_SCAFFOLD_KITS.some((kit) => kit.framework === framework);
}

export function isExtensionScaffoldFramework(
  framework: string | undefined
): framework is ExtensionScaffoldFramework {
  return EXTENSION_SCAFFOLD_KITS.some((kit) => kit.framework === framework);
}

export function isScaffoldFramework(framework: string | undefined): framework is ScaffoldFramework {
  return (
    isBackendScaffoldFramework(framework) ||
    isFrontendScaffoldFramework(framework) ||
    isDesktopScaffoldFramework(framework) ||
    isExtensionScaffoldFramework(framework)
  );
}

export function frontendKitIdForFramework(
  framework: FrontendScaffoldFramework
): `frontend.${FrontendScaffoldFramework}` {
  return `frontend.${framework}`;
}

export function resolveFrontendKitDefinition(
  kitOrFramework: string | undefined
): FrontendScaffoldKitDefinition | undefined {
  if (!kitOrFramework) {
    return undefined;
  }
  const normalized = kitOrFramework.toLowerCase();
  return (
    FRONTEND_SCAFFOLD_KITS.find(
      (kit) => kit.kitId === normalized || kit.framework === normalized
    ) ?? undefined
  );
}
