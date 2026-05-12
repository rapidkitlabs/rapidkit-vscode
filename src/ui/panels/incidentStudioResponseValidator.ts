/**
 * Incident Studio Response Contract Validator
 *
 * Enforces deterministic response schemas and claim discipline per:
 * WORKSPAI_INCIDENT_STUDIO_ENTERPRISE_PRODUCT_UX_SPEC.md § 7 (AI Response Contract)
 *
 * Validates:
 * 1. Length constraints: 8-12 lines (workspace), 6-10 lines (project)
 * 2. Required sections: Assumptions must be present
 * 3. Claim discipline: No unsourced claims
 * 4. Command format: Exactly one deterministic next command and verify command
 */

export type ResponseScope = 'workspace' | 'project';

export interface ValidationViolation {
  rule: string;
  severity: 'error' | 'warning';
  detail: string;
  lineRange?: [number, number]; // 1-indexed line numbers
}

export interface ValidationResult {
  isValid: boolean;
  scope: ResponseScope;
  violations: ValidationViolation[];
  lineCount: number;
  hasAssumptions: boolean;
  commandCount: number;
}

/**
 * Validate AI response against Incident Studio response contract
 * @param response - The raw AI response text
 * @param scope - 'workspace' for workspace-level, 'project' for project-level
 * @returns ValidationResult with violations list
 */
export function validateIncidentStudioResponse(
  response: string,
  scope: ResponseScope = 'workspace'
): ValidationResult {
  const lines = response.split('\n');
  const violations: ValidationViolation[] = [];
  const requiredSections =
    scope === 'workspace'
      ? [
          'Workspace Status',
          'Priority Issues',
          'Cross-Project Risks',
          'Recommended Action',
          'Verification',
          'Affected Projects',
          'Assumptions',
        ]
      : [
          'What happened',
          'Why',
          'Next command',
          'Verify command',
          'Risk and confidence',
          'Assumptions',
        ];

  // 1. CHECK: Length constraint
  const lineCount = lines.filter((line) => line.trim()).length;
  const minLines = scope === 'workspace' ? 8 : 6;
  const maxLines = scope === 'workspace' ? 12 : 10;

  if (lineCount < minLines) {
    violations.push({
      rule: 'LENGTH_TOO_SHORT',
      severity: 'warning',
      detail: `Response has ${lineCount} lines; minimum is ${minLines} for ${scope} scope`,
    });
  }

  if (lineCount > maxLines) {
    violations.push({
      rule: 'LENGTH_TOO_LONG',
      severity: 'error',
      detail: `Response has ${lineCount} lines; maximum is ${maxLines} for ${scope} scope`,
      lineRange: [maxLines + 1, lines.length],
    });
  }

  // 2. CHECK: Markdown tables (forbidden by default)
  if (hasMarkdownTable(response)) {
    const tableLines = lines
      .map((line, idx) => (isMarkdownTableLine(line) ? idx + 1 : null))
      .filter((n) => n !== null);
    violations.push({
      rule: 'MARKDOWN_TABLE_FORBIDDEN',
      severity: 'error',
      detail: 'Response contains markdown tables; use bullet points instead',
      lineRange:
        tableLines.length > 0 ? [tableLines[0]!, tableLines[tableLines.length - 1]!] : undefined,
    });
  }

  // 3. CHECK: Fenced code blocks (forbidden by default)
  const codeBlockLines = lines
    .map((line, idx) => (line.trim().startsWith('```') ? idx + 1 : null))
    .filter((n) => n !== null);
  if (codeBlockLines.length > 0) {
    violations.push({
      rule: 'CODE_BLOCK_FORBIDDEN',
      severity: 'error',
      detail: 'Response contains fenced code blocks (```); use plain text for commands',
      lineRange: [codeBlockLines[0]!, codeBlockLines[codeBlockLines.length - 1]!],
    });
  }

  // 4. CHECK: Required sections
  const hasAssumptions = checkSectionPresence(response, ['Assumptions', 'assumption']);
  if (!hasAssumptions) {
    violations.push({
      rule: 'MISSING_ASSUMPTIONS_SECTION',
      severity: 'error',
      detail: 'Response must include Assumptions section (even if "none")',
    });
  }

  const sectionOrder = validateRequiredSectionOrder(lines, requiredSections);
  if (!sectionOrder.isValid) {
    violations.push(...sectionOrder.violations);
  }

  // 5. CHECK: Command count (workspace vs project)
  const commandCount = countDeterministicCommands(response, scope);
  if (scope === 'workspace') {
    // Workspace should have: "Recommended Action" and "Verification"
    if (sectionOrder.recommendedActionCount !== 1) {
      violations.push({
        rule: 'MISSING_DETERMINISTIC_COMMAND',
        severity: 'error',
        detail: 'Response must include exactly one Recommended Action command section',
      });
    }
    if (sectionOrder.verificationCount !== 1) {
      violations.push({
        rule: 'MISSING_VERIFY_COMMAND',
        severity: 'error',
        detail: 'Response must include exactly one Verification command section',
      });
    }
    if (commandCount > 2) {
      violations.push({
        rule: 'TOO_MANY_COMMANDS',
        severity: 'warning',
        detail: `Response has ${commandCount} commands; expected exactly 2 (Recommended Action + Verification)`,
      });
    }
  } else {
    // Project should have: "Next command" and "Verify command"
    if (sectionOrder.nextCommandCount !== 1) {
      violations.push({
        rule: 'MISSING_NEXT_COMMAND',
        severity: 'error',
        detail: 'Response must include exactly one Next command section',
      });
    }
    if (sectionOrder.verifyCommandCount !== 1) {
      violations.push({
        rule: 'MISSING_VERIFY_COMMAND',
        severity: 'error',
        detail: 'Response must include exactly one Verify command section',
      });
    }
    if (commandCount > 2) {
      violations.push({
        rule: 'TOO_MANY_COMMANDS',
        severity: 'warning',
        detail: `Response has ${commandCount} commands; expected exactly 2 (Next + Verify)`,
      });
    }
  }

  // 6. CHECK: Claim discipline (no unsourced claims) - only warn if there are suspicious claims
  const unsourcedClaimLines = detectUnsourcedClaims(lines);
  if (unsourcedClaimLines.length > 2) {
    // Only flag if there are many unsourced claims (3+)
    violations.push({
      rule: 'UNSOURCED_CLAIM',
      severity: 'warning',
      detail: `Response contains multiple unsourced claims. Mark inferred claims with "(assumption)" or cite evidence source.`,
      lineRange:
        unsourcedClaimLines.length > 0
          ? [unsourcedClaimLines[0]!, unsourcedClaimLines[unsourcedClaimLines.length - 1]!]
          : undefined,
    });
  }

  // Determine overall validity
  const hasErrors = violations.some((v) => v.severity === 'error');
  const isValid = !hasErrors;

  return {
    isValid,
    scope,
    violations,
    lineCount,
    hasAssumptions,
    commandCount,
  };
}

