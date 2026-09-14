import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './desktop.css'
import App from './Desktop.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
