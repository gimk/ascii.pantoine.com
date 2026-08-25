import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { prepareShareFromUrl } from './engine/share';
import './styles/terminal.css';

const mount = () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

/*
 * Share links are decoded before the first render.
 *
 * v2 payloads are deflated and DecompressionStream has no synchronous form,
 * while App reads the decoded state from a useMemo that seeds twenty useState
 * initializers. Doing the inflate here keeps that initialisation synchronous
 * at the cost of one microtask before mount. prepareShareFromUrl never
 * rejects, but mount is guarded anyway -- a link that fails to parse must
 * still open the app.
 */
prepareShareFromUrl().then(mount, mount);
