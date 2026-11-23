import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BUILD } from './build';
import { rememberStartupVersion } from './whatsNew';
import './styles.css';

// Vor allem anderen, damit „Was ist neu“ den Stand vom App-Start sieht (AP-4)
rememberStartupVersion(BUILD.version);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
