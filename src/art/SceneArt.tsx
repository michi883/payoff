import type { ArtKey } from "../domain/types";

type SceneArtProps = {
  artKey: ArtKey;
  label: string;
};

function Phone({ x = 118, y = 32, glow = false }: { x?: number; y?: number; glow?: boolean }) {
  return (
    <g className={glow ? "scene-phone scene-phone--glow" : "scene-phone"}>
      {glow && <rect className="scene-glow" x={x - 18} y={y - 18} width="120" height="164" rx="40" />}
      <rect className="scene-ink" x={x} y={y} width="84" height="124" rx="14" />
      <rect className="scene-screen" x={x + 6} y={y + 8} width="72" height="104" rx="9" />
      <circle className="scene-paper" cx={x + 42} cy={y + 118} r="3" />
    </g>
  );
}

function Person({ x, y, flip = false, older = false }: { x: number; y: number; flip?: boolean; older?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <circle className="scene-ink" cx="0" cy="0" r="18" />
      {older && <path className="scene-paper" d="M-16,-5 Q0,-24 16,-5 Q7,-12 0,-8 Q-8,-13 -16,-5" />}
      <path className="scene-ink" d="M-27,64 Q-24,25 0,25 Q24,25 27,64 Z" />
      <path className="scene-line" d="M7,36 L30,55" />
      <rect className="scene-accent" x="24" y="46" width="18" height="29" rx="4" />
    </g>
  );
}

function GenericArt({ artKey }: { artKey: ArtKey }) {
  if (artKey === "phone_closeup") {
    return <Phone x={118} y={27} glow />;
  }
  if (artKey === "conversation") {
    return (
      <>
        <Person x={83} y={63} />
        <Person x={237} y={63} flip />
        <path className="scene-line scene-line--dash" d="M110 48 C145 20 178 20 210 48" />
      </>
    );
  }
  if (artKey === "window_light") {
    return (
      <>
        <rect className="scene-ink" x="66" y="22" width="188" height="130" rx="5" />
        <rect className="scene-sun" x="78" y="34" width="164" height="106" />
        <path className="scene-line" d="M160 34 V140 M78 87 H242" />
        <Person x={160} y={88} />
      </>
    );
  }
  return (
    <>
      <circle className="scene-sun" cx="160" cy="86" r="62" />
      <circle className="scene-ink" cx="160" cy="86" r="42" />
      <path className="scene-paper" d="M160 53 V88 L187 104" fill="none" strokeWidth="7" strokeLinecap="round" />
    </>
  );
}

export function SceneArt({ artKey, label }: SceneArtProps) {
  return (
    <svg className={`scene-art scene-art--${artKey}`} viewBox="0 0 320 180" role="img" aria-label={label}>
      <rect className="scene-bg" width="320" height="180" rx="18" />
      <circle className="scene-orbit" cx="276" cy="28" r="54" />

      {artKey === "emoji_glow" && (
        <>
          <Phone x={54} y={30} />
          <rect className="scene-bubble" x="138" y="38" width="132" height="54" rx="22" />
          <text className="scene-emoji" x="156" y="75">😂</text>
          <text className="scene-heart" x="218" y="74">♥</text>
          <path className="scene-line scene-line--dash" d="M136 118 C180 144 229 142 271 111" />
        </>
      )}

      {artKey === "voice_wave" && (
        <>
          <Phone x={39} y={29} />
          <g transform="translate(145 57)">
            {[20, 46, 70, 42, 82, 55, 30].map((height, index) => (
              <rect
                className={index === 4 ? "scene-accent" : "scene-ink"}
                key={height + index}
                x={index * 18}
                y={(84 - height) / 2}
                width="8"
                height={height}
                rx="4"
              />
            ))}
          </g>
          <path className="scene-line" d="M151 143 H277" />
        </>
      )}

      {artKey === "auto_reply" && (
        <>
          <Person x={72} y={70} />
          <Phone x={172} y={27} glow />
          <rect className="scene-bubble" x="194" y="54" width="52" height="8" rx="4" />
          <rect className="scene-bubble" x="194" y="70" width="38" height="8" rx="4" />
          <rect className="scene-accent" x="194" y="91" width="51" height="15" rx="7" />
          <path className="scene-line scene-line--dash" d="M116 54 C144 44 153 43 175 52" />
        </>
      )}

      {artKey === "message_streak" && (
        <>
          {[0, 1, 2, 3, 4].map((index) => (
            <g key={index} transform={`translate(${35 + index * 52} ${48 + Math.abs(2 - index) * 10})`}>
              <rect className="scene-screen" width="42" height="62" rx="9" />
              <circle className={index === 4 ? "scene-accent" : "scene-ink"} cx="21" cy="23" r="9" />
              <path className="scene-line" d="M10 43 H32" />
            </g>
          ))}
          <path className="scene-line scene-line--dash" d="M56 138 C110 112 208 160 264 126" />
          <text className="scene-number" x="139" y="103">30</text>
        </>
      )}

      {artKey === "empty_chair" && (
        <>
          <path className="scene-ink" d="M77 70 H151 V119 H66 V81 Q66 70 77 70 Z" />
          <path className="scene-line" d="M75 119 L64 153 M143 119 L155 153" />
          <rect className="scene-bubble" x="178" y="39" width="99" height="48" rx="20" />
          <path className="scene-line" d="M193 62 H263" />
          <circle className="scene-accent" cx="228" cy="116" r="11" />
          <path className="scene-line" d="M228 108 V124" />
        </>
      )}

      {artKey === "funeral_phone" && (
        <>
          <circle className="scene-muted" cx="61" cy="88" r="29" />
          <circle className="scene-muted" cx="255" cy="88" r="29" />
          <circle className="scene-muted" cx="108" cy="74" r="35" />
          <circle className="scene-muted" cx="210" cy="74" r="35" />
          <Phone x={118} y={27} glow />
          <rect className="scene-accent" x="138" y="64" width="44" height="10" rx="5" />
          <path className="scene-line" d="M137 88 H183 M144 100 H176" />
        </>
      )}

      {artKey === "mother_autoreply" && (
        <>
          <Person x={93} y={68} older />
          <rect className="scene-bubble" x="157" y="35" width="126" height="59" rx="24" />
          <path className="scene-line" d="M177 56 H257 M177 72 H230" />
          <circle className="scene-accent" cx="254" cy="124" r="17" />
          <path className="scene-paper" d="M247 124 L252 129 L262 118" fill="none" strokeWidth="4" strokeLinecap="round" />
        </>
      )}

      {artKey === "two_rooms" && (
        <>
          <path className="scene-line" d="M160 19 V161" />
          <Person x={84} y={70} />
          <Person x={236} y={70} flip older />
          <path className="scene-accent-line" d="M113 48 C141 24 178 24 207 48" />
          <path className="scene-accent-line" d="M207 56 C177 80 143 80 113 56" />
          <path className="scene-arrow" d="M202 42 L210 48 L202 53 M119 50 L110 56 L118 62" />
        </>
      )}

      {![
        "emoji_glow",
        "voice_wave",
        "auto_reply",
        "message_streak",
        "empty_chair",
        "funeral_phone",
        "mother_autoreply",
        "two_rooms",
      ].includes(artKey) && <GenericArt artKey={artKey} />}
    </svg>
  );
}
