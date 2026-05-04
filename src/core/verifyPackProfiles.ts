export type VerifyPackPhase = 'health' | 'lint' | 'typecheck' | 'test' | 'build' | 'smoke';

export type VerifyPackProfileId =
  | 'python-backend'
  | 'node-backend'
  | 'java-backend'
  | 'go-backend'
  | 'ruby-backend'
  | 'generic-backend';

export interface VerifyPackCommand {
  phase: VerifyPackPhase;
  command: string;
  args: string[];
  label: string;
}

export interface VerifyPackPlan {
  profileId: VerifyPackProfileId;
  confidence: 'high' | 'medium' | 'low';
  commands: VerifyPackCommand[];
}

export interface VerifyPackPlanInput {
  projectType?: string;
  kitType?: string;
  projectPath?: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn';
}

function containsAny(value: string, tokens: string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function normalizeInput(input: VerifyPackPlanInput): string {
  return [input.projectType, input.kitType, input.projectPath]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
}

function command(
  phase: VerifyPackPhase,
  cmd: string,
  args: string[],
  label: string
): VerifyPackCommand {
  return {
    phase,
    command: cmd,
    args,
    label,
  };
}

function resolvePackageManager(
  input: VerifyPackPlanInput,
  normalized: string
): 'npm' | 'pnpm' | 'yarn' {
  if (input.packageManager) {
    return input.packageManager;
  }
  if (normalized.includes('pnpm')) {
    return 'pnpm';
  }
  if (normalized.includes('yarn')) {
    return 'yarn';
  }
  return 'npm';
}

function buildNodeCommands(pm: 'npm' | 'pnpm' | 'yarn'): VerifyPackCommand[] {
  const runArgs = (script: string): string[] => {
    if (pm === 'npm') {
      return ['run', script, '--if-present'];
    }
    return ['run', script];
  };

  return [
    command('health', 'rapidkit', ['doctor'], 'health: rapidkit doctor'),
    command('lint', pm, runArgs('lint'), 'lint: run linter'),
    command('typecheck', pm, runArgs('typecheck'), 'typecheck: run type checks'),
    command('test', pm, runArgs('test'), 'test: run test suite'),
    command('build', pm, runArgs('build'), 'build: compile/build project'),
    command('smoke', pm, runArgs('smoke'), 'smoke: run smoke suite'),
  ];
}

function buildPythonCommands(): VerifyPackCommand[] {
  return [
    command('health', 'rapidkit', ['doctor'], 'health: rapidkit doctor'),
    command('lint', 'python', ['-m', 'ruff', 'check', '.'], 'lint: ruff check'),
    command('typecheck', 'python', ['-m', 'pyright'], 'typecheck: pyright'),
    command('test', 'pytest', ['-q'], 'test: pytest'),
    command('build', 'python', ['-m', 'compileall', '-q', '.'], 'build: compileall'),
    command('smoke', 'pytest', ['-q', '-k', 'smoke'], 'smoke: pytest -k smoke'),
  ];
}

function buildJavaCommands(): VerifyPackCommand[] {
  return [
    command('health', 'rapidkit', ['doctor'], 'health: rapidkit doctor'),
    command('lint', './mvnw', ['-q', 'checkstyle:check'], 'lint: checkstyle'),
    command('typecheck', './mvnw', ['-q', 'test-compile'], 'typecheck: test-compile'),
    command('test', './mvnw', ['-q', 'test'], 'test: mvn test'),
    command('build', './mvnw', ['-q', '-DskipTests', 'package'], 'build: mvn package'),
    command('smoke', './mvnw', ['-q', '-Dtest=*Smoke*', 'test'], 'smoke: smoke tests'),
  ];
}

function buildGoCommands(): VerifyPackCommand[] {
  return [
    command('health', 'rapidkit', ['doctor'], 'health: rapidkit doctor'),
    command('lint', 'go', ['vet', './...'], 'lint: go vet'),
    command('typecheck', 'go', ['test', './...', '-run', '^$'], 'typecheck: compile test targets'),
    command('test', 'go', ['test', './...'], 'test: go test'),
    command('build', 'go', ['build', './...'], 'build: go build'),
    command('smoke', 'go', ['test', './...', '-run', 'Smoke'], 'smoke: smoke tests'),
  ];
}

function buildRubyCommands(): VerifyPackCommand[] {
  return [
    command('health', 'rapidkit', ['doctor'], 'health: rapidkit doctor'),
    command('lint', 'bundle', ['exec', 'rubocop'], 'lint: rubocop'),
    command('typecheck', 'bundle', ['exec', 'ruby', '-wc', '.'], 'typecheck: ruby -wc'),
    command('test', 'bundle', ['exec', 'rspec'], 'test: rspec'),
    command('build', 'bundle', ['exec', 'rake', 'build'], 'build: rake build'),
    command('smoke', 'bundle', ['exec', 'rspec', '--tag', 'smoke'], 'smoke: rspec smoke tag'),
  ];
}

function buildGenericCommands(): VerifyPackCommand[] {
  return [
    command('health', 'rapidkit', ['doctor'], 'health: rapidkit doctor'),
    command('test', 'rapidkit', ['doctor'], 'test: fallback verify via doctor evidence'),
    command('smoke', 'rapidkit', ['doctor'], 'smoke: fallback health smoke'),
  ];
}

export function buildVerifyPackPlan(input: VerifyPackPlanInput): VerifyPackPlan {
  const normalized = normalizeInput(input);

  if (
    containsAny(normalized, ['fastapi', 'python', 'flask', 'django', '.py', 'pytest', 'poetry'])
  ) {
    return {
      profileId: 'python-backend',
      confidence: 'high',
      commands: buildPythonCommands(),
    };
  }

  if (
    containsAny(normalized, ['nestjs', 'node', 'express', 'nextjs', '.ts', '.tsx', '.js', '.jsx'])
  ) {
    return {
      profileId: 'node-backend',
      confidence: 'high',
      commands: buildNodeCommands(resolvePackageManager(input, normalized)),
    };
  }

  if (containsAny(normalized, ['spring', 'java', 'quarkus', '.java', 'maven', 'gradle'])) {
    return {
      profileId: 'java-backend',
      confidence: 'medium',
      commands: buildJavaCommands(),
    };
  }

  if (containsAny(normalized, ['go', 'golang', '.go', 'fiber', 'gin'])) {
    return {
      profileId: 'go-backend',
      confidence: 'medium',
      commands: buildGoCommands(),
    };
  }

  if (containsAny(normalized, ['ruby', 'rails', '.rb', 'rspec'])) {
    return {
      profileId: 'ruby-backend',
      confidence: 'medium',
      commands: buildRubyCommands(),
    };
  }

  return {
    profileId: 'generic-backend',
    confidence: 'low',
    commands: buildGenericCommands(),
  };
}

export function toVerifyPackCommandStrings(plan: VerifyPackPlan, maxCommands = 6): string[] {
  const result: string[] = [];
  for (const item of plan.commands) {
    const commandLine = [item.command, ...item.args].join(' ').trim();
    if (!commandLine) {
      continue;
    }
    result.push(commandLine);
    if (result.length >= maxCommands) {
      break;
    }
  }
  return result;
}
