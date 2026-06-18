"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Camera, Loader2, UserRound, Video } from "lucide-react";
import { toast } from "sonner";
import { cleanupOldAvatars, uploadAvatar } from "@/lib/avatar";
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

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

// /teacher/apply 페이지의 강사 지원 양식. 강사 프로필(/teacher)과 동일 필드.
// useActionState + submitTeacherApplication. 제출 전 AlertDialog 확인 → requestSubmit. controlled inputs.
// 거절 후 재신청 시 이전 지원서 값(initialBio/Experience/ZoomUrl 등)으로 프리필 — 재입력 부담 방지.
export default function TeacherApplicationForm({
  userId,
  initialFirstName,
  initialLastName,
  initialPhone,
  initialAvatarUrl,
  initialBio = "",
  initialExperience = "",
  initialZoomUrl = "",
}: {
  userId: string;
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string;
  initialAvatarUrl: string;
  initialBio?: string;
  initialExperience?: string;
  initialZoomUrl?: string;
}) {
  const [state, formAction, pending] = useActionState<TeacherApplyState, FormData>(submitTeacherApplication, {});
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phone, setPhone] = useState(initialPhone);
  const [bio, setBio] = useState(initialBio);
  const [experience, setExperience] = useState(initialExperience);
  const [zoomUrl, setZoomUrl] = useState(initialZoomUrl);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 프로필 사진 — 브라우저에서 본인 폴더로 즉시 업로드, publicUrl을 hidden 필드로 제출.
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success) toast.success("Your teacher application has been submitted.");
    else if (state.error) toast.error(state.error);
  }, [state]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files can be uploaded.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image must be 5MB or smaller.");
      return;
    }
    const prev = avatarUrl;
    startUpload(async () => {
      try {
        const { publicUrl, path } = await uploadAvatar(file, userId);
        setAvatarUrl(publicUrl);
        // 제출 전이라 업로드 직후 이전 파일 정리(best-effort).
        await cleanupOldAvatars(userId, path);
        toast.success("Photo uploaded.");
      } catch {
        setAvatarUrl(prev);
        toast.error("Image upload failed. Please try again.");
      }
    });
  };

  const handleReview = () => {
    const form = formRef.current;
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    // 아바타는 hidden 필드라 native 검증이 안 됨 → 수동 확인.
    if (!avatarUrl) {
      toast.error("Please upload a profile photo.");
      return;
    }
    setConfirmOpen(true);
  };

  // 리뷰 다이얼로그의 Apply → 비가역 최종 확인창을 한 번 더 띄움.
  const handleFinalConfirm = () => {
    setFinalOpen(false);
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

      {/* 제출 시 함께 저장되는 아바타 publicUrl */}
      <input type="hidden" name="avatar_url" value={avatarUrl} />

      {/* 프로필 사진 */}
      <div className="grid gap-1.5">
        <Label>
          Profile photo <span className="text-brand">*</span>
        </Label>
        <div className="flex items-center gap-4">
          <div className="bg-surface border-rule relative size-20 shrink-0 overflow-hidden rounded-2xl border">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="Profile photo" fill sizes="80px" className="object-cover" />
            ) : (
              <span className="text-muted-fg-faint flex h-full items-center justify-center">
                <UserRound className="size-8" aria-hidden />
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <Loader2 className="size-5 animate-spin" aria-hidden />
              </span>
            )}
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" aria-hidden />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
              Change Photo
            </Button>
            <p className="text-muted-fg-faint mt-2 text-xs">JPG or PNG, up to 5MB. Square images recommended.</p>
          </div>
        </div>
      </div>

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
        <Label htmlFor="ta-bio">
          About / Bio <span className="text-brand">*</span>
        </Label>
        <Textarea
          id="ta-bio"
          name="bio"
          required
          minLength={10}
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Share your experience, teaching style, and anything students should know. (at least 10 characters)"
          className="min-h-[100px]"
          maxLength={2000}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ta-experience">
          Teaching &amp; related experience <span className="text-brand">*</span>
        </Label>
        <Textarea
          id="ta-experience"
          name="experience"
          required
          rows={3}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          placeholder="Teaching experience, certifications, relevant background, etc."
          className="min-h-[80px]"
          maxLength={2000}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ta-zoom-url" className="flex items-center gap-1.5">
          <Video className="text-accent-blue-ink size-4" aria-hidden /> Zoom URL <span className="text-brand">*</span>
        </Label>
        <Input
          id="ta-zoom-url"
          name="zoom_url"
          type="url"
          required
          value={zoomUrl}
          onChange={(e) => setZoomUrl(e.target.value)}
          placeholder="https://zoom.us/j/..."
          maxLength={500}
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
        <AlertDialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85vh] sm:max-w-2xl! lg:max-w-4xl!">
          <AlertDialogHeader>
            <AlertDialogTitle>Review your application</AlertDialogTitle>
            <AlertDialogDescription>Please review your details below before submitting.</AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="border-rule text-ink divide-rule divide-y overflow-y-auto rounded-lg border text-left text-sm">
            {[
              ["First name", firstName],
              ["Last name", lastName],
              ["Phone", phone || "(not provided)"],
              ["Bio", bio],
              ["Experience", experience],
              ["Zoom URL", zoomUrl],
              ["Photo", "Uploaded"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 px-3.5 py-2.5">
                <dt className="text-muted-fg w-28 shrink-0 sm:w-36">{label}</dt>
                <dd className="min-w-0 flex-1 font-medium break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          <AlertDialogFooter>
            <AlertDialogCancel>Review again</AlertDialogCancel>
            <AlertDialogAction onClick={() => setFinalOpen(true)} variant="brand">
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 최종 확인 — 제출 비가역 경고 */}
      <AlertDialog open={finalOpen} onOpenChange={setFinalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your application?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit? Once submitted, your application cannot be edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalConfirm} variant="brand">
              Yes, submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
