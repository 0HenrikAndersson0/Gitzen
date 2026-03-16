# Gitzen: Alpha to Beta Transition Plan

Based on a fresh analysis of the Gitzen codebase, the application has a solid architectural foundation (e.g., a centralized `gitService.ts` and a UI-level operation queue preventing repository locks). However, to transition from Alpha to a Stable Beta that users can confidently test, we need to address several key areas focusing on maintainability, reliability, feature completeness, and edge-case UX.

Here is the proposed plan to take Gitzen to a Stable Beta:

### Phase 0: Documentation
- **Save Plan:** Copy this transition plan to `docs/alpha-to-beta-plan.md` in the main project repository so it persists across sessions and can be easily referenced.

### Phase 1: Architectural Refactoring & State Management
Currently, `App.tsx` is heavily overloaded (1800+ lines) with state and business logic. This makes it brittle and hard to maintain as we add more features.
- **Decompose `App.tsx`:** Extract monolithic logic into dedicated custom hooks (e.g., `useGitState`, `useRepositoryData`) or introduce a lightweight state management solution like Zustand to handle global UI state (operation queues, loading states, auth errors).
- **Componentization:** Ensure all major panels and dialogs are fully decoupled from `App.tsx` and only receive the props/callbacks they absolutely need.

### Phase 2: Robust Error Handling & Recovery
In the Alpha state, errors from Git are mostly treated as raw strings. A stable Beta needs to gracefully guide the user when things go wrong.
- **Structured Error System:** Implement custom error classes in `gitService.ts` (e.g., `MergeConflictError`, `NetworkAuthError`, `DetachedHeadError`) instead of just throwing string messages.
- **Actionable UI Feedback:** Update the frontend to catch these structured errors and provide actionable recovery paths (e.g., if a `NetworkAuthError` occurs, automatically prompt the user to update their credentials instead of just showing a red toast).

### Phase 3: Hardening Core Git Operations & Testing
The core engine (`gitService.ts`) is over 2400 lines but lacks sufficient test coverage for complex edge cases.
- **Expand Test Coverage:** Write comprehensive unit and integration tests for critical paths: partial staging, varied merge conflict scenarios, and complex rebases.
- **Large Repository UX:** `runGitSpawn` currently uses a 10MB buffer limit. Investigate and implement streaming or pagination for operations that yield massive outputs (e.g., `git log` on huge repositories or massive diffs) to prevent memory crashes.

### Phase 4: Feature Completeness & UX Polish
While core features like branching, merging, cherry-picking, and reverting are present, several Git GUI essentials are missing. We must ensure a feature-complete workflow compared to established Git GUIs.
- **Missing Git GUI Essentials:** 
  - **Undo Commit / Amend:** Add support for easily amending the last commit or undoing it (e.g., soft reset `HEAD~1`) directly from the UI.
  - **Git Blame:** Implement an inline or dedicated Git Blame view for file histories.
  - **Submodule Management:** Add UI and service support for initializing, updating, and syncing Git submodules.
  - **Advanced History Filtering:** Add ability to filter the commit history by author, date, and specific file.
- **Enhanced Progress Indicators:** Interactive rebase, large clones, and heavy fetches need robust progress bars rather than simple spinners, utilizing Git's built-in progress output where possible.
- **Merge Conflict Resolution:** Enhance the `MergeConflictDialog` to potentially include a more integrated side-by-side diff view, or ensure seamless and reliable handoffs to external merge tools.
- **Tag & Stash Management:** Ensure the UI for managing tags and stashes provides clear feedback, especially when applying stashes with conflicts.