# Lockdown

A [Pi](https://pi.dev/) extension that adds security constraints to the agent's tool usage. It intercepts every tool call and enforces fine-grained read/edit/write permissions based on whether files are inside or outside the project, and whether they match protected patterns (e.g., `.env`, `.git/`, `node_modules/`).

## Installation

```bash
pi install npm:@chrischow/pi-lockdown
```

## Usage
Just run Pi.

If you need to amend settings for the session:

| Command | Description |
|---------|-------------|
| `/lockdown:session-permissions` | Open the interactive session permissions dialog |
| `/lockdown:reset` | Reset all permissions to settings/default values |

**Note:** `/lockdown:session-permissions` allows you to toggle any of the 16 permission slots on the fly. Changes apply immediately and last for the current session only.

## What It Does
When you start Pi, Lockdown automatically sets the tools listed in the `tools` (default Pi tools, less Bash) and `customTools` properties in your settings.

On every tool call, Lockdown evaluates (1) whether the target path is internal or external, (2) whether the path matches a proteted pattern, and (3) what is the tool call. Lockdown then applies the appropriate permission:

- `allow`: Execution continues
- `warn`: Execution is halted - you must confirm the action
- `block`: Execution is blocked without confirmation from you

### Empty write protection

Lockdown also blocks empty writes (`write` with empty content) as a safeguard against file soft-deletion workarounds.

## Configuration
Add a `lockdown` property in your project or global `settings.json` with one or more of the keys as outlined in the default settings below. Configuration is optional: any omitted fields fall back to the built-in defaults.

```json
{
  "lockdown": {
    // No Bash
    "tools": ["read", "edit", "write", "grep", "find", "ls"],
    "customTools": [],
    "protectedPatterns": [
      "**/.env*",
      "**/.git/**",
      "**/node_modules/**"
    ],
    "fileAccess": {
      "external": {
        "protected": {
          "read": "block",
          "write": "block",
          "edit": "block",
          "other": "block"
        },
        "unprotected": {
          "read": "warn",
          "write": "block",
          "edit": "block",
          "other": "block"
        }
      },
      "internal": {
        "protected": {
          "read": "warn",
          "write": "warn",
          "edit": "warn",
          "other": "warn"
        },
        "unprotected": {
          "read": "allow",
          "write": "warn",
          "edit": "warn",
          "other": "warn"
        }
      }
    }
  }
}
```

Default protected patterns:

```
**/.env*
**/.git/**
**/node_modules/**
```
