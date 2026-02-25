import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import {
  getSubscription,
  createCheckoutSession,
  getNotificationSettings,
  updateNotificationSettings,
} from "../api/client";

export default function UserMenu() {
  const { user, signOut, getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [notifEmail, setNotifEmail] = useState("");
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

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

  const { data: notifSettings } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: () => getNotificationSettings(getToken),
    enabled: !!user,
  });

  useEffect(() => {
    if (notifSettings?.notification_email) {
      setNotifEmail(notifSettings.notification_email);
    } else if (user?.email) {
      setNotifEmail(user.email);
    }
  }, [notifSettings, user]);

  const isActive = sub?.status === "active";

  const checkoutMutation = useMutation({
    mutationFn: () => createCheckoutSession(getToken),
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    },
  });

  async function handleToggleNotifications(enabled: boolean) {
    setNotifError(null);
    setNotifSaving(true);
    try {
      await updateNotificationSettings(getToken, {
        enabled,
        notification_email: notifEmail || user?.email || null,
      });
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
    } catch (err: unknown) {
      setNotifError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setNotifSaving(false);
    }
  }

  async function handleSaveNotifEmail(e: React.FormEvent) {
    e.preventDefault();
    await handleToggleNotifications(notifSettings?.enabled ?? false);
    setShowNotifSettings(false);
  }

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
        <div className="absolute right-0 top-10 w-64 bg-[#1f2937] border border-surface-border rounded-lg
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

          {/* Notification settings */}
          <div className="px-4 py-3 border-b border-surface-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Weekly Emails</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isActive
                    ? "Monday morning pitcher digest"
                    : "Requires Pro subscription"}
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isActive) {
                    checkoutMutation.mutate();
                    setOpen(false);
                    return;
                  }
                  if (notifSettings?.enabled) {
                    handleToggleNotifications(false);
                  } else {
                    setShowNotifSettings((v) => !v);
                  }
                }}
                disabled={notifSaving}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none
                  ${notifSettings?.enabled && isActive ? "bg-brand" : "bg-gray-600"}
                  ${!isActive ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                title={isActive ? "Toggle weekly emails" : "Upgrade to enable"}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                    ${notifSettings?.enabled && isActive ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            {showNotifSettings && isActive && (
              <form onSubmit={handleSaveNotifEmail} className="mt-3 flex flex-col gap-2">
                <label className="text-xs text-gray-400">Send emails to:</label>
                <input
                  type="email"
                  className="select-base text-xs"
                  value={notifEmail}
                  onChange={(e) => setNotifEmail(e.target.value)}
                  placeholder={user.email ?? ""}
                />
                {notifError && <p className="text-red-400 text-xs">{notifError}</p>}
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary text-xs py-1" disabled={notifSaving}>
                    {notifSaving ? "Saving…" : "Enable & Save"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-gray-400 hover:text-gray-200"
                    onClick={() => setShowNotifSettings(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
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
