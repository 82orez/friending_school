"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Camera, Loader2, UserRound, Video } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { updateTeacherAvatar, updateTeacherProfile, type TeacherActionState } from "@/app/teacher/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type TeacherProfile = {
  full_name: string;
  avatar_url: string;
  zoom_url: string;
  bio: string;
  headline: string;
  phone: string;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

export default function TeacherProfileForm({ userId, email, initial }: { userId: string; email: string; initial: TeacherProfile }) {
  // 텍스트 폼 (useActionState)
  const [state, formAction, pending] = useActionState<TeacherActionState, FormData>(updateTeacherProfile, {});
  const [fullName, setFullName] = useState(initial.full_name);
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [phone, setPhone] = useState(initial.phone);
  const [zoomUrl, setZoomUrl] = useState(initial.zoom_url);

  // 아바타 (즉시 업로드 + 저장)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 저장 성공 시 잠깐 노출되는 배너 자동 정리는 하지 않음(명시적 상태 유지).
  useEffect(() => {
    if (state.ok) setAvatarError(null);
  }, [state.ok]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setAvatarError(null);

    if (!file.type.startsWith("image/")) {
      setAvatarError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("이미지 용량은 5MB 이하여야 합니다.");
      return;
    }

    const prev = avatarUrl;
    startUpload(async () => {
      try {
        const supabase = createClient();
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${userId}/avatar-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(path);

        // 낙관적 미리보기
        setAvatarUrl(publicUrl);

        const res = await updateTeacherAvatar(publicUrl);
        if (res.error) {
          setAvatarUrl(prev);
          setAvatarError(res.error);
        }
      } catch {
        setAvatarUrl(prev);
        setAvatarError("이미지 업로드에 실패했습니다. 다시 시도해 주세요.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* 프로필 사진 */}
      <section className="border-rule rounded-2xl border bg-white p-6">
        <h2 className="text-ink mb-4 flex items-center gap-2 text-base font-bold">
          <span aria-hidden>📷</span> 프로필 사진
        </h2>
        <div className="flex items-center gap-5">
          <div className="bg-surface border-rule relative size-24 shrink-0 overflow-hidden rounded-full border">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="프로필 사진" fill sizes="96px" className="object-cover" />
            ) : (
              <span className="text-muted-fg-faint flex h-full items-center justify-center">
                <UserRound className="size-10" aria-hidden />
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <Loader2 className="size-6 animate-spin" aria-hidden />
              </span>
            )}
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" aria-hidden />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Camera className="size-4" aria-hidden />
              )}
              사진 변경
            </Button>
            <p className="text-muted-fg-faint mt-2 text-xs">JPG·PNG, 5MB 이하. 정사각형 이미지를 권장합니다.</p>
            {avatarError && (
              <p role="alert" className="text-brand mt-2 text-xs font-medium">
                {avatarError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 기본 정보 폼 */}
      <form action={formAction} className="border-rule rounded-2xl border bg-white p-6">
        <h2 className="text-ink mb-4 flex items-center gap-2 text-base font-bold">
          <span aria-hidden>👤</span> 강사 정보
        </h2>

        {state.error && (
          <p role="alert" className="border-brand/30 bg-brand/5 text-brand mb-4 rounded-lg border px-4 py-2.5 text-sm font-medium">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="mb-4 rounded-lg border border-[#0F6E56]/30 bg-[#E1F5EE] px-4 py-2.5 text-sm font-medium text-[#0F6E56]">
            저장되었습니다.
          </p>
        )}

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>이메일</Label>
            <Input value={email} disabled readOnly className="bg-surface text-muted-fg" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="full_name">표시 이름 (강사명)</Label>
            <Input id="full_name" name="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="예: 김프렌딩" maxLength={60} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="headline">담당 분야 (한줄 소개)</Label>
            <Input
              id="headline"
              name="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="예: 워홀·주방 영어 전담 강사"
              maxLength={100}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bio">강사 소개</Label>
            <Textarea
              id="bio"
              name="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="경력, 강의 스타일 등 학생에게 보여줄 소개를 작성해 주세요."
              rows={5}
              maxLength={2000}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">연락처</Label>
            <Input id="phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="예: 010-1234-5678" maxLength={30} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zoom_url" className="flex items-center gap-1.5">
              <Video className="text-accent-blue-ink size-4" aria-hidden /> Zoom URL
            </Label>
            <Input
              id="zoom_url"
              name="zoom_url"
              type="url"
              value={zoomUrl}
              onChange={(e) => setZoomUrl(e.target.value)}
              placeholder="https://zoom.us/j/..."
              maxLength={500}
            />
            <p className="text-muted-fg-faint text-xs">학생과 화상수업에 사용할 본인 Zoom 링크. 화상수업 연동 기능은 추후 제공될 예정입니다.</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="submit" variant="brand" disabled={pending} className={cn(pending && "opacity-90")}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "저장 중" : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}
