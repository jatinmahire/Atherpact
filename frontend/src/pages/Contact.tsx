/**
 * AetherPact — Contact/Support page (Phase 21, Addendum 3 / reference image panel 12).
 * Real submission to POST /contact — no fake success toast without a stored row.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, CheckCircle, Mail, Phone } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { contactAPI } from '../api/client'
import type { ContactMessagePayload } from '../api/client'

const CATEGORIES: { value: ContactMessagePayload['category']; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'booking', label: 'Booking' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'verification', label: 'Verification' },
  { value: 'technical', label: 'Technical' },
]

export default function Contact() {
  const [form, setForm] = useState<ContactMessagePayload>({
    name: '', business: '', email: '', phone: '', category: 'general', message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const update = (field: keyof ContactMessagePayload) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await contactAPI.send(form)
      setSubmitted(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Could not send your message — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-lavender/10">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Get in Touch</h1>
        <p className="text-gray-500 mb-8">We're here to help. Reach out to us with any questions or support needs.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-center gap-2"><Mail size={15} className="text-navy" /> support@aetherpact.demo</div>
            <div className="flex items-center gap-2"><Phone size={15} className="text-navy" /> +91 (demo line)</div>
            <p className="text-xs text-gray-400 pt-2">This is a local demo — messages are stored in the backend, not routed anywhere.</p>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl border border-lavender/20 shadow-sm p-6">
            {submitted ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-10">
                <CheckCircle size={36} className="mx-auto mb-3 text-green-500" />
                <p className="font-semibold text-gray-900">Message sent</p>
                <p className="text-sm text-gray-500 mt-1">We'll get back to you shortly.</p>
              </motion.div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.name} onChange={update('name')} required placeholder="Name"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                  <input value={form.business} onChange={update('business')} placeholder="Business (optional)"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="email" value={form.email} onChange={update('email')} required placeholder="Email"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                  <input value={form.phone} onChange={update('phone')} placeholder="Phone (optional)"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                </div>
                <select value={form.category} onChange={update('category')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy bg-white">
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <textarea value={form.message} onChange={update('message')} required rows={4} placeholder="How can we help you?"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy resize-none" />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button type="submit" disabled={submitting}
                  className="bg-navy text-white px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center gap-2 hover:bg-navy-light transition-colors">
                  {submitting && <Loader2 size={14} className="animate-spin" />} Send Message
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