/**
 * Check if response contains required section
 */
function checkSectionPresence(response: string, sectionNames: string[]): boolean {
  const lowerResponse = response.toLowerCase();
  return sectionNames.some((name) => {
    const patterns = [`${name}:`, `**${name}**`, `## ${name}`, `- ${name}:`];
    return patterns.some((pattern) => lowerResponse.includes(pattern.toLowerCase()));
  });
}

function validateRequiredSectionOrder(
  lines: string[],
  requiredSections: string[]
): {
  isValid: boolean;
  violations: ValidationViolation[];
  recommendedActionCount: number;
  verificationCount: number;
  nextCommandCount: number;
  verifyCommandCount: number;
} {
  const violations: ValidationViolation[] = [];

  const headingIndex = (heading: string): number => {
    const target = heading.toLowerCase();
    return lines.findIndex((line) => line.trim().toLowerCase().startsWith(`${target}:`));
  };

  const sectionIndices = requiredSections.map((section) => ({
    section,
    index: headingIndex(section),
  }));
  const presentSections = sectionIndices.filter((entry) => entry.index >= 0);
  for (let i = 1; i < presentSections.length; i++) {
    if (presentSections[i]!.index < presentSections[i - 1]!.index) {
      violations.push({
        rule: 'SECTION_ORDER_INVALID',
        severity: 'warning',
        detail: `Response sections are out of order; expected ${requiredSections.join(' -> ')}`,
      });
      break;
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    recommendedActionCount: countHeadingOccurrences(lines, 'Recommended Action'),
    verificationCount: countHeadingOccurrences(lines, 'Verification'),
    nextCommandCount: countHeadingOccurrences(lines, 'Next command'),
    verifyCommandCount: countHeadingOccurrences(lines, 'Verify command'),
  };
}

function countHeadingOccurrences(lines: string[], heading: string): number {
  const target = heading.toLowerCase();
  return lines.filter((line) => line.trim().toLowerCase().startsWith(`${target}:`)).length;
}

/**
 * Count deterministic commands in response
 * Looks for command-starting patterns
 */
function countDeterministicCommands(response: string, scope: ResponseScope): number {
  const lines = response.split('\n');
  const patterns =
    scope === 'workspace'
      ? [/^Recommended Action:\s*\S+/i, /^Verification:\s*\S+/i]
      : [/^Next command:\s*\S+/i, /^Verify command:\s*\S+/i];

  return lines.reduce((count, line) => {
    const trimmed = line.trim();
    return count + (patterns.some((pattern) => pattern.test(trimmed)) ? 1 : 0);
  }, 0);
}

/**
 * Detect lines that make claims without evidence markers
 */
function detectUnsourcedClaims(lines: string[]): number[] {
  const unsourcedLines: number[] = [];
  const evidenceMarkers = [
    'from doctor',
    'evidence shows',
    'confirmed',
    'verified',
    '(assumption)',
    'assuming',
    'likely',
    'appears to',
    'suggest that',
    'based on',
    'block shows',
    'doctor shows',
    'evidence block',
  ];

  lines.forEach((line, idx) => {
    const trimmed = line.trim().toLowerCase();

    // Skip empty lines, section headers, and commands
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('-') ||
      trimmed.startsWith('>') ||
      (trimmed.includes(':') && trimmed.length < 50)
    ) {
      return;
    }

    // Check if line makes a claim (contains words like "is", "has", "shows", etc.)
    const claimPatterns = /\b(is|has|shows|contains|missing|found|detected|requires)\b/i;
    const hasClaim = claimPatterns.test(trimmed);

    if (hasClaim) {
      // Check if line has evidence marker
      const hasEvidence = evidenceMarkers.some((marker) => trimmed.includes(marker.toLowerCase()));

      if (!hasEvidence) {
        unsourcedLines.push(idx + 1);
      }
    }
  });

  return unsourcedLines.slice(0, 3); // Return up to 3 lines
}

