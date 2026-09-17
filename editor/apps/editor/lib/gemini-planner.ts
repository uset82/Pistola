/**
 * Gemini Planner — uses Gemini 2.5 Pro as the assistant planning model.
 *
 * When GEMINI_API_KEY is set, this module provides a reliable alternative
 * to the OpenRouter free model for generating assistant turn results.
 */

import {
  disableGeminiApiKey,
  getGeminiApiKey,
  getGeminiAvailabilityError,
  isGeminiApiKeyFailure,
  isGeminiAvailable,
} from './gemini-shared'

const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GEMINI_TIMEOUT_MS = 60_000

export const isGeminiPlannerAvailable = () => isGeminiAvailable()

/**
 * Call Gemini to generate an assistant planning response.
 * Takes the full text prompt (already assembled by buildAssistantRequest)
 * and the system prompt, returns the raw text response (should be JSON).
 */
export const requestGeminiPlannerTurn = async (
  systemPrompt: string,
  userContent: string,
  imageDataUrl?: string | null,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
): Promise<string> => {
  const geminiApiKey = getGeminiApiKey()
  const availabilityError = getGeminiAvailabilityError()
  if (!geminiApiKey || availabilityError) {
    throw new Error(availabilityError ?? 'Gemini API key is not configured.')
  }

  const parts: Array<Record<string, unknown>> = []

  // If an image is provided, include it as inline data
  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1]!,
          data: match[2]!,
        },
      })
    }
  }

  parts.push({ text: userContent })

  const historyContents = (conversationHistory ?? []).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }))

  const requestBody = {
    contents: [
      ...historyContents,
      {
        role: 'user',
        parts,
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
    },
  }

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown Gemini error')
      const message = `Gemini planner request failed (${response.status}): ${errorText.slice(0, 300)}`
      if (isGeminiApiKeyFailure(message)) {
        disableGeminiApiKey(message)
      }
      throw new Error(message)
    }

    const json = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      throw new Error('Gemini planner returned an empty response.')
    }

    return text.trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini planner request failed.'
    if (isGeminiApiKeyFailure(message)) {
      disableGeminiApiKey(message)
    }
    throw error
  }
}
