---
target: tables et filtres backoffice
total_score: 20
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 3
target_identity: "file:/Users/sob/Projets/wedding/admin/styles.css:tables-filters"
timestamp: 2026-10-26T15-16-13Z
slug: admin-styles-css-tables-filters
---
Method: DEGRADED single-context (no sub-agent tool)
Target: admin/styles.css · admin/guests.js · admin/vendors.js
Mode: Operate

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No result count, no sort indicator |
| 2 | Match System / Real World | 3 | "Max" ambiguous; rest correct |
| 3 | User Control and Freedom | 2 | Filters reversible, no search to clear |
| 4 | Consistency and Standards | 2 | Active filter = bordeaux, nav active = blue — broken rule |
| 5 | Error Prevention | 3 | Delete confirmation exists, filters reversible |
| 6 | Recognition Rather Than Recall | 2 | Filter groups without labels, "Max" opaque |
| 7 | Flexibility and Efficiency | 1 | No text search, no column sort, no multi-select |
| 8 | Aesthetic and Minimalist Design | 2 | 8 columns, "Lien" column, bulk action in filter bar |
| 9 | Error Recovery | 3 | Toast with undo on delete, empty state present |
| 10 | Help and Documentation | n/a | Internal tool |
| **Total** | | **20/36** | **Acceptable** |

## Priority Issues

P1: Filter groups without labels — memory load
P1: Active filter uses bordeaux instead of admin blue (--sidebar-blue)
P1: No result count feedback
P2: Row hover imperceptible (#fafafa on #ffffff)
P2: Action menu trigger uses unicode ⋮ instead of SVG (craft floor violation)

## Minor Observations
- vendor-filters and guest-filters duplicate CSS structure
- Bulk email action injected inside filter group (semantic mixing)
- title + aria-label redundancy on action menu btn
- Cell padding 10px 14px tight for 8-column table

## Questions
- Tabs (Confirmés/En attente/Déclinés) vs pills for primary status filter?
- Merge Lien column into Actions menu?
- Is Max column needed or detail-panel info?
