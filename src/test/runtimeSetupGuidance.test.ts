import { describe, expect, it } from 'vitest';

import { resolveRuntimeSetupGuidance } from '../contracts/runtimeSetupGuidance.js';

describe('runtime setup guidance', () => {
  it.each([
    ['go', 'Go', 'https://go.dev/doc/install'],
    ['dotnet', '.NET SDK', 'https://dotnet.microsoft.com/download'],
    ['python3', 'Python', 'https://www.python.org/downloads/'],
    ['cargo', 'Rust', 'https://www.rust-lang.org/tools/install'],
    ['mix', 'Elixir', 'https://elixir-lang.org/install.html'],
  ])('maps %s to allowlisted official setup guidance', (executable, runtimeLabel, officialUrl) => {
    expect(resolveRuntimeSetupGuidance(executable)).toMatchObject({ runtimeLabel, officialUrl });
  });

  it('rejects unknown or unsafe executable values', () => {
    expect(resolveRuntimeSetupGuidance('unknown-runtime')).toBeUndefined();
    expect(resolveRuntimeSetupGuidance('go; open evil.example')).toBeUndefined();
  });
});
