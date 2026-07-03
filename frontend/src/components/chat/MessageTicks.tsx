type Variant = "bubble" | "sidebar";

/**
 * WhatsApp-style delivery/read ticks.
 *
 * IMPORTANT: the two places these render sit on very different
 * backgrounds — a coral/crimson gradient bubble vs. a white/light
 * sidebar row — so a single fixed color doesn't work (a coral tick
 * on a coral bubble is invisible, which is the bug we're fixing).
 *
 * - variant="bubble"  → used inside sent message bubbles (dark bg)
 * - variant="sidebar" → used in the conversation list preview (light bg)
 */
export default function MessageTicks({
  read,
  variant = "sidebar",
}: {
  read: boolean;
  variant?: Variant;
}) {
  const colors =
    variant === "bubble"
      ? {
          unread: "rgba(255,255,255,0.65)", // sent, on the coral gradient
          read: "#FFD966",                  // bright gold — pops against purple/coral
        }
      : {
          unread: "#B7AFC4", // sent, on white/light sidebar row
          read: "#7C3AED",   // saturated violet — clearly reads against white
        };

  const stroke = read ? colors.read : colors.unread;

  return (
    <svg
      width="16"
      height="11"
      viewBox="0 0 16 11"
      fill="none"
      className="shrink-0"
      aria-label={read ? "Read" : "Sent"}
    >
      <path
        d="M1 5.5L4 8.5L9.5 1.5"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 5.5L9 8.5L14.5 1.5"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
