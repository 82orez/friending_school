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

export type TeacherApplicationEmailData = {
  name: string;
  phone: string;
  bio: string;
  experience: string;
  zoomUrl: string;
  email: string;
  createdAt: string;
};

function buildTeacherHtml(d: TeacherApplicationEmailData): string {
  const rows: [string, string][] = [
    ["이름", d.name],
    ["전화번호", d.phone || "-"],
    ["자기소개(Bio)", d.bio || "-"],
    ["경력", d.experience || "-"],
    ["Zoom URL", d.zoomUrl || "-"],
    ["이메일", d.email || "(미입력)"],
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
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">새 강사 지원이 접수되었습니다</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(d.name)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:12px;color:#999;margin:16px 0 0">프렌딩 스쿨 관리자 알림 · 관리자 페이지(강사 관리)에서 승인/거절할 수 있습니다.</p>
  </div>`;
}

function buildTeacherText(d: TeacherApplicationEmailData): string {
  return [
    "새 강사 지원이 접수되었습니다.",
    "",
    `이름: ${d.name}`,
    `전화번호: ${d.phone || "-"}`,
    `자기소개(Bio): ${d.bio || "-"}`,
    `경력: ${d.experience || "-"}`,
    `Zoom URL: ${d.zoomUrl || "-"}`,
    `이메일: ${d.email || "(미입력)"}`,
    `신청 일시: ${new Date(d.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  ].join("\n");
}

/**
 * 관리자들에게 신규 강사 지원 알림 메일 발송. best-effort — 호출 측에서 try/catch로 감쌀 것.
 * 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않고 로그만 남긴다.
 */
export async function sendTeacherApplicationNotification(to: string[], data: TeacherApplicationEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY 미설정 — 강사 지원 알림 메일 생략");
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
      subject: `[신규 강사지원] ${data.name}`,
      html: buildTeacherHtml(data),
      text: buildTeacherText(data),
    });
    if (error) console.error("[mailer] Resend 발송 실패:", error);
  } catch (err) {
    console.error("[mailer] 메일 발송 예외:", err);
  }
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

/* ===== 지원자 대상 강사 심사 결과 알림 ===== */

function buildResultHtml(title: string, bodyHtml: string): string {
  return `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 12px">${escapeHtml(title)}</h2>
    ${bodyHtml}
    <p style="font-size:12px;color:#999;margin:20px 0 0">프렌딩 스쿨</p>
  </div>`;
}

async function sendResultEmail(to: string[], subject: string, html: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY 미설정 — 강사 심사 결과 메일 생략");
    return;
  }
  if (to.length === 0) {
    console.warn("[mailer] 지원자 수신자가 없어 메일 생략");
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: FROM, to, subject, html, text });
    if (error) console.error("[mailer] Resend 발송 실패:", error);
  } catch (err) {
    console.error("[mailer] 메일 발송 예외:", err);
  }
}

/**
 * 지원자에게 강사 지원 승인 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendTeacherApprovalNotification(to: string[], data: { name: string; teacherUrl: string }): Promise<void> {
  const greeting = data.name ? `${data.name}님, ` : "";
  const html = buildResultHtml(
    "강사 지원이 승인되었습니다 🎉",
    `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 16px">${escapeHtml(greeting)}프렌딩 스쿨 강사 지원이 승인되었습니다. 이제 강사 페이지에서 프로필과 수업 가능 시간을 관리하실 수 있습니다.</p>
     <a href="${escapeHtml(data.teacherUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">강사 페이지로 이동</a>`,
  );
  const text = `${greeting}프렌딩 스쿨 강사 지원이 승인되었습니다.\n강사 페이지: ${data.teacherUrl}`;
  await sendResultEmail(to, "[프렌딩 스쿨] 강사 지원이 승인되었습니다", html, text);
}

/**
 * 지원자에게 강사 지원 거절(결과) 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendTeacherRejectionNotification(to: string[], data: { name: string; reason: string; applyUrl: string }): Promise<void> {
  const greeting = data.name ? `${data.name}님, ` : "";
  const reasonHtml = data.reason
    ? `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 8px"><strong>사유</strong></p>
       <p style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap;background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:12px;margin:0 0 16px">${escapeHtml(data.reason)}</p>`
    : "";
  const html = buildResultHtml(
    "강사 지원 결과 안내",
    `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 16px">${escapeHtml(greeting)}아쉽게도 이번 강사 지원은 승인되지 않았습니다.</p>
     ${reasonHtml}
     <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 16px">내용을 보완해 다시 지원하실 수 있습니다.</p>
     <a href="${escapeHtml(data.applyUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">강사 지원 페이지로 이동</a>`,
  );
  const text = `${greeting}이번 강사 지원은 승인되지 않았습니다.${data.reason ? `\n사유: ${data.reason}` : ""}\n내용을 보완해 다시 지원하실 수 있습니다.\n강사 지원: ${data.applyUrl}`;
  await sendResultEmail(to, "[프렌딩 스쿨] 강사 지원 결과 안내", html, text);
}
