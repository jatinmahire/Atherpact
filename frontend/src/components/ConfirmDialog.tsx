import Modal from './Modal'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth="max-w-sm">
      <p className="text-sm text-warm-white/70 mb-5">{message}</p>
      <div className="flex gap-3">
        <button onClick={onConfirm}
          className={`flex-1 py-2.5 rounded-xl font-semibold text-sm text-espresso transition-colors ${danger ? 'bg-red-500 hover:bg-red-400' : 'bg-navy hover:bg-navy-light'}`}>
          {confirmLabel}
        </button>
        <button onClick={onCancel} className="px-5 py-2.5 text-warm-white/70 hover:bg-warm-white/10 rounded-xl text-sm transition-colors">
          Cancel
        </button>
      </div>
    </Modal>
  )
}
