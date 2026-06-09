"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { submitApplication, type ApplyState } from "@/app/courses/actions";
import { type ApplyGroup, type ApplyOption, isApplyGroup } from "@/data/courses";

// 과정 상세페이지 상담 신청폼. useActionState + submitApplication 서버 액션으로 실제 저장.
// 제출 전 입력 내용 확인 다이얼로그(AlertDialog) 노출 → 확인 시 requestSubmit으로 진행.
// 입력은 controlled(React 19 auto-reset & Base UI defaultValue 경고 회피).
export default function CourseApplyForm({ courseSlug, title, options }: { courseSlug: string; title: string; options: ApplyOption[] | ApplyGroup[] }) {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(submitApplication, {});
  const [option, setOption] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [schedule, setSchedule] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 제출 버튼 → 브라우저 기본 검증 통과 시 확인 다이얼로그 노출.
  const handleReview = () => {
    const form = formRef.current;
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setConfirmOpen(true);
  };

  // 확인 → 다이얼로그 닫고 실제 폼 제출(서버 액션 호출).
  const handleConfirm = () => {
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  };

  if (state.success) {
    return (
      <div role="status" className="text-ink mx-auto w-full max-w-[560px] rounded-2xl bg-white p-7 text-center md:p-9">
        <CheckCircle2 className="text-cta mx-auto mb-3 h-10 w-10" />
        <p className="text-base font-extrabold md:text-lg">신청해 주셔서 감사합니다.</p>
        <p className="text-muted-fg mt-1 text-sm">입력하신 번호 {phone}로 곧 연락드릴게요.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} aria-describedby={state.error ? "apply-error" : undefined} className="text-ink mx-auto w-full max-w-[560px] rounded-2xl bg-white p-7 md:p-9">
      <p className="text-ink mb-5 text-lg font-bold">{title}</p>
      <input type="hidden" name="courseSlug" value={courseSlug} />

      {state.error && (
        <p id="apply-error" role="alert" className="border-brand/30 bg-brand/5 text-brand mb-4 rounded-md border px-3.5 py-2.5 text-sm font-medium">
          {state.error}
        </p>
      )}

      <div className="mb-4 flex flex-col gap-1.5">
        <Label htmlFor="course-option">과정 선택</Label>
        <select
          id="course-option"
          name="option"
          required
          value={option}
          onChange={(e) => setOption(e.target.value)}
          aria-invalid={!!state.error && !option}
          className="border-rule-faint focus:border-accent-blue h-11 w-full rounded-md border bg-white px-3.5 text-base outline-none">
          <option value="">{isApplyGroup(options[0]) ? "과정을 선택하세요" : "수업 횟수를 선택하세요"}</option>
          {options.map((opt) =>
            isApplyGroup(opt) ? (
              <optgroup key={opt.group} label={opt.group}>
                {opt.options.map((o) => (
                  <option key={o.value} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={opt.value} value={opt.label}>
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
        type="button"
        onClick={handleReview}
        disabled={pending}
        className="bg-cta mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-base font-bold tracking-wide text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "신청 중" : "상담 신청하기"}
      </button>

      {/* 제출 전 입력 내용 확인 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>입력하신 내용이 맞나요?</AlertDialogTitle>
            <AlertDialogDescription>아래 내용으로 상담을 신청합니다. 확인 후 진행해 주세요.</AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="border-rule text-ink divide-rule divide-y rounded-lg border text-left text-sm">
            {[
              ["과정", option],
              ["이름", name],
              ["전화번호", phone],
              ["이메일", email || "(미입력)"],
              ["희망 날짜/시간", schedule],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 px-3.5 py-2.5">
                <dt className="text-muted-fg w-24 shrink-0">{label}</dt>
                <dd className="flex-1 font-medium break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          <AlertDialogFooter>
            {/* base-nova: AlertDialogCancel은 자동 닫힘, AlertDialogAction은 수동 → handleConfirm에서 close */}
            <AlertDialogCancel>다시 확인</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              신청하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
