/**
 * AetherPact — Razorpay Checkout wrapper (Phase 38, Addendum 4).
 * The Checkout script is loaded via a plain <script> tag in index.html —
 * Razorpay has no npm package for its hosted modal.
 */

interface RazorpaySuccessResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void }
  }
}

export function openRazorpayCheckout(opts: {
  keyId: string
  amount: number
  currency: string
  orderId: string
  name: string
  description: string
  prefillName?: string
  prefillEmail?: string
}): Promise<RazorpaySuccessResponse> {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay Checkout script did not load — check your connection.'))
      return
    }
    const rzp = new window.Razorpay({
      key: opts.keyId,
      amount: opts.amount,
      currency: opts.currency,
      order_id: opts.orderId,
      name: opts.name,
      description: opts.description,
      prefill: { name: opts.prefillName, email: opts.prefillEmail },
      theme: { color: '#2a3560' },
      handler: (response: RazorpaySuccessResponse) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled')),
      },
    })
    rzp.open()
  })
}
