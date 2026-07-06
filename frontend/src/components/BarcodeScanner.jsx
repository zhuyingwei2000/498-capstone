import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { lookupBarcode } from "../api/openfoodfacts";

// Wraps html5-qrcode in a full-screen overlay.
// Props:
//   onResult(product) — called once with { name, category } when a barcode is found
//   onClose()         — called when the user cancels
export default function BarcodeScanner({ onResult, onClose }) {
  const scannerRef = useRef(null);
  const [status, setStatus] = useState("Starting camera…");
  const [error, setError] = useState("");
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    const scanner = new Html5Qrcode("barcode-reader-viewport");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" }, // prefer rear camera on mobile
        { fps: 10, qrbox: { width: 260, height: 130 } },
        async (barcode) => {
          if (looking) return; // ignore extra frames while fetching
          setLooking(true);
          await scanner.stop().catch(() => {});
          setStatus("Looking up product…");
          try {
            const product = await lookupBarcode(barcode);
            onResult(product);
          } catch (err) {
            setError(err.message);
            setLooking(false);
          }
        },
        () => {} // per-frame decode errors are normal — ignore them
      )
      .then(() => setStatus("Point camera at a barcode"))
      .catch((err) => setError(String(err)));

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="scanner-overlay">
      <div className="scanner-modal">
        <div className="scanner-header">
          <span>Scan Barcode</span>
          <button className="btn-ghost scanner-close" onClick={onClose}>✕</button>
        </div>

        {/* html5-qrcode mounts the camera stream inside this div */}
        <div id="barcode-reader-viewport" className="scanner-viewport" />

        <div className="scanner-footer">
          {error ? (
            <>
              <p className="form-error">{error}</p>
              <button className="btn-ghost" onClick={onClose}>Enter manually</button>
            </>
          ) : (
            <p className="status-msg">{status}</p>
          )}
        </div>
      </div>
    </div>
  );
}
