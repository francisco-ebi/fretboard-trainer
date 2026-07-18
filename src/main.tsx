import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/app/styles/index.css'
import '@/shared/config/i18n';
import App from '@/app/App'
import { reloadOnceForCrossOriginIsolation } from '@/app/coi-reload'

reloadOnceForCrossOriginIsolation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
