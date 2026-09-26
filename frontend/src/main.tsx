import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Addendum 7: self-hosted site-wide type system, loaded once here so every
// route has Fraunces/Archivo available from first paint, not just Landing.
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/700.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
