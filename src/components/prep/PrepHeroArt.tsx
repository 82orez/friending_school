// 프렙 새벽 일러스트 — 새벽 하늘 + 떠오르는 해 + (히어로에서는) Zoom 타일과 6:00 시계.
//
// ⚠️ 파일 자산(.svg)이 아니라 **인라인 SVG**인 이유: next/image로 SVG를 서빙하려면
//    next.config.ts에 images.dangerouslyAllowSVG를 켜야 한다. 장식용 그림 하나 때문에
//    그 스위치를 켜지 않는다(/friending 히어로가 인라인 장식 SVG를 쓰는 선례).
// 색은 globals.css 토큰 값과 같은 hex를 쓴다(SVG gradient는 CSS 변수 대신 리터럴이 안전).
//
// variant:
//  - "hero"   : /prep 히어로용(높이 380~440px). 타일·시계까지 다 그린다.
//  - "banner" : /friending 신청 배너용(높이 절반 이하). ⚠️ 타일·시계는 slice로 잘려 지저분해지므로
//               하늘·해·능선·말풍선만 남기고 viewBox도 납작하게 쓴다.
export default function PrepHeroArt({ className, variant = "hero" }: { className?: string; variant?: "hero" | "banner" }) {
  const banner = variant === "banner";
  const height = banner ? 260 : 420;
  // 납작한 배너에서는 지평선·해를 위로 끌어올려야 잘리지 않는다.
  const horizon = banner ? 196 : 352;
  const sunY = banner ? 190 : 330;

  return (
    <svg viewBox={`0 0 1200 ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" className={className}>
      <defs>
        {/* 새벽 하늘: 브랜드 그라디언트(블루→핑크)를 밤에서 아침으로 넘어가는 색으로 쓴다. */}
        <linearGradient id={`prep-sky-${variant}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1b2450" />
          <stop offset="45%" stopColor="#4a5bb0" />
          <stop offset="78%" stopColor="#6b8ff0" />
          <stop offset="100%" stopColor="#f06b9d" />
        </linearGradient>
        <linearGradient id={`prep-sun-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd6a5" />
          <stop offset="100%" stopColor="#f06b9d" />
        </linearGradient>
        <radialGradient id={`prep-glow-${variant}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffd6a5" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffd6a5" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1200" height={height} fill={`url(#prep-sky-${variant})`} />

      {/* 별 — 아직 남아 있는 새벽의 흔적 */}
      <g fill="#ffffff">
        <circle cx="120" cy="46" r="2" opacity="0.8" />
        <circle cx="260" cy="30" r="1.5" opacity="0.55" />
        <circle cx="410" cy="70" r="1.8" opacity="0.45" />
        <circle cx="620" cy="38" r="1.4" opacity="0.5" />
        <circle cx="905" cy="56" r="2" opacity="0.35" />
        <circle cx="1075" cy="28" r="1.6" opacity="0.5" />
      </g>

      {/* 떠오르는 해 */}
      <circle cx="980" cy={sunY} r={banner ? 150 : 190} fill={`url(#prep-glow-${variant})`} />
      <circle cx="980" cy={sunY} r={banner ? 62 : 86} fill={`url(#prep-sun-${variant})`} />

      {/* 지평선 능선 */}
      <path
        d={`M0 ${horizon} C 150 ${horizon - 30}, 260 ${horizon + 20}, 420 ${horizon - 4} C 560 ${horizon - 24}, 690 ${horizon + 20}, 840 ${horizon - 2} C 980 ${horizon - 22}, 1080 ${horizon + 14}, 1200 ${horizon - 8} L1200 ${height} L0 ${height} Z`}
        fill="#1a1a1a"
        opacity="0.55"
      />
      <path
        d={`M0 ${horizon + 34} C 180 ${horizon + 14}, 320 ${horizon + 52}, 500 ${horizon + 34} C 700 ${horizon + 14}, 860 ${horizon + 50}, 1040 ${horizon + 32} C 1120 ${horizon + 24}, 1170 ${horizon + 34}, 1200 ${horizon + 30} L1200 ${height} L0 ${height} Z`}
        fill="#1a1a1a"
        opacity="0.8"
      />

      {/* Zoom 타일 4개 — 함께 모여 말하는 화면(히어로 전용: 배너 높이에서는 잘린다) */}
      {!banner && (
        <g opacity="0.95">
          {[
            { x: 96, y: 128 },
            { x: 268, y: 128 },
            { x: 96, y: 244 },
            { x: 268, y: 244 },
          ].map((t, i) => (
            <g key={i} transform={`translate(${t.x} ${t.y})`}>
              <rect width="150" height="96" rx="12" fill="#ffffff" opacity={i === 0 ? 0.98 : 0.86} />
              <circle cx="42" cy="48" r="19" fill="#6b8ff0" opacity="0.9" />
              <path d="M23 78 a19 19 0 0 1 38 0 z" fill="#6b8ff0" opacity="0.9" />
              <rect x="76" y="34" width="54" height="8" rx="4" fill="#1a1a1a" opacity="0.22" />
              <rect x="76" y="50" width="40" height="8" rx="4" fill="#1a1a1a" opacity="0.14" />
            </g>
          ))}
          {/* 말하고 있는 사람 표시(첫 타일 테두리 강조) */}
          <rect x="94" y="126" width="154" height="100" rx="14" fill="none" stroke="#f06b9d" strokeWidth="3" />
        </g>
      )}

      {/* 말풍선 — 배너에서는 위로 올려 능선 위에 뜨게 한다. */}
      <g transform={banner ? "translate(0 -70) scale(1)" : undefined}>
        <rect x="474" y="150" width="176" height="60" rx="18" fill="#ffffff" opacity="0.95" />
        <path d="M500 210 l0 22 l24 -22 z" fill="#ffffff" opacity="0.95" />
        <rect x="496" y="170" width="118" height="8" rx="4" fill="#1a1a1a" opacity="0.2" />
        <rect x="496" y="186" width="80" height="8" rx="4" fill="#1a1a1a" opacity="0.12" />

        <rect x="560" y="242" width="140" height="54" rx="16" fill="#f06b9d" opacity="0.92" />
        <path d="M672 296 l0 20 l-24 -20 z" fill="#f06b9d" opacity="0.92" />
        <rect x="582" y="260" width="90" height="8" rx="4" fill="#ffffff" opacity="0.75" />
        <rect x="582" y="276" width="60" height="8" rx="4" fill="#ffffff" opacity="0.5" />
      </g>

      {/* 6:00 시계 — 히어로 전용 */}
      {!banner && (
        <g transform="translate(792 120)">
          <circle r="52" fill="#ffffff" opacity="0.95" />
          <circle r="52" fill="none" stroke="#1a1a1a" strokeWidth="3" opacity="0.15" />
          {/* 시침: 6시(아래), 분침: 12시(위) */}
          <line x1="0" y1="0" x2="0" y2="30" stroke="#1a1a1a" strokeWidth="6" strokeLinecap="round" />
          <line x1="0" y1="0" x2="0" y2="-36" stroke="#f06b9d" strokeWidth="5" strokeLinecap="round" />
          <circle r="4.5" fill="#1a1a1a" />
        </g>
      )}
    </svg>
  );
}
