import "server-only";
import { Resend } from "resend";

// 관리자 알림 메일 발송 (Resend).
// 환경 변수:
// - RESEND_API_KEY (필수) — 미설정 시 발송 생략(에러 없이 no-op, 신청 저장은 영향 없음)
// - APPLICATION_NOTIFY_FROM (선택) — 발신 주소. Resend에서 인증된 도메인이어야 함.
//   미설정 시 테스트용 onboarding@resend.dev(계정 소유자 본인에게만 전송 가능).

const FROM = process.env.APPLICATION_NOTIFY_FROM ?? "프렌딩 스쿨 <onboarding@resend.dev>";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
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

/* ===== 프렌더 지원 알림 (관리자 대상) ===== */

export type FrienderApplicationEmailData = {
  name: string;
  nickname: string; // 선택 입력 — 빈 문자열이면 "-"로 표시
  phone: string;
  intro: string;
  zoomUrl: string;
  email: string;
  createdAt: string;
};

function buildFrienderHtml(d: FrienderApplicationEmailData): string {
  const rows: [string, string][] = [
    ["이름", d.name],
    ["닉네임", d.nickname || "-"],
    ["전화번호", d.phone || "-"],
    ["자기소개", d.intro || "-"],
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
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">새 프렌더 지원이 접수되었습니다</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(d.name)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:12px;color:#999;margin:16px 0 0">프렌딩 스쿨 관리자 알림 · 관리자 페이지에서 승인/거절할 수 있습니다.</p>
  </div>`;
}

function buildFrienderText(d: FrienderApplicationEmailData): string {
  return [
    "새 프렌더 지원이 접수되었습니다.",
    "",
    `이름: ${d.name}`,
    `닉네임: ${d.nickname || "-"}`,
    `전화번호: ${d.phone || "-"}`,
    `자기소개: ${d.intro || "-"}`,
    `Zoom URL: ${d.zoomUrl || "-"}`,
    `이메일: ${d.email || "(미입력)"}`,
    `신청 일시: ${new Date(d.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  ].join("\n");
}

/**
 * 관리자들에게 신규 프렌더 지원 알림 메일 발송. best-effort — 호출 측에서 try/catch로 감쌀 것.
 * 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않고 로그만 남긴다.
 */
export async function sendFrienderApplicationNotification(to: string[], data: FrienderApplicationEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY 미설정 — 프렌더 지원 알림 메일 생략");
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
      subject: `[신규 프렌더지원] ${data.name}`,
      html: buildFrienderHtml(data),
      text: buildFrienderText(data),
    });
    if (error) console.error("[mailer] Resend 발송 실패:", error);
  } catch (err) {
    console.error("[mailer] 메일 발송 예외:", err);
  }
}

/* ===== 강사 대상 신규 수강신청 알림 ===== */

export type EnrollmentEmailData = {
  studentName: string;
  courseTitle: string;
  schedule: string; // 주간 일정 요약(영문 요일)
  startDate: string; // YYYY-MM-DD
  teacherUrl: string; // 강사 대시보드 링크
  // 아래는 신규 수강신청 알림 전용(옵셔널) — 취소 알림 호출부는 미제공.
  studentEnglishName?: string; // 학생 영문 이름
  courseEnglishTitle?: string; // 영문 과정명
  endDate?: string; // YYYY-MM-DD, 마지막(N회째) 수업일
  totalSessions?: number; // 총 수업 횟수
};

/**
 * 강사에게 신규 수강신청 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 * 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않고 로그만 남긴다.
 */
export async function sendEnrollmentNotificationToTeacher(to: string[], data: EnrollmentEmailData): Promise<void> {
  // 강사가 읽는 영문 메일 — 영문 이름/과정명 우선 노출(한글은 괄호로 병기, 강사 대시보드 관례와 동일).
  const studentLabel = data.studentEnglishName ? `${data.studentEnglishName} (${data.studentName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseEnglishTitle} (${data.courseTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ["Weekly schedule", data.schedule || "-"],
    ["Preferred start date", data.startDate || "-"],
    ...(data.endDate ? ([["End date", data.endDate]] as [string, string][]) : []),
    ...(data.totalSessions ? ([["Total sessions", String(data.totalSessions)]] as [string, string][]) : []),
  ];
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#666;background:#f8f8f8;white-space:nowrap;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(
          k,
        )}</td><td style="padding:8px 12px;color:#1a1a1a;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">You have a new enrollment request 🎉</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(studentLabel)} · ${escapeHtml(courseLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">Please review and approve or decline the request on your teacher page.</p>
    <a href="${escapeHtml(data.teacherUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to teacher page</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "You have a new enrollment request.",
    "",
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    `Weekly schedule: ${data.schedule || "-"}`,
    `Preferred start date: ${data.startDate || "-"}`,
    ...(data.endDate ? [`End date: ${data.endDate}`] : []),
    ...(data.totalSessions ? [`Total sessions: ${data.totalSessions}`] : []),
    "",
    `Review on your teacher page: ${data.teacherUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Friending School] New enrollment request · ${data.studentEnglishName || data.studentName}`, html, text);
}

/**
 * 강사에게 결제 확정(수업 확정) 알림. 관리자가 입금을 확인하면 수업(클래스)이 생성되므로 강사에게 통보한다.
 * best-effort — 호출 측에서 try/catch로 감쌀 것. 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않고 로그만 남긴다.
 */
export async function sendEnrollmentPaymentConfirmedToTeacher(to: string[], data: EnrollmentEmailData): Promise<void> {
  // 강사가 읽는 영문 메일 — 영문 이름/과정명 우선 노출(한글은 괄호로 병기, 강사 대시보드 관례와 동일).
  const studentLabel = data.studentEnglishName ? `${data.studentEnglishName} (${data.studentName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseEnglishTitle} (${data.courseTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ["Weekly schedule", data.schedule || "-"],
    ["Start date", data.startDate || "-"],
    ...(data.endDate ? ([["End date", data.endDate]] as [string, string][]) : []),
    ...(data.totalSessions ? ([["Total sessions", String(data.totalSessions)]] as [string, string][]) : []),
  ];
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#666;background:#f8f8f8;white-space:nowrap;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(
          k,
        )}</td><td style="padding:8px 12px;color:#1a1a1a;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">Your class is confirmed 🎉</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(studentLabel)} · ${escapeHtml(courseLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">The student's payment has been confirmed and the classes have been scheduled. You can review your upcoming classes in My Classroom on your teacher page.</p>
    <a href="${escapeHtml(data.teacherUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to teacher page</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "Your class is confirmed.",
    "",
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    `Weekly schedule: ${data.schedule || "-"}`,
    `Start date: ${data.startDate || "-"}`,
    ...(data.endDate ? [`End date: ${data.endDate}`] : []),
    ...(data.totalSessions ? [`Total sessions: ${data.totalSessions}`] : []),
    "",
    `The payment has been confirmed and classes are scheduled. Review them in My Classroom: ${data.teacherUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Class confirmed · ${data.studentEnglishName || data.studentName}`, html, text);
}

