import type { AssistantImageAttachment, AssistantImageClientAnalysis, AssistantViewportMetadata } from './assistant-image-contract'

const loadImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load the attached image for assistant analysis.'))
    image.src = dataUrl
  })

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number(value.toFixed(4))))

const getAverageLuminance = ({
  data,
  imageHeight,
  imageWidth,
  startX,
  startY,
  width,
  height,
}: {
  data: Uint8ClampedArray
  imageWidth: number
  imageHeight: number
  startX: number
  startY: number
  width: number
  height: number
}) => {
  const x0 = Math.max(0, Math.min(imageWidth - 1, Math.floor(startX)))
  const y0 = Math.max(0, Math.min(imageHeight - 1, Math.floor(startY)))
  const x1 = Math.max(x0 + 1, Math.min(imageWidth, Math.ceil(startX + width)))
  const y1 = Math.max(y0 + 1, Math.min(imageHeight, Math.ceil(startY + height)))
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24))

  let sampleCount = 0
  let totalLuminance = 0
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const index = (y * imageWidth + x) * 4
      const red = data[index] ?? 0
      const green = data[index + 1] ?? 0
      const blue = data[index + 2] ?? 0
      const alpha = data[index + 3] ?? 0
      if (alpha < 32) continue
      totalLuminance += (red + green + blue) / (3 * 255)
      sampleCount += 1
    }
  }

  return sampleCount > 0 ? totalLuminance / sampleCount : 0
}

const getViewportMatchScore = (
  imageWidth: number,
  imageHeight: number,
  viewport: AssistantViewportMetadata | undefined,
) => {
  if (!(viewport?.width && viewport?.height)) return undefined

  const imageRatio = imageWidth / imageHeight
  const viewportRatio = viewport.width / viewport.height
  const ratioPenalty = Math.abs(imageRatio - viewportRatio) / Math.max(imageRatio, viewportRatio, 1)
  const widthPenalty = Math.abs(imageWidth - viewport.width) / Math.max(imageWidth, viewport.width, 1)
  const heightPenalty = Math.abs(imageHeight - viewport.height) / Math.max(imageHeight, viewport.height, 1)

  return clamp01(1 - ratioPenalty * 1.4 - (widthPenalty + heightPenalty) * 0.3)
}

const getWorkspaceUiScore = (
  data: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
) => {
  const topBand = getAverageLuminance({
    data,
    imageWidth,
    imageHeight,
    startX: 0,
    startY: 0,
    width: imageWidth,
    height: imageHeight * 0.09,
  })
  const leftRail = getAverageLuminance({
    data,
    imageWidth,
    imageHeight,
    startX: 0,
    startY: imageHeight * 0.08,
    width: imageWidth * 0.08,
    height: imageHeight * 0.84,
  })
  const rightRail = getAverageLuminance({
    data,
    imageWidth,
    imageHeight,
    startX: imageWidth * 0.92,
    startY: imageHeight * 0.08,
    width: imageWidth * 0.08,
    height: imageHeight * 0.84,
  })
  const centerPane = getAverageLuminance({
    data,
    imageWidth,
    imageHeight,
    startX: imageWidth * 0.25,
    startY: imageHeight * 0.18,
    width: imageWidth * 0.5,
    height: imageHeight * 0.56,
  })

  const edgeDarkness = ((1 - topBand) + (1 - leftRail) + (1 - rightRail)) / 3
  const centerContrast = clamp01(centerPane - Math.min(topBand, leftRail, rightRail))
  return clamp01(edgeDarkness * 0.7 + centerContrast * 0.4 - 0.15)
}

