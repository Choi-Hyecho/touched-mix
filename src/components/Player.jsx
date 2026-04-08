import { forwardRef } from "react";

export const Player = forwardRef(function Player(
  {
    videoUrl,
    posterUrl,
    title,
    className = "",
    sessionStarted = false,
    overlay = null,
    onInteract = null,
  },
  ref
) {
  return (
    <div className={`w-full ${className}`}>
      <div
        className="relative aspect-[1/1] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] shadow-glass ring-1 ring-inset ring-white/[0.08] backdrop-blur-xl sm:rounded-3xl"
        onPointerDown={onInteract ? () => onInteract() : undefined}
      >
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.06] via-transparent to-black/30 sm:rounded-3xl" />
        <video
          ref={ref}
          className="relative z-[1] h-full w-full object-cover"
          src={videoUrl}
          poster={posterUrl}
          playsInline
          muted
          controls={sessionStarted}
          controlsList="nofullscreen nodownload noremoteplayback"
          disablePictureInPicture
          preload="metadata"
        />
        {overlay ? (
          <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center p-4 sm:p-6">
            <div className="pointer-events-auto w-full max-w-[min(100%,20rem)]">
              {overlay}
            </div>
          </div>
        ) : null}
      </div>
      {title ? (
        <p className="mt-3 text-center text-sm font-semibold tracking-tight text-white/90">
          {title}
        </p>
      ) : null}
    </div>
  );
});
