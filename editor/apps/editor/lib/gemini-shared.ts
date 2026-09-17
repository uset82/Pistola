const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? ''

let geminiApiKeyDisabledReason: string | null = null

export const getGeminiApiKey = () => GEMINI_API_KEY

export const isGeminiApiKeyFailure = (message: string) =>
  /api key not valid|api_key_invalid|invalid api key/i.test(message)

export const disableGeminiApiKey = (reason: string) => {
  geminiApiKeyDisabledReason = reason
}

export const getGeminiAvailabilityError = () => {
  if (!GEMINI_API_KEY) return 'Gemini API key is not configured.'
  return geminiApiKeyDisabledReason
}

export const isGeminiAvailable = () =>
  Boolean(GEMINI_API_KEY) && geminiApiKeyDisabledReason === null
