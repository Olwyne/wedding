---
target: backoffice admin (admin/index.html)
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/sob/Projets/wedding/admin/index.html"
target_fingerprint: "sha256:c1f921e8f4cf6dc91500555eb9371851be78b29ea6827672a30f358f6a14d6a0"
target_path: /Users/sob/Projets/wedding/admin/index.html
timestamp: 2026-10-23T06-51-39Z
slug: admin-index-html
---
# Critique — Admin backoffice (admin/)

Method: dual-agent (Assessment A design review + Assessment B detector/browser evidence, isolated parallel sub-agents)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2/4 | Real Firestore error leaves Invités tab stuck on "Chargement..." forever |
| 2 | Match System/Real World | 3/4 | Témoins nav icon is a medal, not people |
| 3 | User Control and Freedom | 1/4 | No undo anywhere; native confirm() for every destructive action |
| 4 | Consistency and Standards | 2/4 | Two parallel dialog systems: bespoke .panel vs native confirm()/alert() |
| 5 | Error Prevention | 2/4 | Good table-capacity flagging, but no reversible delete |
| 6 | Recognition Rather Than Recall | 3/4 | 20/20 icon buttons have aria-label; emoji inconsistent with SVG system |
| 7 | Flexibility and Efficiency | 1/4 | Seating and witness assignment: drag-and-drop only, no keyboard/click fallback |
| 8 | Aesthetic and Minimalist Design | 3/4 | Consistent card/table system per DESIGN.md |
| 9 | Error Recovery | 1/4 | alert(`Erreur: ${err.message}`) exposes raw technical text almost everywhere |
| 10 | Help and Documentation | 0/4 | Zero-permission witness lands on bare "Bienvenue." with no explanation |
| **Total** | | **18/40 (45%)** | **Poor** |

## Design Specificity Verdict

LLM assessment: deliberately neutral per DESIGN.md's Operate-mode intent, but goes further than documented — outside the bordeaux brand touches and "S·R" monogram, nothing signals this specific wedding. Témoins icon (medal) wasn't considered for the concept.

Deterministic scan: 126 findings on admin/ (122 advisory, 4 warning), 113 concentrated in admin/styles.css. Two warnings corroborate rather than contradict the specificity verdict: `side-tab` (styles.css:336, thick colored left border — recognized AI-UI tell) and `ai-color-palette` (purple/violet detected in admin/index.html and seed pages) — the latter is a genuine drift, not a false positive: DESIGN.md documents an admin palette limited to blue+bordeaux, yet undocumented purple/violet values (#6366f1, #ede9fe, #6d28d9) appear in styles.css. #fff (19x) is a likely false positive — too baseline to signal real palette drift.

Visual overlays: live overlay on dashboard/guests reported "no anti-patterns found" — inconclusive, not a clean bill of health: without real auth the Invités tab never loaded real content, so the overlay had almost nothing to scan. The real drift signal came from the static CLI scan of styles.css, not the live (mostly empty) screens.

## Overall Impression

A genuinely rigorous permission system and a well-built table-screen pattern, undercut by zero keyboard fallback on two core tasks (seating, witness assignment), destructive actions with no safety net, and raw technical error exposure — serious for a solo tool used under deadline stress for months.

## What's Working

1. Permission system is real, not cosmetic: permissions.js + sections-registry.js + updateNavVisibility() correctly gate nav and write access per section.
2. Table-screen filter/action pattern is consistently well-built across guests/vendors/todo, all icon buttons labeled, DESIGN.md's shadow system applied uniformly.
3. Mobile sidebar collapse is genuinely implemented, confirmed live at 375px: horizontal scrollable bar, secondary links properly dropped rather than just hidden.

## Priority Issues

**[P1] Destructive actions have no undo; native confirm()/alert() instead of the product's own panel system** — a guest/vendor/task/table/lane deletion is irreversible on one more click via a dialog that breaks the visual system. Fix: replace confirm() (11 call sites, 9 files) with the existing .panel component, add soft-delete + "Annuler" toast at least for guests/vendors. /impeccable harden

**[P1] Error states silently fail instead of informing the user** — live-confirmed: a real permission error leaves Invités stuck on "Chargement..." forever; elsewhere alert(`Erreur: ${err.message}`) exposes raw text. Fix: generalize dashboard.js's try/catch to every tab; replace alert() with inline plain-language messaging (dayof.js:239 is a good template). /impeccable harden

**[P1] Seating chart and witness assignment are keyboard-inaccessible with no alternative** — drag-and-drop only, zero click fallback, in tables.js and witnesses.js. A keyboard-only user cannot complete two core product tasks. Fix: click-to-pick/click-to-place fallback with Enter/Space. /impeccable harden

**[P2] Flat 13-item primary nav with no grouping** — exceeds working-memory guidance by 2.6x; worse on mobile (~2.5 items visible at a time). Fix: group into 2-3 clusters (Contenu/Invités/Jour-J/Système) with dividers. /impeccable clarify

**[P2] Undocumented purple/violet colors and a thick-left-border pattern drift from the documented neutral admin palette** — DESIGN.md's "Règle de l'Admin Plat" specifies blue+bordeaux only, yet #6366f1/#ede9fe/#6d28d9 and a 4px colored left border (styles.css:336, a recognized generic-admin tell) appear undocumented. Fix: document if intentional (status badges), else retint to the existing palette; revisit the side-border pattern. /impeccable polish

**[P3] Mixed icon languages (emoji vs SVG) and unlabeled overflow actions** — bulk-email buttons use emoji while the rest of the product uses consistent stroke SVGs. Fix: swap emoji for matching SVG icons. /impeccable polish

## Persona Red Flags

**Alex (power user, daily use for months)**: zero keyboard shortcuts across 20 modules; seating/witness assignment — repeated dozens of times — are drag-only with no bulk action; every delete requires a confirm() round-trip.

**Sam (accessibility-dependent)**: cannot complete seating or witness assignment at all (hard blocker, not degraded). Form inputs have a careful focus halo, but buttons (.btn-primary, .nav-item, .btn-icon) have no custom :focus-visible rule — falling back to browser defaults, unlike the public site's deliberate treatment.

**Witness/wedding-planner (reduced-nav secondary user)**: a zero-permission witness lands on bare "Bienvenue." with no explanation of what they can access or where. The permission logic itself is sound; the onboarding/messaging is the gap.

## Minor Observations

- escapeHtml is reimplemented near-identically across multiple modules rather than shared — risk of future XSS-fix drift between copies.
- Toggle switches (.toggle) also lack a custom focus state.
- The "Avec invitation simulée" sidebar preview link is a nice, underused idea.
- badge-contacted (vendor) and badge-pending (RSVP) reuse identical colors for different meanings — low risk while the two views never coexist on screen.
- #fff (19 occurrences) flagged by the detector is a likely false positive — too baseline to signal real drift.

## Questions to Consider

- Given this tool is used solo (+ a few witnesses) for months, would the 13-item nav survive better grouped into 4 clusters, or does the couple prefer everything visible even at the cost of scan time?
- Does the no-build constraint rule out a lightweight toast/undo pattern, or has no one built one yet?
- If a zero-permission witness lands on "Bienvenue." today, is that the intended experience or just what happens by default?
