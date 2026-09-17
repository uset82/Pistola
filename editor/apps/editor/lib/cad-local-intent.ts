import { generateId } from '../../../packages/core/src/schema/base'
import { CadBodyNodeSchema, type CadBodyNode } from '../../../packages/core/src/schema/nodes/cad-body'
import type { AnyNode, AnyNodeId } from '../../../packages/core/src/schema/types'
import useScene from '../../../packages/core/src/store/use-scene'
import {
  buildEarAttachmentSpecs,
  buildFaceExtrusionSpec,
  buildShellPanelSpecs,
  getBoxBodySummary,
  type AssistantCadBoxFace,
  type CadAttachmentBodySpec,
} from '@pascal-app/editor/lib/assistant/box-features'
import { buildFallbackCadBrief, normalizeCadPrompt } from './cad-deterministic-brief'

type CadLocalContext = {
  parentId: string
  nodes: Record<string, AnyNode>
  selectedIds: string[]
  levelId: string | null
}

type LocalCadBriefIntent = {
  kind: 'brief'
  brief: ReturnType<typeof buildFallbackCadBrief>
}

type LocalCadAddEarsIntent = {
  kind: 'add_box_ears'
  bodyId: string
  assumptions: string[]
}

type LocalCadExtrudeFaceIntent = {
  kind: 'extrude_box_face'
  bodyId: string
  face: AssistantCadBoxFace
  distance?: number
  assumptions: string[]
}

type LocalCadShellIntent = {
  kind: 'shell_box_body'
  bodyId: string
  thickness?: number
  assumptions: string[]
}

export type LocalCadIntent =
  | LocalCadBriefIntent
  | LocalCadAddEarsIntent
  | LocalCadExtrudeFaceIntent
  | LocalCadShellIntent

const EAR_KEYWORDS = /\b(ear|ears|oreja|orejas)\b/
const SURFACE_KEYWORDS = /\b(surface|shell|hollow|superficie)\b/
const FACE_EXTRUDE_KEYWORDS = /\b(tab|tabs|flange|flanges|lip)\b|\b(extrude|pull|push)\b.*\bface\b|\bface\b.*\b(extrude|pull|push)\b/

const parseCadBoxFace = (normalizedPrompt: string): AssistantCadBoxFace => {
  if (/\bbottom\b|\bbase\b|\bunderside\b|\binferior\b/.test(normalizedPrompt)) return 'bottom'
  if (/\bleft\b|\bizquierda\b/.test(normalizedPrompt)) return 'left'
  if (/\bright\b|\bderecha\b/.test(normalizedPrompt)) return 'right'
  if (/\bfront\b|\bfrontal\b|\bdelantera\b/.test(normalizedPrompt)) return 'front'
  if (/\bback\b|\brear\b|\bposterior\b|\btrasera\b/.test(normalizedPrompt)) return 'back'
  return 'top'
}

const parseSingleMetricValue = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  const match = normalizedPrompt.match(/(\d+(?:\.\d+)?)\s*m(?:\b|$)/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

export const getSelectedCadBody = (
  nodes: Record<string, AnyNode>,
  selectedIds: string[],
): CadBodyNode | null => {
  if (selectedIds.length !== 1) return null
  const node = nodes[selectedIds[0] as AnyNodeId]
  return node?.type === 'cad-body' ? node : null
}

export const resolveLocalCadIntent = (
  prompt: string,
  context: CadLocalContext,
): LocalCadIntent | null => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  const selectedBody = getSelectedCadBody(context.nodes, context.selectedIds)
  const selectedBoxBody = selectedBody ? getBoxBodySummary(selectedBody) : null

  if (selectedBoxBody && EAR_KEYWORDS.test(normalizedPrompt)) {
    const assumptions: string[] = [
      `Attached two box ears to the selected body ${selectedBoxBody.id}.`,
    ]

    if (SURFACE_KEYWORDS.test(normalizedPrompt)) {
      assumptions.push(
        'Interpreted the surface request as placing the ears on the selected body top face because the local CAD scaffold does not support shell conversion.',
      )
    }

    return {
      kind: 'add_box_ears',
      bodyId: selectedBoxBody.id,
      assumptions,
    }
  }

  if (selectedBoxBody && SURFACE_KEYWORDS.test(normalizedPrompt) && !EAR_KEYWORDS.test(normalizedPrompt)) {
    return {
      kind: 'shell_box_body',
      bodyId: selectedBoxBody.id,
      assumptions: [
        `Converted the selected body ${selectedBoxBody.id} into thin shell panels.`,
        'Approximated the shell request with surface panels because the local CAD scaffold does not provide a true shell feature.',
      ],
    }
  }

  if (selectedBoxBody && FACE_EXTRUDE_KEYWORDS.test(normalizedPrompt)) {
    const face = parseCadBoxFace(normalizedPrompt)
    const distance = parseSingleMetricValue(prompt)
    const assumptions = [`Extruded a ${face} face tab from the selected body ${selectedBoxBody.id}.`]
    if (distance == null) assumptions.push('Used a default tab depth based on the selected box size.')

    return {
      kind: 'extrude_box_face',
      bodyId: selectedBoxBody.id,
      face,
      ...(typeof distance === 'number' ? { distance } : {}),
      assumptions,
    }
  }

  const brief = buildFallbackCadBrief(prompt, {
    levelId: context.levelId,
  })

  if (brief.operationGraph.length > 0 && brief.ambiguities.length === 0) {
    return {
      kind: 'brief',
      brief,
    }
  }

  return null
}

