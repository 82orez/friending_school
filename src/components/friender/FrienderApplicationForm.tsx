"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, UserRound, Video } from "lucide-react";
import { toast } from "sonner";
import { cleanupOldAvatars, uploadAvatar } from "@/lib/avatar";
import { NATIONALITIES, nationalityLabel } from "@/data/nationalities";
import { GENDERS, genderLabelKo } from "@/data/genders";
import { formatPhone } from "@/lib/phone";
import { submitFrienderApplication, type FrienderApplyState } from "@/app/friender/apply-actions";
import PhoneVerifyField from "@/components/mypage/PhoneVerifyField";
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

// /friender/apply 페이지의 프렌더 지원 양식(한국어 UI).
// 강사 지원폼(TeacherApplicationForm)과 동일한 흐름이나 ①전화번호 SMS 인증 필수 ②센터 없음
// ③학력/경력 대신 "회원들에게 자신을 소개하기"(intro) 1개 ④Zoom URL 필수.
// useActionState + submitFrienderApplication. 제출 전 2단계 AlertDialog 확인. controlled inputs.
// 거절 후 재신청 시 이전 지원서 값으로 프리필 — 재입력 부담 방지.
export default function FrienderApplicationForm({
  userId,
  initialFirstName,
  initialLastName,
  initialPhone,
  initialPhoneVerified,
  initialAvatarUrl,
  initialNationality = "",
  initialGender = "",
  initialIntro = "",
  initialZoomUrl = "",
}: {
  userId: string;
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string;
  initialPhoneVerified: boolean;
  initialAvatarUrl: string;
  initialNationality?: string;
  initialGender?: string;
  initialIntro?: string;
  initialZoomUrl?: string;
}) {
  const [state, formAction, pending] = useActionState<FrienderApplyState, FormData>(submitFrienderApplication, {});
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [nationality, setNationality] = useState(initialNationality);
  const [gender, setGender] = useState(initialGender);
  const [intro, setIntro] = useState(initialIntro);
  const [zoomUrl, setZoomUrl] = useState(initialZoomUrl);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 전화번호 인증 상태 — PhoneVerifyField가 onVerifiedChange로 끌어올림(제출 게이팅).
  // 번호 자체는 서버가 profiles의 인증 값을 쓰므로 폼으로 보내지 않고 확인 다이얼로그 표시용으로만 보관.
  // 인증 성공 시 PhoneVerifyField가 router.refresh()를 호출 → initialPhone prop이 갱신되면 여기서 동기화.
  const [phoneVerified, setPhoneVerified] = useState(initialPhoneVerified && !!initialPhone);
  const [phone, setPhone] = useState(initialPhone);
  useEffect(() => {
    if (initialPhone) setPhone(initialPhone);
  }, [initialPhone]);

  // 프로필 사진 — 선택 시엔 미리보기만, 실제 업로드는 최종 제출 시점에.
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialAvatarUrl || null);
  // 재신청 시 이미 저장돼 있던 URL — 새 파일을 고르지 않으면 이 값을 그대로 제출.
  const [savedAvatarUrl] = useState(initialAvatarUrl);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 실패만 여기서 토스트 — 제출 성공 시엔 액션이 리다이렉트하고 이 폼이 언마운트되므로
  // 성공 토스트는 페이지의 ToastOnMount가 담당한다.
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  // objectURL 미리보기 메모리 정리 — 값이 바뀌거나 언마운트될 때 revoke.
  useEffect(() => {
    if (!avatarPreview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("이미지는 5MB 이하만 등록할 수 있습니다.");
      return;
    }
    // 업로드하지 않고 로컬 미리보기만 — 실제 업로드는 제출 시.
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleReview = () => {
    const form = formRef.current;
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    // 전화 인증·아바타는 폼 필드가 아니라 별도 상태 → 수동 확인.
    if (!phoneVerified) {
      toast.error("전화번호 인증을 완료해 주세요.");
      return;
    }
    if (!avatarFile && !savedAvatarUrl) {
      toast.error("프로필 사진을 등록해 주세요.");
      return;
    }
    setConfirmOpen(true);
  };

  // 리뷰 → 최종 확인 → 이 시점에 이미지 업로드 후 텍스트와 함께 제출(액션 dispatch).
  const handleFinalConfirm = async () => {
    setFinalOpen(false);
    setConfirmOpen(false);
    const form = formRef.current;
    if (!form) return;
    setSubmitting(true);
    try {
      let url = savedAvatarUrl;
      if (avatarFile) {
        const { publicUrl, path } = await uploadAvatar(avatarFile, userId);
        await cleanupOldAvatars(userId, path); // best-effort
        url = publicUrl;
      }
      if (!url) {
        toast.error("프로필 사진을 등록해 주세요.");
        return;
      }
      const fd = new FormData(form);
      fd.set("avatar_url", url);
      // useActionState의 dispatch는 transition 안에서 호출해야 함(await 뒤라 자동 transition 밖).
      startTransition(() => formAction(fd));
    } catch {
      toast.error("이미지 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleReview();
      }}
      className="grid gap-4">
      {state.error && (
        <p role="alert" className="border-brand/30 bg-brand/5 text-brand rounded-md border px-3.5 py-2.5 text-sm font-medium">
          {state.error}
        </p>
      )}

      {/* 프로필 사진 */}
      <div className="grid gap-1.5">
        <Label>
          프로필 사진 <span className="text-brand">*</span>
        </Label>
        <div className="flex items-center gap-4">
          <div className="bg-surface border-rule relative size-20 shrink-0 overflow-hidden rounded-2xl border">
            {avatarPreview ? (
              <Image src={avatarPreview} alt="프로필 사진" fill sizes="80px" unoptimized className="object-cover" />
            ) : (
              <span className="text-muted-fg-faint flex h-full items-center justify-center">
                <UserRound className="size-8" aria-hidden />
              </span>
            )}
            {submitting && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <Loader2 className="size-5 animate-spin" aria-hidden />
              </span>
            )}
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" aria-hidden />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={submitting || pending}>
              <Camera className="size-4" aria-hidden />
              사진 변경
            </Button>
            <p className="text-muted-fg-faint mt-2 text-xs">JPG 또는 PNG, 5MB 이하. 정사각형 이미지를 권장합니다.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="fa-last-name">
            성 <span className="text-brand">*</span>
          </Label>
          <Input
            id="fa-last-name"
            name="last_name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="홍"
            maxLength={40}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fa-first-name">
            이름 <span className="text-brand">*</span>
          </Label>
          <Input
            id="fa-first-name"
            name="first_name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="길동"
            maxLength={40}
          />
        </div>
      </div>

      {/* 전화번호 — SMS 인증 필수. PhoneVerifyField는 name 없는 입력 + type="button"이라 폼 제출에 개입하지 않음. */}
      <div className="border-rule rounded-xl border p-4">
        <PhoneVerifyField initialPhone={initialPhone} initialVerified={initialPhoneVerified} onVerifiedChange={setPhoneVerified} />
        {!phoneVerified && <p className="text-muted-fg-faint mt-2 text-xs">프렌더 신청을 위해 전화번호 인증이 필요합니다.</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="fa-nationality">
          국적 <span className="text-brand">*</span>
        </Label>
        <select
          id="fa-nationality"
          name="nationality"
          required
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          aria-invalid={!!state.error && !nationality}
          className="border-rule-faint focus:border-accent-blue h-11 w-full rounded-md border bg-white px-3.5 text-base outline-none">
          <option value="">국적을 선택해 주세요</option>
          {NATIONALITIES.map((n) => (
            <option key={n.name} value={n.name}>
              {n.flag} {n.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="fa-gender">
          성별 <span className="text-brand">*</span>
        </Label>
        <select
          id="fa-gender"
          name="gender"
          required
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          aria-invalid={!!state.error && !gender}
          className="border-rule-faint focus:border-accent-blue h-11 w-full rounded-md border bg-white px-3.5 text-base outline-none">
          <option value="">성별을 선택해 주세요</option>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.ko}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="fa-intro">
          회원들에게 자신을 소개하기 <span className="text-brand">*</span>
        </Label>
        <Textarea
          id="fa-intro"
          name="intro"
          required
          minLength={10}
          rows={5}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder="회원들에게 보여질 소개글입니다. 어떤 사람인지, 어떤 이야기를 나눌 수 있는지 자유롭게 적어 주세요. (10자 이상)"
          className="min-h-[120px]"
          maxLength={2000}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="fa-zoom-url" className="flex items-center gap-1.5">
          <Video className="text-accent-blue-ink size-4" aria-hidden /> Zoom URL <span className="text-brand">*</span>
        </Label>
        <Input
          id="fa-zoom-url"
          name="zoom_url"
          type="url"
          required
          value={zoomUrl}
          onChange={(e) => setZoomUrl(e.target.value)}
          placeholder="https://zoom.us/j/..."
          maxLength={500}
        />
        <p className="text-muted-fg-faint text-xs">회원들과 zoom으로 소통하기 때문에 개인 zoom 주소가 필요합니다.</p>
      </div>

      <div>
        <Button type="button" variant="brand" onClick={handleReview} disabled={pending || submitting || !phoneVerified}>
          {pending || submitting ? (
            <>
              <Loader2 className="animate-spin" />
              제출 중
            </>
          ) : (
            "프렌더 신청하기"
          )}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl! lg:max-w-4xl!">
          <AlertDialogHeader>
            <AlertDialogTitle>신청 내용 확인</AlertDialogTitle>
            <AlertDialogDescription>제출 전에 아래 내용을 확인해 주세요.</AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="border-rule text-ink divide-rule divide-y overflow-y-auto rounded-lg border text-left text-sm">
            {/* 프로필 이미지 — 다른 항목과 동일한 라벨 행으로(최상단) */}
            <div className="flex gap-3 px-3.5 py-2.5">
              <dt className="text-muted-fg w-28 shrink-0 sm:w-36">프로필 사진</dt>
              <dd className="min-w-0 flex-1">
                <div className="bg-surface border-rule relative size-20 overflow-hidden rounded-2xl border">
                  {avatarPreview ? (
                    <Image src={avatarPreview} alt="프로필 사진" fill sizes="80px" unoptimized className="object-cover" />
                  ) : (
                    <span className="text-muted-fg-faint flex h-full items-center justify-center">
                      <UserRound className="size-8" aria-hidden />
                    </span>
                  )}
                </div>
              </dd>
            </div>
            {[
              ["성", lastName],
              ["이름", firstName],
              ["전화번호", phone ? formatPhone(phone) : "-"],
              ["국적", nationalityLabel(nationality)],
              ["성별", genderLabelKo(gender)],
              ["자기소개", intro],
              ["Zoom URL", zoomUrl],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 px-3.5 py-2.5">
                <dt className="text-muted-fg w-28 shrink-0 sm:w-36">{label}</dt>
                <dd className="min-w-0 flex-1 font-medium break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          <AlertDialogFooter>
            <AlertDialogCancel>다시 확인</AlertDialogCancel>
            <AlertDialogAction onClick={() => setFinalOpen(true)} variant="brand">
              신청하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 최종 확인 — 제출 비가역 경고 */}
      <AlertDialog open={finalOpen} onOpenChange={setFinalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>신청서를 제출할까요?</AlertDialogTitle>
            <AlertDialogDescription>제출한 신청서는 수정할 수 없습니다. 그대로 제출하시겠어요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalConfirm} variant="brand">
              네, 제출합니다
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
