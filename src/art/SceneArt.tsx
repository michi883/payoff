import type { ArtKey } from "../domain/types";

type SceneArtProps = {
  artKey: ArtKey;
  label: string;
};

function Phone({ x, y, faceDown = false }: { x: number; y: number; faceDown?: boolean }) {
  if (faceDown) {
    return <rect className="scene-ink" x={x} y={y} width="58" height="11" rx="5" />;
  }
  return (
    <g>
      <rect className="scene-ink" x={x} y={y} width="35" height="57" rx="7" />
      <rect className="scene-screen" x={x + 4} y={y + 5} width="27" height="43" rx="4" />
    </g>
  );
}

function Dad({ x, y, lookingDown = true }: { x: number; y: number; lookingDown?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className="scene-ink" cx="0" cy="0" r="20" />
      <path className="scene-paper" d={lookingDown ? "M-9 3 Q0 10 9 3" : "M-9 -1 Q0 5 9 -1"} fill="none" strokeWidth="2" />
      <path className="scene-ink" d="M-34 85 Q-31 31 0 28 Q31 31 34 85 Z" />
      {lookingDown && (
        <>
          <path className="scene-line" d="M-18 46 L13 62" />
          <Phone x={7} y={45} />
        </>
      )}
    </g>
  );
}

function Girl({ x, y, walking = false }: { x: number; y: number; walking?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className="scene-ink" cx="0" cy="0" r="15" />
      <circle className="scene-ink" cx="-15" cy="-3" r="7" />
      <path className="scene-accent" d="M-22 70 Q-19 25 0 24 Q19 25 22 70 Z" />
      <path className="scene-line" d={walking ? "M-8 68 L-22 91 M8 68 L23 88" : "M-8 68 L-12 91 M8 68 L12 91"} />
    </g>
  );
}

function Drawing({ x, y, width = 72, height = 58, motif = "sun" }: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  motif?: "sun" | "heart" | "house";
}) {
  return (
    <g>
      <rect className="scene-paper scene-paper--outline" x={x} y={y} width={width} height={height} rx="3" />
      {motif === "sun" && (
        <>
          <circle className="scene-sun" cx={x + width * 0.72} cy={y + height * 0.28} r={height * 0.12} />
          <path className="scene-accent-line" d={`M${x + 9} ${y + height - 10} L${x + width * 0.42} ${y + height * 0.54} L${x + width - 8} ${y + height - 10}`} />
        </>
      )}
      {motif === "heart" && <path className="scene-accent" d={`M${x + width / 2} ${y + height * 0.72} C${x + width * 0.12} ${y + height * 0.44},${x + width * 0.28} ${y + height * 0.18},${x + width / 2} ${y + height * 0.36} C${x + width * 0.72} ${y + height * 0.18},${x + width * 0.88} ${y + height * 0.44},${x + width / 2} ${y + height * 0.72} Z`} />}
      {motif === "house" && (
        <>
          <path className="scene-accent" d={`M${x + 13} ${y + height * 0.48} L${x + width / 2} ${y + 9} L${x + width - 13} ${y + height * 0.48} Z`} />
          <rect className="scene-sun" x={x + 19} y={y + height * 0.46} width={width - 38} height={height * 0.36} />
        </>
      )}
    </g>
  );
}

function Fridge() {
  return (
    <g>
      <rect className="scene-screen scene-outline" x="43" y="17" width="168" height="148" rx="12" />
      <path className="scene-line" d="M43 84 H211" />
      <path className="scene-line" d="M193 41 V67" />
      <path className="scene-line" d="M193 100 V128" />
    </g>
  );
}

function GenericArt({ artKey }: { artKey: ArtKey }) {
  if (artKey === "phone_closeup") return <Phone x={142} y={55} />;
  if (artKey === "conversation") {
    return <><Dad x={95} y={62} lookingDown={false} /><Girl x={226} y={76} /><path className="scene-line scene-line--dash" d="M120 51 C153 25 184 25 210 51" /></>;
  }
  if (artKey === "window_light") {
    return <><rect className="scene-ink" x="66" y="22" width="188" height="130" rx="5" /><rect className="scene-sun" x="78" y="34" width="164" height="106" /><path className="scene-line" d="M160 34 V140 M78 87 H242" /></>;
  }
  return <><circle className="scene-sun" cx="160" cy="86" r="62" /><circle className="scene-ink" cx="160" cy="86" r="42" /><path className="scene-paper" d="M160 53 V88 L187 104" fill="none" strokeWidth="7" strokeLinecap="round" /></>;
}

export function SceneArt({ artKey, label }: SceneArtProps) {
  const storyArt = ["drawing_offer", "drawing_again", "fridge_gallery", "quiet_fridge", "phone_dad_drawing", "crayon_together"];

  return (
    <svg className={`scene-art scene-art--${artKey}`} viewBox="0 0 320 180" role="img" aria-label={label}>
      <rect className="scene-bg" width="320" height="180" rx="18" />
      <circle className="scene-orbit" cx="276" cy="28" r="54" />

      {artKey === "drawing_offer" && <><Girl x={73} y={69} /><Drawing x={102} y={52} motif="sun" /><Dad x={247} y={57} /></>}
      {artKey === "drawing_again" && <><circle className="scene-sun" cx="42" cy="35" r="16" /><Girl x={76} y={70} /><Drawing x={105} y={50} motif="heart" /><Dad x={247} y={57} /></>}
      {artKey === "fridge_gallery" && (
        <><Fridge /><Drawing x={57} y={29} width={48} height={38} motif="sun" /><Drawing x={119} y={34} width={55} height={39} motif="heart" /><Drawing x={67} y={96} width={57} height={45} motif="house" /><Drawing x={138} y={96} width={50} height={43} motif="sun" /><Dad x={267} y={72} /></>
      )}
      {artKey === "quiet_fridge" && <><Fridge /><Drawing x={92} y={55} width={70} height={55} motif="house" /><Girl x={263} y={74} walking /><path className="scene-line scene-line--dash" d="M228 124 C248 134 271 139 295 135" /></>}
      {artKey === "phone_dad_drawing" && (
        <>
          <rect className="scene-paper scene-paper--outline" x="30" y="18" width="206" height="144" rx="5" />
          <Girl x={84} y={71} />
          <Phone x={145} y={50} />
          <text className="scene-dad-label" x="131" y="134">DAD</text>
          <path className="scene-accent-line" d="M116 123 C132 108 153 108 172 123" />
          <Dad x={275} y={75} lookingDown={false} />
        </>
      )}
      {artKey === "crayon_together" && (
        <>
          <Phone x={29} y={142} faceDown />
          <Dad x={112} y={65} lookingDown={false} />
          <Girl x={228} y={77} />
          <rect className="scene-paper scene-paper--outline" x="102" y="128" width="130" height="36" rx="3" />
          <path className="scene-accent-line" d="M171 137 L207 151" />
          <path className="scene-line" d="M137 114 L172 138 M214 115 L205 145" />
        </>
      )}
      {!storyArt.includes(artKey) && <GenericArt artKey={artKey} />}
    </svg>
  );
}
