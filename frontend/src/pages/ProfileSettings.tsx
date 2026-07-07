import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import { UPDATE_PROFILE_MUTATION, DELETE_ACCOUNT_MUTATION } from "../lib/mutations";
import { useAuth, type AuthUser } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  getNotificationPermission,
  isNotificationsEnabledByUser,
  isNotificationSupported,
  requestNotificationPermission,
  setNotificationsEnabledByUser,
} from "../lib/notifications";

// Fixed square output size (px) for the cropped avatar — same idea as
// WhatsApp: whatever photo the user picks, we center-crop it to a square
// and downscale it, so the upload is always small and consistent instead
// of depending on the original file size.
const AVATAR_SIZE = 320;
const JPEG_QUALITY = 0.85;
const MAX_SOURCE_FILE_BYTES = 15 * 1024 * 1024; // sanity cap on the *original* pick, way above what we'll actually send

/**
 * Loads an image file, center-crops it to a square, downscales it to
 * AVATAR_SIZE x AVATAR_SIZE, and returns a compressed JPEG data URL.
 * This is what keeps the payload small regardless of the original photo's
 * resolution/size — a 12MP phone photo and a tiny screenshot both end up
 * as the same small square.
 */

// This function takes an image file selected by the user, makes it a center-cropped square avatar, compresses it as a JPEG, and returns it as a Base64 data URL string.
function cropAndCompressToSquare(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const side = Math.min(img.width, img.height); //crop the image
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;

      const canvas = document.createElement("canvas");//send it to thhe canva evatar side
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported."));
        return;
      }

      // White backdrop first — JPEG has no alpha, so transparent PNGs
      // would otherwise turn black.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));// return the image as yeh jpeg
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image."));
    };

    img.src = objectUrl;
  });
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar ?? null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Notification preference — separate from the "Save changes" form below,
  // this applies immediately, WhatsApp-style, with no save step of its own.
  const notificationsSupported = isNotificationSupported();
  const [notificationsEnabled, setNotificationsEnabled] = useState(isNotificationsEnabledByUser());
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());

  // Delete account — a two-step, type-to-confirm flow since this is
  // irreversible. Kept separate from the profile-edit form's error/success
  // state so the two don't clobber each other.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  if (!user) return null; // ProtectedRoute already guards this route

  function handlePickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError("");
    setSuccess("");
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setError("That image is too large to use. Please pick a smaller one.");
      return;
    }

    setIsProcessingImage(true);
    try {
      const squareDataUrl = await cropAndCompressToSquare(file);
      setAvatarPreview(squareDataUrl);
      setAvatarChanged(true);
    } catch {
      setError("Could not process that image. Try another one.");
    } finally {
      setIsProcessingImage(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    // TS can't carry the `if (!user) return null;` narrowing above into this
    // nested closure, so re-check here.
    if (!user) return;

    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }

    setIsSaving(true);
    try {
      const variables: { name?: string; avatar?: string } = {};
      if (name.trim() !== user.name) variables.name = name.trim();
      if (avatarChanged && avatarPreview) variables.avatar = avatarPreview;

      const data = await gql<{ updateProfile: AuthUser }>(UPDATE_PROFILE_MUTATION, variables);
      setUser(data.updateProfile);
      setAvatarChanged(false);
      setSuccess("Profile updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleNotifications() {
    setError("");

    // Turning off never needs the permission dialog — just flip the pref.
    if (notificationsEnabled) {
      setNotificationsEnabledByUser(false);
      setNotificationsEnabled(false);
      return;
    }

    // Turning on: make sure the browser actually allows it first, since
    // flipping the in-app switch alone can't override a browser-level
    // denial.
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setNotificationsEnabledByUser(true);
      setNotificationsEnabled(true);
    } else {
      setError(
        "Notifications are blocked in your browser. Allow them in your browser's site settings, then try again."
      );
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    navigate("/login");
  }

  async function handleDeleteAccount() {
    setDeleteError("");
    setIsDeleting(true);
    try {
      await gql(DELETE_ACCOUNT_MUTATION);
      // Account + cookie are gone server-side — clear local state and
      // bounce to login, same destination as a normal logout.
      setUser(null);
      navigate("/login");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete account.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-y-auto bg-whispr-snow dark:bg-whispr-night">
      <div className="flex items-center gap-3 border-b border-whispr-linen bg-white px-5 py-4 dark:border-whispr-ash dark:bg-whispr-charcoal">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-linen hover:text-whispr-noir dark:text-whispr-fog dark:hover:bg-whispr-onyx dark:hover:text-whispr-ivory"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="font-display text-xl font-semibold text-whispr-noir dark:text-whispr-ivory">Profile settings</h1>
      </div>

      <div className="mx-auto w-full max-w-sm px-6 py-10">
        {/* Avatar — fixed square box, center-cropped, just like WhatsApp */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={handlePickFile}
            disabled={isProcessingImage}
            className="group relative h-24 w-24 overflow-hidden rounded-full shadow-sm disabled:opacity-70"
            aria-label="Change profile photo"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center font-display text-2xl font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #A06CD5, #815AC0)" }}
              >
                {initialsFor(user.name)}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-whispr-noir/0 text-white opacity-0 transition group-hover:bg-whispr-noir/40 group-hover:opacity-100">
              <span className="font-body text-xs font-semibold uppercase tracking-wider">
                {isProcessingImage ? "…" : "Change"}
              </span>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={handlePickFile}
            disabled={isProcessingImage}
            className="mt-3 font-body text-xs font-semibold uppercase tracking-wider text-whispr-coral hover:text-whispr-crimson disabled:opacity-60"
          >
            {isProcessingImage ? "Processing…" : "Upload new photo"}
          </button>
          <p className="mt-1 font-body text-[11px] text-whispr-mauve/70 dark:text-whispr-fog/70">
            We'll crop it to a square, like your chat avatar.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="name" className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve dark:text-whispr-fog">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-whispr-rose/40 bg-white px-4 py-3 font-body text-sm text-whispr-noir shadow-sm focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/25 dark:border-whispr-ash dark:bg-whispr-onyx dark:text-whispr-ivory"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve dark:text-whispr-fog">
              Email
            </label>
            <p className="rounded-md border border-whispr-linen bg-whispr-linen/40 px-4 py-3 font-body text-sm text-whispr-mauve dark:border-whispr-ash dark:bg-whispr-onyx/60 dark:text-whispr-fog">
              {user.email}
            </p>
          </div>

          {error && (
            <p className="rounded-md bg-whispr-burgundy/10 px-3 py-2 font-body text-sm text-whispr-burgundy dark:bg-whispr-burgundy/20 dark:text-whispr-petal">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md bg-green-50 px-3 py-2 font-body text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving || isProcessingImage}
            className="w-full rounded-full bg-whispr-coral py-3.5 font-body text-sm font-semibold uppercase tracking-wider text-white shadow-sm transition-colors duration-200 hover:bg-whispr-crimson disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </form>

        {/* Appearance — dark mode, applies immediately, no Save needed */}
        <div className="mt-8 flex items-center justify-between gap-4 rounded-md border border-whispr-linen bg-white px-4 py-3.5 dark:border-whispr-ash dark:bg-whispr-charcoal">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                theme === "dark" ? "bg-whispr-onyx text-whispr-petal" : "bg-whispr-linen text-whispr-coral"
              }`}
            >
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
            <div>
              <p className="font-body text-sm font-semibold text-whispr-noir dark:text-whispr-ivory">Dark mode</p>
              <p className="mt-0.5 font-body text-[11px] text-whispr-mauve/70 dark:text-whispr-fog/70">
                {theme === "dark" ? "Easier on the eyes at night." : "Switch to a darker, moodier look."}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Toggle dark mode"
            onClick={toggleTheme}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
              theme === "dark" ? "bg-whispr-coral" : "bg-whispr-linen dark:bg-whispr-ash"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                theme === "dark" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Notifications — WhatsApp-style, applies immediately, no Save needed */}
        <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-whispr-linen bg-white px-4 py-3.5 dark:border-whispr-ash dark:bg-whispr-charcoal">
          <div>
            <p className="font-body text-sm font-semibold text-whispr-noir dark:text-whispr-ivory">Message notifications</p>
            <p className="mt-0.5 font-body text-[11px] text-whispr-mauve/70 dark:text-whispr-fog/70">
              {notificationsSupported
                ? "Get notified when a message arrives and Whispr isn't in focus."
                : "Not supported in this browser."}
            </p>
            {notificationsSupported && notificationPermission === "denied" && (
              <p className="mt-1 font-body text-[11px] text-whispr-burgundy dark:text-whispr-petal">
                Blocked at the browser level — check your site settings.
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notificationsEnabled}
            aria-label="Toggle message notifications"
            onClick={handleToggleNotifications}
            disabled={!notificationsSupported}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
              notificationsEnabled ? "bg-whispr-coral" : "bg-whispr-linen dark:bg-whispr-ash"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                notificationsEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="mt-8 w-full rounded-full border border-whispr-burgundy/40 py-3 font-body text-sm font-semibold uppercase tracking-wider text-whispr-burgundy transition hover:bg-whispr-burgundy/10 disabled:opacity-60 dark:border-whispr-burgundy/60 dark:text-whispr-petal dark:hover:bg-whispr-burgundy/20"
        >
          {isLoggingOut ? "Logging out…" : "Log out"}
        </button>

        {/* Delete account — irreversible, so it's a type-to-confirm flow */}
        <div className="mt-4 rounded-md border border-whispr-burgundy/30 bg-whispr-burgundy/5 px-4 py-4 dark:border-whispr-burgundy/50 dark:bg-whispr-burgundy/10">
          <p className="font-body text-sm font-semibold text-whispr-burgundy dark:text-whispr-petal">
            Delete account
          </p>
          <p className="mt-1 font-body text-[11px] leading-relaxed text-whispr-mauve/80 dark:text-whispr-fog/80">
            This permanently deletes your profile. People you've chatted with
            will still see your old messages, shown as sent by "Deleted User" —
            but nobody will be able to message you again, and you won't be
            able to log back in.
          </p>

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-3 font-body text-xs font-semibold uppercase tracking-wider text-whispr-burgundy transition hover:text-whispr-crimson dark:text-whispr-petal"
            >
              Delete my account
            </button>
          ) : (
            <div className="mt-3 space-y-2.5">
              <p className="font-body text-xs text-whispr-mauve dark:text-whispr-fog">
                Type{" "}
                <span className="font-semibold text-whispr-noir dark:text-whispr-ivory">
                  DELETE
                </span>{" "}
                to confirm.
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
                className="w-full rounded-md border border-whispr-burgundy/40 bg-white px-3 py-2 font-body text-sm text-whispr-noir shadow-sm focus:border-whispr-burgundy focus:outline-none focus:ring-2 focus:ring-whispr-burgundy/20 dark:bg-whispr-onyx dark:text-whispr-ivory"
              />

              {deleteError && (
                <p className="font-body text-xs text-whispr-burgundy dark:text-whispr-petal">
                  {deleteError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                    setDeleteError("");
                  }}
                  disabled={isDeleting}
                  className="flex-1 rounded-full border border-whispr-linen py-2 font-body text-xs font-semibold uppercase tracking-wider text-whispr-mauve transition hover:bg-whispr-snow disabled:opacity-60 dark:border-whispr-ash dark:text-whispr-fog dark:hover:bg-whispr-onyx"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || isDeleting}
                  className="flex-1 rounded-full bg-whispr-burgundy py-2 font-body text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-whispr-crimson disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? "Deleting…" : "Permanently delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}