import { useNavigate } from 'react-router-dom'

export default function Footer() {
  const nav = useNavigate()
  return (
    <footer className="border-t border-lavender/20 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-navy flex items-center justify-center">
            <span className="text-espresso text-xs font-bold">Æ</span>
          </div>
          <span>AetherPact — a real, working local demo. No production claims.</span>
        </div>
        <div className="flex gap-4">
          <button onClick={() => nav('/how-it-works')} className="hover:text-navy transition-colors">How It Works</button>
          <button onClick={() => nav('/about')} className="hover:text-navy transition-colors">About</button>
          <button onClick={() => nav('/contact')} className="hover:text-navy transition-colors">Contact</button>
        </div>
      </div>
    </footer>
  )
}
