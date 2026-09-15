# Lockdown

An opinionated [Pi](https://pi.dev/) extension that adds security constraints to agent tool usage. It intercepts every tool call and enforces fine-grained read/edit/write permissions based on whether files are inside or outside the project, and whether they match protected patterns (e.g., `.env`, `.git/`, `node_modules/`).

## Installation

```bash
pi install npm:@chrischow/pi-lockdown
```

## Usage
Configure Lockdown (see [Configuration](#configuration) below), then start Pi.

If you need to amend settings for the session:

| Command | Description |
|---------|-------------|
| `/lockdown:session-permissions` | Open the interactive session permissions dialog |
| `/lockdown:reset` | Reset all permissions to settings/default values |

**Note:** `/lockdown:session-permissions` allows you to toggle any of the 16 permission slots on the fly. Changes apply immediately and last for the current session only.

## What It Does
When you start Pi, Lockdown automatically sets the tools configured under the `tools` and `customTools` properties in your settings.

On every tool call, Lockdown evaluates (1) whether the target path is internal or external, (2) whether the path matches a proteted pattern, and (3) what is the tool call. Lockdown then applies the appropriate permission:

- `allow`: Execution continues
- `warn`: Execution is halted - you must confirm the action
- `block`: Execution is blocked unconditionally

### Empty write protection

Lockdown also blocks empty writes (`write` with empty content) as a safeguard against file soft-deletion workarounds.

## Configuration
Add a `lockdown` property in your project or global `settings.json`. The order of hierarchy that Lockdown respects is: (1) project, (2) global, then (3) defaults (see below). Lockdown **does not** merge project and global settings. For example, if a `lockdown` config exists in **both** the project and global `settings.json` files, only the properties in the **project** will be applied on top of the defaults, and none of the configs in the global `settings.json` will be applied.


Mandatory properties:
- `customTools`: You must add the permissions for all custom tools and tools from other extensions here. Otherwise, Lockdown will not load them into your session.

**All other properties are optional.** Any omitted fields will fall back to the built-in defaults listed below.

```json
{
  "lockdown": {
    "customTools": {
      "custom-tool-name": "<allow|warn|block>"
    },
    // No Bash
    "tools": ["read", "edit", "write", "grep", "find", "ls"],
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


### Subagent Profile
Subagent processes (spawned `pi` processes running in headless `--mode json`) read a **separate** permission set under `lockdownSubagent`, same shape as `lockdown`. This lets you grant/deny subagents a different set of permissions than the main agent.

A process is treated as a subagent when it was started with the `--lockdown-subagent` flag or the `PI_LOCKDOWN_SUBAGENT=1` environment variable. The main agent never sets either, so it always uses `lockdown`.

Resolution order for a **subagent** process: (1) project `lockdownSubagent`, (2) global `lockdownSubagent`, (3) project `lockdown`, (4) global `lockdown`, then (5) defaults. If no `lockdownSubagent` key exists anywhere, subagents fall back to `lockdown`.

```json
{
  "lockdown": {
    "customTools": {
      "custom-tool-name": "<allow|warn|block>"
    },
    "tools": ["read", "edit", "write", "grep", "find", "ls"],
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
  },
  "lockdownSubagent": {
    "customTools": {},
    "tools": ["read", "grep", "find", "ls"],
    "fileAccess": {
      "internal": {
        "unprotected": {
          "write": "block",
          "edit": "block"
        }
      }
    }
  }
}
```

**Spawner contract:** when a future subagent extension spawns child `pi` processes, it must add `--lockdown-subagent` to the child's arguments — and **only** for subagent processes, never for the main agent. Example:

```ts
const args: string[] = ['--mode', 'json', '-p', '--no-session']
args.push('--lockdown-subagent') // always, for every spawned subagent
```

Requires pi-lockdown to be installed globally (`~/.pi/agent/extensions` or via a pi package) so it loads inside the spawned processes.

**Headless behavior:** `warn`-level permissions prompt for confirmation in interactive sessions. In headless sessions (no UI, e.g. subagents in `--mode json`) the confirmation cannot be shown, so `warn` is treated as `block` (fail-closed).
