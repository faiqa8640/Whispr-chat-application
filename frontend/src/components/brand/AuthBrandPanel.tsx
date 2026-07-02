// import { Link } from "react-router-dom";

// interface AuthBrandPanelProps {
//   quote: string;
//   body: string;
// }

// /**
//  * Shared left-hand brand panel for Login & Signup.
//  * Signature element: layered chat bubbles rendered as hairline strokes,
//  * bleeding off the bottom-right edge — conveys connection without stock imagery.
//  */
// export default function AuthBrandPanel({ quote, body }: AuthBrandPanelProps) {
//   return (
//     <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-delina-espresso px-14 py-16 text-delina-ivory lg:flex">
//       {/* ambient color wash */}
//       <div
//         aria-hidden="true"
//         className="absolute inset-0 opacity-[0.10]"
//         style={{
//           backgroundImage:
//             "radial-gradient(circle at 20% 15%, #9AB17A 0, transparent 50%), radial-gradient(circle at 90% 85%, #DEB887 0, transparent 55%)",
//         }}
//       />

//       {/* chat bubble illustration — signature element */}
//       <ChatBubbles className="pointer-events-none absolute -bottom-8 -right-10 h-[520px] w-[420px] opacity-[0.16]" />
//       <div
//         aria-hidden="true"
//         className="pointer-events-none absolute inset-0 bg-gradient-to-t from-delina-espresso via-transparent to-transparent"
//       />

//       {/* wordmark */}
//       <Link to="/" className="relative z-10 flex flex-col">
//         <span className="font-display text-4xl font-semibold tracking-widest2">
//           WHISPR
//         </span>
//         <span className="mt-2 h-px w-12 bg-delina-burlywood/70" />
//         <span className="mt-2 font-body text-[10px] uppercase tracking-[0.3em] text-delina-sageLight">
//           Speak softly. Connect deeply.
//         </span>
//       </Link>

//       {/* quote block */}
//       <div className="relative z-10 max-w-md">
//         <span className="font-body text-[10px] uppercase tracking-[0.3em] text-delina-burlywood/80">
//           Est. 2026
//         </span>
//         <p className="mt-4 font-display text-[34px] italic leading-[1.25] text-delina-blush">
//           {quote}
//         </p>
//         <p className="mt-6 font-body text-sm leading-relaxed text-delina-taupe">
//           {body}
//         </p>
//       </div>

//       <div className="relative z-10 font-body text-xs uppercase tracking-[0.2em] text-delina-clay">
//         © {new Date().getFullYear()} Whispr
//       </div>
//     </div>
//   );
// }

// function ChatBubbles({ className }: { className?: string }) {
//   return (
//     <svg
//       viewBox="0 0 420 560"
//       fill="none"
//       xmlns="http://www.w3.org/2000/svg"
//       className={className}
//     >
//       {/* large bubble — bottom right, sent */}
//       <rect
//         x="80"
//         y="340"
//         width="280"
//         height="90"
//         rx="24"
//         stroke="#DEB887"
//         strokeWidth="1.5"
//       />
//       {/* tail for large bubble (right side — "sent") */}
//       <path
//         d="M340 420 Q370 435 355 460 Q345 438 330 430Z"
//         stroke="#DEB887"
//         strokeWidth="1.5"
//         strokeLinejoin="round"
//       />
//       {/* dot row inside large bubble */}
//       <circle cx="165" cy="385" r="4" fill="#DEB887" opacity="0.5" />
//       <circle cx="210" cy="385" r="4" fill="#DEB887" opacity="0.5" />
//       <circle cx="255" cy="385" r="4" fill="#DEB887" opacity="0.5" />

