import { describe, expect, it } from 'vitest';

import {
  buildEdgeCaseChecklist,
  buildIntegrationTestStub,
  buildUnitTestStub,
  detectTestFramework,
  getFrameworkTestConventions,
  type TestGenerationInput,
} from '../ui/panels/aiTestGenerator';

describe('aiTestGenerator', () => {
  // ── detectTestFramework ────────────────────────────────────────────────────

  describe('detectTestFramework', () => {
    it('returns explicit framework when set', () => {
      const input: TestGenerationInput = { framework: 'rspec' };
      expect(detectTestFramework(input)).toBe('rspec');
    });

    it('detects pytest from fastapi kit prefix', () => {
      expect(detectTestFramework({ kitType: 'fastapi.ddd' })).toBe('pytest');
    });

    it('detects pytest from python kit prefix', () => {
      expect(detectTestFramework({ kitType: 'python.standard' })).toBe('pytest');
    });

    it('detects jest from nestjs kit prefix', () => {
      expect(detectTestFramework({ kitType: 'nestjs.standard' })).toBe('jest');
    });

    it('detects junit from spring kit prefix', () => {
      expect(detectTestFramework({ kitType: 'spring.mvc' })).toBe('junit');
    });

    it('detects pytest from .py file extension', () => {
      expect(detectTestFramework({ fileExtension: 'py' })).toBe('pytest');
    });

    it('detects vitest from .ts file extension', () => {
      expect(detectTestFramework({ fileExtension: 'ts' })).toBe('vitest');
    });

    it('detects jest from .js file extension', () => {
      expect(detectTestFramework({ fileExtension: 'js' })).toBe('jest');
    });

    it('detects junit from .java file extension', () => {
      expect(detectTestFramework({ fileExtension: 'java' })).toBe('junit');
    });

    it('detects rspec from .rb file extension', () => {
      expect(detectTestFramework({ fileExtension: 'rb' })).toBe('rspec');
    });

    it('detects go-testing from .go file extension', () => {
      expect(detectTestFramework({ fileExtension: 'go' })).toBe('go-testing');
    });

    it('detects pytest from snippet containing import pytest', () => {
      expect(detectTestFramework({ contextSnippet: 'import pytest\nassert x == 1' })).toBe(
        'pytest'
      );
    });

    it('detects vitest from snippet containing from vitest import', () => {
      expect(detectTestFramework({ contextSnippet: "import { it } from 'vitest';" })).toBe(
        'vitest'
      );
    });

    it('returns unknown when no evidence', () => {
      expect(detectTestFramework({})).toBe('unknown');
    });
  });

  // ── buildUnitTestStub ──────────────────────────────────────────────────────

  describe('buildUnitTestStub', () => {
    it('generates a pytest unit stub with correct file name', () => {
      const stub = buildUnitTestStub({
        functionName: 'calculate_discount',
        moduleName: 'PricingService',
        fileExtension: 'py',
      });
      expect(stub.framework).toBe('pytest');
      expect(stub.testFileName).toBe('test_PricingService.py');
      expect(stub.imports.some((imp) => imp.includes('pytest'))).toBe(true);
      expect(stub.imports.some((imp) => imp.includes('calculate_discount'))).toBe(true);
    });

    it('pytest stub includes happy path, raises, and parametrize test cases', () => {
      const stub = buildUnitTestStub({
        functionName: 'parse_config',
        moduleName: 'ConfigLoader',
        fileExtension: 'py',
      });
      const names = stub.testCases.map((tc) => tc.name);
      expect(names.some((n) => n.includes('happy_path'))).toBe(true);
      expect(names.some((n) => n.includes('raises'))).toBe(true);
      expect(names.some((n) => n.includes('boundary'))).toBe(true);
    });

    it('generates a vitest unit stub for .ts extension', () => {
      const stub = buildUnitTestStub({
        functionName: 'formatDate',
        moduleName: 'DateUtils',
        fileExtension: 'ts',
      });
      expect(stub.framework).toBe('vitest');
      expect(stub.testFileName).toBe('DateUtils.test.ts');
      expect(stub.imports.some((imp) => imp.includes('vitest'))).toBe(true);
    });

    it('vitest stub includes happy path, throws, and boundary test cases', () => {
      const stub = buildUnitTestStub({
        functionName: 'sumValues',
        moduleName: 'MathHelper',
        fileExtension: 'ts',
      });
      const names = stub.testCases.map((tc) => tc.name);
      expect(names.some((n) => /valid|happy|expected/i.test(n))).toBe(true);
      expect(names.some((n) => /throw|invalid/i.test(n))).toBe(true);
      expect(names.some((n) => /boundary/i.test(n))).toBe(true);
    });

    it('generates a jest unit stub for .js extension', () => {
      const stub = buildUnitTestStub({
        functionName: 'buildUrl',
        moduleName: 'UrlBuilder',
        fileExtension: 'js',
      });
      expect(stub.framework).toBe('jest');
      expect(stub.testFileName).toBe('UrlBuilder.test.ts');
    });

    it('generates a junit unit stub for .java extension', () => {
      const stub = buildUnitTestStub({
        functionName: 'computeTotal',
        moduleName: 'OrderService',
        fileExtension: 'java',
      });
      expect(stub.framework).toBe('junit');
      expect(stub.testFileName).toBe('OrderServiceTest.java');
      expect(stub.imports.some((imp) => imp.includes('junit'))).toBe(true);
    });

    it('generates a rspec unit stub for .rb extension', () => {
      const stub = buildUnitTestStub({
        functionName: 'apply_discount',
        moduleName: 'CartService',
        fileExtension: 'rb',
      });
      expect(stub.framework).toBe('rspec');
      expect(stub.testFileName).toBe('CartService_spec.rb');
    });

    it('generates a go-testing unit stub for .go extension', () => {
      const stub = buildUnitTestStub({
        functionName: 'parseToken',
        moduleName: 'authMiddleware',
        fileExtension: 'go',
      });
      expect(stub.framework).toBe('go-testing');
      expect(stub.testFileName).toBe('authMiddleware_test.go');
      expect(stub.imports.some((imp) => imp.includes('testing'))).toBe(true);
    });

    it('falls back to unknown stub when no framework evidence', () => {
      const stub = buildUnitTestStub({ functionName: 'doThing' });
      expect(stub.framework).toBe('unknown');
      expect(stub.testCases.length).toBeGreaterThan(0);
    });

    it('uses safe identifier for function and module names with special chars', () => {
      const stub = buildUnitTestStub({
        functionName: 'my-func!',
        moduleName: 'My Module',
        fileExtension: 'ts',
      });
      expect(stub.testFileName).not.toMatch(/[!@# ]/);
    });
  });

  // ── buildIntegrationTestStub ───────────────────────────────────────────────

  describe('buildIntegrationTestStub', () => {
    it('generates a pytest integration stub with setup steps', () => {
      const stub = buildIntegrationTestStub({
        functionName: 'create_order',
        moduleName: 'OrderRepo',
        fileExtension: 'py',
      });
      expect(stub.framework).toBe('pytest');
      expect(stub.testFileName).toBe('test_OrderRepo_integration.py');
      expect(stub.setupSteps.length).toBeGreaterThan(0);
      expect(stub.setupSteps.some((s) => /service|DB|migration/i.test(s))).toBe(true);
    });

    it('pytest integration stub includes roundtrip and rollback test cases', () => {
      const stub = buildIntegrationTestStub({
        functionName: 'save_event',
        moduleName: 'EventStore',
        fileExtension: 'py',
      });
      const names = stub.testCases.map((tc) => tc.name);
      expect(names.some((n) => /roundtrip|full/i.test(n))).toBe(true);
      expect(names.some((n) => /rollback|failure/i.test(n))).toBe(true);
    });

    it('generates a vitest integration stub', () => {
      const stub = buildIntegrationTestStub({
        functionName: 'createUser',
        moduleName: 'UserService',
        fileExtension: 'ts',
      });
      expect(stub.framework).toBe('vitest');
      expect(stub.testFileName).toContain('integration');
      expect(stub.setupSteps.length).toBeGreaterThan(0);
    });

    it('generates a junit integration stub with @SpringBootTest pattern', () => {
      const stub = buildIntegrationTestStub({
        functionName: 'processPayment',
        moduleName: 'PaymentService',
        fileExtension: 'java',
      });
      expect(stub.framework).toBe('junit');
      expect(stub.setupSteps.some((s) => /SpringBootTest|DataJpaTest/i.test(s))).toBe(true);
    });
  });

  // ── buildEdgeCaseChecklist ─────────────────────────────────────────────────

  describe('buildEdgeCaseChecklist', () => {
    it('always includes universal risk areas', () => {
      const checklist = buildEdgeCaseChecklist({ functionName: 'doX', moduleName: 'Svc' });
      expect(checklist.riskAreas.some((r) => /null|undefined|nil/i.test(r))).toBe(true);
      expect(checklist.riskAreas.some((r) => /boundary|zero/i.test(r))).toBe(true);
      expect(checklist.riskAreas.some((r) => /concurrent/i.test(r))).toBe(true);
    });

    it('includes framework-specific risk areas for pytest', () => {
      const checklist = buildEdgeCaseChecklist({
        functionName: 'fetch_data',
        moduleName: 'DataLoader',
        fileExtension: 'py',
      });
      expect(checklist.riskAreas.some((r) => /None propagation|asyncio|encoding/i.test(r))).toBe(
        true
      );
    });

    it('includes framework-specific risk areas for vitest/typescript', () => {
      const checklist = buildEdgeCaseChecklist({
        functionName: 'loadConfig',
        moduleName: 'ConfigService',
        fileExtension: 'ts',
      });
      expect(checklist.riskAreas.some((r) => /undefined|null coercion|promise/i.test(r))).toBe(
        true
      );
    });

    it('detects file I/O risk from context snippet', () => {
      const checklist = buildEdgeCaseChecklist({
        functionName: 'readConfig',
        moduleName: 'Loader',
        contextSnippet: "const data = fs.readFileSync('config.json')",
        fileExtension: 'ts',
      });
      expect(checklist.riskAreas.some((r) => /file not found|permission/i.test(r))).toBe(true);
    });

    it('detects async race risk from context snippet', () => {
      const checklist = buildEdgeCaseChecklist({
        functionName: 'fetchUser',
        moduleName: 'UserApi',
        contextSnippet: 'const result = await fetch(url)',
        fileExtension: 'ts',
      });
      expect(checklist.riskAreas.some((r) => /async|promise/i.test(r))).toBe(true);
    });

    it('detects destructive operation risk from context snippet', () => {
      const checklist = buildEdgeCaseChecklist({
        functionName: 'clearTable',
        moduleName: 'DbUtil',
        contextSnippet: 'db.execute("DELETE FROM users")',
        fileExtension: 'py',
      });
      expect(checklist.riskAreas.some((r) => /destructive|guard/i.test(r))).toBe(true);
    });

    it('detects HTTP risk from context snippet', () => {
      const checklist = buildEdgeCaseChecklist({
        functionName: 'callApi',
        moduleName: 'HttpClient',
        contextSnippet: 'response = requests.get(url)',
        fileExtension: 'py',
      });
      expect(checklist.riskAreas.some((r) => /remote|unavailable|4xx|5xx/i.test(r))).toBe(true);
    });

    it('formats all checklist items with [ ] prefix', () => {
      const checklist = buildEdgeCaseChecklist({ functionName: 'compute' });
      expect(checklist.checklistItems.every((item) => item.startsWith('[ ]'))).toBe(true);
    });

    it('uses correct function signature format', () => {
      const checklist = buildEdgeCaseChecklist({
        functionName: 'applyTax',
        moduleName: 'BillingService',
      });
      expect(checklist.functionSignature).toBe('BillingService.applyTax()');
    });

    it('uses module-only signature when no function name provided', () => {
      const checklist = buildEdgeCaseChecklist({ moduleName: 'AuthModule' });
      expect(checklist.functionSignature).toBe('AuthModule');
    });
  });

  // ── getFrameworkTestConventions ────────────────────────────────────────────

  describe('getFrameworkTestConventions', () => {
    it('returns pytest conventions with expected fields', () => {
      const conv = getFrameworkTestConventions('pytest');
      expect(conv.framework).toBe('pytest');
      expect(conv.testRunCommand).toContain('pytest');
      expect(conv.fileNamingPattern).toContain('.py');
      expect(conv.conventions.length).toBeGreaterThan(0);
    });

    it('returns vitest conventions with correct runner command', () => {
      const conv = getFrameworkTestConventions('vitest');
      expect(conv.framework).toBe('vitest');
      expect(conv.testRunCommand).toContain('vitest');
    });

    it('returns jest conventions', () => {
      const conv = getFrameworkTestConventions('jest');
      expect(conv.framework).toBe('jest');
      expect(conv.testRunCommand).toContain('jest');
    });

    it('returns junit conventions with Java file pattern', () => {
      const conv = getFrameworkTestConventions('junit');
      expect(conv.fileNamingPattern).toContain('.java');
      expect(conv.conventions.some((c) => /Mockito|@Param/i.test(c))).toBe(true);
    });

    it('returns rspec conventions with bundle exec command', () => {
      const conv = getFrameworkTestConventions('rspec');
      expect(conv.testRunCommand).toContain('rspec');
    });

    it('returns go-testing conventions with go test command', () => {
      const conv = getFrameworkTestConventions('go-testing');
      expect(conv.testRunCommand).toContain('go test');
    });

    it('returns unknown conventions as safe fallback', () => {
      const conv = getFrameworkTestConventions('unknown');
      expect(conv.conventions.length).toBeGreaterThan(0);
    });

    it('all framework conventions include at least 4 convention items', () => {
      const frameworks = ['pytest', 'vitest', 'jest', 'junit', 'rspec', 'go-testing'] as const;
      for (const fw of frameworks) {
        const conv = getFrameworkTestConventions(fw);
        expect(conv.conventions.length).toBeGreaterThanOrEqual(4);
      }
    });
  });
});
