'use client'

import useEditor from '../../../store/use-editor'
import { CadCommandToast } from './cad-command-toast'
import { CadHelper } from './cad-helper'

export function HelperManager({
  enableCad = true,
  enableCadRuntime = true,
}: {
  enableCad?: boolean
  enableCadRuntime?: boolean
}) {
  const phase = useEditor((s) => s.phase)

  return (
    <>
      {enableCad && enableCadRuntime && phase === 'cad' ? <CadHelper /> : null}
      {enableCad ? <CadCommandToast /> : null}
    </>
  )
}
