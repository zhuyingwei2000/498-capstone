import { useState } from "react";

const STEPS = [
  {
    emoji: "🥗",
    title: "Welcome to PantryPilot!",
    desc: "Your smart pantry & recipe companion. Never waste food again — we'll help you track what you have, find recipes, and shop smarter.",
    image: null,
  },
  {
    emoji: "🧺",
    title: "Build Your Pantry",
    desc: "Add ingredients by scanning a barcode 📷, photographing a receipt 📄, or typing manually. We'll track expiry dates and warn you before food goes bad.",
    highlights: ["📷 Scan barcodes instantly", "📄 OCR receipt scanning", "⏰ Expiry date alerts"],
  },
  {
    emoji: "🍳",
    title: "Discover Recipes",
    desc: "Get AI-powered recipe suggestions based on exactly what's in your pantry. Tap Cook It and we'll automatically deduct the ingredients you used.",
    highlights: ["✨ AI recipe suggestions", "🔍 Search 300k+ recipes", "👨‍🍳 Cook It deducts pantry"],
  },
];

export default function WelcomeTour({ onDone, uid }) {
  const [step, setStep] = useState(0);

  function finish() {
    const key = uid ? `pp_tour_done_${uid}` : "pp_tour_done";
    localStorage.setItem(key, "1");
    onDone();
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="tour-overlay">
      <div className="tour-modal">
        <button className="tour-skip" onClick={finish}>Skip</button>

        <div className="tour-emoji">{current.emoji}</div>
        <h2 className="tour-title">{current.title}</h2>
        <p className="tour-desc">{current.desc}</p>

        {current.highlights && (
          <ul className="tour-highlights">
            {current.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}

        <div className="tour-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`tour-dot${i === step ? " tour-dot--active" : ""}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className="tour-actions">
          {step > 0 && (
            <button className="btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {isLast ? (
            <button className="btn-primary tour-cta" onClick={finish}>
              Let's go! 🚀
            </button>
          ) : (
            <button className="btn-primary tour-cta" onClick={() => setStep(step + 1)}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
