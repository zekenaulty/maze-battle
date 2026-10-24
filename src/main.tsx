import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const Workshop = lazy(() => import('./components/maze3d/ModelWorkshop'));
const models = new URLSearchParams(location.search).get('view') === 'models';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {models ? <Suspense fallback={<p>Loading model workshop…</p>}><Workshop /></Suspense> : <App />}
  </StrictMode>,
);
