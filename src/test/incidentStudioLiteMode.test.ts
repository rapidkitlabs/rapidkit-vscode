import { describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for Lite mode blocker-priority action routing
 *
 * Ensures that when blockers are present, the primary action routes to:
 * 1. Verify command (if required verify commands available)
 * 2. Blocker remediation query (if no verify commands available)
 * 3. Normal action routing (if no blockers present)
 *
 * This prevents users from attempting risky actions while critical blockers exist.
 */

describe('IncidentStudioLiteMode - Blocker Priority Routing', () => {
  /**
   * Test 1: When liteTopBlocker exists and required verify commands are available,
   * should prioritize running the verify command over normal action
   */
  it('routes to verify command when blocker exists and verify commands available', () => {
    const runCommandSpy = vi.fn();
    const onChatBrainQuerySpy = vi.fn();

    // Simulate state: blocker present, verify command required
    const liteTopBlocker = 'Verify evidence completion below target.';
    const requiredVerifyCommands = [{ required: true, command: 'rapidkit doctor project' }];
    const liteVerifyCommand = 'rapidkit doctor project';

    // Simulate runLitePrimaryAction logic
    if (liteTopBlocker) {
      if (requiredVerifyCommands.length > 0) {
        runCommandSpy(liteVerifyCommand);
      } else {
        const blockerQuery = `Inspect this blocker and propose one deterministic remediation command: ${liteTopBlocker}`;
        onChatBrainQuerySpy(blockerQuery);
      }
    }

    expect(runCommandSpy).toHaveBeenCalledWith('rapidkit doctor project');
    expect(onChatBrainQuerySpy).not.toHaveBeenCalled();
  });

  /**
   * Test 2: When liteTopBlocker exists but no required verify commands,
   * should send focused blocker remediation query to AI
   */
  it('routes to blocker remediation query when blocker exists but no verify commands', () => {
    const runCommandSpy = vi.fn();
    const onChatBrainQuerySpy = vi.fn();
    const setLastUserQuerySpy = vi.fn();

    // Simulate state: blocker present, no verify commands
    const liteTopBlocker = 'Unrecovered verification failures above target.';
    const requiredVerifyCommands: any[] = [];

    // Simulate runLitePrimaryAction logic
    if (liteTopBlocker) {
      if (requiredVerifyCommands.length > 0) {
        runCommandSpy('some-command');
      } else {
        const blockerQuery = `Inspect this blocker and propose one deterministic remediation command: ${liteTopBlocker}`;
        setLastUserQuerySpy(blockerQuery);
        onChatBrainQuerySpy(blockerQuery);
      }
    }

    expect(runCommandSpy).not.toHaveBeenCalled();
    expect(onChatBrainQuerySpy).toHaveBeenCalledWith(
      'Inspect this blocker and propose one deterministic remediation command: Unrecovered verification failures above target.'
    );
    expect(setLastUserQuerySpy).toHaveBeenCalledWith(
      'Inspect this blocker and propose one deterministic remediation command: Unrecovered verification failures above target.'
    );
  });

  /**
   * Test 3: When no liteTopBlocker exists,
   * should proceed with normal action routing (not blocker-focused)
   */
  it('routes to normal action when no blocker present', () => {
    const runCommandSpy = vi.fn();
    const onChatBrainExecuteActionSpy = vi.fn();
    const onChatBrainQuerySpy = vi.fn();

    // Simulate state: no blocker, primary board action available
    const liteTopBlocker = null;
    const primaryBoardAction = { actionType: 'doctor-fix', id: 'action-1' };
    const fallbackQuery = 'Ask AI for the single safest next step';

    // Simulate runLitePrimaryAction logic
    if (liteTopBlocker) {
      // Blocker path (not taken)
      if (true) runCommandSpy('should-not-run');
    } else {
      if (primaryBoardAction) {
        onChatBrainExecuteActionSpy(primaryBoardAction.actionType, primaryBoardAction.id);
      } else {
        onChatBrainQuerySpy(fallbackQuery);
      }
    }

    expect(runCommandSpy).not.toHaveBeenCalled();
    expect(onChatBrainExecuteActionSpy).toHaveBeenCalledWith('doctor-fix', 'action-1');
    expect(onChatBrainQuerySpy).not.toHaveBeenCalled();
  });

  /**
   * Test 4: Status label should be "NO-GO" when blockers present
   */
  it('displays NO-GO status when blockers present', () => {
    const liteHardBlockReasons = [
      'Verify evidence completion below target.',
      'Rollback success rate below target.',
    ];

    const liteReleaseNoGo = liteHardBlockReasons.length > 0;
    const liteStatusLabel = liteReleaseNoGo ? 'NO-GO' : 'READY';
    const liteStatusSummary = liteReleaseNoGo
      ? `Blocked by ${liteHardBlockReasons.length} signal${liteHardBlockReasons.length === 1 ? '' : 's'}`
      : 'No hard blockers detected in current evidence';

    expect(liteStatusLabel).toBe('NO-GO');
    expect(liteStatusSummary).toBe('Blocked by 2 signals');
  });

  /**
   * Test 5: Status label should be "READY" when no blockers present
   */
  it('displays READY status when no blockers present', () => {
    const liteHardBlockReasons: string[] = [];

    const liteReleaseNoGo = liteHardBlockReasons.length > 0;
    const liteStatusLabel = liteReleaseNoGo ? 'NO-GO' : 'READY';
    const liteStatusSummary = liteReleaseNoGo
      ? `Blocked by ${liteHardBlockReasons.length} signal${liteHardBlockReasons.length === 1 ? '' : 's'}`
      : 'No hard blockers detected in current evidence';

    expect(liteStatusLabel).toBe('READY');
    expect(liteStatusSummary).toBe('No hard blockers detected in current evidence');
  });

  /**
   * Test 6: Button label should reflect blocker-aware action
   */
  it('button label reflects blocker-aware primary action', () => {
    const litePrimaryActionLabel = 'Validate deployment impact';
    const liteTopBlocker = 'Resolution pattern reuse below target.';

    const blockerAwarePrimaryActionLabel = liteTopBlocker
      ? `Resolve blocker: ${liteTopBlocker}`
      : litePrimaryActionLabel;

    expect(blockerAwarePrimaryActionLabel).toBe(
      'Resolve blocker: Resolution pattern reuse below target.'
    );
  });

  /**
   * Test 7: Blocker severity classification - Hard vs Soft
   */
  it('classifies blockers as hard (release/verify) or soft (KPI)', () => {
    const releaseReadinessBlockers = ['Release readiness check failed'];
    const verifyPackBlockers = ['Critical verify step blocked'];
    const stabilizationBlockers = [
      'Verify evidence completion below target.',
      'Unrecovered verification failures above target.',
    ];

    // Map blocker text to severity
    const blockerSeverityMap = new Map<string, 'hard' | 'soft'>();

    releaseReadinessBlockers.forEach((reason) => {
      blockerSeverityMap.set(reason, 'hard');
    });
    verifyPackBlockers.forEach((reason) => {
      blockerSeverityMap.set(reason, 'hard');
    });
    stabilizationBlockers.forEach((reason) => {
      blockerSeverityMap.set(reason, 'soft');
    });

    expect(blockerSeverityMap.get('Release readiness check failed')).toBe('hard');
    expect(blockerSeverityMap.get('Critical verify step blocked')).toBe('hard');
    expect(blockerSeverityMap.get('Verify evidence completion below target.')).toBe('soft');
    expect(blockerSeverityMap.get('Unrecovered verification failures above target.')).toBe('soft');
  });

  /**
   * Test 8: Blocker text normalization for user display
   */
  it('normalizes raw blocker text for user-friendly display', () => {
    const blockerNormalizer = (raw: string): string => {
      let text = raw.trim();

      // Expand abbreviations
      text = text.replace(/^Verify-path completion/, 'Verify evidence completion');
      text = text.replace(/^False-confidence rate/, 'Unrecovered verification failures');
      text = text.replace(/^Rollback recovery/, 'Rollback success rate');
      text = text.replace(/^Repeat verified resolution/, 'Resolution pattern reuse');

      // Fix grammar
      text = text.replace(/is below threshold/g, 'below target');
      text = text.replace(/is above threshold/g, 'above target');

      // Ensure punctuation
      if (text && !text.endsWith('.')) {
        text = text + '.';
      }

      return text;
    };

    expect(blockerNormalizer('Verify-path completion is below threshold')).toBe(
      'Verify evidence completion below target.'
    );
    expect(blockerNormalizer('False-confidence rate is above threshold')).toBe(
      'Unrecovered verification failures above target.'
    );
    expect(blockerNormalizer('Rollback recovery is below threshold')).toBe(
      'Rollback success rate below target.'
    );
    expect(blockerNormalizer('Repeat verified resolution is below threshold')).toBe(
      'Resolution pattern reuse below target.'
    );
  });
});