/**
 * Format validation result for logging and telemetry
 */
export function formatValidationReport(result: ValidationResult): string {
  const status = result.isValid ? '✓ PASS' : '✗ FAIL';
  const lines: string[] = [
    `${status} | ${result.scope.toUpperCase()} scope | ${result.lineCount} lines | ${result.commandCount} commands`,
  ];

  if (result.violations.length === 0) {
    lines.push('No violations detected.');
  } else {
    result.violations.forEach((v) => {
      const badge = v.severity === 'error' ? '[ERROR]' : '[WARN]';
      lines.push(`${badge} ${v.rule}: ${v.detail}`);
    });
  }

  return lines.join('\n');
}

/**
 * Extract error messages for user feedback
 */
export function extractErrorMessages(result: ValidationResult): string[] {
  return result.violations.filter((v) => v.severity === 'error').map((v) => v.detail);
}

/**
 * Check if a single line is part of a markdown table structure
 */
function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  // Must have pipes AND consecutive pipes with dashes/colons between them
  // Format: | --- | --- |
  return /^\|[\s-:|]+\|/.test(trimmed) && /-{2,}/.test(trimmed);
}

/**
 * Check if response contains actual markdown table structure
 */
function hasMarkdownTable(response: string): boolean {
  const lines = response.split('\n');
  let pipeCount = 0;
  let dashLineCount = 0;

  for (const line of lines) {
    if (isMarkdownTableLine(line)) {
      dashLineCount++;
    }
    if (line.trim().startsWith('|') && line.includes('|')) {
      pipeCount++;
    }
  }

  // Only flag as table if we have actual table structure (dash line + pipe lines)
  return dashLineCount > 0 && pipeCount > 1;
}
