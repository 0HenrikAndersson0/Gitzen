#!/bin/bash

# Ralph Wiggum Hook for Gemini CLI
# Ported from Claude Code Ralph Wiggum Plugin
# This hook intercepts the assistant's response and forces a retry
# if the "completion promise" hasn't been met.

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# State file location
RALPH_STATE_FILE=".gemini/ralph-state.json"

if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  # No active loop - allow
  echo '{"decision": "allow"}'
  exit 0
fi

# Parse state
ITERATION=$(jq -r '.iteration' "$RALPH_STATE_FILE")
MAX_ITERATIONS=$(jq -r '.max_iterations' "$RALPH_STATE_FILE")
COMPLETION_PROMISE=$(jq -r '.completion_promise' "$RALPH_STATE_FILE")
PROMPT_TEXT=$(jq -r '.prompt' "$RALPH_STATE_FILE")

# Extract assistant response from hook input
# AfterAgent provides prompt_response
LAST_OUTPUT=$(echo "$HOOK_INPUT" | jq -r '.prompt_response')

# Check for completion promise
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  # Extract text from <promise> tags
  # We use a simpler grep/sed approach or perl if available
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")

  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" == "$COMPLETION_PROMISE" ]]; then
    # Promise met!
    rm "$RALPH_STATE_FILE"
    echo '{"decision": "allow"}'
    exit 0
  fi
fi

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  rm "$RALPH_STATE_FILE"
  echo '{"decision": "allow"}'
  exit 0
fi

# Not complete - continue loop
NEXT_ITERATION=$((ITERATION + 1))

# Update state file
jq --argjson next "$NEXT_ITERATION" '.iteration = $next' "$RALPH_STATE_FILE" > "${RALPH_STATE_FILE}.tmp" && mv "${RALPH_STATE_FILE}.tmp" "$RALPH_STATE_FILE"

# Build feedback message
FEEDBACK="🔄 Ralph iteration $NEXT_ITERATION | To stop: output <promise>$COMPLETION_PROMISE</promise>

$PROMPT_TEXT"

# Deny and retry
jq -n 
  --arg reason "$FEEDBACK" 
  '{
    "decision": "deny",
    "reason": $reason
  }'

exit 0
