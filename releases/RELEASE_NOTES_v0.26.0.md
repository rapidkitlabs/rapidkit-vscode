# Workspai v0.26.0 Release Notes

**Release Date:** May 8, 2026  
**Version:** 0.25.0 → 0.26.0  
**Quality Gates:** typecheck ✓ | build ✓ | 736/736 tests ✓

---

## Executive Summary

This release ships **four independent hardening initiatives** that collectively improve model selection reliability, streaming robustness, UI clarity, and add strategic VS Code 1.119 alignment:

1. **Browser smoke test action** — new Incident Studio action type for AI-guided web app verification (VS Code 1.119 native browser agent tools support)
2. **Auto model selection regression fix** — preserves `'auto'` string through all normalize helpers so UI state doesn't collapse
3. **Smart rate-limit fallback** — one-shot intelligent fallback on 429/quota/overloaded with cache reset before first chunk
4. **View controls UI polish** — larger icons/labels in header with dedicated CSS context for clarity

---

## ✦ Feature: Browser Smoke Test Action

### Overview

New `browser-smoke-test` action type enables AI-guided smoke testing of web applications directly from Incident Studio. Opens the project's dev server in VS Code simple browser and generates a structured verification report:

- **Verified endpoints:** HTTP status codes for key routes
- **Detected issues:** Any problems found during testing
- **Smoke result:** Overall PASS/FAIL
- **Recommended next step:** What to do if test fails

### User Flow

**Trigger:**
```
User in Incident Studio: "run a browser smoke test"
Copilot recognizes keywords: browser smoke, smoke test, ui smoke, etc.
```

**Action executes:**
1. Detects running dev server port from `runningServers` registry
2. Opens VS Code simple browser with detected URL (e.g., `http://localhost:8000`)
3. Generates AI-driven smoke test prompt
4. Returns structured report

### Technical Implementation

#### 1. Action Matrix (`incidentCliActionMatrix.ts`)

```typescript
{
    id: 'project-browser-smoke-test',
    scope: 'project',  // only for project-scoped incidents
    label: 'Run browser smoke test',
    detail: 'Open project in VS Code browser and verify key UI surfaces...',
    command: 'rapidkit dev',
    stability: 'advanced',
    actionTypes: ['browser-smoke-test'],
}
```

**Key properties:**
- `scope: 'project'` — only available when user selects a project
- `stability: 'advanced'` — may be hidden in Guided mode
- `actionTypes: ['browser-smoke-test']` — routing key for action resolution

#### 2. Prompt Policy (`incidentStudioPromptPolicy.ts`)

**Allowlist:**
```typescript
INCIDENT_ACTION_ALLOWLIST.add('browser-smoke-test')
```

**Risk classification:**
```typescript
riskClass: 'non-mutating-executable',  // read-only, no filesystem/git changes
riskLevel: 'low',                      // safe to run automatically
requiresImpactReview: false,            // no blast radius analysis
requiresVerifyPath: false,              // no deterministic verify steps
allowCompletionClaimWithoutVerify: true // can resolve incident without verify
```

#### 3. Payload Contracts (`incidentStudioPayload.ts`)

`buildIncidentActionExecutionMetadata` integrates `browser-smoke-test` into non-mutating-executable branch for consistent risk evaluation across webview → panel → telemetry layers.

#### 4. Action Routing (`welcomePanel.ts`)

**Type definition:**
```typescript
type RoutingResult = {
  actionType: 'browser-smoke-test' | ... other types ...
  fallbackReason: 'success' | ...
}
```

**Keyword detection:**
```typescript
if (normalized.includes('browser smoke') ||
    normalized.includes('smoke test') ||
    normalized.includes('ui smoke') ||
    normalized.includes('browser test') ||
    normalized.includes('browser check') ||
    normalized.includes('verify ui') ||
    normalized.includes('verify browser') ||
    normalized.includes('open browser')) {
  return { actionType: 'browser-smoke-test', fallbackReason: 'success' }
}
```

**Inline query builder:**
1. Detects running server port from `runningServers` registry
2. Opens VS Code simple browser (graceful fallback if unavailable)
3. Generates AI smoke test checklist with 4 sections:
   - Smoke result (PASS/FAIL)
   - Verified endpoints (URL → status → pass/fail)
   - Detected issues
   - Recommended next step

### VS Code 1.119 Alignment

**New browser agent tools API:**
- `workbench.browser.enableChatTools` — enables agent browser integration
- Browser tools: `openBrowserPage`, `navigatePage`, `readPage`, `screenshotPage`, `clickElement`, `runPlaywrightCode`

**How browser-smoke-test leverages this:**
1. Opens browser tab with `openBrowserPage` or `simpleBrowser.show`
2. AI agent can `readPage` to inspect DOM/content
3. AI agent can `clickElement` to interact with UI
4. AI agent can `screenshotPage` for visual inspection
5. AI returns structured smoke test report

