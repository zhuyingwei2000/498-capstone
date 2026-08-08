import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { addPantryItem, scanReceipt } from "../api/client";

// step flow: "camera" → "preview" → "scanning" → "review" → "adding"
export default function ReceiptScanner({ onDone, onClose }) {
  const { token } = useAuth();
  const [step, setStep] = useState("camera");
  const [preview, setPreview] = useState(null);       // data-URL of captured/uploaded image
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  // Start camera whenever we enter the "camera" step.
  useEffect(() => {
    if (step !== "camera") return;
    setCameraError("");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera requires HTTPS. Please use Upload Photo instead.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        setCameraError("Camera unavailable: " + err.message);
      });

    return () => stopCamera();
  }, [step]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // Resize image to max 1200px wide and compress to JPEG 0.8 before sending.
  // Reduces token consumption without affecting OCR accuracy.
  function compressImage(sourceDataUrl, callback) {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      const scale = img.width > MAX ? MAX / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = sourceDataUrl;
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0);
    // Capture at 0.8 quality — camera frames are already display-size
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    stopCamera();
    setPreview(dataUrl);
    setImageDataUrl(dataUrl);
    setError("");
    setStep("preview");
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      stopCamera();
      // Compress uploaded files (phone photos can be 5–10 MB originals)
      compressImage(ev.target.result, (compressed) => {
        setPreview(compressed);
        setImageDataUrl(compressed);
        setError("");
        setStep("preview");
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleScan() {
    setError("");
    setStep("scanning");
    try {
      const { items: parsed } = await scanReceipt(token, imageDataUrl);
      if (!parsed || parsed.length === 0) {
        setError("No food items detected. Try a clearer photo of the receipt.");
        setStep("preview");
        return;
      }
      setItems(parsed.map((item) => ({ ...item, selected: true })));
      setStep("review");
    } catch (err) {
      setError(err.message);
      setStep("preview");
    }
  }

  function toggleItem(index) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, selected: !it.selected } : it))
    );
  }

  function updateItem(index, field, value) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  }

  async function handleAddSelected() {
    setError("");
    setStep("adding");
    const selected = items.filter((it) => it.selected);
    try {
      for (const item of selected) {
        await addPantryItem(token, {
          name: item.name,
          quantity: parseFloat(item.quantity) || 1,
          unit: item.unit,
          category: item.category || null,
          expiry_date: null,
        });
      }
      onDone(selected.length);
    } catch (err) {
      setError(err.message);
      setStep("review");
    }
  }

  const selectedCount = items.filter((it) => it.selected).length;

  return (
    <div className="scanner-overlay">
      <div className="scanner-modal receipt-modal">
        <div className="scanner-header">
          <span>Scan Receipt</span>
          <button className="scanner-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="receipt-body">

          {/* ── Live camera view ── */}
          {step === "camera" && (
            <>
              <div className="receipt-camera-viewport">
                {cameraError ? (
                  <p className="receipt-camera-error">{cameraError}</p>
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="receipt-camera-video"
                  />
                )}
              </div>
              <div className="form-actions">
                <button className="btn-primary" onClick={capturePhoto} disabled={!!cameraError}>
                  📸 Capture
                </button>
                <button className="btn-ghost" onClick={() => fileRef.current.click()}>
                  Upload Photo
                </button>
              </div>
              {cameraError && (
                <p className="receipt-hint">
                  Camera blocked — use <strong>Upload Photo</strong> instead.
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </>
          )}

          {/* ── Still preview + Scan button ── */}
          {(step === "preview" || step === "scanning") && (
            <>
              <img src={preview} alt="Receipt preview" className="receipt-preview" />
              {error && <p className="form-error">{error}</p>}
              <div className="form-actions">
                <button
                  className="btn-primary"
                  onClick={handleScan}
                  disabled={step === "scanning"}
                >
                  {step === "scanning" ? "Scanning…" : "Scan Receipt"}
                </button>
                <button className="btn-ghost" onClick={() => setStep("camera")}>
                  Retake
                </button>
              </div>
            </>
          )}

          {/* ── Review checklist ── */}
          {(step === "review" || step === "adding") && (
            <>
              <p className="receipt-hint">
                Check the items to add. You can edit names and quantities before adding.
              </p>
              <ul className="receipt-item-list">
                {items.map((item, i) => (
                  <li
                    key={i}
                    className={`receipt-item${item.selected ? "" : " receipt-item--unchecked"}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleItem(i)}
                      className="receipt-checkbox"
                    />
                    <div className="receipt-item-fields">
                      <input
                        className="receipt-item-name"
                        value={item.name}
                        onChange={(e) => updateItem(i, "name", e.target.value)}
                      />
                      <div className="receipt-qty-row">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, "quantity", e.target.value)}
                          className="receipt-qty-input"
                        />
                        {item.category && (
                          <span className="receipt-cat-tag">{item.category}</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {error && <p className="form-error">{error}</p>}
              <div className="form-actions">
                <button
                  className="btn-primary"
                  onClick={handleAddSelected}
                  disabled={selectedCount === 0 || step === "adding"}
                >
                  {step === "adding"
                    ? "Adding…"
                    : `Add ${selectedCount} item${selectedCount !== 1 ? "s" : ""}`}
                </button>
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
