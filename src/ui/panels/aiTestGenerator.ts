/**
 * AI Test Generator — A07
 *
 * Deterministic, framework-aware test stub and checklist generation.
 * No AI calls — all outputs are derived from input evidence and framework
 * conventions so they are stable, testable, and safe for release gating.
 *
 * Public API:
 *   detectTestFramework()          — infer framework from kit/extension/snippet
 *   buildUnitTestStub()            — generate unit test skeleton
 *   buildIntegrationTestStub()     — generate integration test skeleton
 *   buildEdgeCaseChecklist()       — generate risk-ranked edge-case checklist
 *   getFrameworkTestConventions()  — return naming, runner, assertion conventions
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestFramework =
  | 'pytest'
  | 'vitest'
  | 'jest'
  | 'junit'
  | 'rspec'
  | 'go-testing'
  | 'unknown';

export type TestGenerationMode = 'unit' | 'integration' | 'edge-case-checklist';

export interface TestGenerationInput {
  /** Name of the function / method under test. */
  functionName?: string;
  /** Name of the module / class being tested. */
  moduleName?: string;
  /** Detected or declared test framework. Overrides auto-detection when set. */
  framework?: TestFramework;
  /** RapidKit kit identifier e.g. 'fastapi.ddd', 'nestjs.standard'. */
  kitType?: string;
  /** File extension of the source file (without dot, e.g. 'py', 'ts'). */
  fileExtension?: string;
  /** Short snippet of the code under test — used for edge-case extraction. */
  contextSnippet?: string;
}

export interface TestCase {
  name: string;
  description: string;
  skeleton: string;
}

export interface UnitTestStub {
  framework: TestFramework;
  testFileName: string;
  imports: string[];
  testCases: TestCase[];
}

export interface IntegrationTestStub {
  framework: TestFramework;
  testFileName: string;
  setupSteps: string[];
  testCases: TestCase[];
}

export interface EdgeCaseChecklist {
  functionSignature: string;
  riskAreas: string[];
  checklistItems: string[];
}