const createAttachmentBody = (
  parentId: string,
  spec: CadAttachmentBodySpec,
): string => {
  const body = CadBodyNodeSchema.parse({
    id: generateId('cbody'),
    name: spec.name,
    parentId,
    transform: {
      position: spec.position,
      rotation: spec.rotation,
      scale: [1, 1, 1],
    },
    sourceSketchId: null,
    sourceSketchIds: [],
    regenStatus: 'idle',
    regenError: null,
    preview: {
      primitive: 'box',
      dimensions: spec.dimensions,
      color: spec.color,
    },
    operations: [],
    operationHistory: [],
    artifacts: {},
    warnings: ['Local assistant-generated CAD attachment body.'],
  })

  useScene.getState().createNode(body, parentId as AnyNodeId)
  return body.id
}

export async function executeLocalCadIntent(
  prompt: string,
  context: CadLocalContext,
): Promise<{ handled: boolean; bodyIds: string[]; sketchIds: string[]; assumptions: string[] }> {
  const intent = resolveLocalCadIntent(prompt, context)
  if (!intent) {
    return {
      handled: false,
      bodyIds: [],
      sketchIds: [],
      assumptions: [],
    }
  }

  if (intent.kind === 'brief') {
    const { executeCadBrief } = await import('./cad-brief-executor')
    const result = await executeCadBrief(intent.brief, context.parentId)
    return {
      handled: true,
      bodyIds: result.bodyIds,
      sketchIds: result.sketchIds,
      assumptions: intent.brief.assumptions,
    }
  }

  const body = context.nodes[intent.bodyId as AnyNodeId]
  if (body?.type !== 'cad-body') {
    throw new Error('Select a CAD body before adding ears.')
  }

  const boxBody = getBoxBodySummary(body)
  if (!boxBody) {
    throw new Error('The selected CAD body must use a box preview before adding ears.')
  }

  if (intent.kind === 'add_box_ears') {
    const specs = buildEarAttachmentSpecs(boxBody)
    const createdBodyIds = specs.map((spec) => createAttachmentBody(boxBody.parentId, spec))

    return {
      handled: true,
      bodyIds: [boxBody.id, ...createdBodyIds],
      sketchIds: [],
      assumptions: intent.assumptions,
    }
  }

  if (intent.kind === 'extrude_box_face') {
    const createdBodyId = createAttachmentBody(
      boxBody.parentId,
      buildFaceExtrusionSpec(boxBody, intent.face, intent.distance),
    )

    return {
      handled: true,
      bodyIds: [boxBody.id, createdBodyId],
      sketchIds: [],
      assumptions: intent.assumptions,
    }
  }

  const createdBodyIds = buildShellPanelSpecs(boxBody, intent.thickness).map((spec) =>
    createAttachmentBody(boxBody.parentId, spec),
  )
  useScene.getState().deleteNode(boxBody.id as AnyNodeId)

  return {
    handled: true,
    bodyIds: createdBodyIds,
    sketchIds: [],
    assumptions: intent.assumptions,
  }
}
