import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    if (mode === "signin") {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
    } else {
      const { error: err } = await signUp(email, password);
      if (err) {
        setError(err);
      } else {
        setSuccessMsg("Account created! Check your email to confirm your address, then sign in.");
        setMode("signin");
      }
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-raised">
      <div className="w-full max-w-sm bg-[#1f2937] border border-surface-border rounded-xl p-8 shadow-2xl">
        {/* Logo */}
        <div className="text-center mb-6">
          <span className="text-3xl">⚾</span>
          <h1 className="text-xl font-bold text-gray-100 mt-2">Pitcher Trend Analyzer</h1>
          <p className="text-sm text-gray-400 mt-1">
            {mode === "signin" ? "Sign in to your account" : "Create a free account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="sidebar-label">Email</label>
            <input
              type="email"
              required
              className="select-base"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="sidebar-label">Password</label>
            <input
              type="password"
              required
              className="select-base"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {mode === "signup" && (
            <div>
              <label className="sidebar-label">Confirm Password</label>
              <input
                type="password"
                required
                className="select-base"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-950/40 border border-red-800 rounded px-3 py-2">
              {error}
            </p>
          )}
          {successMsg && (
            <p className="text-green-400 text-sm bg-green-950/40 border border-green-800 rounded px-3 py-2">
              {successMsg}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary mt-1"
            disabled={loading}
          >
            {loading
              ? "Please wait…"
              : mode === "signin"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-5">
          {mode === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                className="text-blue-400 hover:underline"
                onClick={() => { setMode("signup"); setError(null); setSuccessMsg(null); }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                className="text-blue-400 hover:underline"
                onClick={() => { setMode("signin"); setError(null); setSuccessMsg(null); }}
              >
                Sign in
              </button>
            </>
          )}
        </p>

        {/* Continue without account */}
        <div className="mt-4 text-center">
          <button
            className="text-xs text-gray-500 hover:text-gray-300 underline"
            onClick={() => {
              // The parent App will handle this by not requiring auth for the analyzer
              // This button is only shown as a hint — since we allow anonymous use
              window.location.hash = "#guest";
            }}
          >
            Continue without an account
          </button>
        </div>
      </div>
    </div>
  );
}
