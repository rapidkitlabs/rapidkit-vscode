# Release Notes - v0.24.1 (May 6, 2026)

## ✦ Incident Studio UX Polish + Dashboard AI Surface + Docs Refresh

### Summary

This release packages the latest product-facing quality pass around Workspai inside VS Code: Incident Studio layout and state-sync hardening, a sharper AI-first dashboard surface, reliable project add-module routing, and README/screenshot alignment through editor quick fixes.

---

### Added

- **Dashboard AI spotlighting**
  Added a featured Incident Studio card, compact AI feature cards, a Quick Links "build with AI" cue, and refreshed README coverage for screenshot 8.

- **Project modal kit retry path**
  Added an on-demand retry flow when the create-project modal opens before kits are loaded.

---

### Changed

- **Incident Studio interaction surface**
  Reworked header controls, maximize/view toggles, active-scope presentation, and removed the redundant scope bar to eliminate horizontal overflow.

- **Host/webview navigation flow**
  Updated dashboard and Incident Studio tab switching, setup entry points, and active-scope syncing so context stays aligned across surfaces.

- **README and positioning pass**
  Tightened README copy, synced screenshots 1-8, and aligned messaging around backend AI workflows including Spring Boot support.

---

### Fixed

- **Project Explorer add-module crash**
  Fixed circular command-argument serialization so right-click add-module actions work reliably from the Project Explorer.

- **Analyze icon ambiguity and tab polish**
  Fixed overlapping Analyze/Test visuals and corrected tab alignment/icon regressions.

- **Incident Studio state races**
  Fixed stale scope state, first-open kit-loading gaps, and the header regression introduced by the earlier layout refactor.

---

### Validation Snapshot

- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('package-lock.json','utf8'));"` -> pass