---

## ✦ Fix: Auto Model Selection Regression

### Problem

In v0.25.0, the model selection UI broke for explicit 'auto' selections because three normalize functions converted the literal string `'auto'` to `null`/`undefined`:

```typescript
// BROKEN:
normalizeSelectedModelId('auto') → null       // should be 'auto'
normalizeRequestedModelId('auto') → undefined // should be 'auto'
normalizePreferredModelId('auto') → undefined // should be 'auto'
```

This collapsed the explicit Auto model selection into no-selection state, breaking the flow where users explicitly request Auto model.

### Root Cause

Normalize functions conflated two distinct semantic meanings:
1. **Empty selection sentinel** (user hasn't picked a model) → convert to null
2. **Explicit 'auto' selection** (user/system chose Auto model) → preserve as string

### Solution

Updated all three normalize functions to only convert truly empty values:

**`App.tsx` (`normalizeSelectedModelId`):**
```typescript
function normalizeSelectedModelId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // ✓ Preserve 'auto' as literal string
  return trimmed
}
```

**`welcomePanel.ts` (`normalizeRequestedModelId`):**
```typescript
const normalizeRequestedModelId = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  // ✓ Preserve 'auto' as literal string
  return trimmed
}
```

**`aiService.ts` (`normalizePreferredModelId`):**
```typescript
export const normalizePreferredModelId = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined
  if (!raw) return undefined
  // ✓ Preserve 'auto' (and any other string) as-is
  return raw
}
```

### Impact

- ✓ Auto model selection flows correctly through all layers
- ✓ Explicit `modelId: 'auto'` requests reach streaming layer unchanged
- ✓ `selectModelAuto()` called correctly when `modelId === 'auto'`
- ✓ View displays selected model correctly for both explicit and inferred models

---

## ✦ Feature: Smart Rate-Limit Fallback

### Problem

When the primary AI model hit a rate limit (HTTP 429) or quota error, the entire streaming session failed with no recovery. Users had to manually wait or select a different model and retry.

### Solution

Implemented intelligent one-shot fallback in `streamAIResponse` (`aiService.ts`):

**1. Error detection (`isRetryableModelRequestError`):**
```typescript
function isRetryableModelRequestError(err: unknown): boolean {
  const msg = String(err).toLowerCase()
  return /429|rate limit|quota|unavailable|overloaded|busy|service unavailable|model unavailable/.test(msg)
}
```

Detects: 429, rate limit, quota, service unavailable, overloaded, busy, etc.

**2. Fallback model selection (`selectFallbackModelForFailure`):**
```typescript
async function selectFallbackModelForFailure(failedModel) {
  // 1. Reset cache so auto-selection picks something different
  resetModelSelectionCache()
  
  // 2. Call auto-select to get alternative
  const alternative = await selectModelAuto()
  
  // 3. If auto-select picks same model, try raw registry
  if (isSameModel(alternative.model, failedModel)) {
    const models = await vscode.lm.selectChatModels()
    const other = models.find(m => !isSameModel(m, failedModel))
    if (other) return { model: other, modelId: other.id }
  }
  
  return alternative
}
```

**3. Guarded retry (only before first chunk):**
```typescript
let emittedFromPrimary = false

const streamWithModel = async (selected, onEmitChunk) => {
  const stream = await selected.sendRequest([...])
  for await (const chunk of stream) {
    emittedFromPrimary = true  // Mark that we got data
    onEmitChunk(chunk)
  }
  return true
}

try {
  await streamWithModel(selected, onEmitChunk)
} catch (err) {
  if (isRetryableModelRequestError(err) && !emittedFromPrimary) {
    // Only retry if:
    // 1. Error is retryable (429, quota, overloaded, etc.)
    // 2. We haven't streamed any data yet
    const fallback = await selectFallbackModelForFailure(selected.model)
    if (fallback) {
      selected = fallback
      await streamWithModel(selected, onEmitChunk)
    }
  }
}
```

**Key safety properties:**
- ✓ One-shot only — no cascading retries
- ✓ No duplicate content — `emittedFromPrimary` prevents streaming partial then complete response
- ✓ Smart alternative — auto-select respects user preferences, cache reset forces different model
- ✓ Graceful degradation — if fallback unavailable, original error surfaces

### Regression Test

**New test in `aiService.test.ts`:**
```typescript
it('falls back to another model when initial request fails with retryable rate-limit error', () => {
  // Setup
  const autoModel = { /* returns 429 */ }
  const fallbackModel = { /* returns valid response */ }
  
  // Execute
  const result = await streamAIResponse({ modelId: 'auto', ... })
  
  // Verify
  expect(mockSelectChatModels).toHaveBeenCalledTimes(2)  // once for auto, once for fallback
  expect(result.chunks).toEqual(['fallback response'])
  expect(result.modelId).toBe('GPT-4o')  // fallback model ID
})
```

**Result:** ✓ 15/15 tests passing in aiService.test.ts

---

## ✦ Polish: View Controls UI

### Changes

Increased readability of Incident Studio header View controls (Maximize and Lite/Full toggles):

**CSS additions** (`styles-tailwind.css`):
```css
.incident-header-group--view .incident-view-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.incident-header-group--view .incident-view-chip svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.incident-view-chip__icon {
  font-size: 12px;
  line-height: 1;
  font-weight: 900;
}

.incident-view-chip__label {
  font-size: 10.2px;
  line-height: 1;
  letter-spacing: 0.01em;
}
```

**Context isolation:**
- `.incident-header-group--view` selector ensures sizing only applies to View toggle section
- Prevents affecting other header chips (mode chips, action chips, etc.)

**Result:**
- Icons: cleaner 14px size
- Labels: bolder (font-weight 800) and slightly larger (10.2px)
- Better visual hierarchy and easier to click

---

## ✦ Fixed: driftGuard Test Assertion

### Issue

Test expected:
```typescript
expect(appSource).toContain('context: ctx, requestId')
```

But actual `App.tsx` code had multi-line formatting:
```typescript
vscode.postMessage('aiQuery', {
  context: ctx,
  requestId,
  ...
})
```

### Fix

Split assertion into two separate checks:
```typescript
expect(appSource).toContain('context: ctx,')
expect(appSource).toContain('requestId,')
```

### Impact

- ✓ Test now passes (no behavioral change)
- ✓ Prevents false-positive drift detection from formatting
- ✓ 11/11 driftGuard tests passing

---

## ◆ Quality Assurance

### Build & Type Safety

```bash
$ npm run typecheck
✓ TypeScript compilation: 0 errors

$ npm run build
✓ esbuild main output: clean
✓ webview build (React): clean
```

### Test Suite

```bash
$ npm run test
✓ Test Files: 65 passed
✓ Tests: 736 passed

Key suites:
  ✓ aiService.test.ts — 15/15 (new fallback test)
  ✓ driftGuard.test.ts — 11/11 (updated assertion)
  ✓ incidentStudioPromptPolicy.test.ts — policy checks passing
```

### Files Changed

**Core fixes:**
- src/core/aiService.ts — smart fallback + normalize helper
- src/ui/panels/welcomePanel.ts — model normalization + routing
- webview-ui/src/App.tsx — model normalization
- webview-ui/src/components/AIIncidentStudio.tsx — View controls UI
- webview-ui/src/styles-tailwind.css — View controls CSS

**New browser-smoke-test action:**
- webview-ui/src/lib/incidentCliActionMatrix.ts — action matrix entry
- src/ui/panels/incidentStudioPromptPolicy.ts — allowlist + policy
- webview-ui/src/lib/incidentStudioPayload.ts — payload contracts

**Tests & release:**
- src/test/aiService.test.ts — new fallback test
- src/test/driftGuard.test.ts — assertion fix
- package.json — version bump to 0.26.0
- CHANGELOG.md, RELEASE_NOTES.md — docs

---

## ▸ Compatibility & Breaking Changes

### Backward Compatibility

✓ **No breaking changes**

- Model selection normalization preserves existing behavior
- Smart fallback is transparent to users
- View controls CSS scoped with context selector
- Browser smoke test is purely additive

### Version Requirements

- **VS Code:** 1.119+ recommended (full browser agent tools)
  - 1.100-1.118: fallback to standard simple browser
- **Node.js:** 18+
- **Python:** 3.10+

---

## ▸ Known Limitations

1. **simpleBrowser fallback** — if unavailable, action still generates prompt but browser tab won't auto-open
2. **Port detection** — relies on `runningServers` registry; fails if server started outside Workspai
3. **No persistent results** — smoke test results not saved to incident history
4. **Single-shot fallback** — if both primary and fallback fail, no further retry (design choice)

---

## ▸ Deployment

**Release channel:** Stable  
**Rollout:** Immediate  

**Telemetry:**
- New event: `workspai.studio.action_executed` with `actionType: 'browser-smoke-test'`
- Existing events unchanged

**Migration:** None required

---

## ▸ Next Steps

### Short-term
1. Merge to main branch
2. Push v0.26.0 tag
3. Publish to VS Code Marketplace
4. Monitor adoption via telemetry

### Medium-term
1. Screenshot comparison for browser-smoke-test
2. Performance metrics (Core Web Vitals)
3. Accessibility scanning (axe integration)
4. User feedback on action usefulness

### Long-term
1. API contract validation with browser agent tools
2. XHR/fetch interception for responses
3. Golden image baseline comparison
4. Cross-browser testing (Chromium, Firefox, Safari)
