"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Camera, Loader2, Pencil, UserRound, Video } from "lucide-react";
import { toast } from "sonner";
import { cleanupOldAvatars, uploadAvatar } from "@/lib/avatar";
import { updateFrienderAvatar, updateFrienderProfile, type FrienderActionState } from "@/app/friender/actions";
import { NATIONALITIES } from "@/data/nationalities";
import { GENDERS } from "@/data/genders";
import { formatPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type FrienderProfile = {
  first_name: string;
  last_name: string;
  nickname: string;
  avatar_url: string;
  zoom_url: string;
  bio: string;
  phone: string;
  nationality: string;
  gender: string;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

// 보기 모드(disabled)에서 값이 흐려지지 않도록 텍스트를 진하게 + 커서는 일반(default) 유지.
const VIEW_TEXT = "disabled:opacity-100 disabled:text-ink disabled:cursor-default disabled:bg-transparent";

// 영구 잠금 필드(프렌더 수정 불가: 이름·전화·국적·성별·이메일 — 닉네임은 편집 가능) — **편집 모드에서만** not-allowed 커서로 표시.
// Input 기본의 disabled:pointer-events-none가 hover 자체를 막으므로 auto로 되돌린 뒤 not-allowed 적용.
const LOCKED = "disabled:pointer-events-auto disabled:cursor-not-allowed";

// 프렌더 프로필 — 편집 가능한 항목은 닉네임(선택)·자기소개(bio)·Zoom URL 3개.
// 나머지(이름·전화·국적·성별)는 승인 시 확정되며 변경은 관리자만 가능.
export default function FrienderProfileForm({ userId, email, initial }: { userId: string; email: string; initial: FrienderProfile }) {
  const [state, formAction, pending] = useActionState<FrienderActionState, FormData>(updateFrienderProfile, {});
  const [nickname, setNickname] = useState(initial.nickname);
  const [bio, setBio] = useState(initial.bio);
  const [zoomUrl, setZoomUrl] = useState(initial.zoom_url);

  // 보기/편집 모드 — 편집 모드에서만 수정 가능(실수 저장 방지).
  const [editing, setEditing] = useState(false);
  const snapshotRef = useRef({ nickname, bio, zoomUrl });

  const startEditing = () => {
    snapshotRef.current = { nickname, bio, zoomUrl };
    setEditing(true);
  };

  const cancelEditing = () => {
    const s = snapshotRef.current;
    setNickname(s.nickname);
    setBio(s.bio);
    setZoomUrl(s.zoomUrl);
    setEditing(false);
  };

  // 아바타 (즉시 업로드 + 저장)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [uploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("저장했습니다.");
      setEditing(false);
    } else if (state.error) toast.error(state.error);
  }, [state]);

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

    const prev = avatarUrl;
    startUpload(async () => {
      try {
        const { publicUrl, path } = await uploadAvatar(file, userId);

        // 낙관적 미리보기
        setAvatarUrl(publicUrl);

        const res = await updateFrienderAvatar(publicUrl);
        if (res.error) {
          setAvatarUrl(prev);
          toast.error(res.error);
        } else {
          toast.success("사진을 변경했습니다.");
          // DB 반영 성공 후 이전 파일 정리(best-effort).
          await cleanupOldAvatars(userId, path);
        }
      } catch {
        setAvatarUrl(prev);
        toast.error("이미지 업로드에 실패했습니다. 다시 시도해 주세요.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* 프로필 사진 */}
      <section className="border-rule rounded-2xl border bg-white p-6">
        <h2 className="text-ink mb-4 flex items-center gap-2 text-base font-bold">
          <span aria-hidden>📷</span> 프로필 사진 {editing && <span className="text-brand">*</span>}
        </h2>
        <div className="flex items-center gap-5">
          <div className="bg-surface border-rule relative size-24 shrink-0 overflow-hidden rounded-2xl border">
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
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
              사진 변경
            </Button>
            <p className="text-muted-fg-faint mt-2 text-xs">JPG 또는 PNG, 5MB 이하. 정사각형 이미지를 권장합니다.</p>
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
            toast.error("프로필 사진을 등록해 주세요.");
          }
        }}
        className="border-rule rounded-2xl border bg-white p-6">
        <h2 className="text-ink mb-4 flex items-center gap-2 text-base font-bold">
          <span aria-hidden>👤</span> 프렌더 정보
        </h2>
        <p className="text-muted-fg-faint -mt-2 mb-4 text-xs">이름·전화번호·국적·성별은 신청 승인 시 확정되며 관리자만 변경할 수 있습니다.</p>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>이메일</Label>
            <Input value={email} disabled readOnly className={cn("text-muted-fg disabled:bg-transparent disabled:opacity-100", editing && LOCKED)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="fp-last-name">성</Label>
              <Input id="fp-last-name" value={initial.last_name} readOnly disabled className={cn(VIEW_TEXT, editing && LOCKED)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fp-first-name">이름</Label>
              <Input id="fp-first-name" value={initial.first_name} readOnly disabled className={cn(VIEW_TEXT, editing && LOCKED)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nickname">
              닉네임 <span className="text-muted-fg-faint font-normal">(선택)</span>
            </Label>
            <Input
              id="nickname"
              name="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="회원들에게 보여질 별칭"
              maxLength={30}
              disabled={!editing}
              className={VIEW_TEXT}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fp-phone">전화번호</Label>
            <Input
              id="fp-phone"
              value={initial.phone ? formatPhone(initial.phone) : ""}
              readOnly
              disabled
              className={cn(VIEW_TEXT, editing && LOCKED)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fp-nationality">국적</Label>
            <select
              id="fp-nationality"
              value={initial.nationality}
              disabled
              onChange={() => {}}
              className={cn(
                "border-input h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none md:text-sm",
                "disabled:text-ink disabled:opacity-100",
                editing && LOCKED,
              )}>
              <option value="">미설정</option>
              {NATIONALITIES.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.flag} {n.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fp-gender">성별</Label>
            <select
              id="fp-gender"
              value={initial.gender}
              disabled
              onChange={() => {}}
              className={cn(
                "border-input h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none md:text-sm",
                "disabled:text-ink disabled:opacity-100",
                editing && LOCKED,
              )}>
              <option value="">미설정</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.ko}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bio">회원들에게 자신을 소개하기 {editing && <span className="text-brand">*</span>}</Label>
            <Textarea
              id="bio"
              name="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="회원들에게 보여질 소개글입니다. 어떤 사람인지, 어떤 이야기를 나눌 수 있는지 자유롭게 적어 주세요."
              rows={5}
              maxLength={2000}
              required
              disabled={!editing}
              className={VIEW_TEXT}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zoom_url" className="flex items-center gap-1.5">
              <Video className="text-accent-blue-ink size-4" aria-hidden /> Zoom URL {editing && <span className="text-brand">*</span>}
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
            <p className="text-muted-fg-faint text-xs">회원들과 소통할 때 사용하는 개인 Zoom 주소입니다.</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {editing ? (
            <>
              <Button type="button" variant="outline" onClick={cancelEditing} disabled={pending}>
                취소
              </Button>
              <Button type="submit" variant="brand" disabled={pending} className={cn(pending && "opacity-90")}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {pending ? "저장 중" : "저장"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="brand" onClick={startEditing}>
              <Pencil className="size-4" aria-hidden />
              수정
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
