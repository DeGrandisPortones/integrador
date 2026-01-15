// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRoot from './AppRoot.jsx';
import './index.css';

// AppRoot ya incluye AuthProvider y el “gate” para link mode.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