export interface FrameworkTestConventions {
  framework: TestFramework;
  fileNamingPattern: string;
  testRunCommand: string;
  assertionStyle: string;
  setupPattern: string;
  teardownPattern: string;
  conventions: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PYTEST_CONVENTIONS: FrameworkTestConventions = {
  framework: 'pytest',
  fileNamingPattern: 'test_<module>.py or <module>_test.py',
  testRunCommand: 'pytest -v',
  assertionStyle: 'assert <expr>',
  setupPattern: '@pytest.fixture or setup_method()',
  teardownPattern: 'yield in fixture or teardown_method()',
  conventions: [
    'Name test functions test_<what>_<when>_<expected>',
    'Use fixtures for shared setup; avoid global state',
    'Prefer parametrize over duplicate test functions',
    'Each test should verify exactly one behaviour',
    'Use tmp_path fixture for file-system tests',
    'Mock external I/O with monkeypatch or pytest-mock',
  ],
};

const VITEST_CONVENTIONS: FrameworkTestConventions = {
  framework: 'vitest',
  fileNamingPattern: '<module>.test.ts or <module>.spec.ts',
  testRunCommand: 'npx vitest run',
  assertionStyle: 'expect(<value>).<matcher>()',
  setupPattern: 'beforeEach(() => { ... })',
  teardownPattern: 'afterEach(() => { ... })',
  conventions: [
    'Co-locate test files next to source or in src/test/',
    'Use describe blocks to group related behaviours',
    'Prefer vi.fn() over manual stubs for mocking',
    'Use beforeEach for setup that must repeat across tests',
    'Keep each it() focused on a single assertion path',
    'Use vi.spyOn() to verify side-effects without full mocks',
  ],
};

const JEST_CONVENTIONS: FrameworkTestConventions = {
  framework: 'jest',
  fileNamingPattern: '<module>.test.ts or <module>.spec.ts',
  testRunCommand: 'npx jest --verbose',
  assertionStyle: 'expect(<value>).<matcher>()',
  setupPattern: 'beforeEach(() => { ... })',
  teardownPattern: 'afterEach(() => { ... })',
  conventions: [
    'Use jest.mock() at module scope, not inside describe',
    'Use jest.spyOn() when you need the original implementation as fallback',
    'Prefer jest.fn().mockResolvedValue() for async stubs',
    'Clear mocks with jest.clearAllMocks() in beforeEach',
    'Snapshot tests only for stable, small outputs',
    'Keep test files co-located or under __tests__/',
  ],
};

const JUNIT_CONVENTIONS: FrameworkTestConventions = {
  framework: 'junit',
  fileNamingPattern: '<Module>Test.java',
  testRunCommand: 'mvn test or ./gradlew test',
  assertionStyle: 'Assertions.assertEquals / assertThat()',
  setupPattern: '@BeforeEach void setUp()',
  teardownPattern: '@AfterEach void tearDown()',
  conventions: [
    'Use @DisplayName for human-readable test descriptions',
    'Prefer @ParameterizedTest over copy-paste test methods',
    'Use @ExtendWith(MockitoExtension.class) for Mockito mocks',
    'Test class should mirror the production class package structure',
    'Avoid static state in test classes; reset in @BeforeEach',
    'Use AssertJ for fluent, readable assertions',
  ],
};

const RSPEC_CONVENTIONS: FrameworkTestConventions = {
  framework: 'rspec',
  fileNamingPattern: '<module>_spec.rb',
  testRunCommand: 'bundle exec rspec',
  assertionStyle: 'expect(<subject>).to <matcher>',
  setupPattern: 'before(:each) { ... } or let(:name) { ... }',
  teardownPattern: 'after(:each) { ... }',
  conventions: [
    'Use let and let! for lazy vs eager subject setup',
    'Use subject to define the primary object under test',
    'Use shared_examples for reusable contract tests',
    'Prefer FactoryBot over fixtures for object creation',
    'Stub external HTTP with WebMock or VCR',
    'Group with context/describe for clear intent hierarchy',
  ],
};

const GO_TESTING_CONVENTIONS: FrameworkTestConventions = {
  framework: 'go-testing',
  fileNamingPattern: '<module>_test.go',
  testRunCommand: 'go test ./...',
  assertionStyle: 't.Errorf / require.Equal (testify)',
  setupPattern: 'TestMain(m *testing.M) or setup helper funcs',
  teardownPattern: 't.Cleanup(func() { ... })',
  conventions: [
    'Use table-driven tests with subtests (t.Run)',
    'Name subtests descriptively: "input_x_returns_y"',
    'Use testify/assert for readable assertions',
    'Avoid global vars; pass dependencies explicitly',
    'Use t.Parallel() for independent tests to speed up CI',
    'Mock interfaces, not concrete types',
  ],
};

const UNKNOWN_CONVENTIONS: FrameworkTestConventions = {
  framework: 'unknown',
  fileNamingPattern: '<module>.test.<ext>',
  testRunCommand: 'run your test suite',
  assertionStyle: 'framework-specific assertions',
  setupPattern: 'framework-specific setup',
  teardownPattern: 'framework-specific teardown',
  conventions: [
    'One logical assertion per test',
    'Arrange → Act → Assert structure',
    'Mock all external I/O (network, disk, time)',
    'Name tests: <function>_<scenario>_<expected>',
    'Tests must be repeatable and order-independent',
    'Cover happy path, error path, and boundary values',
  ],
};

const CONVENTIONS_MAP: Record<TestFramework, FrameworkTestConventions> = {
  pytest: PYTEST_CONVENTIONS,
  vitest: VITEST_CONVENTIONS,
  jest: JEST_CONVENTIONS,
  junit: JUNIT_CONVENTIONS,
  rspec: RSPEC_CONVENTIONS,
  'go-testing': GO_TESTING_CONVENTIONS,
  unknown: UNKNOWN_CONVENTIONS,
};

// ─── Framework Detection ─────────────────────────────────────────────────────

/**
 * Infer the test framework from available evidence.
 * Priority: explicit input.framework → kit prefix → file extension → snippet signals.
 */
export function detectTestFramework(input: TestGenerationInput): TestFramework {
  if (input.framework && input.framework !== 'unknown') {
    return input.framework;
  }

  const kit = (input.kitType ?? '').toLowerCase();
  if (
    kit.startsWith('fastapi') ||
    kit.startsWith('python') ||
    kit.startsWith('django') ||
    kit.startsWith('flask')
  ) {
    return 'pytest';
  }
  if (kit.startsWith('nestjs') || kit.startsWith('nextjs') || kit.startsWith('nuxt')) {
    return 'jest';
  }
  if (kit.startsWith('spring') || kit.startsWith('java') || kit.startsWith('quarkus')) {
    return 'junit';
  }

  const ext = (input.fileExtension ?? '').toLowerCase().replace(/^\./, '');
  if (ext === 'py') {
    return 'pytest';
  }
  if (ext === 'ts' || ext === 'tsx') {
    return 'vitest';
  }
  if (ext === 'js' || ext === 'jsx') {
    return 'jest';
  }
  if (ext === 'java') {
    return 'junit';
  }
  if (ext === 'rb') {
    return 'rspec';
  }
  if (ext === 'go') {
    return 'go-testing';
  }

  const snippet = (input.contextSnippet ?? '').toLowerCase();
  if (snippet.includes('import pytest') || snippet.includes('def test_')) {
    return 'pytest';
  }
  if (snippet.includes("from 'vitest'") || snippet.includes('from "vitest"')) {
    return 'vitest';
  }
  if (snippet.includes("from 'jest'") || snippet.includes("require('jest')")) {
    return 'jest';
  }
  if (snippet.includes('@test') && snippet.includes('void')) {
    return 'junit';
  }
  if (snippet.includes('describe ') && snippet.includes(' do')) {
    return 'rspec';
  }
  if (snippet.includes('testing.t') || snippet.includes('func test')) {
    return 'go-testing';
  }

  return 'unknown';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeIdentifier(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? '').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function testFileName(framework: TestFramework, moduleName: string): string {
  const safe = safeIdentifier(moduleName, 'module');
  switch (framework) {
    case 'pytest':
      return `test_${safe}.py`;
    case 'vitest':
      return `${safe}.test.ts`;
    case 'jest':
      return `${safe}.test.ts`;
    case 'junit':
      return `${safe.charAt(0).toUpperCase() + safe.slice(1)}Test.java`;
    case 'rspec':
      return `${safe}_spec.rb`;
    case 'go-testing':
      return `${safe}_test.go`;
    default:
      return `${safe}.test`;
  }
}

// ─── Unit Test Stub ───────────────────────────────────────────────────────────

/** Generate a unit test stub for the given input. */
export function buildUnitTestStub(input: TestGenerationInput): UnitTestStub {
  const framework = detectTestFramework(input);
  const modName = safeIdentifier(input.moduleName, 'MyModule');
  const fnName = safeIdentifier(input.functionName, 'myFunction');
  const fileName = testFileName(framework, modName);

  switch (framework) {
    case 'pytest':
      return {
        framework,
        testFileName: fileName,
        imports: [`import pytest`, `from ${modName.toLowerCase()} import ${fnName}`],
        testCases: [
          {
            name: `test_${fnName}_happy_path`,
            description: 'Verify expected output on valid input.',
            skeleton: [
              `def test_${fnName}_happy_path():`,
              `    # Arrange`,
              `    input_value = ...`,
              `    expected = ...`,
              `    # Act`,
              `    result = ${fnName}(input_value)`,
              `    # Assert`,
              `    assert result == expected`,
            ].join('\n'),
          },
          {
            name: `test_${fnName}_raises_on_invalid_input`,
            description: 'Verify ValueError is raised on bad input.',
            skeleton: [
              `def test_${fnName}_raises_on_invalid_input():`,
              `    with pytest.raises(ValueError):`,
              `        ${fnName}(None)`,
            ].join('\n'),
          },
          {
            name: `test_${fnName}_boundary_values`,
            description: 'Verify boundary and edge values.',
            skeleton: [
              `@pytest.mark.parametrize("value,expected", [`,
              `    (0, ...),`,
              `    (-1, ...),`,
              `])`,
              `def test_${fnName}_boundary_values(value, expected):`,
              `    assert ${fnName}(value) == expected`,
            ].join('\n'),
          },
        ],
      };

    case 'vitest':
      return {
        framework,
        testFileName: fileName,
        imports: [
          `import { describe, it, expect, beforeEach, vi } from 'vitest';`,
          `import { ${fnName} } from '../${modName}';`,
        ],
        testCases: [
          {
            name: `${fnName} returns expected result on valid input`,
            description: 'Happy path — valid input produces expected output.',
            skeleton: [
              `it('${fnName} returns expected result on valid input', () => {`,
              `  // Arrange`,
              `  const input = ...;`,
              `  const expected = ...;`,
              `  // Act`,
              `  const result = ${fnName}(input);`,
              `  // Assert`,
              `  expect(result).toEqual(expected);`,
              `});`,
            ].join('\n'),
          },
          {
            name: `${fnName} throws on invalid input`,
            description: 'Error path — invalid input raises expected error.',
            skeleton: [
              `it('${fnName} throws on invalid input', () => {`,
              `  expect(() => ${fnName}(null)).toThrow();`,
              `});`,
            ].join('\n'),
          },
          {
            name: `${fnName} handles boundary values`,
            description: 'Boundary — zero, negative, and max values.',
            skeleton: [
              `it.each([`,
              `  [0, ...],`,
              `  [-1, ...],`,
              `])('${fnName} boundary: %s → %s', (input, expected) => {`,
              `  expect(${fnName}(input)).toEqual(expected);`,
              `});`,
            ].join('\n'),
          },
        ],
      };

    case 'jest':
      return {
        framework,
        testFileName: fileName,
        imports: [`import { ${fnName} } from '../${modName}';`],
        testCases: [
          {
            name: `returns expected output on valid input`,
            description: 'Happy path.',
            skeleton: [
              `it('returns expected output on valid input', () => {`,
              `  const result = ${fnName}(validInput);`,
              `  expect(result).toEqual(expected);`,
              `});`,
            ].join('\n'),
          },
          {
            name: `throws on missing required argument`,
            description: 'Error guard path.',
            skeleton: [
              `it('throws on missing required argument', () => {`,
              `  expect(() => ${fnName}(undefined)).toThrow();`,
              `});`,
            ].join('\n'),
          },
        ],
      };

    case 'junit':
      return {
        framework,
        testFileName: fileName,
        imports: [
          `import org.junit.jupiter.api.Test;`,
          `import static org.assertj.core.api.Assertions.*;`,
        ],
        testCases: [
          {
            name: `${fnName}_shouldReturnExpected_whenValidInput`,
            description: 'Happy path.',
            skeleton: [
              `@Test`,
              `@DisplayName("${fnName} returns expected value for valid input")`,
              `void ${fnName}_shouldReturnExpected_whenValidInput() {`,
              `    // Arrange`,
              `    var input = ...;`,
              `    // Act`,
              `    var result = subject.${fnName}(input);`,
              `    // Assert`,
              `    assertThat(result).isEqualTo(expected);`,
              `}`,
            ].join('\n'),
          },
          {
            name: `${fnName}_shouldThrow_whenNullInput`,
            description: 'Null-guard path.',
            skeleton: [
              `@Test`,
              `void ${fnName}_shouldThrow_whenNullInput() {`,
              `    assertThatThrownBy(() -> subject.${fnName}(null))`,
              `        .isInstanceOf(IllegalArgumentException.class);`,
              `}`,
            ].join('\n'),
          },
        ],
      };

    case 'rspec':
      return {
        framework,
        testFileName: fileName,
        imports: [`require 'spec_helper'`, `require '${modName.toLowerCase()}'`],
        testCases: [
          {
            name: `returns expected result`,
            description: 'Happy path.',
            skeleton: [
              `context 'with valid input' do`,
              `  it 'returns the expected result' do`,
              `    expect(subject.${fnName}(valid_input)).to eq(expected)`,
              `  end`,
              `end`,
            ].join('\n'),
          },
          {
            name: `raises on nil input`,
            description: 'Nil-guard path.',
            skeleton: [
              `context 'with nil input' do`,
              `  it 'raises ArgumentError' do`,
              `    expect { subject.${fnName}(nil) }.to raise_error(ArgumentError)`,
              `  end`,
              `end`,
            ].join('\n'),
          },
        ],
      };

    case 'go-testing':
      return {
        framework,
        testFileName: fileName,
        imports: [`import "testing"`, `import "github.com/stretchr/testify/require"`],
        testCases: [
          {
            name: `Test${fnName.charAt(0).toUpperCase() + fnName.slice(1)}_HappyPath`,
            description: 'Valid input returns expected result.',
            skeleton: [
              `func Test${fnName.charAt(0).toUpperCase() + fnName.slice(1)}_HappyPath(t *testing.T) {`,
              `    t.Parallel()`,
              `    result, err := ${fnName}(validInput)`,
              `    require.NoError(t, err)`,
              `    require.Equal(t, expected, result)`,
              `}`,
            ].join('\n'),
          },
          {
            name: `Test${fnName.charAt(0).toUpperCase() + fnName.slice(1)}_ReturnsError_WhenInvalidInput`,
            description: 'Error path.',
            skeleton: [
              `func Test${fnName.charAt(0).toUpperCase() + fnName.slice(1)}_ReturnsError_WhenInvalidInput(t *testing.T) {`,
              `    t.Parallel()`,
              `    _, err := ${fnName}("")`,
              `    require.Error(t, err)`,
              `}`,
            ].join('\n'),
          },
        ],
      };

    default:
      return {
        framework: 'unknown',
        testFileName: fileName,
        imports: [],
        testCases: [
          {
            name: `${fnName}_happy_path`,
            description: 'Happy path — valid input produces expected output.',
            skeleton: `// Arrange → Act → Assert\n// assert ${fnName}(validInput) === expected`,
          },
        ],
      };
  }
}

// ─── Integration Test Stub ───────────────────────────────────────────────────

/** Generate an integration test stub for the given input. */
export function buildIntegrationTestStub(input: TestGenerationInput): IntegrationTestStub {
  const framework = detectTestFramework(input);
  const modName = safeIdentifier(input.moduleName, 'MyModule');
  const fnName = safeIdentifier(input.functionName, 'myFunction');
  const baseName = safeIdentifier(modName, 'module');
  const fileName = testFileName(framework, `${baseName}_integration`);

  switch (framework) {
    case 'pytest':
      return {
        framework,
        testFileName: fileName,
        setupSteps: [
          'Start required services (DB, cache, message broker)',
          'Apply schema migrations: rapidkit db migrate --workspace',
          'Load minimal seed fixtures',
        ],
        testCases: [
          {
            name: `test_${fnName}_full_roundtrip`,
            description: 'End-to-end call through all layers including persistence.',
            skeleton: [
              `@pytest.mark.integration`,
              `def test_${fnName}_full_roundtrip(client, db_session):`,
              `    # Arrange: insert prerequisite records`,
              `    ...`,
              `    # Act: call the real implementation (no mocks on DB)`,
              `    result = ${fnName}(real_input)`,
              `    # Assert: verify DB state and return value`,
              `    assert result is not None`,
              `    assert db_session.query(MyModel).count() == 1`,
            ].join('\n'),
          },
          {
            name: `test_${fnName}_rollback_on_failure`,
            description: 'Verify DB is not mutated when an exception is raised.',
            skeleton: [
              `@pytest.mark.integration`,
              `def test_${fnName}_rollback_on_failure(db_session):`,
              `    count_before = db_session.query(MyModel).count()`,
              `    with pytest.raises(Exception):`,
              `        ${fnName}(bad_input)`,
              `    assert db_session.query(MyModel).count() == count_before`,
            ].join('\n'),
          },
        ],
      };

    case 'vitest':
    case 'jest': {
      const runner = framework === 'vitest' ? "from 'vitest'" : "from '@jest/globals'";
      return {
        framework,
        testFileName: fileName,
        setupSteps: [
          'Start test DB / in-memory server (testcontainers or supertest)',
          'Apply migrations before suite',
          'Seed minimal fixture data',
        ],
        testCases: [
          {
            name: `${fnName} persists data end-to-end`,
            description: 'Full roundtrip through service and repository layers.',
            skeleton: [
              `import { describe, it, expect, beforeAll, afterAll } ${runner};`,
              ``,
              `describe('${modName} integration', () => {`,
              `  beforeAll(async () => { /* start server / DB */ });`,
              `  afterAll(async () => { /* teardown */ });`,
              ``,
              `  it('${fnName} persists data end-to-end', async () => {`,
              `    const result = await ${fnName}(validInput);`,
              `    expect(result).toBeDefined();`,
              `    // verify persisted state via direct DB query`,
              `  });`,
              `});`,
            ].join('\n'),
          },
        ],
      };
    }

    case 'junit':
      return {
        framework,
        testFileName: fileName,
        setupSteps: [
          'Use @SpringBootTest or @DataJpaTest for slice tests',
          'Use Testcontainers for real DB containers',
          'Use @Sql or @BeforeEach to seed data',
        ],
        testCases: [
          {
            name: `${fnName}_shouldPersistAndReturn_whenCalledEndToEnd`,
            description: 'Full-stack integration test.',
            skeleton: [
              `@SpringBootTest`,
              `@Transactional`,
              `class ${modName}IntegrationTest {`,
              `    @Autowired`,
              `    private ${modName} subject;`,
              ``,
              `    @Test`,
              `    void ${fnName}_shouldPersistAndReturn_whenCalledEndToEnd() {`,
              `        var result = subject.${fnName}(validInput);`,
              `        assertThat(result).isNotNull();`,
              `    }`,
              `}`,
            ].join('\n'),
          },
        ],
      };

    default:
      return {
        framework,
        testFileName: fileName,
        setupSteps: [
          'Start all required external services',
          'Prepare seed data',
          'Register teardown hooks',
        ],
        testCases: [
          {
            name: `${fnName}_integration_roundtrip`,
            description: 'Full path through real dependencies.',
            skeleton: `// Arrange external state\n// Act: call ${fnName}\n// Assert: verify side-effects and return`,
          },
        ],
      };
  }
}

// ─── Edge-Case Checklist ──────────────────────────────────────────────────────

const UNIVERSAL_RISK_AREAS = [
  'Null / undefined / nil inputs',
  'Empty string and empty collection inputs',
  'Boundary values (zero, negative, max-int, max-length)',
  'Concurrent / re-entrant calls',
  'Network or I/O failure (timeout, partial response)',
  'Partial failures mid-transaction',
  'Malformed or adversarial input (injection, oversized payload)',
  'Authentication / authorization edge cases',
];

const PYTHON_RISK_AREAS = [
  'None propagation through call chain',
  'Large list/generator exhaustion',
  'Encoding issues (UTF-8 vs bytes vs str)',
  'asyncio task cancellation handling',
];

const TYPESCRIPT_RISK_AREAS = [
  'undefined vs null coercion paths',
  'Promise rejection without await',
  'Type narrowing missed at runtime (any smuggling)',
  'Event-loop starvation on heavy sync computation',
];

const JAVA_RISK_AREAS = [
  'NullPointerException in Optional chains',
  'Integer overflow in accumulation loops',
  'Thread-safety of shared mutable state',
  'Transaction isolation level edge cases',
];

function frameworkRiskAreas(framework: TestFramework): string[] {
  switch (framework) {
    case 'pytest':
      return PYTHON_RISK_AREAS;
    case 'vitest':
    case 'jest':
      return TYPESCRIPT_RISK_AREAS;
    case 'junit':
      return JAVA_RISK_AREAS;
    default:
      return [];
  }
}

function snippetRiskSignals(snippet: string): string[] {
  const signals: string[] = [];
  const lower = snippet.toLowerCase();

  if (lower.includes('open(') || lower.includes('read_file') || lower.includes('fs.read')) {
    signals.push('File not found / permission denied');
  }
  if (lower.includes('await') || lower.includes('async') || lower.includes('promise')) {
    signals.push('Unhandled promise rejection / async race condition');
  }
  if (lower.includes('delete') || lower.includes('drop') || lower.includes('truncate')) {
    signals.push('Destructive operation without guard or confirmation');
  }
  if (lower.includes('http') || lower.includes('fetch') || lower.includes('request')) {
    signals.push('Remote service unavailable or returns 4xx/5xx');
  }
  if (lower.includes('for ') || lower.includes('while ') || lower.includes('.map(')) {
    signals.push('Off-by-one error in iteration / empty collection');
  }
  if (lower.includes('parse') || lower.includes('json') || lower.includes('decode')) {
    signals.push('Malformed payload causing parse failure');
  }

  return signals;
}

/**
 * Build a risk-ranked edge-case checklist from the given input.
 */
export function buildEdgeCaseChecklist(input: TestGenerationInput): EdgeCaseChecklist {
  const framework = detectTestFramework(input);
  const fnName = safeIdentifier(input.functionName, 'function');
  const modName = safeIdentifier(input.moduleName, 'module');
  const signature = input.functionName ? `${modName}.${fnName}()` : modName;

  const riskAreas = [
    ...UNIVERSAL_RISK_AREAS,
    ...frameworkRiskAreas(framework),
    ...snippetRiskSignals(input.contextSnippet ?? ''),
  ];

  const checklistItems = riskAreas.map((area) => `[ ] ${area}`);

  return {
    functionSignature: signature,
    riskAreas,
    checklistItems,
  };
}

// ─── Framework Conventions ────────────────────────────────────────────────────

/** Return test conventions for the given framework. */
export function getFrameworkTestConventions(framework: TestFramework): FrameworkTestConventions {
  return CONVENTIONS_MAP[framework] ?? UNKNOWN_CONVENTIONS;
}
