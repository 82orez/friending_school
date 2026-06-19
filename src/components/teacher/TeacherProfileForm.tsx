"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Camera, Loader2, Pencil, UserRound, Video } from "lucide-react";
import { toast } from "sonner";
import { cleanupOldAvatars, uploadAvatar } from "@/lib/avatar";
import { updateTeacherAvatar, updateTeacherProfile, type TeacherActionState } from "@/app/teacher/actions";
import { NATIONALITIES } from "@/data/nationalities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type TeacherProfile = {
  first_name: string;
  last_name: string;
  avatar_url: string;
  zoom_url: string;
  bio: string;
  experience: string;
  phone: string;
  nationality: string;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

// 보기 모드(disabled)에서 값이 흐려지지 않도록 텍스트를 진하게(disabled: 변형은 편집 모드엔 미적용).
const VIEW_TEXT = "disabled:opacity-100 disabled:text-ink";

export default function TeacherProfileForm({ userId, email, initial }: { userId: string; email: string; initial: TeacherProfile }) {
  // 텍스트 폼 (useActionState)
  const [state, formAction, pending] = useActionState<TeacherActionState, FormData>(updateTeacherProfile, {});
  const [firstName, setFirstName] = useState(initial.first_name);
  const [lastName, setLastName] = useState(initial.last_name);
  const [bio, setBio] = useState(initial.bio);
  const [experience, setExperience] = useState(initial.experience);
  const [phone, setPhone] = useState(initial.phone);
  const [nationality, setNationality] = useState(initial.nationality);
  const [zoomUrl, setZoomUrl] = useState(initial.zoom_url);

  // 보기/편집 모드 — 편집 모드에서만 Teacher Info 필드 수정 가능.
  const [editing, setEditing] = useState(false);
  // 편집 진입 시점 스냅샷(Cancel 시 복원).
  const snapshotRef = useRef({ firstName, lastName, bio, experience, phone, nationality, zoomUrl });

  const startEditing = () => {
    snapshotRef.current = { firstName, lastName, bio, experience, phone, nationality, zoomUrl };
    setEditing(true);
  };

  const cancelEditing = () => {
    const s = snapshotRef.current;
    setFirstName(s.firstName);
    setLastName(s.lastName);
    setBio(s.bio);
    setExperience(s.experience);
    setPhone(s.phone);
    setNationality(s.nationality);
    setZoomUrl(s.zoomUrl);
    setEditing(false);
  };

  // 아바타 (즉시 업로드 + 저장)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [uploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 텍스트 폼 액션 결과 → 토스트. 초기 {} 상태는 ok/error 모두 falsy라 마운트 시 토스트 없음.
  useEffect(() => {
    if (state.ok) {
      toast.success("Saved.");
      setEditing(false); // 저장 성공 → 보기 모드로
    } else if (state.error) toast.error(state.error);
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

        // 낙관적 미리보기
        setAvatarUrl(publicUrl);

        const res = await updateTeacherAvatar(publicUrl);
        if (res.error) {
          setAvatarUrl(prev);
          toast.error(res.error);
        } else {
          toast.success("Photo updated.");
          // DB 반영 성공 후 이전 파일 정리(best-effort).
          await cleanupOldAvatars(userId, path);
        }
      } catch {
        setAvatarUrl(prev);
        toast.error("Image upload failed. Please try again.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* 프로필 사진 */}
      <section className="border-rule rounded-2xl border bg-white p-6">
        <h2 className="text-ink mb-4 flex items-center gap-2 text-base font-bold">
          <span aria-hidden>📷</span> Profile Photo <span className="text-brand">*</span>
        </h2>
        <div className="flex items-center gap-5">
          <div className="bg-surface border-rule relative size-24 shrink-0 overflow-hidden rounded-2xl border">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="Profile photo" fill sizes="96px" className="object-cover" />
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
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
              Change Photo
            </Button>
            <p className="text-muted-fg-faint mt-2 text-xs">JPG or PNG, up to 5MB. Square images recommended.</p>
          </div>
        </div>
      </section>

      {/* 기본 정보 폼 */}
      <form
        action={formAction}
        onSubmit={(e) => {
          // 프로필 사진은 별도 업로드(폼 외부)라 native 검증 불가 → 없으면 저장 차단.
          if (!avatarUrl) {
            e.preventDefault();
            toast.error("Please upload a profile photo.");
          }
        }}
        className="border-rule rounded-2xl border bg-white p-6"
      >
        <h2 className="text-ink mb-4 flex items-center gap-2 text-base font-bold">
          <span aria-hidden>👤</span> Teacher Info
        </h2>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input value={email} disabled readOnly className="bg-surface text-muted-fg" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="first_name">
                First Name <span className="text-brand">*</span>
              </Label>
              <Input
                id="first_name"
                name="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Jane"
                maxLength={40}
                required
                disabled={!editing}
                className={VIEW_TEXT}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="last_name">
                Last Name <span className="text-brand">*</span>
              </Label>
              <Input
                id="last_name"
                name="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Kim"
                maxLength={40}
                required
                disabled={!editing}
                className={VIEW_TEXT}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bio">
              About / Bio <span className="text-brand">*</span>
            </Label>
            <Textarea
              id="bio"
              name="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Share your experience, teaching style, and anything students should know."
              rows={5}
              maxLength={2000}
              required
              disabled={!editing}
              className={VIEW_TEXT}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="experience">
              Teaching &amp; related experience <span className="text-brand">*</span>
            </Label>
            <Textarea
              id="experience"
              name="experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="Teaching experience, certifications, relevant background, etc."
              rows={3}
              maxLength={2000}
              required
              disabled={!editing}
              className={VIEW_TEXT}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">
              Phone <span className="text-muted-fg-faint font-normal">(optional)</span>
            </Label>
            <Input
              id="phone"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 010-1234-5678"
              maxLength={30}
              disabled={!editing}
              className={VIEW_TEXT}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nationality">
              Nationality <span className="text-brand">*</span>
            </Label>
            <select
              id="nationality"
              name="nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              required
              disabled={!editing}
              className={cn(
                "border-input h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none md:text-sm",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                "disabled:text-ink disabled:opacity-100",
              )}
            >
              <option value="">Select your nationality</option>
              {NATIONALITIES.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.flag} {n.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zoom_url" className="flex items-center gap-1.5">
              <Video className="text-accent-blue-ink size-4" aria-hidden /> Zoom URL <span className="text-brand">*</span>
            </Label>
            <Input
              id="zoom_url"
              name="zoom_url"
              type="url"
              value={zoomUrl}
              onChange={(e) => setZoomUrl(e.target.value)}
              placeholder="https://zoom.us/j/..."
              maxLength={500}
              required
              disabled={!editing}
              className={VIEW_TEXT}
            />
            <p className="text-muted-fg-faint text-xs">
              Your personal Zoom link for live classes with students. Live-class integration is coming soon.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {editing ? (
            <>
              <Button type="button" variant="outline" onClick={cancelEditing} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={pending} className={cn(pending && "opacity-90")}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {pending ? "Saving" : "Save"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="brand" onClick={startEditing}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
