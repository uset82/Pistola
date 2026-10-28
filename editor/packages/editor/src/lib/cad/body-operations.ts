import {
  normalizeCadBodyOperations,
  type CadBodyNode,
  type CadBodyOperation,
} from '@pascal-app/core'

/**
 * The one rule for reading a body's editable timeline.
 *
 * `operationHistory` is the canonical list once it has entries; `operations`
 * mirrors it for older scenes and for nodes created before the history field.
 */
export const readBodyOperations = (
  body: Pick<CadBodyNode, 'operations' | 'operationHistory'>,
): CadBodyOperation[] =>
  normalizeCadBodyOperations(
    body.operationHistory.length > 0 ? body.operationHistory : body.operations,
  )

/**
 * Patch both lists from one array.
 *
 * Any writer that updates one without the other silently loses the update on
 * the next regenerate, so callers should spread this instead of hand-writing
 * the two keys.
 */
export const bodyOperationsPatch = (
  operations: CadBodyOperation[],
): Pick<CadBodyNode, 'operations' | 'operationHistory'> => ({
  operations,
  operationHistory: operations,
})
