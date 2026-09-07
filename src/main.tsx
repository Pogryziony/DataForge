import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <main className="workbench"><h1>DataForge</h1><p>Local test data workbench</p></main>
    </HashRouter>
  </React.StrictMode>,
);
