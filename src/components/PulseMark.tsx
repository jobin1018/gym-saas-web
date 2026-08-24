export function PulseMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 24" className={className} fill="none">
      <path
        d="M0 12h14l4-9 6 18 5-13 4 9h6l4-9 5 13 6-18 4 9h6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
