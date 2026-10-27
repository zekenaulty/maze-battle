import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const Workshop = lazy(() => import('./components/maze3d/ModelWorkshop'));
const ConstructionWorkshop = lazy(() => import('./components/maze3d/ConstructionWorkshop'));
const models = new URLSearchParams(location.search).get('view') === 'models';
const construction = new URLSearchParams(location.search).get('view') === 'construction';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {construction ? <Suspense fallback={<p>Loading construction workshop…</p>}><ConstructionWorkshop /></Suspense>
      : models ? <Suspense fallback={<p>Loading model workshop…</p>}><Workshop /></Suspense> : <App />}
  </StrictMode>,
);
