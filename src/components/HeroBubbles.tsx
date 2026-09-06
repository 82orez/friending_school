/**
 * 목업 `.hero-deco` — 사진 히어로 위에 얹는 말풍선 장식.
 *
 * 프렌딩 홈 히어로와 샤우팅 배너 히어로가 **같은 모양**을 쓰므로(v14 목업의 형제 히어로) 한 곳에 둔다.
 * ⚠️ `preserveAspectRatio="none"` — 비율을 무시하고 늘려 배경처럼 깐다(목업과 동일).
 * ⚠️ 목업이 모바일에서 `.hero-deco { display:none }`이므로 호출부가 `hidden md:block`을 준다.
 */
export default function HeroBubbles({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1200 300" preserveAspectRatio="none" className={className}>
      <rect x="60" y="40" width="130" height="80" rx="24" fill="rgba(255,255,255,0.16)" />
      <path d="M90 118 L78 142 L112 120 Z" fill="rgba(255,255,255,0.16)" />
      <rect x="1000" y="170" width="110" height="70" rx="22" fill="rgba(255,255,255,0.14)" />
      <path d="M1030 238 L1042 260 L1072 240 Z" fill="rgba(255,255,255,0.14)" />
      <rect x="960" y="30" width="80" height="52" rx="18" fill="rgba(255,255,255,0.1)" />
      <path d="M980 80 L972 98 L998 82 Z" fill="rgba(255,255,255,0.1)" />
      <rect x="40" y="200" width="70" height="46" rx="16" fill="rgba(255,255,255,0.1)" />
      <path d="M58 244 L50 262 L76 246 Z" fill="rgba(255,255,255,0.1)" />
    </svg>
  );
}
