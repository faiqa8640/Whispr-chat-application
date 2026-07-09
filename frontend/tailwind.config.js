/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        whispr: {
          blush:     "#F5EEFB",  // near-white lavender wash
          petal:     "#DEC9E9",  // lightest lavender
          rose:      "#D2B7E5",  // soft borders / dividers
          flamingo:  "#C19EE0",  // mid accent
          coral:     "#A06CD5",  // primary accent / CTA
          raspberry: "#9163CB",  // secondary accent
          crimson:   "#815AC0",  // CTA hover
          burgundy:  "#6247AA",  // deepest accent / error text
          snow:      "#FAF6FD",  // page background
          linen:     "#EFE1F7",  // hairline borders
          mauve:     "#7C6A93",  // muted body text
          noir:      "#2A1F3D",  // headings / deep panel base

          // ── Dark theme palette ──────────────────────────────────────────
          night:    "#140F1F",   // page background (dark)
          charcoal: "#1D1730",   // card / surface background (dark)
          onyx:     "#251E3B",   // secondary surface, inputs, hover (dark)
          ash:      "#3A3152",   // borders / dividers (dark)
          fog:      "#A79BC4",   // muted body text (dark)
          ivory:    "#F4EEFC",   // headings / primary text (dark)
        },
      },

      fontFamily: {
        display: ["'Cormorant Garamond'", "serif"],
        body: ["'Manrope'", "sans-serif"],
      },
      letterSpacing: {
        widest2: "0.25em",
      },
      keyframes: {
        slideDown: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Sweeping highlight for skeleton/loading states (voice-message
        // waveform placeholder) — a translucent band travels left to
        // right across the flat grey bars, WhatsApp-style.
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        slideDown: "slideDown 0.4s ease-out",
        fadeIn: "fadeIn 0.2s ease-out",
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};