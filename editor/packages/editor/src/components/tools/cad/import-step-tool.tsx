'use client'

import { Html } from '@react-three/drei'
import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '../../../lib/utils'
import useCad, { cadHelperUnavailableMessage } from '../../../store/use-cad'
import useEditor from '../../../store/use-editor'

export const ImportStepTool: React.FC = () => {
  const setMode = useEditor((state) => state.setMode)
  const setTool = useEditor((state) => state.setTool)
  const helperStatus = useCad((state) => state.helperStatus)
  const lastError = useCad((state) => state.lastError)
  const importStepFile = useCad((state) => state.importStepFile)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const helperUnavailable = helperStatus === 'error'

  const handleImport = async () => {
    if (!selectedFile || isImporting) return

    setIsImporting(true)
    try {
      await importStepFile(selectedFile)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Html fullscreen>
      <div className="pointer-events-none fixed top-24 left-1/2 z-50 w-[360px] -translate-x-1/2">
        <div className="pointer-events-auto rounded-2xl border border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                <FileUp className="h-4 w-4" />
                Import STEP
              </div>
              <div className="pt-1 text-muted-foreground text-xs">
                Upload a `.step` or `.stp` file to create an imported CAD body.
              </div>
            </div>
            <button
              className="rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              onClick={() => {
                setMode('select')
                setTool(null)
              }}
              type="button"
            >
              Cancel
            </button>
          </div>

          <div className="mt-3 rounded-lg border border-dashed border-border/60 bg-black/10 p-3">
            <input
              accept=".step,.stp"
              className="hidden"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null)
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/50 bg-background/60 px-3 py-3 font-medium text-sm text-foreground transition-colors hover:bg-accent/40"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <FileUp className="h-4 w-4" />
              {selectedFile ? 'Choose a different STEP file' : 'Choose STEP file'}
            </button>
            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              {selectedFile ? selectedFile.name : 'No file selected'}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-black/10 px-3 py-2 text-[11px] text-muted-foreground">
            {lastError ||
              (helperUnavailable
                ? cadHelperUnavailableMessage
                : 'Imported bodies are placed in the active level when one is selected.')}
          </div>

          <button
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-sm transition-colors',
              selectedFile && !isImporting && !helperUnavailable
                ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
                : 'cursor-not-allowed bg-border/20 text-muted-foreground',
            )}
            disabled={!selectedFile || isImporting || helperUnavailable}
            onClick={() => void handleImport()}
            type="button"
          >
            <FileUp className="h-4 w-4" />
            {isImporting ? 'Importing…' : 'Import STEP'}
          </button>
        </div>
      </div>
    </Html>
  )
}
