import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  pi.registerProvider('platform-ai', {
    name: 'PlatformAI',
    baseUrl: 'https://api.ai.tech.gov.sg/platform/models',
    apiKey: '$PLATFORM_AI_API_KEY',
    api: 'openai-completions',
  })
}
