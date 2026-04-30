import { useEffect, useMemo, useRef, useState } from "react";
import { Drum, Guitar, Mic, Music, Piano } from "lucide-react";
import { ShareMixPanel } from "./ShareMixPanel.jsx";

const trackBtnBase =
  "flex min-h-[48px] min-w-0 items-center justify-center rounded-2xl border px-3 py-3 text-center text-sm font-semibold leading-tight transition-[transform,box-shadow,background-color,border-color,color] duration-200 active:scale-[0.97] sm:min-h-[52px] sm:text-[0.9375rem]";

const trackOn =
  "border-2 border-brand bg-gradient-to-br from-neutral-950/90 via-zinc-900/85 to-brand/18 text-white shadow-neon-brand [text-shadow:0_0_8px_rgba(240,90,90,0.4)]";

const trackOff =
  "border-white/[0.12] bg-white/[0.06] text-ym-muted shadow-none backdrop-blur-md";

/** 조절 모드 볼륨 바: 뮤트 시 빨강 대신 차분한 회색 + 은은한 스트라이프(비활성 느낌) */
function volumeAdjustBarBackground(vol, isMuted) {
  const p = Math.round(Math.min(1, Math.max(0, vol)) * 100);
  if (isMuted) {
    return [
      `repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 3px, transparent 3px, transparent 7px)`,
      `linear-gradient(90deg, rgba(72, 74, 82, 0.88) 0%, rgba(58, 60, 68, 0.78) ${p}%, rgba(28, 29, 34, 0.62) ${p}%, rgba(16, 17, 20, 0.45) 100%)`,
    ].join(", ");
  }
  return `linear-gradient(90deg, rgba(230, 45, 45, 0.86) 0%, rgba(230, 45, 45, 0.72) ${p}%, transparent ${p}%)`;
}

function TrackIcon({ track }) {
  const id = track?.id ?? "";
  const label = track?.label ?? "";

  const isVocal1 = id === "vocal1";
  const isVocal2 = id === "vocal2";
  const isVocal = id.startsWith("vocal") || label.includes("보컬");
  const isGuitar = id === "guitar" || label.includes("기타");
  const isBass = id === "bass" || label.includes("베이스");
  const isDrum = id === "drum" || label.includes("드럼");
  const isPiano = id === "piano" || label.includes("피아노");
  const isString = id === "string" || label.includes("스트링");

  let Icon = Music;
  if (isVocal) Icon = Mic;
  else if (isDrum) Icon = Drum;
  else if (isPiano) Icon = Piano;
  else if (isGuitar || isBass) Icon = Guitar;

  const showBadge = isVocal1 || isVocal2;
  const badge = isVocal1 ? "1" : isVocal2 ? "2" : null;

  return (
    <span className="relative inline-flex items-center justify-center">
      <Icon size={20} color="currentColor" />

      {/* 베이스/스트링은 아이콘에 작은 텍스트 라벨로 구분 */}
      {isBass ? (
        <span className="absolute -right-[0.05rem] -bottom-[0.45rem] rounded-[0.35rem] bg-white/10 px-1 py-[0.05rem] text-[0.52rem] font-bold leading-none text-white/90">
          bass
        </span>
      ) : isString ? (
        <span className="absolute -right-[0.05rem] -bottom-[0.45rem] rounded-[0.35rem] bg-white/10 px-[0.2rem] py-[0.05rem] text-[0.44rem] font-bold leading-none text-white/90">
          STR
        </span>
      ) : null}

      {showBadge ? (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-[0.35rem] bg-white/10 px-1 text-[0.55rem] font-bold leading-none text-white/85">
          {badge}
        </span>
      ) : null}
    </span>
  );
}

