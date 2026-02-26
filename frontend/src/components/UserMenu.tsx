import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { getSubscription, createCheckoutSession } from "../api/client";

export default function UserMenu() {
  const { user, signOut, getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: sub } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => getSubscription(getToken),
    enabled: !!user,
    staleTime: 60_000,
  });

  const isActive = sub?.status === "active";

  const checkoutMutation = useMutation({
    mutationFn: () => createCheckoutSession(getToken),
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    },
  });

  if (!user) {
    return null;
  }

  const initials = (user.email ?? "?")[0].toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-sm font-bold
                   hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand"
        title={user.email}
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-56 bg-[#1f2937] border border-surface-border rounded-lg
                        shadow-2xl z-50 overflow-hidden">
          {/* Account info */}
          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-xs text-gray-400">Signed in as</p>
            <p className="text-sm text-gray-100 truncate font-medium">{user.email}</p>
          </div>

          {/* Subscription status */}
          <div className="px-4 py-3 border-b border-surface-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Plan</p>
                <p className={`text-sm font-medium ${isActive ? "text-green-400" : "text-gray-300"}`}>
                  {isActive ? "Pro ($5/yr)" : "Free"}
                </p>
              </div>
              {!isActive && (
                <button
                  onClick={() => { checkoutMutation.mutate(); setOpen(false); }}
                  disabled={checkoutMutation.isPending}
                  className="text-xs bg-brand text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                >
                  {checkoutMutation.isPending ? "…" : "Upgrade"}
                </button>
              )}
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={() => { signOut(); setOpen(false); }}
            className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-950/30 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
