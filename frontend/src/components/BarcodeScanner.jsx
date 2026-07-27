import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { lookupBarcode } from "../api/openfoodfacts";

export default function BarcodeScanner({ onResult, onClose }) {
  const scannerRef = useRef(null);
  const activeRef = useRef(false); // tracks whether start() succeeded
  const [status, setStatus] = useState("Starting camera…");
  const [error, setError] = useState("");
  const lookingRef = useRef(false);

  useEffect(() => {
    // Each effect run gets its own scanner instance bound to a fresh div.
    const scanner = new Html5Qrcode("barcode-reader-viewport");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 120 } },
        async (barcode) => {
          if (lookingRef.current) return;
          lookingRef.current = true;
          // stop() throws synchronously if not running — must use try/catch
          try { await scanner.stop(); } catch (_) {}
          activeRef.current = false;
          setStatus("Looking up product…");
          try {
            const product = await lookupBarcode(barcode);
            onResult(product);
          } catch (err) {
            setError(err.message);
            lookingRef.current = false;
          }
        },
        () => {} // per-frame decode misses are normal
      )
      .then(() => {
        activeRef.current = true;
        setStatus("Point camera at a barcode");
      })
      .catch((err) => setError(String(err)));

    return () => {
      // stop() throws synchronously when scanner never started — always wrap
      if (activeRef.current) {
        try { scanner.stop().catch(() => {}); } catch (_) {}
        activeRef.current = false;
      }
    };
  }, []);

  return (
    <div className="scanner-overlay">
      <div className="scanner-modal">
        <div className="scanner-header">
          <span>Scan Barcode</span>
          <button className="scanner-close-btn" onClick={onClose}>✕</button>
        </div>

        <div id="barcode-reader-viewport" className="scanner-viewport" />

        <div className="scanner-footer">
          {error ? (
            <>
              <p className="form-error">{error}</p>
              <button className="btn-ghost" onClick={onClose}>Enter manually</button>
            </>
          ) : (
            <p className="scanner-status">{status}</p>
          )}
        </div>
      </div>
    </div>
  );
}
