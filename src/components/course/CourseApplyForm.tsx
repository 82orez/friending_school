"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ApplyGroup, type ApplyOption, isApplyGroup } from "@/data/courses";

// 과정 상세페이지 상담 신청폼. ⚠️ mock — Phase 4(applications DB) 액션 연결 전.
// ApplyForm.tsx 패턴(controlled state + setTimeout 성공 전환)을 미러링 + 과정/횟수 select 추가.
export default function CourseApplyForm({ title, options }: { title: string; options: ApplyOption[] | ApplyGroup[] }) {
  const [course, setCourse] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [schedule, setSchedule] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    console.log("[CourseApplyForm] submission:", { title, course, name, phone, email, schedule });
    setTimeout(() => {
      setPending(false);
      setSubmitted(true);
    }, 400);
  };

  if (submitted) {
    return (
      <div role="status" className="text-ink mx-auto w-full max-w-[560px] rounded-2xl bg-white p-7 text-center md:p-9">
        <CheckCircle2 className="text-cta mx-auto mb-3 h-10 w-10" />
        <p className="text-base font-extrabold md:text-lg">신청해 주셔서 감사합니다.</p>
        <p className="text-muted-fg mt-1 text-sm">입력하신 번호 {phone}로 곧 연락드릴게요.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="text-ink mx-auto w-full max-w-[560px] rounded-2xl bg-white p-7 md:p-9">
      <p className="text-ink mb-5 text-lg font-bold">{title}</p>

      <div className="mb-4 flex flex-col gap-1.5">
        <Label htmlFor="course-select">과정 선택</Label>
        <select
          id="course-select"
          name="course"
          required
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          className="border-rule-faint focus:border-accent-blue h-11 w-full rounded-md border bg-white px-3.5 text-base outline-none">
          <option value="">{isApplyGroup(options[0]) ? "과정을 선택하세요" : "수업 횟수를 선택하세요"}</option>
          {options.map((opt) =>
            isApplyGroup(opt) ? (
              <optgroup key={opt.group} label={opt.group}>
                {opt.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ),
          )}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apply-name">이름</Label>
          <Input id="apply-name" name="name" type="text" autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className="h-11" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apply-phone">전화번호</Label>
          <Input id="apply-phone" name="phone" type="tel" autoComplete="tel" required pattern="[0-9\-\s]+" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" className="h-11" />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="apply-email">
            이메일 <span className="text-muted-fg text-xs font-normal">(선택)</span>
          </Label>
          <Input id="apply-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11" />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="apply-schedule">희망 날짜/시간</Label>
          <Textarea id="apply-schedule" name="schedule" required rows={4} value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="희망 날짜/시간 등을 알려 주세요." className="min-h-[90px]" />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-cta mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-base font-bold tracking-wide text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "신청 중" : "상담 신청하기"}
      </button>
    </form>
  );
}
