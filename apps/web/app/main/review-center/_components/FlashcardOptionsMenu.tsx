type FlashcardOptionsMenuProps = {
  open: boolean
}

export default function FlashcardOptionsMenu({ open }: FlashcardOptionsMenuProps) {
  if (!open) return null

  return (
    <div className="absolute right-0 top-10 z-10 w-56 overflow-hidden rounded-lg border border-outline-variant bg-white shadow-[0_16px_40px_-20px_rgba(15,23,42,0.65)]">
      <button className="flex h-12 w-full items-center gap-3 px-4 text-left text-on-surface hover:bg-surface-container">
        <span className="material-symbols-outlined text-base">edit</span>
        Chỉnh sửa thẻ
      </button>
      <button className="flex h-12 w-full items-center gap-3 border-t border-outline-variant/40 px-4 text-left text-error hover:bg-red-50">
        <span className="material-symbols-outlined text-base">delete</span>
        Xóa thẻ
      </button>
    </div>
  )
}
