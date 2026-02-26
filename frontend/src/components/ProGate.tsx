import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { createCheckoutSession } from "../api/client";

interface Props {
  onSignUp?: () => void;
}

export default function ProGate({ onSignUp }: Props) {
  const { user, getToken } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const data = await createCheckoutSession(getToken);
      if (data.checkout_url) window.location.href = data.checkout_url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
      <span className="text-5xl">🔒</span>
      <div>
        <p className="text-gray-200 font-semibold text-lg">Pro Feature</p>
        <p className="text-gray-400 text-sm mt-1">
          This tab requires a Pro subscription ($5/yr).
        </p>
      </div>
      {user ? (
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="text-sm bg-brand text-white px-5 py-2 rounded hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "…" : "Upgrade to Pro — $5/yr"}
        </button>
      ) : onSignUp ? (
        <button
          onClick={onSignUp}
          className="text-sm bg-brand text-white px-5 py-2 rounded hover:opacity-90"
        >
          Sign up for Pro
        </button>
      ) : (
        <p className="text-gray-500 text-sm">Sign in to upgrade.</p>
      )}
    </div>
  );
}
