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
export default function TeacherApplicationForm({
  initialFirstName,
  initialLastName,
  initialPhone,
}: {
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string;
}) {
  const [state, formAction, pending] = useActionState<TeacherApplyState, FormData>(submitTeacherApplication, {});
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phone, setPhone] = useState(initialPhone);
  const [intro, setIntro] = useState("");
  const [experience, setExperience] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) toast.success("Your teacher application has been submitted.");
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
          <Label htmlFor="ta-first-name">
            First name <span className="text-brand">*</span>
          </Label>
          <Input
            id="ta-first-name"
            name="first_name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="John"
            maxLength={40}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ta-last-name">
            Last name <span className="text-brand">*</span>
          </Label>
          <Input
            id="ta-last-name"
            name="last_name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
            maxLength={40}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ta-phone">
          Phone <span className="text-muted-fg-faint font-normal">(optional)</span>
        </Label>
        <Input
          id="ta-phone"
          name="phone"
          type="tel"
          pattern="[0-9\-\s]+"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-1234-5678"
          maxLength={30}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ta-intro">
          About &amp; motivation <span className="text-brand">*</span>
        </Label>
        <Textarea
          id="ta-intro"
          name="intro"
          required
          minLength={10}
          rows={4}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder="Tell us about yourself and why you'd like to teach. (at least 10 characters)"
          className="min-h-[100px]"
          maxLength={2000}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ta-experience">
          Teaching &amp; related experience <span className="text-muted-fg-faint font-normal">(optional)</span>
        </Label>
        <Textarea
          id="ta-experience"
          name="experience"
          rows={3}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          placeholder="Teaching experience, certifications, relevant background, etc."
          className="min-h-[80px]"
          maxLength={2000}
        />
      </div>

      <div>
        <Button type="button" variant="brand" onClick={handleReview} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Submitting
            </>
          ) : (
            "Apply to teach"
          )}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply with this information?</AlertDialogTitle>
            <AlertDialogDescription>Your teacher application will be submitted with the details below. Please review before continuing.</AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="border-rule text-ink divide-rule divide-y rounded-lg border text-left text-sm">
            {[
              ["First name", firstName],
              ["Last name", lastName],
              ["Phone", phone || "(not provided)"],
              ["About & motivation", intro],
              ["Experience", experience || "(not provided)"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 px-3.5 py-2.5">
                <dt className="text-muted-fg w-28 shrink-0">{label}</dt>
                <dd className="flex-1 font-medium break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          <AlertDialogFooter>
            <AlertDialogCancel>Review again</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} variant="brand">
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
