'use client'

import useEditor from '../../../store/use-editor'
import { CadCommandToast } from './cad-command-toast'
import { CadHelper } from './cad-helper'

export function HelperManager() {
  const phase = useEditor((s) => s.phase)

  return (
    <>
      {phase === 'cad' ? <CadHelper /> : null}
      <CadCommandToast />
    </>
  )
}
