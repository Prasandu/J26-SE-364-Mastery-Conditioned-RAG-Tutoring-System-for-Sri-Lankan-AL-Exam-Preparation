import '@fontsource/noto-sans-sinhala/sinhala-400.css';
import '@fontsource/noto-sans-sinhala/sinhala-600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
