/**
 * Gemini Vision — server-side image analysis via the Gemini 2.5 Pro REST API.
 *
 * We call Gemini to describe what the user's attached image contains so
 * the main assistant (which may run on a text-only model like openrouter/free)
 * still receives rich context about the image.
 */

import {
  disableGeminiApiKey,
  getGeminiApiKey,
  getGeminiAvailabilityError,
  isGeminiApiKeyFailure,
} from './gemini-shared'

const GEMINI_MODEL = 'gemini-2.5-pro-preview-06-05'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GEMINI_TIMEOUT_MS = 30_000

const VISION_SYSTEM_PROMPT = `You are an image analyst for a 3D architecture and CAD editor called Pistola.
Describe what the image shows in 2-4 concise sentences. Focus on:
- What objects, rooms, or structures are visible
- Approximate dimensions or proportions if discernible
- Layout or spatial relationships
- Materials, colors, or textures if notable
- Whether this looks like a floor plan, a 3D model, a sketch, a photo of a real space, or something else

Keep the response factual and brief. Do NOT generate instructions or code.`

/**
 * Extracts the base64 body and MIME type from a data-URL.
 * Returns null if the string is not a valid data-URL.
 */
const parseDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1]!, base64: match[2]! }
}

export type GeminiVisionResult = {
  ok: true
  description: string
} | {
  ok: false
  error: string
}

/**
 * Calls Gemini 2.5 Pro to describe what an image contains.
 * Returns a short textual description that can be injected into the
 * assistant planner's text context.
 */
export const analyzeImageWithGemini = async (
  imageDataUrl: string,
  userPrompt?: string,
): Promise<GeminiVisionResult> => {
  const geminiApiKey = getGeminiApiKey()
  const availabilityError = getGeminiAvailabilityError()
  if (!geminiApiKey || availabilityError) {
    return { ok: false, error: availabilityError ?? 'Gemini API key is not configured (GEMINI_API_KEY).' }
  }

  const parsed = parseDataUrl(imageDataUrl)
  if (!parsed) {
    return { ok: false, error: 'Invalid image data URL.' }
  }

  const textPart = userPrompt
    ? `The user said: "${userPrompt}"\n\nDescribe what this image shows so we can help them.`
    : 'Describe what this image shows.'

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: parsed.mimeType,
              data: parsed.base64,
            },
          },
          { text: textPart },
        ],
      },
    ],
    systemInstruction: {
      parts: [{ text: VISION_SYSTEM_PROMPT }],
    },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 400,
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
      const message = `Gemini vision request failed (${response.status}): ${errorText.slice(0, 200)}`
      if (isGeminiApiKeyFailure(message)) {
        disableGeminiApiKey(message)
      }
      return { ok: false, error: message }
    }

    const json = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      return { ok: false, error: 'Gemini returned an empty response.' }
    }

    return { ok: true, description: text.trim() }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini vision call failed.'
    if (isGeminiApiKeyFailure(message)) {
      disableGeminiApiKey(message)
    }
    return { ok: false, error: message }
  }
}
