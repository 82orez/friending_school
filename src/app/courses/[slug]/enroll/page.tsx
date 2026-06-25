import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCourse } from "@/data/courses";
import { loadEnrollTeachers } from "@/app/courses/enroll-actions";
import EnrollWizard from "@/components/course/EnrollWizard";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = getCourse(slug);
  return { title: course ? `${course.title} 수강신청 — 프렌딩 스쿨` : "수강신청 — 프렌딩 스쿨" };
}

export default async function EnrollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/courses/${slug}/enroll`);

  // 휴대폰 인증 + 영문 이름 가드. 휴대폰: 결과 SMS 발송에 필요 / 영문 이름: 수강신청 필수.
  const { data: profile } = await supabase.from("profiles").select("phone_verified_at, english_name").eq("id", user.id).maybeSingle();
  const phoneVerified = !!profile?.phone_verified_at;
  const englishNameSet = !!profile?.english_name;
  const ready = phoneVerified && englishNameSet;

  // 전체 강사(공개 안전 필드 + 슬롯) 미리 로드 → 위저드가 클라에서 라이브 필터.
  const teachers = ready ? await loadEnrollTeachers(user.id) : [];

  return (
    <div className="bg-surface min-h-screen">
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">수강신청</span>
        <h1 className="text-ink mt-4 text-2xl font-bold tracking-tight md:text-3xl">{course.title}</h1>
      </div>

      <div className="px-5 pb-16">
        {ready ? (
          <EnrollWizard courseSlug={course.slug} courseTitle={course.title} coursePrice={course.price} teachers={teachers} />
        ) : !phoneVerified ? (
          <div className="border-brand/30 bg-brand/5 mx-auto max-w-[560px] rounded-2xl border p-8 text-center">
            <h2 className="text-ink text-lg font-bold">휴대폰 인증이 필요해요</h2>
            <p className="text-muted-fg mt-3 text-sm leading-relaxed">
              수강신청 결과를 문자(SMS)로 안내드리기 위해 휴대폰 인증이 필요합니다.
              <br />
              마이페이지에서 인증을 완료한 뒤 다시 신청해 주세요.
            </p>
            <Link
              href="/mypage"
              className="bg-cta mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90">
              마이페이지에서 인증하기
            </Link>
          </div>
        ) : (
          <div className="border-brand/30 bg-brand/5 mx-auto max-w-[560px] rounded-2xl border p-8 text-center">
            <h2 className="text-ink text-lg font-bold">영문 이름 등록이 필요해요</h2>
            <p className="text-muted-fg mt-3 text-sm leading-relaxed">
              수강신청을 위해 영문 이름 등록이 필요합니다.
              <br />
              마이페이지에서 영문 이름을 등록한 뒤 다시 신청해 주세요.
            </p>
            <Link
              href="/mypage"
              className="bg-cta mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90">
              마이페이지에서 등록하기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