/**
 * 강사에게 학생의 수강신청 취소 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 * 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않고 로그만 남긴다.
 */
export async function sendEnrollmentCancellationToTeacher(to: string[], data: EnrollmentEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Weekly schedule", data.schedule || "-"],
    ["Start date", data.startDate || "-"],
  ];
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#666;background:#f8f8f8;white-space:nowrap;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(
          k,
        )}</td><td style="padding:8px 12px;color:#1a1a1a;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">An enrollment request has been cancelled</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.studentName)} · ${escapeHtml(data.courseTitle)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">The student cancelled this request, so no action is needed. You can review your enrollments on your teacher page.</p>
    <a href="${escapeHtml(data.teacherUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to teacher page</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "An enrollment request has been cancelled by the student.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Weekly schedule: ${data.schedule || "-"}`,
    `Start date: ${data.startDate || "-"}`,
    "",
    `Teacher page: ${data.teacherUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Enrollment cancelled · ${data.studentName}`, html, text);
}

export type EnrollmentRefundEmailData = {
  studentName: string | null;
  courseTitle: string;
  courseEnglishTitle?: string;
  teacherUrl: string;
};

/**
 * 강사에게 환불로 인한 수강 취소 알림(미래 수업이 취소됨). best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendEnrollmentRefundToTeacher(to: string[], data: EnrollmentRefundEmailData): Promise<void> {
  const title = data.courseEnglishTitle || data.courseTitle;
  const student = data.studentName || "-";
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A course has been refunded and cancelled</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(student)} · ${escapeHtml(title)}</p>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 12px">This student's payment was refunded, so the course and its upcoming classes have been cancelled. No action is needed — the cancelled sessions are removed from My Classroom.</p>
    <a href="${escapeHtml(data.teacherUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to teacher page</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "A course has been refunded and cancelled.",
    "",
    `Student: ${student}`,
    `Course: ${title}`,
    "The upcoming classes have been cancelled. No action is needed.",
    "",
    `Teacher page: ${data.teacherUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Course refunded · ${student}`, html, text);
}

export type ClassCancellationEmailData = {
  studentName: string;
  courseTitle: string;
  sessionDate: string; // YYYY-MM-DD (취소된 회차)
  sessionTime: string; // "09:00~09:25"
  makeupDate?: string; // YYYY-MM-DD (자동 보강 예정일)
};

/**
 * 강사에게 학생의 개별 수업 연기 + 자동 보강 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendClassCancellationToTeacher(to: string[], data: ClassCancellationEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Postponed session", `${data.sessionDate} ${data.sessionTime}`],
    ...(data.makeupDate ? ([["Makeup scheduled", `${data.makeupDate} ${data.sessionTime}`]] as [string, string][]) : []),
  ];
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#666;background:#f8f8f8;white-space:nowrap;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(
          k,
        )}</td><td style="padding:8px 12px;color:#1a1a1a;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A class has been postponed by the student</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.studentName)} · ${escapeHtml(data.courseTitle)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 0">${
      data.makeupDate
        ? "A makeup class has been automatically scheduled (same weekday and time). You can review it on your teacher page."
        : "You can review your classes on your teacher page."
    }</p>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "A class has been postponed by the student.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Postponed session: ${data.sessionDate} ${data.sessionTime}`,
    ...(data.makeupDate ? [`Makeup scheduled: ${data.makeupDate} ${data.sessionTime}`] : []),
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Class postponed · ${data.studentName}`, html, text);
}

/* ===== 강사 대체(교체) 알림 ===== */

export type ClassReassignEmailData = {
  studentName: string;
  courseTitle: string;
  sessionDate: string; // YYYY-MM-DD
  sessionTime: string; // "09:00~09:25"
  oldTeacherName?: string;
  newTeacherName?: string;
  teacherUrl: string;
};

function reassignTableRows(rows: [string, string][]): string {
  return rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#666;background:#f8f8f8;white-space:nowrap;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(
          k,
        )}</td><td style="padding:8px 12px;color:#1a1a1a;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
}

/**
 * 대체 투입된(새) 강사에게 수업 배정 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendClassReassignToNewTeacher(to: string[], data: ClassReassignEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Session", `${data.sessionDate} ${data.sessionTime}`],
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">You have been assigned a class</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.studentName)} · ${escapeHtml(data.courseTitle)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 0">This session has been assigned to you. You can review it on your <a href="${escapeHtml(
      data.teacherUrl,
    )}" style="color:#1a4fa0">teacher page</a>.</p>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "You have been assigned a class.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Session: ${data.sessionDate} ${data.sessionTime}`,
    "",
    `Review it on your teacher page: ${data.teacherUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Class assigned · ${data.studentName}`, html, text);
}

/**
 * 기존(원) 강사에게 해당 수업이 다른 강사로 이관됐음을 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendClassReassignToOldTeacher(to: string[], data: ClassReassignEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Session", `${data.sessionDate} ${data.sessionTime}`],
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A class has been reassigned to another teacher</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.studentName)} · ${escapeHtml(data.courseTitle)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 0">This session has been reassigned and no longer appears in your classroom. No action is needed.</p>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "A class has been reassigned to another teacher.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Session: ${data.sessionDate} ${data.sessionTime}`,
    "",
    "This session no longer appears in your classroom. No action is needed.",
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Class reassigned · ${data.studentName}`, html, text);
}

export type ClassReassignAdminEmailData = {
  studentName: string;
  courseTitle: string;
  sessionDate: string; // YYYY-MM-DD
  sessionTime: string; // "09:00~09:25"
  oldTeacherName?: string;
  newTeacherName?: string;
  centerName?: string; // 담당 센터명
  actorName?: string; // 대체를 실행한 센터 매니저
  adminUrl: string; // 관리자 화상수업(상세) 링크
};

/**
 * 관리자에게 센터 매니저의 개별 회차 강사 대체 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 * 영문 본문(관리자 알림 통일). 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않음.
 */
export async function sendClassReassignToAdmin(to: string[], data: ClassReassignAdminEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Session", `${data.sessionDate} ${data.sessionTime}`],
    ["Previous teacher", data.oldTeacherName || "-"],
    ["New teacher", data.newTeacherName || "-"],
    ...(data.centerName ? ([["Center", data.centerName]] as [string, string][]) : []),
    ...(data.actorName ? ([["Changed by", data.actorName]] as [string, string][]) : []),
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A class teacher was reassigned by a center manager</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.courseTitle)} · ${escapeHtml(data.studentName)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">A center manager changed the assigned teacher for this session. You can review it on the admin page.</p>
    <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to class management</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School admin notification</p>
  </div>`;
  const text = [
    "A class teacher was reassigned by a center manager.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Session: ${data.sessionDate} ${data.sessionTime}`,
    `Previous teacher: ${data.oldTeacherName || "-"}`,
    `New teacher: ${data.newTeacherName || "-"}`,
    ...(data.centerName ? [`Center: ${data.centerName}`] : []),
    ...(data.actorName ? [`Changed by: ${data.actorName}`] : []),
    "",
    `Class management: ${data.adminUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Class reassigned] ${data.courseTitle} · ${data.studentName}`, html, text);
}

