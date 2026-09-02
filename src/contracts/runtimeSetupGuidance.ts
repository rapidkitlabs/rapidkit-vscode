export type RuntimeSetupGuidance = {
  executable: string;
  runtimeLabel: string;
  actionLabel: string;
  officialUrl: string;
};

const RUNTIME_SETUP_GUIDANCE: Record<string, Omit<RuntimeSetupGuidance, 'executable'>> = {
  go: {
    runtimeLabel: 'Go',
    actionLabel: 'Open Go setup',
    officialUrl: 'https://go.dev/doc/install',
  },
  dotnet: {
    runtimeLabel: '.NET SDK',
    actionLabel: 'Open .NET setup',
    officialUrl: 'https://dotnet.microsoft.com/download',
  },
  java: {
    runtimeLabel: 'Java',
    actionLabel: 'Open Java setup',
    officialUrl: 'https://adoptium.net/installation/',
  },
  node: {
    runtimeLabel: 'Node.js',
    actionLabel: 'Open Node.js setup',
    officialUrl: 'https://nodejs.org/en/download',
  },
  python: {
    runtimeLabel: 'Python',
    actionLabel: 'Open Python setup',
    officialUrl: 'https://www.python.org/downloads/',
  },
  rustc: {
    runtimeLabel: 'Rust',
    actionLabel: 'Open Rust setup',
    officialUrl: 'https://www.rust-lang.org/tools/install',
  },
  php: {
    runtimeLabel: 'PHP',
    actionLabel: 'Open PHP setup',
    officialUrl: 'https://www.php.net/manual/en/install.php',
  },
  ruby: {
    runtimeLabel: 'Ruby',
    actionLabel: 'Open Ruby setup',
    officialUrl: 'https://www.ruby-lang.org/en/documentation/installation/',
  },
  elixir: {
    runtimeLabel: 'Elixir',
    actionLabel: 'Open Elixir setup',
    officialUrl: 'https://elixir-lang.org/install.html',
  },
};

const EXECUTABLE_ALIASES: Record<string, string> = {
  cargo: 'rustc',
  mix: 'elixir',
  nodejs: 'node',
  npm: 'node',
  npx: 'node',
  pip: 'python',
  pip3: 'python',
  python3: 'python',
};

export function resolveRuntimeSetupGuidance(
  executable: string | undefined
): RuntimeSetupGuidance | undefined {
  const normalized = executable?.trim().toLowerCase();
  if (!normalized || !/^[a-z0-9.+_-]+$/.test(normalized)) {
    return undefined;
  }
  const canonical = EXECUTABLE_ALIASES[normalized] ?? normalized;
  const guidance = RUNTIME_SETUP_GUIDANCE[canonical];
  return guidance ? { executable: normalized, ...guidance } : undefined;
}