//       {/* medium bubble — middle left, received */}
//       <rect
//         x="40"
//         y="210"
//         width="240"
//         height="86"
//         rx="22"
//         stroke="#9AB17A"
//         strokeWidth="1.4"
//       />
//       {/* tail for medium bubble (left side — "received") */}
//       <path
//         d="M60 290 Q28 308 44 332 Q55 308 74 300Z"
//         stroke="#9AB17A"
//         strokeWidth="1.4"
//         strokeLinejoin="round"
//       />
//       {/* short text lines inside medium bubble */}
//       <line x1="70" y1="243" x2="240" y2="243" stroke="#9AB17A" strokeWidth="1.1" opacity="0.6" strokeLinecap="round" />
//       <line x1="70" y1="263" x2="190" y2="263" stroke="#9AB17A" strokeWidth="1.1" opacity="0.6" strokeLinecap="round" />

//       {/* small bubble — upper right, sent */}
//       <rect
//         x="140"
//         y="100"
//         width="210"
//         height="74"
//         rx="20"
//         stroke="#DEB887"
//         strokeWidth="1.3"
//       />
//       {/* tail for small bubble (right side) */}
//       <path
//         d="M326 168 Q352 180 340 200 Q330 180 316 174Z"
//         stroke="#DEB887"
//         strokeWidth="1.3"
//         strokeLinejoin="round"
//       />
//       {/* text lines inside small bubble */}
//       <line x1="168" y1="130" x2="318" y2="130" stroke="#DEB887" strokeWidth="1.0" opacity="0.5" strokeLinecap="round" />
//       <line x1="168" y1="150" x2="270" y2="150" stroke="#DEB887" strokeWidth="1.0" opacity="0.5" strokeLinecap="round" />

//       {/* tiny floating bubble — top left, decorative */}
//       <rect
//         x="30"
//         y="30"
//         width="110"
//         height="50"
//         rx="16"
//         stroke="#9AB17A"
//         strokeWidth="1.1"
//         opacity="0.6"
//       />
//       <path
//         d="M48 76 Q28 90 38 106 Q46 88 60 84Z"
//         stroke="#9AB17A"
//         strokeWidth="1.1"
//         opacity="0.6"
//         strokeLinejoin="round"
//       />
//       {/* typing dots inside tiny bubble */}
//       <circle cx="62"  cy="55" r="3.5" fill="#9AB17A" opacity="0.45" />
//       <circle cx="82"  cy="55" r="3.5" fill="#9AB17A" opacity="0.45" />
//       <circle cx="102" cy="55" r="3.5" fill="#9AB17A" opacity="0.45" />

//       {/* connecting vertical thread — subtle, ties bubbles together */}
//       <line
//         x1="210" y1="170"
//         x2="210" y2="210"
//         stroke="#DEB887"
//         strokeWidth="0.8"
//         strokeDasharray="4 6"
//         opacity="0.3"
//       />
//       <line
//         x1="210" y1="296"
//         x2="210" y2="340"
//         stroke="#9AB17A"
//         strokeWidth="0.8"
//         strokeDasharray="4 6"
//         opacity="0.3"
//       />
//     </svg>
//   );
// }



import { Link } from "react-router-dom";

interface AuthBrandPanelProps {
  quote: string;
  body: string;
}

/**
 * Shared left-hand brand panel for Login & Signup.
 * Deep violet → lavender gradient, glowing softly at the corners.
 * Chat bubbles float on top as the signature illustration.
 */
