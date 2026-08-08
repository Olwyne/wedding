# Task 3 Implementation Report: To-Do Tab

## Summary
Completed full implementation of the To-Do tab with task list, status filter pills, quick-toggle checkboxes, and CRUD operations. All code from the task brief was transcribed exactly, with no syntax errors and all imports verified.

## Files Changed
1. **admin/todo.js** (97 lines)
   - Complete rewrite from stub to full implementation
   - Replaced placeholder with full renderTodoTab() function
   - 95 lines of production code

2. **admin/styles.css**
   - Appended 7 new CSS rule blocks (filter pills, status badges)
   - Added .todo-filters, .pill, .pill-active, .badge-status-todo/progress/done

## Verification Performed

### 1. Syntax & Parsing
- ✓ Node.js syntax check: `node --check admin/todo.js` — PASSED
- ✓ No syntax errors, balanced braces, well-formed template literals

### 2. Import Resolution
All required exports verified to exist:
- ✓ `loadTasks()` from tasks-shared.js
- ✓ `escapeHtml()` from tasks-shared.js
- ✓ `STATUS_LABELS` from tasks-shared.js
- ✓ `openTaskPanel()` from tasks-shared.js
- ✓ `canWrite()` from permissions.js
- ✓ `loadGuests()` from guests.js
- ✓ `loadVendors()` from vendors.js
- ✓ `loadUsers()` from users.js

### 3. Feature Completeness
- ✓ Filter pills: Four buttons (Toutes, À faire, En cours, Terminé) with state tracking
- ✓ Quick-toggle checkbox: First column, toggles task status todo→done without panel
- ✓ Add button: "+ Ajouter une tâche" wired to openTaskPanel(null, tasks)
- ✓ Edit buttons: Per-row Modifier wired to openTaskPanel(id, tasks)
- ✓ Delete buttons: Per-row Supprimer with confirm dialog, Firestore delete
- ✓ Table columns (7 total):
  1. Checkbox (quick-toggle)
  2. Titre (escaped)
  3. Statut (badge with color via STATUS_BADGE)
  4. Échéance (escaped, fallback to —)
  5. Lié à (linked guest/vendor name lookup, escaped)
  6. Assigné (assigned admin email lookup, escaped)
  7. Actions (Modifier/Supprimer buttons, hidden for read-only)
- ✓ Status badges: Three CSS classes applied (badge-status-todo/progress/done)
- ✓ Permission gating: canWrite('todo') controls button visibility & checkbox disable state
- ✓ "No tasks" fallback: colspan="7" empty state message

### 4. Code Quality
- ✓ Exact match to brief (no paraphrasing, no additions)
- ✓ Follows existing code style:
  - Escaping all user text with escapeHtml()
  - Using STATUS_LABELS for display
  - Direct Firestore calls (doc, updateDoc, deleteDoc)
  - Event delegation pattern consistent with other modules
  - Permission checks via canWrite()
- ✓ No code beyond brief's specification (no YAGNI violations)

### 5. CSS Verification
- ✓ Filter pill styles: background, border, cursor, border-radius, padding, hover state
- ✓ Active pill state: background/border/text color inversion
- ✓ Status badges: Three distinct colors per status (todo/progress/done)
- ✓ Appended cleanly to end of file with section comment

## Commit
```
a4d30ea feat: implement To-Do tab list, filters, and task CRUD
```
- Both files staged and committed
- Message follows project convention

## Self-Review Findings
**No issues found.** Implementation is complete and ready for manual browser verification per the brief's Step 3 checklist (adding tasks, editing, filtering, quick-toggle, deletion, permission gating).

## Next Steps
Manual verification (deferred to human/controller):
- Create task via "+ Ajouter une tâche" → Save → Verify row appears
- Edit task → Set dueDate, link to vendor, assign to admin → Save → Verify columns update
- Click quick-toggle checkbox → Status flips without panel → Verify badge updates
- Click filter pills → Table filters correctly
- Click Supprimer → Confirm dialog → Delete → Verify Firestore doc removed
- Test as read-only user → Verify buttons/checkbox absent or disabled

