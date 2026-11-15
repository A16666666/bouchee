import { useEffect, useId, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';

export function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const id = 'reader-' + useId().replace(/:/g, '');
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    const s = new Html5Qrcode(id, {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      verbose: false,
      useBarCodeDetectorIfSupported: true,
    });
    let done = false, started = false;
    s.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: (w: number) => ({ width: Math.min(w * 0.85, 320), height: 150 }), aspectRatio: 1 },
      text => {
        if (done) return; done = true;
        navigator.vibrate?.(40);
        s.stop().catch(() => { }).finally(() => onCode(text));
      },
      () => { },
    ).then(() => { started = true; })
      .catch((e: unknown) => setErr(String(e).includes('Permission') || String(e).includes('NotAllowed')
        ? 'Accès à la caméra refusé. Autorise-le dans Réglages → Safari → Caméra, ou saisis le code ci-dessous.'
        : 'Caméra indisponible. Saisis le code ci-dessous.'));
    return () => { if (started && !done) s.stop().catch(() => { }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scanner">
      <div id={id} className="reader" />
      {err ? <p className="err">{err}</p> : <p className="muted center">Place le code-barres dans le cadre</p>}
      <form className="row gap" onSubmit={e => { e.preventDefault(); if (manual.replace(/\D/g, '').length >= 8) onCode(manual); }}>
        <input inputMode="numeric" placeholder="Saisir le code-barres" value={manual} onChange={e => setManual(e.target.value)} />
        <button className="btn" type="submit">OK</button>
      </form>
    </div>
  );
}
