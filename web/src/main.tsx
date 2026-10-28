import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { takeDevToken } from './api.ts';
import { App } from './app.tsx';
import './styles.css';

if (import.meta.env.DEV)
  takeDevToken();


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
