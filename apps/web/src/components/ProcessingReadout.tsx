export function ProcessingReadout({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs tracking-wide text-signal">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
      </span>
      <span>{label}</span>
      <span className="animate-caret">_</span>
    </div>
  );
}