/* ===== 강사 중도 하차 — 과정 전체 이관 알림 ===== */

export type CourseReassignEmailData = {
  studentName: string;
  courseTitle: string;
  schedule: string; // 주간 일정 요약(영문 요일)
  remainingCount: number; // 이관되는 남은 수업 수
  nextDate: string; // 다음(첫) 남은 수업 날짜 YYYY-MM-DD
  oldTeacherName?: string;
  newTeacherName?: string;
  teacherUrl: string;
};

/**
 * 새 담당 강사에게 과정의 남은 수업 전체가 배정됐음을 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendCourseReassignToNewTeacher(to: string[], data: CourseReassignEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Schedule", data.schedule || "-"],
    ["Remaining sessions", String(data.remainingCount)],
    ["Next session", data.nextDate],
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">You are now teaching this course</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.studentName)} · ${escapeHtml(data.courseTitle)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 0">All remaining sessions of this course have been assigned to you. You can review them on your <a href="${escapeHtml(
      data.teacherUrl,
    )}" style="color:#1a4fa0">teacher page</a>.</p>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "You are now teaching this course.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Schedule: ${data.schedule || "-"}`,
    `Remaining sessions: ${data.remainingCount}`,
    `Next session: ${data.nextDate}`,
    "",
    `Review them on your teacher page: ${data.teacherUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Course assigned · ${data.studentName}`, html, text);
}

/**
 * 기존(원) 강사에게 과정이 다른 강사로 이관됐음을 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendCourseReassignToOldTeacher(to: string[], data: CourseReassignEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Schedule", data.schedule || "-"],
    ["Remaining sessions", String(data.remainingCount)],
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A course has been reassigned to another teacher</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.studentName)} · ${escapeHtml(data.courseTitle)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 0">The remaining sessions of this course have been reassigned and no longer appear in your classroom. No action is needed.</p>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "A course has been reassigned to another teacher.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Schedule: ${data.schedule || "-"}`,
    `Remaining sessions: ${data.remainingCount}`,
    "",
    "These sessions no longer appear in your classroom. No action is needed.",
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Course reassigned · ${data.studentName}`, html, text);
}

/* ===== 관리자 대상 신규 수강신청 알림 ===== */

export type EnrollmentAdminEmailData = {
  studentName: string; // 학생 한글 이름
  studentEnglishName: string; // 학생 영문 이름
  courseTitle: string; // 과정 한글명
  courseEnglishTitle: string; // 과정 영문명
  teacherName: string; // 강사명
  schedule: string; // 주간 일정 요약(한국어 요일)
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD, 마지막(N회째) 수업일(취소 알림 등 무의미한 경우 생략)
  totalSessions?: number; // 총 수업 횟수
  adminUrl: string; // 관리자 수강신청 관리 링크
  reason?: string; // 거절 사유(거절 알림에만 사용)
  fromStatus?: string; // 취소 직전 상태(학생 취소 알림에만 사용: 신청/승인/결제대기)
};

