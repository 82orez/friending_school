import "server-only";
import { Resend } from "resend";

// 관리자 알림 메일 발송 (Resend).
// 환경 변수:
// - RESEND_API_KEY (필수) — 미설정 시 발송 생략(에러 없이 no-op, 신청 저장은 영향 없음)
// - APPLICATION_NOTIFY_FROM (선택) — 발신 주소. Resend에서 인증된 도메인이어야 함.
//   미설정 시 테스트용 onboarding@resend.dev(계정 소유자 본인에게만 전송 가능).

const FROM = process.env.APPLICATION_NOTIFY_FROM ?? "프렌딩 스쿨 <onboarding@resend.dev>";

export type ApplicationEmailData = {
  courseTitle: string;
  option: string;
  name: string;
  phone: string;
  email: string;
  memo: string;
  loggedIn: boolean;
  createdAt: string;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function buildHtml(d: ApplicationEmailData): string {
  const rows: [string, string][] = [
    ["과정", d.courseTitle],
    ["수업 옵션", d.option || "-"],
    ["이름", d.name],
    ["전화번호", d.phone],
    ["이메일", d.email || "(미입력)"],
    ["희망 날짜/시간", d.memo || "-"],
    ["신청 경로", d.loggedIn ? "로그인 회원" : "비로그인(익명)"],
    ["신청 일시", new Date(d.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })],
  ];
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#666;background:#f8f8f8;white-space:nowrap;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(
          k,
        )}</td><td style="padding:8px 12px;color:#1a1a1a;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">새 상담 신청이 접수되었습니다</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(d.courseTitle)} · ${escapeHtml(d.name)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:12px;color:#999;margin:16px 0 0">프렌딩 스쿨 관리자 알림 · 관리자 페이지에서 처리 상태를 변경할 수 있습니다.</p>
  </div>`;
}

function buildText(d: ApplicationEmailData): string {
  return [
    "새 상담 신청이 접수되었습니다.",
    "",
    `과정: ${d.courseTitle}`,
    `수업 옵션: ${d.option || "-"}`,
    `이름: ${d.name}`,
    `전화번호: ${d.phone}`,
    `이메일: ${d.email || "(미입력)"}`,
    `희망 날짜/시간: ${d.memo || "-"}`,
    `신청 경로: ${d.loggedIn ? "로그인 회원" : "비로그인(익명)"}`,
    `신청 일시: ${new Date(d.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  ].join("\n");
}

/**
 * 관리자들에게 신규 신청 알림 메일 발송. best-effort — 호출 측에서 try/catch로 감싸 신청 저장과 분리할 것.
 * 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않고 로그만 남긴다.
 */
export async function sendApplicationNotification(to: string[], data: ApplicationEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY 미설정 — 관리자 알림 메일 생략");
    return;
  }
  if (to.length === 0) {
    console.warn("[mailer] 관리자(admin) 수신자가 없어 메일 생략");
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      replyTo: data.email || undefined,
      subject: `[신규 상담신청] ${data.courseTitle} · ${data.name}`,
      html: buildHtml(data),
      text: buildText(data),
    });
    if (error) console.error("[mailer] Resend 발송 실패:", error);
  } catch (err) {
    console.error("[mailer] 메일 발송 예외:", err);
  }
}
