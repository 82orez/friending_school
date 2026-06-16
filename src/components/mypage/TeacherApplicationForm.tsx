"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { submitTeacherApplication, type TeacherApplyState } from "@/app/teacher/apply-actions";
import { Button } from "@/components/ui/button";
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

// /mypage "강사 지원" 섹션의 상세 지원 양식. useActionState + submitTeacherApplication.
// 제출 전 AlertDialog 확인 → requestSubmit (CourseApplyForm 패턴). controlled inputs.
export default function TeacherApplicationForm({ initialName, initialPhone }: { initialName: string; initialPhone: string }) {
  const [state, formAction, pending] = useActionState<TeacherApplyState, FormData>(submitTeacherApplication, {});
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [headline, setHeadline] = useState("");
  const [intro, setIntro] = useState("");
  const [experience, setExperience] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) toast.success("강사 지원이 접수되었습니다.");
    else if (state.error) toast.error(state.error);
  }, [state]);

  const handleReview = () => {
    const form = formRef.current;
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  };

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      {state.error && (
        <p role="alert" className="border-brand/30 bg-brand/5 text-brand rounded-md border px-3.5 py-2.5 text-sm font-medium">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ta-name">
            이름 <span className="text-brand">*</span>
          </Label>
          <Input
            id="ta-name"
            name="name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            maxLength={40}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ta-phone">
            전화번호 <span className="text-brand">*</span>
          </Label>
          <Input
            id="ta-phone"
            name="phone"
            type="tel"
            required
            pattern="[0-9\-\s]+"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
            maxLength={30}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ta-headline">
          한 줄 소개 <span className="text-muted-fg-faint font-normal">(선택)</span>
        </Label>
        <Input
          id="ta-headline"
          name="headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="예: 호주 워홀 5년차 영어 튜터"
          maxLength={120}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ta-intro">
          자기소개 · 지원 동기 <span className="text-brand">*</span>
        </Label>
        <Textarea
          id="ta-intro"
          name="intro"
          required
          minLength={10}
          rows={4}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder="강사로 지원하는 동기와 본인 소개를 자유롭게 적어 주세요. (10자 이상)"
          className="min-h-[100px]"
          maxLength={2000}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ta-experience">
          강의 · 관련 경력 <span className="text-muted-fg-faint font-normal">(선택)</span>
        </Label>
        <Textarea
          id="ta-experience"
          name="experience"
          rows={3}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          placeholder="강의 경력, 자격증, 관련 경험 등을 적어 주세요."
          className="min-h-[80px]"
          maxLength={2000}
        />
      </div>

      <div>
        <Button type="button" variant="brand" onClick={handleReview} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              제출 중
            </>
          ) : (
            "강사 지원하기"
          )}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>입력하신 내용으로 지원할까요?</AlertDialogTitle>
            <AlertDialogDescription>아래 내용으로 강사 지원을 접수합니다. 확인 후 진행해 주세요.</AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="border-rule text-ink divide-rule divide-y rounded-lg border text-left text-sm">
            {[
              ["이름", name],
              ["전화번호", phone],
              ["한 줄 소개", headline || "(미입력)"],
              ["자기소개·지원 동기", intro],
              ["경력", experience || "(미입력)"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 px-3.5 py-2.5">
                <dt className="text-muted-fg w-28 shrink-0">{label}</dt>
                <dd className="flex-1 font-medium break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          <AlertDialogFooter>
            <AlertDialogCancel>다시 확인</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} variant="brand">
              지원하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