/**
 * 관리자들에게 신규 수강신청 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 * 학생 이름·과정명은 한글/영문 병기. 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않고 로그만 남긴다.
 */
export async function sendEnrollmentNotificationToAdmin(to: string[], data: EnrollmentAdminEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY 미설정 — 수강신청 관리자 알림 메일 생략");
    return;
  }
  if (to.length === 0) {
    console.warn("[mailer] 관리자(admin) 수신자가 없어 메일 생략");
    return;
  }

  // 학생 이름·과정명은 한글 (영문) 병기 — 영문이 없으면 한글만.
  const studentLabel = data.studentEnglishName ? `${data.studentName} (${data.studentEnglishName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseTitle} (${data.courseEnglishTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ["Teacher", data.teacherName || "-"],
    ["Weekly schedule", data.schedule || "-"],
    ["Start date", data.startDate || "-"],
    ...(data.endDate ? ([["End date", data.endDate]] as [string, string][]) : []),
    ...(data.totalSessions ? ([["Total sessions", String(data.totalSessions)]] as [string, string][]) : []),
  ];
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#666;background:#f8f8f8;white-space:nowrap;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(
          k,
        )}</td><td style="padding:8px 12px;color:#1a1a1a;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A new enrollment request has been received</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(courseLabel)} · ${escapeHtml(studentLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">You can confirm payment and manage this request on the admin page (Enrollments).</p>
    <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to enrollment management</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School admin notification</p>
  </div>`;
  const text = [
    "A new enrollment request has been received.",
    "",
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    `Teacher: ${data.teacherName || "-"}`,
    `Weekly schedule: ${data.schedule || "-"}`,
    `Start date: ${data.startDate || "-"}`,
    ...(data.endDate ? [`End date: ${data.endDate}`] : []),
    ...(data.totalSessions ? [`Total sessions: ${data.totalSessions}`] : []),
    "",
    `Enrollment management: ${data.adminUrl}`,
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `[New enrollment] ${courseLabel} · ${studentLabel}`,
      html,
      text,
    });
    if (error) console.error("[mailer] Resend 발송 실패:", error);
  } catch (err) {
    console.error("[mailer] 메일 발송 예외:", err);
  }
}

/* ===== 관리자 대상 수강신청 승인/거절 알림(강사 처리 결과) ===== */

// 강사가 수강신청을 승인 → '결제대기' 전환 시 관리자에 알림(입금 확인 유도). best-effort.
export async function sendEnrollmentApprovedToAdmin(to: string[], data: EnrollmentAdminEmailData): Promise<void> {
  const studentLabel = data.studentEnglishName ? `${data.studentName} (${data.studentEnglishName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseTitle} (${data.courseEnglishTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ["Teacher", data.teacherName || "-"],
    ["Weekly schedule", data.schedule || "-"],
    ["Start date", data.startDate || "-"],
    ...(data.endDate ? ([["End date", data.endDate]] as [string, string][]) : []),
    ...(data.totalSessions ? ([["Total sessions", String(data.totalSessions)]] as [string, string][]) : []),
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">An enrollment was approved (awaiting payment)</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(courseLabel)} · ${escapeHtml(studentLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">The teacher approved this enrollment and it is now awaiting payment. Please confirm the deposit on the admin page.</p>
    <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to enrollment management</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School admin notification</p>
  </div>`;
  const text = [
    "An enrollment was approved and is now awaiting payment.",
    "",
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    `Teacher: ${data.teacherName || "-"}`,
    `Weekly schedule: ${data.schedule || "-"}`,
    `Start date: ${data.startDate || "-"}`,
    ...(data.endDate ? [`End date: ${data.endDate}`] : []),
    ...(data.totalSessions ? [`Total sessions: ${data.totalSessions}`] : []),
    "",
    `Confirm the deposit on the admin page: ${data.adminUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Enrollment approved] ${courseLabel} · ${studentLabel}`, html, text);
}

// 수강생이 카드로 결제를 완료(결제완료 전환) 시 관리자에 알림. best-effort. 무통장(admin 확인)은 제외.
export async function sendEnrollmentPaidToAdmin(to: string[], data: EnrollmentAdminEmailData): Promise<void> {
  const studentLabel = data.studentEnglishName ? `${data.studentName} (${data.studentEnglishName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseTitle} (${data.courseEnglishTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ["Teacher", data.teacherName || "-"],
    ["Weekly schedule", data.schedule || "-"],
    ["Start date", data.startDate || "-"],
    ...(data.endDate ? ([["End date", data.endDate]] as [string, string][]) : []),
    ...(data.totalSessions ? ([["Total sessions", String(data.totalSessions)]] as [string, string][]) : []),
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A card payment has been completed</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(courseLabel)} · ${escapeHtml(studentLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">The student paid by card and the class has been confirmed. The sessions have been scheduled and are visible in the classroom.</p>
    <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to enrollment management</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School admin notification</p>
  </div>`;
  const text = [
    "A card payment has been completed and the class has been confirmed.",
    "",
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    `Teacher: ${data.teacherName || "-"}`,
    `Weekly schedule: ${data.schedule || "-"}`,
    `Start date: ${data.startDate || "-"}`,
    ...(data.endDate ? [`End date: ${data.endDate}`] : []),
    ...(data.totalSessions ? [`Total sessions: ${data.totalSessions}`] : []),
    "",
    `Enrollment management: ${data.adminUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Payment completed] ${courseLabel} · ${studentLabel}`, html, text);
}

