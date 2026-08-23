import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

interface PackageManifest {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

function readPackageManifest(filePath: string): PackageManifest {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageManifest;
}

function expectLockedManifestToMatch(
  manifest: PackageManifest,
  lockedManifest: PackageManifest | undefined,
  label: string
): void {
  expect(lockedManifest, `${label} is missing from its lockfile`).toBeDefined();
  expect(lockedManifest?.name, `${label} name drift`).toBe(manifest.name);
  expect(lockedManifest?.version, `${label} version drift`).toBe(manifest.version);

  for (const field of dependencyFields) {
    expect(lockedManifest?.[field] ?? {}, `${label} ${field} drift`).toEqual(manifest[field] ?? {});
  }
}

function expectExactDependenciesToResolve(
  manifest: PackageManifest,
  lockedPackages: Record<string, PackageManifest>,
  ownerPath: string,
  label: string
): void {
  for (const field of dependencyFields) {
    for (const [dependencyName, requestedVersion] of Object.entries(manifest[field] ?? {})) {
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(requestedVersion)) {
        continue;
      }

      const localPath = ownerPath
        ? `${ownerPath}/node_modules/${dependencyName}`
        : `node_modules/${dependencyName}`;
      const hoistedPath = `node_modules/${dependencyName}`;
      const resolved = lockedPackages[localPath] ?? lockedPackages[hoistedPath];

      expect(
        resolved,
        `${label} ${dependencyName}@${requestedVersion} is not locked`
      ).toBeDefined();
      expect(resolved?.version, `${label} ${dependencyName} resolved-version drift`).toBe(
        requestedVersion
      );
    }
  }
}

describe('package-lock integrity', () => {
  it('keeps root and workspace manifests synchronized with every committed lockfile', () => {
    const rootManifest = readPackageManifest(path.join(repoRoot, 'package.json'));
    const rootLock = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')
    ) as { packages?: Record<string, PackageManifest> };

    expectLockedManifestToMatch(rootManifest, rootLock.packages?.[''], 'root package');
    expectExactDependenciesToResolve(rootManifest, rootLock.packages ?? {}, '', 'root package');

    for (const workspacePath of ['webview-ui']) {
      const workspaceManifest = readPackageManifest(
        path.join(repoRoot, workspacePath, 'package.json')
      );
      const workspaceLock = JSON.parse(
        fs.readFileSync(path.join(repoRoot, workspacePath, 'package-lock.json'), 'utf8')
      ) as { packages?: Record<string, PackageManifest> };

      expectLockedManifestToMatch(
        workspaceManifest,
        rootLock.packages?.[workspacePath],
        `${workspacePath} root-lock projection`
      );
      expectLockedManifestToMatch(
        workspaceManifest,
        workspaceLock.packages?.[''],
        `${workspacePath} package`
      );
      expect(
        workspaceManifest.devDependencies?.esbuild,
        `${workspacePath} must pin its release-critical bundler exactly`
      ).toMatch(/^\d+\.\d+\.\d+$/u);
      expectExactDependenciesToResolve(
        workspaceManifest,
        rootLock.packages ?? {},
        workspacePath,
        `${workspacePath} root-lock projection`
      );
      expectExactDependenciesToResolve(
        workspaceManifest,
        workspaceLock.packages ?? {},
        '',
        `${workspacePath} package`
      );
    }
  });

  it('routes every CI clean install through the package manager pinned by package.json', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ) as { packageManager?: string };
    const workflowDirectory = path.join(repoRoot, '.github', 'workflows');
    const workflowFiles = fs
      .readdirSync(workflowDirectory)
      .filter((fileName) => fileName.endsWith('.yml') || fileName.endsWith('.yaml'));
    const directInstallViolations: string[] = [];

    expect(packageJson.packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);

    for (const fileName of workflowFiles) {
      const source = fs.readFileSync(path.join(workflowDirectory, fileName), 'utf8');
      if (/^\s*run:\s+npm ci\s*$/mu.test(source)) {
        directInstallViolations.push(fileName);
      }
    }

    expect(directInstallViolations).toEqual([]);
  });

  it('records every optional dependency referenced by a locked package', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')) as {
      packages?: Record<string, { optionalDependencies?: Record<string, string> }>;
    };
    const packages = lock.packages ?? {};
    const missing: string[] = [];

    for (const [packagePath, metadata] of Object.entries(packages)) {
      for (const dependencyName of Object.keys(metadata.optionalDependencies ?? {})) {
        if (!packages[`node_modules/${dependencyName}`]) {
          missing.push(`${packagePath || '<root>'} -> ${dependencyName}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
