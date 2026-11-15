import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

navigator.storage?.persist?.().catch(() => { });
createRoot(document.getElementById('root')!).render(<App />);
