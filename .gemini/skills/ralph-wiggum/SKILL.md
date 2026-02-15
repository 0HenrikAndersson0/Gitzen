---
name: ralph-wiggum
description: Implements an iterative self-correction loop (the Ralph Loop). Use when you need to perform a complex, multi-step task that requires autonomous iteration until a specific "completion promise" is met.
---

# Ralph Wiggum Skill

The Ralph Wiggum skill enables the **Ralph Loop**, an iterative development methodology where Gemini CLI repeatedly attempts a task until it can confidently promise that it is complete.

## Workflow

### 1. Starting a Ralph Loop

When a user asks to start a "Ralph Loop", follow these steps:

1.  **Extract Parameters**:
    -   `prompt`: The task to perform.
    -   `completion_promise`: A specific statement that MUST be true for the loop to end (e.g., "All tests passed").
    -   `max_iterations`: (Optional) Maximum number of loops. Default to 10.

2.  **Ensure Infrastructure**:
    -   Create `.gemini/hooks/` if it doesn't exist.
    -   Copy `scripts/ralph-hook.sh` from this skill to `.gemini/hooks/ralph-hook.sh`.
    -   Make it executable: `chmod +x .gemini/hooks/ralph-hook.sh`.
    -   Ensure `.gemini/settings.json` includes the hook configuration:
        ```json
        {
          "hooks": {
            "AfterAgent": [
              {
                "name": "ralph-loop",
                "type": "command",
                "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/ralph-hook.sh"
              }
            ]
          }
        }
        ```

3.  **Initialize State**:
    -   Write `.gemini/ralph-state.json`:
        ```json
        {
          "iteration": 1,
          "max_iterations": 10,
          "completion_promise": "All tests passed",
          "prompt": "Fix the bug and ensure all tests pass."
        }
        ```

4.  **Execute first turn**:
    -   Start working on the prompt.
    -   **CRITICAL**: You must NOT output the `<promise>...</promise>` tag until you are actually done.
    -   If the hook is active, your response will be intercepted if you don't provide the promise.

### 2. During the Loop

-   The `AfterAgent` hook will intercept your responses.
-   If you haven't output `<promise>YOUR_PROMISE</promise>`, the hook will feed the original prompt back to you with an iteration count.
-   You should use the context of previous turns to improve your approach.

### 3. Ending the Loop

-   To end the loop successfully, output your promise wrapped in tags: `<promise>All tests passed</promise>`.
-   The hook will see this, delete the state file, and allow the session to return to the user.
-   If `max_iterations` is reached, the hook will also allow the session to end.

## Example Command

"Start a ralph loop to refactor the gitService.ts file. Promise: 'The refactoring is complete and all tests in gitService.test.ts pass.'"