const inferAnnotationKinds = ({
  bounds,
  imageHeight,
  imageWidth,
  redPixelCount,
}: {
  bounds: NonNullable<AssistantImageClientAnalysis['redMarkupBounds']>
  imageWidth: number
  imageHeight: number
  redPixelCount: number
}) => {
  const kinds = ['region'] as NonNullable<AssistantImageClientAnalysis['annotationKinds']>
  const bboxWidth = Math.max(1, Math.round(bounds.width * imageWidth))
  const bboxHeight = Math.max(1, Math.round(bounds.height * imageHeight))
  const bboxArea = bboxWidth * bboxHeight
  const fillRatio = redPixelCount / bboxArea
  const aspectRatio = Math.max(bboxWidth, bboxHeight) / Math.max(1, Math.min(bboxWidth, bboxHeight))

  if (aspectRatio <= 1.45 && fillRatio <= 0.18) {
    kinds.unshift('circle')
  } else if (aspectRatio >= 2.35 && fillRatio <= 0.16) {
    kinds.unshift('arrow')
  } else if (aspectRatio >= 2 && fillRatio >= 0.24) {
    kinds.unshift('highlight')
  } else if (aspectRatio <= 1.6 && fillRatio <= 0.3) {
    kinds.unshift('cross')
  }

  return Array.from(new Set(kinds))
}

export const analyzeAssistantImageDataUrl = async (
  dataUrl: string,
  viewport?: AssistantViewportMetadata,
): Promise<AssistantImageClientAnalysis | undefined> => {
  if (typeof window === 'undefined') return undefined

  const image = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || canvas.width === 0 || canvas.height === 0) return undefined

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = -1
  let maxY = -1
  let redPixelCount = 0

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0
    const green = data[index + 1] ?? 0
    const blue = data[index + 2] ?? 0
    const alpha = data[index + 3] ?? 0
    if (alpha < 120) continue

    const isMarkupRed =
      red >= 150 &&
      red >= green * 1.35 &&
      red >= blue * 1.35 &&
      green <= 165 &&
      blue <= 165

    if (!isMarkupRed) continue

    const pixelIndex = index / 4
    const x = pixelIndex % canvas.width
    const y = Math.floor(pixelIndex / canvas.width)

    redPixelCount += 1
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const hasRedMarkup = redPixelCount >= Math.max(180, Math.floor(canvas.width * canvas.height * 0.0005))
  const redMarkupBounds =
    hasRedMarkup && Number.isFinite(minX) && Number.isFinite(minY) && maxX >= minX && maxY >= minY
      ? {
          x: Number((minX / canvas.width).toFixed(4)),
          y: Number((minY / canvas.height).toFixed(4)),
          width: Number(((maxX - minX + 1) / canvas.width).toFixed(4)),
          height: Number(((maxY - minY + 1) / canvas.height).toFixed(4)),
        }
      : null
  const viewportMatchScore = getViewportMatchScore(canvas.width, canvas.height, viewport)
  const workspaceUiScore = getWorkspaceUiScore(data, canvas.width, canvas.height)
  const annotationKinds =
    hasRedMarkup && redMarkupBounds
      ? inferAnnotationKinds({
          bounds: redMarkupBounds,
          imageWidth: canvas.width,
          imageHeight: canvas.height,
          redPixelCount,
        })
      : []

  return {
    hasRedMarkup,
    redMarkupBounds,
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    redPixelCount,
    ...(typeof viewportMatchScore === 'number' ? { viewportMatchScore } : {}),
    workspaceUiScore,
    annotationKinds,
  }
}

export const buildAssistantViewportMetadata = ({
  cameraMode,
  levelMode,
  phase,
  tool,
}: {
  cameraMode?: string | null
  levelMode?: string | null
  phase?: string | null
  tool?: string | null
}): AssistantViewportMetadata => ({
  width: typeof window !== 'undefined' ? window.innerWidth : undefined,
  height: typeof window !== 'undefined' ? window.innerHeight : undefined,
  devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
  ...(cameraMode ? { cameraMode } : {}),
  ...(levelMode ? { levelMode } : {}),
  ...(phase ? { phase } : {}),
  ...(typeof tool === 'string' ? { tool } : {}),
})

export const createAssistantImageAttachment = async ({
  dataUrl,
  filename,
  kind,
  mimeType,
  source,
  viewport,
}: {
  dataUrl: string
  filename?: string
  kind: AssistantImageAttachment['kind']
  mimeType?: string
  source: AssistantImageAttachment['source']
  viewport: AssistantViewportMetadata
}): Promise<AssistantImageAttachment> => ({
  dataUrl,
  kind,
  source,
  ...(filename ? { filename } : {}),
  ...(mimeType ? { mimeType } : {}),
  viewport,
  analysis: await analyzeAssistantImageDataUrl(dataUrl, viewport),
})
