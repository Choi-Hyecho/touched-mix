const variants = {
  primary:
    "border-2 border-brand bg-gradient-to-br from-neutral-950 via-zinc-950 to-brand/18 text-white shadow-[0_8px_28px_rgba(0,0,0,0.45)] hover:from-neutral-900 hover:to-brand/22 active:brightness-95",
  glass:
    "border border-white/12 bg-white/[0.08] text-white shadow-glass backdrop-blur-xl hover:bg-white/[0.12]",
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}) {
  return (
    <button
      type="button"
      className={`min-h-[48px] w-full rounded-2xl px-5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[52px] sm:text-base ${variants[variant] ?? variants.primary} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
