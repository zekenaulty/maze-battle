import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const expedition = new URLSearchParams(location.search).get('expedition');
const Screen = expedition === '2' ? lazy(() => import('./components/expedition/StreamExpeditionApp'))
  : expedition === '1' ? lazy(() => import('./components/expedition/ExpeditionApp')) : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<main className="loading-screen">Loading</main>}><Screen /></Suspense>
  </StrictMode>,
);
