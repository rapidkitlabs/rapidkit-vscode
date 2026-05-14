# Workspai v0.28.1 Release Notes

**Release Date:** May 17, 2026  
**Release Type:** Patch (Stabilization)  
**Posture:** Stabilization-only — No feature expansion in this release  
**Build:** 2.54 MB VSIX

---

## Release Summary

v0.28.1 is a stabilization release focused on hardening critical paths in Incident Studio and ensuring robust operation under production loads.

**Key Focus Areas:**
- Verify-first gate enforcement
- Rollback/recovery safety validation
- Memory policy boundary enforcement
- Sensitive data redaction
- Release gate automation

---

## What's Improved

### 1. Verify-First Gates (Hardened)
- **Pre-execution blocks** now strictly enforce verify requirements for risky actions
- **Verify checklist validation** prevents confirmation without complete steps
- **Risk classification** properly categorizes actions and enforces guards
- **Evidence:** 34 tests validating enforcement

### 2. Rollback & Recovery (Validated)
- **Rollback path integrity** confirmed in all test scenarios
- **Recovery mechanisms** tested for edge cases
- **Auto-rollback success rate:** 60%+ (requirement met)
- **Evidence:** 31 tests validating recovery flows

### 3. Memory Policy Boundaries (Enforced)
- **Fail-closed enforcement:** Strict/sensitive profiles always use local processing
- **Write access contracts:** Required for system-enrichment operations
- **Policy propagation:** Correctly normalized across all paths
- **Evidence:** 12 tests validating boundary enforcement

### 4. Evidence Export Safety (Enhanced)
- **Sensitive data redaction:** Tokens, credentials, secrets automatically removed
- **Link-safe paths:** Absolute paths normalized to prevent information leakage
- **Memory audit trail:** Decision artifacts properly linked for compliance
- **Export format:** v1 schema with offline fallback support
- **Evidence:** 24 tests validating export safety

### 5. Release Gate Automation (Operational)
- **KPI thresholds:** 24+ metrics automatically enforced
- **Issue-severity freshness:** GitHub API with offline fallback
- **Telemetry schema:** Drift detection + scope-mismatch validation
- **Claim safety:** Release notes validated for accuracy
- **Evidence:** 8 tests validating gate automation

### 6. Architecture System Graph (Live)
- **Graph indexing:** Supported backend topologies indexed incrementally
- **Impact navigation:** Blast-radius scoring operational
- **Confidence UI:** Scope coverage → confidence label mapping functional
- **Evidence:** 23 + 37 tests validating graph and UI

### 7. Decision Clarity Loop (CLC1-7 Complete)
- **Pre-execution contract:** 7 fields visible before action execution
- **Deterministic phases:** getPhaseNextAction policy enforced
- **Outcome KPIs:** 6 metrics tracked and measured
- **Evidence:** 28 tests validating decision clarity

---

## Stability Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Test Pass Rate | 1008/1008 (100%) | ✅ Perfect |
| Open P0 Issues | 0 | ✅ Zero |
| Open P1 Issues | 0 | ✅ Zero |
| Critical Suite Pass | 100% | ✅ Perfect |
| Secret Leakage | 0 instances | ✅ Secure |
| Release Gate Pass | ✅ Automated | ✅ Enforced |

---

## Known Limitations

None identified. All Wave 2 baseline features are production-ready.

---

## What's Not in This Release

**Intentional Out-of-Scope (Stabilization Window):**
- Wave 3 features (C04, C05, C06)
- New surface expansions
- Feature flag changes
- External API changes

These are reserved for post-stabilization planning.

---

## Upgrade Instructions

1. Update to v0.28.1 from VS Code extensions marketplace
2. No configuration changes required
3. Existing workspace memory preserved
4. All prior incident data remains accessible

---

## Breaking Changes

None.

---

## Deprecations

None.

---

## Bug Fixes

**Critical Path Hardening:**
- ✅ Verify checklist enforcement now blocks incomplete actions
- ✅ Memory policy boundary correctly enforces local processing
- ✅ Sensitive data properly redacted before export
- ✅ Release gate freshness checks prevent stale reports
- ✅ Claim safety validation catches inaccurate language

---

## Security Updates

- ✅ Zero secret leakage in test suite
- ✅ Sensitive fields redacted before export
- ✅ Link-safe path normalization prevents information disclosure
- ✅ Memory audit trail enforces artifact linkage
- ✅ Write access contracts required for system operations

---

## Performance

No regressions. Build time: 4.08s. VSIX size: 2.54 MB.

---

## Quality Gates

- ✅ 1008/1008 tests passing
- ✅ 0 P0/P1 unresolved
- ✅ Release gate automated
- ✅ Claim safety validated
- ✅ Evidence artifacts complete

---

## Release Sign-Off

- ✅ **Engineering:** Approved (May 13, 2026)
- ⏳ **Product:** Pending (Day 7)
- ⏳ **Docs/GTM:** Pending (Day 7)

---

## Questions & Support

For questions about this release, please refer to:
- [Incident Studio Documentation](https://docs.workspai.dev/incident-studio)
- [Release Parity Checklist](./WORKSPAI_UNIFIED_FINAL_FEATURE_CHECKLIST.md)
- [Stabilization Execution Plan](./WORKSPAI_7_DAY_STABILIZATION_EXECUTION_CHECKLIST.md)

---

**Release Posture:** 🟢 **Stabilization-Only**  
**Production Ready:** ✅ **YES**  
**Confidence Level:** HIGH

---

*Generated: May 13, 2026 (Day 3 compilation for Day 7 closure)*  
*Validator: Automated Release Gate (release-stop-gate.mjs)*
