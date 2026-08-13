import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PortalCliente from './pages/PortalCliente'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PortalCliente />
  </StrictMode>,
)