export default function AuthBrandPanel({ quote, body }: AuthBrandPanelProps) {
  return (
    <div
      className="relative hidden w-1/2 flex-col justify-between overflow-hidden px-14 py-16 text-whispr-snow lg:flex"
      style={{
        background:
          "linear-gradient(155deg, #2A1F3D 0%, #6247AA 40%, #9163CB 70%, #C19EE0 100%)",
      }}
    >
      {/* soft ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 10%, rgba(222,201,233,0.35) 0, transparent 45%), radial-gradient(circle at 90% 90%, rgba(193,158,224,0.35) 0, transparent 50%)",
        }}
      />

      {/* chat bubble illustration */}
      <ChatBubbles className="pointer-events-none absolute -bottom-8 -right-10 h-[520px] w-[420px] opacity-[0.28]" />

      {/* gentle darkening at the very bottom so footer text stays legible */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-whispr-noir/50 via-transparent to-transparent"
      />

      {/* wordmark */}
      <Link to="/" className="relative z-10 flex flex-col">
        <span className="font-display text-4xl font-semibold tracking-widest2 text-white">
          WHISPR
        </span>
        <span className="mt-2 h-px w-12 bg-white/50" />
        <span className="mt-2 font-body text-[10px] uppercase tracking-[0.3em] text-whispr-petal/90">
          Speak softly. Connect deeply.
        </span>
      </Link>

      {/* quote block */}
      <div className="relative z-10 max-w-md">
        <span className="font-body text-[10px] uppercase tracking-[0.3em] text-whispr-petal/80">
          Est. 2026
        </span>
        <p className="mt-4 font-display text-[34px] italic leading-[1.25] text-white">
          {quote}
        </p>
        <p className="mt-6 font-body text-sm leading-relaxed text-whispr-petal/90">
          {body}
        </p>
      </div>

      <div className="relative z-10 font-body text-xs uppercase tracking-[0.2em] text-whispr-petal/70">
        © {new Date().getFullYear()} Whispr
      </div>
    </div>
  );
}

function ChatBubbles({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 560"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* large bubble — bottom right, sent */}
      <rect x="80" y="340" width="280" height="90" rx="24" stroke="#FFFFFF" strokeWidth="1.5" />
      <path d="M340 420 Q370 435 355 460 Q345 438 330 430Z" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="185" cy="385" r="5" fill="#FFFFFF" opacity="0.6" />
      <circle cx="210" cy="385" r="5" fill="#FFFFFF" opacity="0.6" />
      <circle cx="235" cy="385" r="5" fill="#FFFFFF" opacity="0.6" />

      {/* medium bubble — middle left, received */}
      <rect x="40" y="210" width="240" height="86" rx="22" stroke="#FFFFFF" strokeWidth="1.4" />
      <path d="M60 290 Q28 308 44 332 Q55 308 74 300Z" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="70" y1="243" x2="240" y2="243" stroke="#FFFFFF" strokeWidth="1.1" opacity="0.7" strokeLinecap="round" />
      <line x1="70" y1="263" x2="190" y2="263" stroke="#FFFFFF" strokeWidth="1.1" opacity="0.7" strokeLinecap="round" />

      {/* small bubble — upper right, sent */}
      <rect x="140" y="100" width="210" height="74" rx="20" stroke="#FFFFFF" strokeWidth="1.3" />
      <path d="M326 168 Q352 180 340 200 Q330 180 316 174Z" stroke="#FFFFFF" strokeWidth="1.3" strokeLinejoin="round" />
      <line x1="168" y1="130" x2="318" y2="130" stroke="#FFFFFF" strokeWidth="1.0" opacity="0.6" strokeLinecap="round" />
      <line x1="168" y1="150" x2="270" y2="150" stroke="#FFFFFF" strokeWidth="1.0" opacity="0.6" strokeLinecap="round" />

      {/* tiny bubble — top left, received */}
      <rect x="30" y="30" width="110" height="50" rx="16" stroke="#FFFFFF" strokeWidth="1.1" opacity="0.7" />
      <path d="M48 76 Q28 90 38 106 Q46 88 60 84Z" stroke="#FFFFFF" strokeWidth="1.1" opacity="0.7" strokeLinejoin="round" />
      <circle cx="62"  cy="55" r="3.5" fill="#FFFFFF" opacity="0.6" />
      <circle cx="82"  cy="55" r="3.5" fill="#FFFFFF" opacity="0.6" />
      <circle cx="102" cy="55" r="3.5" fill="#FFFFFF" opacity="0.6" />

      {/* dashed connecting threads */}
      <line x1="210" y1="174" x2="210" y2="210" stroke="#FFFFFF" strokeWidth="0.8" strokeDasharray="4 6" opacity="0.4" />
      <line x1="210" y1="296" x2="210" y2="340" stroke="#FFFFFF" strokeWidth="0.8" strokeDasharray="4 6" opacity="0.4" />
    </svg>
  );
}

