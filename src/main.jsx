import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './components/Dashboard';

// Global styles
const globalStyles = document.createElement('style');
globalStyles.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0A0F1C; overflow-x: hidden; }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #0F172A; }
  ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #475569; }
`;
document.head.appendChild(globalStyles);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>
);
