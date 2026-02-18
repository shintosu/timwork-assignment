import { useEffect, useMemo, useState } from 'react'

import { loadMetadata } from './data/loadMetadata'
import { normalizeMetadata } from './data/normalizeMetadata'
import type { LayerKey, LayerNode, NormalizedMeta } from './types/normalized'

function useNormalizedData() {
  const [status, setStatus] = useState<'loading'|'ready'|'error'>("loading")
  const [meta, setMeta] = useState<NormalizedMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    loadMetadata()
      .then((raw) => {
        if (!mounted) return
        const norm = normalizeMetadata(raw)
        setMeta(norm)
        setStatus('ready')
      })
      .catch((e) => {
        if (!mounted) return
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      })
    return () => { mounted = false }
  }, [])

  return { status, meta, error }
}

function nodeLabel(node: LayerNode) {
  switch (node.kind) {
    case 'drawing':
      return `도면 · ${node.drawingId} · ${node.drawingName}`
    case 'discipline':
      return `공종 · ${node.drawingName} · ${node.discipline}`
    case 'region':
      return `영역 · ${node.drawingName} · ${node.discipline} · ${node.region}`
    case 'revision': {
      const base = `${node.drawingName} · ${node.discipline} · ${node.revision}`
      if (node.variant === 'region') return `리비전(영역) · ${base} · ${node.region}`
      if (node.variant === 'selfContained') return `리비전(독립) · ${base}`
      return `리비전 · ${base}`
    }
  }
}

export default function App() {
  const { status, meta, error } = useNormalizedData()
  const [userSelectedKey, setUserSelectedKey] = useState<LayerKey | undefined>(undefined)

  const options = useMemo(() => {
    if (!meta) return [] as Array<{ key: LayerKey, label: string }>
    const entries = Object.values(meta.layersByKey)
    // Prefer revisions first, then disciplines, then drawings for quick access
    entries.sort((a, b) => {
      const order = (n: LayerNode) => n.kind === 'revision' ? 0 : n.kind === 'discipline' ? 1 : n.kind === 'region' ? 2 : 3
      const oa = order(a), ob = order(b)
      if (oa !== ob) return oa - ob
      return nodeLabel(a).localeCompare(nodeLabel(b))
    })
    return entries.map(n => ({ key: n.key, label: nodeLabel(n) }))
  }, [meta])

  const selectedKey = useMemo<LayerKey | undefined>(() => {
    if (userSelectedKey) return userSelectedKey
    if (status === 'ready') return options[0]?.key
    return undefined
  }, [userSelectedKey, status, options])

  const selectedNode: LayerNode | undefined = selectedKey && meta ? meta.layersByKey[selectedKey] : undefined

  return (
    <div className="min-h-screen flex flex-col">
      <div className="navbar bg-base-100 border-b">
        <div className="flex-1 px-2">
          <span className="text-lg font-semibold">건설 도면 탐색 · 최소 뷰</span>
        </div>
      </div>

      <div className="w-full border-b p-3 flex items-center gap-4 bg-base-100">
        {status === 'loading' && <span className="loading loading-spinner loading-sm" aria-label="loading" />}
        {status === 'error' && (
          <div role="alert" className="alert alert-error py-2">
            <span>로딩 실패: {error}</span>
          </div>
        )}
        {status === 'ready' && (
          <div className="form-control w-full max-w-3xl">
            <label className="label">
              <span className="label-text">레이어 선택</span>
            </label>
            <select
              className="select select-bordered"
              value={selectedKey ?? ''}
              onChange={(e) => setUserSelectedKey(e.target.value as LayerKey)}
            >
              <option value="" disabled>선택하세요</option>
              {options.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <main className="grid grid-cols-[280px,1fr] gap-4 p-4 flex-1 min-h-0">
        {selectedNode ? (
          <>
            <div className="card bg-base-100 shadow-sm h-fit">
              <div className="card-body py-4">
                <h2 className="card-title text-base">컨텍스트</h2>
                <div className="text-sm">도면: {selectedNode.drawingName} ({selectedNode.drawingId})</div>
                {selectedNode.kind !== 'drawing' && 'discipline' in selectedNode && (
                  <div className="text-sm">공종: {selectedNode.discipline}</div>
                )}
                {selectedNode.kind === 'revision' && (
                  <div className="text-sm">리비전: {selectedNode.revision}{selectedNode.date ? ` · ${selectedNode.date}` : ''}</div>
                )}
              </div>
            </div>
            <div className="card bg-base-100 shadow-sm h-full">
              <div className="card-body p-0 h-full">
                <div className="w-full h-full overflow-auto flex items-center justify-center">
                  <img className="max-w-full max-h-full object-contain" src={selectedNode.image} alt={nodeLabel(selectedNode)} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="col-span-2 h-full flex items-center justify-center text-base-content/60">표시할 레이어가 없습니다</div>
        )}
      </main>
    </div>
  )
}