// 강사가 수강신청을 거절 시 관리자에 알림(사유 포함). best-effort.
export async function sendEnrollmentRejectedToAdmin(to: string[], data: EnrollmentAdminEmailData): Promise<void> {
  const studentLabel = data.studentEnglishName ? `${data.studentName} (${data.studentEnglishName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseTitle} (${data.courseEnglishTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ["Teacher", data.teacherName || "-"],
    ["Weekly schedule", data.schedule || "-"],
    ["Start date", data.startDate || "-"],
    ...(data.reason ? ([["Reason", data.reason]] as [string, string][]) : []),
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">An enrollment was declined by the teacher</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(courseLabel)} · ${escapeHtml(studentLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">You can review this on the admin page (Enrollments).</p>
    <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to enrollment management</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School admin notification</p>
  </div>`;
  const text = [
    "An enrollment was declined by the teacher.",
    "",
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    `Teacher: ${data.teacherName || "-"}`,
    `Weekly schedule: ${data.schedule || "-"}`,
    `Start date: ${data.startDate || "-"}`,
    ...(data.reason ? [`Reason: ${data.reason}`] : []),
    "",
    `Enrollment management: ${data.adminUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Enrollment declined] ${courseLabel} · ${studentLabel}`, html, text);
}

// 취소 직전 상태(enrollment_status)를 관리자 메일용 영문 라벨로. 미매핑 값은 원문 유지.
function statusLabelEn(status: string): string {
  return { 신청: "Pending approval (신청)", 승인: "Approved (승인)", 결제대기: "Awaiting payment (결제대기)" }[status] ?? status;
}

// 수강생이 본인 수강신청을 취소했을 때 관리자에 알림(결제 전 상태에서만 발생). best-effort.
export async function sendEnrollmentCancelledToAdmin(to: string[], data: EnrollmentAdminEmailData): Promise<void> {
  const studentLabel = data.studentEnglishName ? `${data.studentName} (${data.studentEnglishName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseTitle} (${data.courseEnglishTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ["Teacher", data.teacherName || "-"],
    ["Weekly schedule", data.schedule || "-"],
    ["Start date", data.startDate || "-"],
    ...(data.totalSessions ? ([["Total sessions", String(data.totalSessions)]] as [string, string][]) : []),
    ...(data.fromStatus ? ([["Status before cancellation", statusLabelEn(data.fromStatus)]] as [string, string][]) : []),
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">An enrollment was cancelled by the student</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(courseLabel)} · ${escapeHtml(studentLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">The student cancelled before payment was completed, so the reserved time slot has been released. No refund is required.</p>
    <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to enrollment management</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School admin notification</p>
  </div>`;
  const text = [
    "An enrollment was cancelled by the student.",
    "",
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    `Teacher: ${data.teacherName || "-"}`,
    `Weekly schedule: ${data.schedule || "-"}`,
    `Start date: ${data.startDate || "-"}`,
    ...(data.totalSessions ? [`Total sessions: ${data.totalSessions}`] : []),
    ...(data.fromStatus ? [`Status before cancellation: ${statusLabelEn(data.fromStatus)}`] : []),
    "",
    "The student cancelled before payment, so no refund is required.",
    `Enrollment management: ${data.adminUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Enrollment cancelled] ${courseLabel} · ${studentLabel}`, html, text);
}

/* ===== 관리자 대상 개별 수업 연기 알림(수강생 요청) ===== */

export type ClassPostponeAdminEmailData = {
  studentName: string; // 학생 한글 이름
  studentEnglishName?: string; // 학생 영문 이름
  courseTitle: string; // 과정 한글명
  courseEnglishTitle?: string; // 과정 영문명
  teacherName: string;
  sessionDate: string; // YYYY-MM-DD (연기된 회차)
  sessionTime: string; // "09:00~09:25"
  sessionNo?: number; // 회차 번호
  makeupDate?: string; // YYYY-MM-DD (자동 보강 예정일, 생성 실패 시 없음)
  remaining?: number; // 이번 연기 반영 후 남은 연기 횟수
  maxCancellations?: number; // 과정당 연기 한도
  adminUrl: string; // 관리자 화상수업 상세 링크
};

/**
 * 관리자에게 수강생의 개별 수업 연기 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 * 영문 본문(관리자 알림 통일). 보강 자동 생성 실패 시 수동 조치가 필요하므로 그 사실을 본문에 명시한다.
 */
