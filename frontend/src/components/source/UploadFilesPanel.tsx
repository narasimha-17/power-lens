import { UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import { extractErrorMessage, uploadFile } from '../../api/client'
import { useAppState } from '../../state/AppState'

export function UploadFilesPanel() {
  const { refreshSources, setActiveSourceId } = useAppState()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { source_id } = await uploadFile(file)
      await refreshSources()
      setActiveSourceId(source_id)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        handleFiles(e.dataTransfer.files)
      }}
      className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-6 py-10 text-center dark:border-navy-700"
    >
      <UploadCloud className="h-8 w-8 text-brand-500" />
      <div className="text-sm text-slate-600 dark:text-slate-300">
        Drag & drop a CSV or Excel file, or{' '}
        <button className="font-medium text-brand-600 hover:underline" onClick={() => inputRef.current?.click()}>
          browse
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy && <div className="text-xs text-slate-400">Uploading & profiling schema…</div>}
      {error && <div className="text-xs text-rose-500">{error}</div>}
    </div>
  )
}
