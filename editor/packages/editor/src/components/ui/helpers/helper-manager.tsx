'use client'

import { CadCommandToast } from './cad-command-toast'

export function HelperManager({
  enableCad = true,
}: {
  enableCad?: boolean
  enableCadRuntime?: boolean
}) {
  return (
    <>
      {enableCad ? <CadCommandToast /> : null}
    </>
  )
}