export function Mixer({
  tracks = [],
  mutedTracks = {},
  trackVolumes = {},
  onToggleTrack,
  setTrackVolume,
  onResetMix,
  shareAdjustTrackIds = [],
  shareAdjustSyncKey = "",
  shareDisabled = false,
  songTitle = "",
}) {
  const [activeAdjustIds, setActiveAdjustIds] = useState(() => new Set());

  useEffect(() => {
    setActiveAdjustIds(new Set(shareAdjustTrackIds));
  }, [shareAdjustSyncKey]);
  const pressTimerRef = useRef(0);
  const draggingRef = useRef(false);
  const dragTrackIdRef = useRef(null);
  const startXRef = useRef(0);
  const startVolumeRef = useRef(0.8);

  const activeAdjustLookup = useMemo(() => {
    const m = new Map();
    activeAdjustIds.forEach((id) => m.set(id, true));
    return m;
  }, [activeAdjustIds]);

  const toggleAdjust = (trackId) => {
    setActiveAdjustIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = 0;
    }
  };

  const handlePointerDown = (e, trackId) => {
    // 모바일 스크롤 방지용 포인터 캡처
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }

    draggingRef.current = false;
    dragTrackIdRef.current = trackId;
    startXRef.current = e.clientX;
    startVolumeRef.current = Number(trackVolumes?.[trackId] ?? 0.8);

    clearPressTimer();
    pressTimerRef.current = window.setTimeout(() => {
      toggleAdjust(trackId);
      // 롱프레스가 발생했으면 이후 click으로 mute 토글이 튀지 않게
      draggingRef.current = true;
    }, 380);
  };

  const handlePointerMove = (e) => {
    const trackId = dragTrackIdRef.current;
    if (!trackId) return;

    // 손가락이 움직이면 롱프레스 대기 취소
    const dx = e.clientX - startXRef.current;
    if (Math.abs(dx) > 10) {
      clearPressTimer();
    }

    // 활성화된 트랙에서만 드래그 볼륨 조절
    if (!activeAdjustLookup.get(trackId)) return;
    if (Math.abs(dx) < 6) return;

    draggingRef.current = true;

    // 버튼 폭을 기준으로 0~1 매핑
    const el = e.currentTarget;
    const w = el?.getBoundingClientRect?.().width ?? 160;
    const delta = dx / Math.max(60, w);
    const next = Math.min(1, Math.max(0, startVolumeRef.current + delta));
    setTrackVolume?.(trackId, next);
  };

  const handlePointerUp = () => {
    clearPressTimer();
    const wasAdjusting = activeAdjustLookup.get(dragTrackIdRef.current) === true;
    dragTrackIdRef.current = null;
    // 볼륨 조절 모드가 아니었으면 즉시 초기화
    // iOS는 롱프레스 후 click이 안 발생해 draggingRef가 true인 채로 남는 버그 방지
    if (!wasAdjusting) {
      draggingRef.current = false;
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 shadow-glass ring-1 ring-white/[0.06] backdrop-blur-2xl sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-center font-display text-[0.65rem] font-bold uppercase tracking-[0.22em] text-ym-muted">
          Mixer
        </h2>
        <button
          type="button"
          onClick={() => onResetMix?.()}
          className="rounded-full border border-white/[0.14] bg-white/[0.04] px-3 py-1.5 text-[0.7rem] font-semibold text-white/80 backdrop-blur-md transition hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5">
        {tracks.map((track) => {
          const isMuted = mutedTracks[track.id] === true;
          const isOn = !isMuted;
          const isAdjustActive = activeAdjustLookup.get(track.id) === true;
          const vol = Number(trackVolumes?.[track.id] ?? 0.8);
          return (
            <button
              key={track.id}
              type="button"
              aria-pressed={isOn}
              onClick={(e) => {
                // 롱프레스/드래그 직후 click으로 mute 토글 방지
                if (draggingRef.current) {
                  draggingRef.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                onToggleTrack(track.id);
              }}
              onPointerDown={(e) => handlePointerDown(e, track.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`${trackBtnBase} ${isOn ? trackOn : trackOff} relative overflow-hidden ${
                isAdjustActive
                  ? "ring-2 ring-brand shadow-[0_0_28px_rgba(230,45,45,0.35)]"
                  : ""
              } touch-none select-none`}
              aria-label={`${track.label} 트랙`}
            >
              {/* 볼륨 바(활성화된 트랙만 표시) */}
              {isAdjustActive ? (
                <span
                  className="absolute inset-0 opacity-90 transition-opacity duration-200"
                  aria-hidden
                  style={{
                    background: volumeAdjustBarBackground(vol, isMuted),
                  }}
                />
              ) : null}
              <span className="relative z-[1]">
                <TrackIcon track={track} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 w-full border-t border-white/[0.1] pt-4">
        <ShareMixPanel disabled={shareDisabled} songTitle={songTitle} />
      </div>
    </section>
  );
}
