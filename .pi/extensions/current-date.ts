/**
 * Current Date Extension
 *
 * Registers a single custom tool `current_date` that the LLM can call to
 * find out the current date and time.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'current_date',
    label: 'Current Date',
    description:
      'Get the current date and time. Returns the date, day of week, time, timezone, and ISO 8601 timestamp. Use this whenever you need to know what day it is or how old something is relative to today.',
    promptSnippet: 'Get the current date and time',
    promptGuidelines: [
      "Use current_date to know today's date before reasoning about time-sensitive things (recent changes, deadlines, relative dates).",
    ],
    parameters: Type.Object({
      timezone: Type.Optional(
        Type.String({
          description:
            "IANA timezone name (e.g. 'America/New_York', 'Europe/Berlin'). Defaults to the system timezone.",
        }),
      ),
    }),
    async execute(_, params) {
      const now = new Date()

      let tzName = 'system'
      let displayTime = now

      if (params?.timezone) {
        try {
          // Validate the requested timezone; falls back to system time on failure.
          new Intl.DateTimeFormat('en-US', { timeZone: params.timezone })
          displayTime = new Date(now.toLocaleString('en-US', { timeZone: params.timezone }))
          tzName = params.timezone
        } catch {
          tzName = 'system (invalid timezone requested)'
        }
      }

      const tzOffset =
        Intl.DateTimeFormat()
          .formatToParts(displayTime)
          .find((p) => p.type === 'timeZoneName')?.value ?? 'unknown'

      return {
        content: [
          {
            type: 'text',
            text: [
              `Date: ${displayTime.toDateString()}`,
              `Day of week: ${displayTime.toLocaleDateString('en-US', { weekday: 'long' })}`,
              `Time: ${displayTime.toLocaleTimeString('en-US')}`,
              `Timezone: ${tzName} (${tzOffset})`,
              `ISO 8601: ${displayTime.toISOString()}`,
            ].join('\n'),
          },
        ],
        details: {
          date: displayTime.toDateString(),
          weekday: displayTime.toLocaleDateString('en-US', { weekday: 'long' }),
          time: displayTime.toLocaleTimeString('en-US'),
          timezone: tzName,
          iso8601: displayTime.toISOString(),
        },
      }
    },
  })
}
