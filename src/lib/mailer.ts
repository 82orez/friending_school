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

export type ClassCancellationEmailData = {
  studentName: string;
  courseTitle: string;
  sessionDate: string; // YYYY-MM-DD (취소된 회차)
  sessionTime: string; // "09:00~09:25"
  makeupDate?: string; // YYYY-MM-DD (자동 보강 예정일)
};

/**
 * 강사에게 학생의 개별 수업 취소 + 자동 보강 알림. best-effort — 호출 측에서 try/catch로 감쌀 것.
 */
export async function sendClassCancellationToTeacher(to: string[], data: ClassCancellationEmailData): Promise<void> {
  const rows: [string, string][] = [
    ["Student", data.studentName || "-"],
    ["Course", data.courseTitle],
    ["Cancelled session", `${data.sessionDate} ${data.sessionTime}`],
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
    <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 4px">A class has been cancelled by the student</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px">${escapeHtml(data.studentName)} · ${escapeHtml(data.courseTitle)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">${tr}</table>
    <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0 0">${
      data.makeupDate ? "A makeup class has been automatically scheduled (same weekday and time). You can review it on your teacher page." : "You can review your classes on your teacher page."
    }</p>
    <p style="font-size:12px;color:#999;margin:20px 0 0">Friending School</p>
  </div>`;
  const text = [
    "A class has been cancelled by the student.",
    "",
    `Student: ${data.studentName || "-"}`,
    `Course: ${data.courseTitle}`,
    `Cancelled session: ${data.sessionDate} ${data.sessionTime}`,
    ...(data.makeupDate ? [`Makeup scheduled: ${data.makeupDate} ${data.sessionTime}`] : []),
  ].join("\n");
  await sendResultEmail(to, `[Friending School] Class cancelled · ${data.studentName}`, html, text);
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

/* ===== 관리자 대상 신규 수강신청 알림 ===== */

export type EnrollmentAdminEmailData = {
  studentName: string; // 학생 한글 이름
  studentEnglishName: string; // 학생 영문 이름
  courseTitle: string; // 과정 한글명
  courseEnglishTitle: string; // 과정 영문명
  teacherName: string; // 강사명
  schedule: string; // 주간 일정 요약(한국어 요일)
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD, 마지막(N회째) 수업일
  totalSessions: number; // 총 수업 횟수
  adminUrl: string; // 관리자 수강신청 관리 링크
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
