import { useState, type FormEvent } from "react";
import { gql } from "../../lib/gqlClient";
import { FIND_USER_BY_EMAIL_QUERY } from "../../lib/mutations";

export default function NewMessageModal({
  onClose,
  onFound,
}: {
  onClose: () => void;
  onFound: (partnerId: string, partnerName: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter an email address.");
      return;
    }
    setIsSearching(true);
    try {
      const data = await gql<{ findUserByEmail: { id: string; name: string } | null }>(
        FIND_USER_BY_EMAIL_QUERY,
        { email: email.trim() }
      );
      if (!data.findUserByEmail) {
        setError("No Whispr user found with that email.");
        return;
      }
      onFound(data.findUserByEmail.id, data.findUserByEmail.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-whispr-noir/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2 className="font-display text-2xl font-semibold text-whispr-noir">New message</h2>
        <p className="mt-1 font-body text-sm text-whispr-mauve">
          Enter the email of the person you'd like to chat with.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            className="w-full rounded-md border border-whispr-rose/40 bg-white px-4 py-3 font-body text-sm text-whispr-noir shadow-sm placeholder:text-whispr-mauve/50 focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/25"
          />
          {error && (
            <p className="rounded-md bg-whispr-burgundy/10 px-3 py-2 font-body text-sm text-whispr-burgundy">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-whispr-rose/40 py-2.5 font-body text-sm font-semibold text-whispr-mauve hover:bg-whispr-snow"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSearching}
              className="flex-1 rounded-full bg-whispr-coral py-2.5 font-body text-sm font-semibold uppercase tracking-wider text-white hover:bg-whispr-crimson disabled:opacity-70"
            >
              {isSearching ? "Searching…" : "Start Chat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
