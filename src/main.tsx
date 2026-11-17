import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';

// Vérifie les mises à jour au lancement et à chaque retour dans l'app ; recharge dès qu'il y en a une.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { updateSW(true); },
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => reg.update().catch(() => { });
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60_000);
  },
});

navigator.storage?.persist?.().catch(() => { });
createRoot(document.getElementById('root')!).render(<App />);
