/**
 * URL `?mix=` 공유: 곡 id + 트랙별 뮤트·볼륨 (기본값은 생략해 길이 절약)
 */

const DEFAULT_VOL = 0.8;
const DEFAULT_VOL_KEY = Math.round(DEFAULT_VOL * 100);

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(str) {
  return utf8ToBase64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s) {
  if (!s || typeof s !== "string") return null;
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    return base64ToUtf8(b64);
  } catch {
    return null;
  }
}

/**
 * @param {string} songId
 * @param {Record<string, boolean | undefined>} mutedTracks
 * @param {Record<string, number | undefined>} trackVolumes
 * @param {string[]} trackIds 곡에 정의된 트랙 id 순서
 */
export function encodeMixState(songId, mutedTracks, trackVolumes, trackIds) {
  /** @type {Record<string, [0|1, number]>} */
  const t = {};
  for (const id of trackIds) {
    const m = mutedTracks[id] === true ? 1 : 0;
    const v = Math.round((Number(trackVolumes[id] ?? DEFAULT_VOL) || 0) * 100);
    const clampedV = Math.min(100, Math.max(0, v));
    if (m === 0 && clampedV === DEFAULT_VOL_KEY) continue;
    t[id] = [m, clampedV];
  }
  const payload = { s: songId, t };
  return base64UrlEncode(JSON.stringify(payload));
}

/**
 * @param {string} encoded
 * @param {Array<{ id: string, tracks: Array<{ id: string }> }>} songs
 * @returns {{ songId: string, muted: Record<string, boolean>, volumes: Record<string, number>, adjustTrackIds: string[] } | null}
 */
export function decodeMixState(encoded, songs) {
  if (!encoded || typeof encoded !== "string") return null;
  const json = base64UrlDecode(encoded.trim());
  if (!json) return null;
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!payload || typeof payload.s !== "string" || typeof payload.t !== "object") {
    return null;
  }
  const song = songs.find((s) => s.id === payload.s);
  if (!song?.tracks?.length) return null;

  const adjustTrackIds = Object.keys(payload.t || {}).filter((id) =>
    song.tracks.some((tr) => tr.id === id)
  );

  const muted = {};
  const volumes = {};
  for (const tr of song.tracks) {
    const id = tr.id;
    const entry = payload.t[id];
    if (Array.isArray(entry) && entry.length >= 2) {
      muted[id] = entry[0] === 1;
      const v = Number(entry[1]);
      volumes[id] = Math.min(1, Math.max(0, (Number.isFinite(v) ? v : DEFAULT_VOL_KEY) / 100));
    } else {
      muted[id] = false;
      volumes[id] = DEFAULT_VOL;
    }
  }
  return { songId: song.id, muted, volumes, adjustTrackIds };
}

/**
 * @param {string} search 전체 "?foo=bar" 또는 "foo=bar"
 * @param {Array<{ id: string, tracks: unknown[] }>} songs
 */
export function decodeMixFromSearch(search, songs) {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  const mix = params.get("mix");
  if (!mix) return null;
  return decodeMixState(mix, songs);
}

export function getSongIndexById(songs, songId) {
  const i = songs.findIndex((s) => s.id === songId);
  return i >= 0 ? i : 0;
}

/**
 * 최초 진입 시 `?mix=` 로 곡·믹스 복원
 * @returns {{ songIndex: number, preset: { songId: string, muted: Record<string, boolean>, volumes: Record<string, number>, adjustTrackIds: string[] } | null }}
 */
export function getInitialMixRouteState(songs) {
  if (typeof window === "undefined") {
    return { songIndex: 0, preset: null };
  }
  const preset = decodeMixFromSearch(window.location.search, songs);
  if (!preset) {
    return { songIndex: 0, preset: null };
  }
  return {
    songIndex: getSongIndexById(songs, preset.songId),
    preset,
  };
}