export async function sendClassPostponedToAdmin(to: string[], data: ClassPostponeAdminEmailData): Promise<void> {
  const studentLabel = data.studentEnglishName ? `${data.studentName} (${data.studentEnglishName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseTitle} (${data.courseEnglishTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ["Teacher", data.teacherName || "-"],
    ["Postponed session", `${data.sessionDate} ${data.sessionTime}${data.sessionNo ? ` (#${data.sessionNo})` : ""}`],
    ["Makeup scheduled", data.makeupDate ? `${data.makeupDate} ${data.sessionTime}` : "Not created — manual action required"],
    ...(data.remaining != null && data.maxCancellations
      ? ([["Remaining postpones", `${data.remaining} / ${data.maxCancellations}`]] as [string, string][])
      : []),
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A class was postponed by the student</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(courseLabel)} · ${escapeHtml(studentLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">${
      data.makeupDate
        ? "A makeup session has been added automatically at the end of the course. You can review it on the admin page."
        : "The makeup session could not be created automatically. Please add it manually on the admin page."
    }</p>
    <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to class management</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School admin notification</p>
  </div>`;
  const text = [
    "A class was postponed by the student.",
    "",
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    `Teacher: ${data.teacherName || "-"}`,
    `Postponed session: ${data.sessionDate} ${data.sessionTime}${data.sessionNo ? ` (#${data.sessionNo})` : ""}`,
    `Makeup scheduled: ${data.makeupDate ? `${data.makeupDate} ${data.sessionTime}` : "Not created — manual action required"}`,
    ...(data.remaining != null && data.maxCancellations ? [`Remaining postpones: ${data.remaining} / ${data.maxCancellations}`] : []),
    "",
    `Class management: ${data.adminUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Class postponed] ${courseLabel} · ${studentLabel}`, html, text);
}

/* ===== 센터 매니저 대상 수강신청 라이프사이클 알림 ===== */

// 소속 강사의 수강신청이 접수/승인/거절/확정/취소/환불될 때 담당 센터 매니저에게 알린다.
// 관리자용처럼 이벤트별 함수를 복제하지 않고, 제목·헤딩·리드 문단만 EVENT_META로 분기하는 단일 함수로 처리.
export type CenterEnrollmentEvent = "created" | "approved" | "declined" | "paid" | "cancelled" | "refunded";

export type CenterEnrollmentEmailData = {
  event: CenterEnrollmentEvent;
  centerName?: string;
  teacherName: string;
  studentName: string;
  studentEnglishName?: string;
  courseTitle: string;
  courseEnglishTitle?: string;
  schedule?: string; // 주간 일정 요약(영문 요일)
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  totalSessions?: number;
  reason?: string; // 거절/취소/환불 사유
  cancelledBy?: "student" | "admin"; // event=cancelled일 때 취소 주체
  centerUrl: string; // 센터 매니저 페이지 링크(admin 링크 금지 — 매니저는 접근 불가)
};

// 이벤트별 제목 라벨 · 헤딩 · 리드 문단.
const CENTER_EVENT_META: Record<CenterEnrollmentEvent, { tag: string; heading: string; lead: string }> = {
  created: {
    tag: "New enrollment request",
    heading: "A new enrollment request for your center",
    lead: "A student requested this course with one of your teachers. The teacher needs to approve or decline it.",
  },
  approved: {
    tag: "Enrollment approved",
    heading: "An enrollment was approved by the teacher",
    lead: "The teacher approved this request. It is now awaiting payment and is not confirmed yet.",
  },
  declined: {
    tag: "Enrollment declined",
    heading: "An enrollment was declined by the teacher",
    lead: "The teacher declined this request, so the requested time slot stays open.",
  },
  paid: {
    tag: "Class confirmed",
    heading: "A course has been confirmed",
    lead: "Payment is complete and the sessions have been scheduled. You can review them on the weekly schedule.",
  },
  cancelled: {
    tag: "Enrollment cancelled",
    heading: "An enrollment was cancelled",
    lead: "The enrollment was cancelled before payment, so the reserved time slot has been released.",
  },
  refunded: {
    tag: "Course refunded",
    heading: "A confirmed course was refunded and cancelled",
    lead: "The payment was refunded, so the course and its upcoming sessions have been cancelled.",
  },
};

/**
 * 담당 센터 매니저에게 수강신청 라이프사이클 알림. best-effort — 호출 측(center-notify)에서 감싼다.
 * 영문 본문(센터 매니저 UI 정책과 동일). 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않는다.
 */
export async function sendEnrollmentEventToCenterManager(to: string[], data: CenterEnrollmentEmailData): Promise<void> {
  const meta = CENTER_EVENT_META[data.event];
  const studentLabel = data.studentEnglishName ? `${data.studentName} (${data.studentEnglishName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseEnglishTitle} (${data.courseTitle})` : data.courseTitle;
  const rows: [string, string][] = [
    ...(data.centerName ? ([["Center", data.centerName]] as [string, string][]) : []),
    ["Teacher", data.teacherName || "-"],
    ["Student", studentLabel || "-"],
    ["Course", courseLabel],
    ...(data.schedule ? ([["Weekly schedule", data.schedule]] as [string, string][]) : []),
    ...(data.startDate ? ([["Start date", data.startDate]] as [string, string][]) : []),
    ...(data.endDate ? ([["End date", data.endDate]] as [string, string][]) : []),
    ...(data.totalSessions ? ([["Total sessions", String(data.totalSessions)]] as [string, string][]) : []),
    ...(data.cancelledBy ? ([["Cancelled by", data.cancelledBy === "admin" ? "Administrator" : "Student"]] as [string, string][]) : []),
    ...(data.reason ? ([["Reason", data.reason]] as [string, string][]) : []),
  ];
  const ctaLabel = data.event === "paid" ? "Go to weekly schedule" : "Go to center management";
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">${escapeHtml(meta.heading)}</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(courseLabel)} · ${escapeHtml(studentLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">${escapeHtml(meta.lead)}</p>
    <a href="${escapeHtml(data.centerUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">${escapeHtml(ctaLabel)}</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School center notification</p>
  </div>`;
  const text = [
    `${meta.heading}.`,
    "",
    ...(data.centerName ? [`Center: ${data.centerName}`] : []),
    `Teacher: ${data.teacherName || "-"}`,
    `Student: ${studentLabel || "-"}`,
    `Course: ${courseLabel}`,
    ...(data.schedule ? [`Weekly schedule: ${data.schedule}`] : []),
    ...(data.startDate ? [`Start date: ${data.startDate}`] : []),
    ...(data.endDate ? [`End date: ${data.endDate}`] : []),
    ...(data.totalSessions ? [`Total sessions: ${data.totalSessions}`] : []),
    ...(data.cancelledBy ? [`Cancelled by: ${data.cancelledBy === "admin" ? "Administrator" : "Student"}`] : []),
    ...(data.reason ? [`Reason: ${data.reason}`] : []),
    "",
    meta.lead,
    `Center page: ${data.centerUrl}`,
  ].join("\n");
  const subjectPrefix = data.centerName ? `[${data.centerName}] ` : "";
  await sendResultEmail(to, `${subjectPrefix}${meta.tag} · ${courseLabel} · ${studentLabel}`, html, text);
}

/* ===== 센터 매니저 대상 수업(클래스) 변경 알림 ===== */

// admin이 소속 강사의 확정 수업을 대체/연기/취소하거나 남은 일정을 일괄 변경했을 때.
// 수강신청 알림과 동일하게 이벤트별 메타만 분기하는 단일 함수.
export type CenterClassEvent = "class_reassigned" | "class_postponed" | "class_cancelled" | "remaining_rescheduled" | "remaining_reassigned";

export type CenterClassEmailData = {
  event: CenterClassEvent;
  centerName?: string;
  teacherName?: string; // 담당 강사(연기·취소·일정변경)
  oldTeacherName?: string;
  newTeacherName?: string;
  studentName: string;
  studentEnglishName?: string;
  courseTitle: string;
  courseEnglishTitle?: string;
  sessionDate?: string; // YYYY-MM-DD
  sessionTime?: string; // "09:00~09:25"
  makeupDate?: string;
  postponeReason?: "student" | "company";
  oldSchedule?: string; // 변경 전 주간 일정 요약
  newSchedule?: string; // 변경 후 주간 일정 요약
  effectiveDate?: string; // 적용 시작일
  nextDate?: string; // 재배치 후 첫 수업일
  affectedCount?: number; // 영향받은 남은 회차 수
  centerUrl: string;
};

const CENTER_CLASS_META: Record<CenterClassEvent, { tag: string; heading: string; lead: string }> = {
  class_reassigned: {
    tag: "Session teacher changed",
    heading: "A session was reassigned to another teacher",
    lead: "An administrator assigned this single session to a different teacher. The date, time and student stay the same.",
  },
  class_postponed: {
    // 학생 본인 연기(cancelClass)·admin 연기(adminCancelClass) 공용이라 리드는 주체 중립 — 주체는 Reason 행으로 구분.
    tag: "Session postponed",
    heading: "A session was postponed",
    lead: "This session was postponed and a makeup session is added at the end of the course.",
  },
  class_cancelled: {
    tag: "Session cancelled",
    heading: "A session was cancelled",
    lead: "An administrator cancelled this session. No makeup session was created for it.",
  },
  remaining_rescheduled: {
    tag: "Schedule changed",
    heading: "The remaining sessions were rescheduled",
    lead: "An administrator moved the remaining sessions of this course to a new weekly schedule. The teacher stays the same.",
  },
  remaining_reassigned: {
    tag: "Course teacher changed",
    heading: "The remaining sessions were reassigned to another teacher",
    lead: "An administrator handed the remaining sessions of this course to a different teacher.",
  },
};

/**
 * 담당 센터 매니저에게 수업 변경 알림. best-effort — 호출 측(center-notify)에서 감싼다.
 * 영문 본문(센터 매니저 UI 정책과 동일). 키 미설정/수신자 없음/발송 실패 시에도 throw하지 않는다.
 */
export async function sendClassEventToCenterManager(to: string[], data: CenterClassEmailData): Promise<void> {
  const meta = CENTER_CLASS_META[data.event];
  const studentLabel = data.studentEnglishName ? `${data.studentName} (${data.studentEnglishName})` : data.studentName;
  const courseLabel = data.courseEnglishTitle ? `${data.courseEnglishTitle} (${data.courseTitle})` : data.courseTitle;
  const session = data.sessionDate ? `${data.sessionDate}${data.sessionTime ? ` ${data.sessionTime}` : ""}` : "";
  const rows: [string, string][] = [
    ...(data.centerName ? ([["Center", data.centerName]] as [string, string][]) : []),
    ["Course", courseLabel],
    ["Student", studentLabel || "-"],
    ...(data.teacherName ? ([["Teacher", data.teacherName]] as [string, string][]) : []),
    ...(data.oldTeacherName ? ([["Previous teacher", data.oldTeacherName]] as [string, string][]) : []),
    ...(data.newTeacherName ? ([["New teacher", data.newTeacherName]] as [string, string][]) : []),
    ...(session ? ([[data.event === "class_reassigned" ? "Session" : "Affected session", session]] as [string, string][]) : []),
    ...(data.event === "class_postponed"
      ? ([
          [
            "Makeup scheduled",
            data.makeupDate ? `${data.makeupDate}${data.sessionTime ? ` ${data.sessionTime}` : ""}` : "Not created — manual action required",
          ],
        ] as [string, string][])
      : []),
    ...(data.postponeReason
      ? ([["Reason", data.postponeReason === "company" ? "Company (teacher/school side)" : "Student request"]] as [string, string][])
      : []),
    ...(data.oldSchedule && data.newSchedule
      ? ([["Weekly schedule", `${data.oldSchedule} → ${data.newSchedule}`]] as [string, string][])
      : data.newSchedule
        ? ([["Weekly schedule", data.newSchedule]] as [string, string][])
        : []),
    ...(data.effectiveDate ? ([["Effective from", data.effectiveDate]] as [string, string][]) : []),
    ...(data.nextDate ? ([["Next session", data.nextDate]] as [string, string][]) : []),
    ...(data.affectedCount ? ([["Affected sessions", String(data.affectedCount)]] as [string, string][]) : []),
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">${escapeHtml(meta.heading)}</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(courseLabel)} · ${escapeHtml(studentLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 12px">${escapeHtml(meta.lead)}</p>
    <a href="${escapeHtml(data.centerUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to weekly schedule</a>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School center notification</p>
  </div>`;
  const text = [`${meta.heading}.`, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", meta.lead, `Weekly schedule: ${data.centerUrl}`].join("\n");
  const subjectPrefix = data.centerName ? `[${data.centerName}] ` : "";
  await sendResultEmail(to, `${subjectPrefix}${meta.tag} · ${courseLabel} · ${studentLabel}`, html, text);
}

/* ===== 강사 대상 남은 일정 일괄 변경 알림 ===== */

export type RemainingRescheduleEmailData = {
  studentName: string;
  courseTitle: string;
  oldSchedule: string; // 변경 전 주간 일정 요약(영문 요일)
  newSchedule: string;
  effectiveDate: string; // YYYY-MM-DD
  nextDate: string; // 새 일정의 첫 수업일
  affectedCount: number; // 재배치된 남은 회차 수
  teacherUrl: string;
};

/**
 * 담당 강사에게 남은 수업 일정 일괄 변경 알림(담당은 그대로, 요일·시간만 변경). best-effort.
 */
export async function sendRemainingRescheduleToTeacher(to: string[], data: RemainingRescheduleEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Weekly schedule", `${data.oldSchedule || "-"} → ${data.newSchedule || "-"}`],
    ["Effective from", data.effectiveDate],
    ["Next session", data.nextDate],
    ["Rescheduled sessions", String(data.affectedCount)],
  ];
  const html = `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">Your remaining sessions have been rescheduled</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.studentName)} · ${escapeHtml(data.courseTitle)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${reassignTableRows(rows)}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 0">You are still the teacher for this course — only the weekday and time changed. Please check the new dates on your <a href="${escapeHtml(
      data.teacherUrl,
    )}" style="color:#1a4fa0">teacher page</a>.</p>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "Your remaining sessions have been rescheduled.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Weekly schedule: ${data.oldSchedule || "-"} → ${data.newSchedule || "-"}`,
    `Effective from: ${data.effectiveDate}`,
    `Next session: ${data.nextDate}`,
    `Rescheduled sessions: ${data.affectedCount}`,
    "",
    "You are still the teacher for this course — only the weekday and time changed.",
    `Teacher page: ${data.teacherUrl}`,
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Schedule changed · ${data.studentName}`, html, text);
}

/* ===== 지원자 대상 강사 심사 결과 알림 ===== */

function buildResultHtml(title: string, bodyHtml: string): string {
  return `<div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 12px">${escapeHtml(title)}</h2>
    ${bodyHtml}
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
}

async function sendResultEmail(to: string[], subject: string, html: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY 미설정 — 심사 결과 메일 생략");
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
  const greeting = data.name ? `Hi ${data.name}, ` : "";
  const html = buildResultHtml(
    "Your teacher application has been approved 🎉",
    `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 16px">${escapeHtml(greeting)}your application to teach at Friending School has been approved. You can now manage your profile and availability on your teacher page.</p>
     <a href="${escapeHtml(data.teacherUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to teacher page</a>`,
  );
  const text = `${greeting}your application to teach at Friending School has been approved.\nTeacher page: ${data.teacherUrl}`;
  await sendResultEmail(to, "[Friending School] Your teacher application has been approved", html, text);
}

/**
 * 지원자에게 강사 지원 거절(결과) 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendTeacherRejectionNotification(to: string[], data: { name: string; reason: string; applyUrl: string }): Promise<void> {
  const greeting = data.name ? `Hi ${data.name}, ` : "";
  const reasonHtml = data.reason
    ? `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 8px"><strong>Reason</strong></p>
       <p style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap;background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:12px;margin:0 0 16px">${escapeHtml(data.reason)}</p>`
    : "";
  const html = buildResultHtml(
    "Your teacher application result",
    `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 16px">${escapeHtml(greeting)}unfortunately your teacher application was not approved this time.</p>
     ${reasonHtml}
     <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 16px">You're welcome to revise your details and apply again.</p>
     <a href="${escapeHtml(data.applyUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">Go to teacher application</a>`,
  );
  const text = `${greeting}unfortunately your teacher application was not approved this time.${data.reason ? `\nReason: ${data.reason}` : ""}\nYou're welcome to revise your details and apply again.\nTeacher application: ${data.applyUrl}`;
  await sendResultEmail(to, "[Friending School] Your teacher application result", html, text);
}

/**
 * 프렌더 본인에게 자격 해제 안내. best-effort — 호출 측에서 try/catch로 감쌀 것.
 * ⚠️ 프렌더 동선은 전면 한국어라 이 메일도 한국어(강사 대상 결과 메일은 영문).
 * 프렌더 승인/거절은 SMS로 통보하지만 해제는 이메일로 보낸다.
 * reason은 빈 문자열이면 사유 블록을 렌더하지 않음(강사 거절 메일과 동일 규약).
 */
export async function sendFrienderRevokedNotification(to: string[], data: { name: string; reason: string; applyUrl: string }): Promise<void> {
  const greeting = data.name ? `${data.name}님, ` : "";
  const reasonHtml = data.reason
    ? `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 8px"><strong>사유</strong></p>
       <p style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap;background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:12px;margin:0 0 16px">${escapeHtml(data.reason)}</p>`
    : "";
  const html = buildResultHtml(
    "프렌더 자격 해제 안내",
    `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 16px">${escapeHtml(greeting)}프렌더 자격이 해제되어 일반 회원으로 전환되었습니다.</p>
     ${reasonHtml}
     <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 16px">계정과 프로필은 그대로 유지되며, 원하시면 언제든 다시 프렌더로 신청하실 수 있습니다.</p>
     <a href="${escapeHtml(data.applyUrl)}" style="display:inline-block;background:#1a4fa0;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px">프렌더 다시 신청하기</a>`,
  );
  const text = `${greeting}프렌더 자격이 해제되어 일반 회원으로 전환되었습니다.${data.reason ? `\n사유: ${data.reason}` : ""}\n계정과 프로필은 그대로 유지되며, 원하시면 언제든 다시 프렌더로 신청하실 수 있습니다.\n프렌더 신청: ${data.applyUrl}`;
  await sendResultEmail(to, "[프렌딩 스쿨] 프렌더 자격 해제 안내", html, text);
}
