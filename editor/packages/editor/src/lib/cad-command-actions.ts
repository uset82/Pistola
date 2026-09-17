import type { AssistantAction } from './assistant'
import { runAssistantCommand } from './assistant-command-actions'
import type { CadBooleanMode } from '../store/use-editor'

const runAssistantCadCommand = async (actions: AssistantAction[]) => {
  return runAssistantCommand(actions, { failureMessage: 'CAD command failed.' })
}

export const activateCadSketchCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-sketch' }])

export const activateCadLineCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-line' }])

export const activateCadRectangleCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-rectangle' }])

export const activateCadCircleCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-circle' }])

export const closeActiveCadSketchCommand = async () =>
  runAssistantCadCommand([{ type: 'close_cad_sketch' }])

export const activateCadExtrudeCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-extrude' }])

export const activateCadRevolveCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-revolve' }])

export const activateCadBooleanCommand = async (mode: CadBooleanMode) =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-boolean', cadBooleanMode: mode }])

export const activateCadFilletCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-fillet' }])

export const activateCadChamferCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-chamfer' }])

export const activateCadInspectCommand = async () =>
  runAssistantCadCommand([{ type: 'activate_tool', tool: 'cad-inspect' }])
