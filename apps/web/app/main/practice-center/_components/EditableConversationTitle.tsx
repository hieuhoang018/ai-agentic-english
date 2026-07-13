'use client'

import { useState } from 'react'

type EditableConversationTitleProps = {
  conversationId: string
  title: string | null
  fallback: string
  onSaved: (title: string) => void
  textClassName: string
}

export default function EditableConversationTitle({
  conversationId,
  title,
  fallback,
  onSaved,
  textClassName,
}: EditableConversationTitleProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(title ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setValue(title ?? '')
    setError(null)
    setIsEditing(true)
  }

  async function save() {
    const trimmed = value.trim()
    if (trimmed === '' || trimmed === title) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/review-center/conversations/${conversationId}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      if (!res.ok) throw new Error(`Request failed with ${res.status}`)
      onSaved(trimmed)
      setIsEditing(false)
    } catch {
      setError('Không thể lưu tên. Vui lòng thử lại.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            disabled={isSaving}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save()
              if (event.key === 'Escape') setIsEditing(false)
            }}
            placeholder={fallback}
            className="min-w-0 flex-1 rounded border border-outline-variant bg-white px-2 py-1 text-sm outline-none focus:border-primary dark:border-outline dark:bg-surface-dark-high dark:text-on-primary"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving}
            className="flex h-8 w-8 items-center justify-center rounded-full text-primary dark:text-primary-fixed-dim hover:bg-surface-container dark:hover:bg-surface-dark-high"
            aria-label="Lưu tên"
          >
            <span className="material-symbols-outlined text-base">check</span>
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container dark:text-surface-dim dark:hover:bg-surface-dark-high"
            aria-label="Hủy"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        {error ? <p className="text-xs text-error dark:text-red-400">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <h3 className={textClassName}>{title ?? fallback}</h3>
      <button
        type="button"
        onClick={startEditing}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container dark:text-surface-dim dark:hover:bg-surface-dark-high"
        aria-label="Đổi tên hội thoại"
      >
        <span className="material-symbols-outlined text-base">edit</span>
      </button>
    </div>
  )
}
