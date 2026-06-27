import { redirect } from "next/navigation";

// 구 '신청 관리'(상담신청 applications, 레거시)는 수강신청(enrollments)으로 대체됨.
// admin 인덱스는 수강신청 관리로 리다이렉트.
export default function AdminIndexPage() {
  redirect("/admin/enrollments");
}