---

# Review Findings Fix Report

## Finding 1: CSS Class Collision

**Issue:** The To-Do filter pill styles used `.pill` and `.pill-active` classes, which collided with pre-existing `.pill` class in guests.js for event-tag chips. Due to CSS cascade (equal specificity), the later To-Do rule silently overwrote the guest chip styles, breaking their appearance.

**Fix Applied:**
1. **admin/styles.css** (lines 260-264):
   - Renamed `.pill` → `.filter-pill`
   - Renamed `.pill:hover` → `.filter-pill:hover`
   - Renamed `.pill-active` → `.filter-pill-active`
   - Original `.pill` rule (line 196, used by guests.js) left untouched

2. **admin/todo.js** (line 31):
   - Updated template literal: `class="filter-pill ${currentFilter === id ? 'filter-pill-active' : ''}"`

**Verification:**
```bash
grep -n "\.pill\b" admin/styles.css
# Result: Only line 196 (.pill) remains — the original guests.js rule
# Lines 260-264 now use .filter-pill / .filter-pill-active

grep -n "pill" admin/todo.js
# Result: Only filter-pill / filter-pill-active found; no bare "pill"

git diff admin/guests.js
# Result: Empty — guests.js untouched
```

## Finding 2: Filter Re-fetches Firestore on Every Click

**Issue:** Clicking a filter pill called `renderTodoTab()`, which re-ran the full Firestore fetch (`Promise.all([loadTasks(), loadGuests(), loadVendors(), loadUsers()])`) — 4 database calls for a client-side filter operation. Design intent was client-side filtering of already-loaded data.

**Fix Applied:**

Restructured todo.js to separate data loading from rendering:

1. **New function `renderTodoPanel()`** (lines 16-82):
   - Takes pre-loaded data as arguments: `tasks`, `guestsById`, `vendorsById`, `adminsById`, `editable`
   - Builds filter pills + table HTML using `currentFilter` state
   - Attaches event listeners (filter clicks, edit/delete/toggle)
   - **Does NOT fetch from Firestore**

2. **Refactored `renderTodoTab()`** (lines 85-102):
   - Still performs initial Firestore fetch (`Promise.all([...])` and map building)
   - Calls `renderTodoPanel()` once with loaded data
   - Still exported as the public entry point

3. **Filter pill click handler** (lines 58-60):
   - Changed from `renderTodoTab()` → `renderTodoPanel()`
   - Filter clicks now re-render from cached data (no network call)

4. **Edit/Delete/Toggle handlers** (lines 64, 67, 73, 79):
   - Unchanged — still call `renderTodoTab()` to re-fetch (correct behavior after data mutations)

**Result:**
- Initial tab load: 1x full fetch + render
- Filter click: render only (no network)
- After add/edit/delete/toggle: 1x full fetch + render

**Verification:**
```bash
node --check admin/todo.js
# Result: No syntax errors

grep "renderTodoTab\|renderTodoPanel" admin/todo.js | wc -l
# Result: 8 references total
# - Line 16: renderTodoPanel definition
# - Line 59: Filter click → renderTodoPanel (no fetch)
# - Lines 64, 67: Task add/edit → renderTodoTab (full fetch)
# - Lines 73, 79: Delete/toggle → renderTodoTab (full fetch)
# - Line 85: renderTodoTab export
# - Line 101: Initial call to renderTodoPanel after fetch

# Trace: Filter click handler (line 59) calls renderTodoPanel, 
#        which closes over tasks/maps and uses only currentFilter state change
```

## Commit
```
2024-XX-XX (pending)
fix: resolve To-Do tab review findings (pill CSS collision, filter re-fetch)
```

Both findings fixed, all verification checks passed.
