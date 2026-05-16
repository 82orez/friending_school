import { type EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  // open redirect 방지: 내부 절대경로(`/...`)만 허용하고 `//host` 형태는 차단.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  // recovery 흐름 식별: type=recovery이거나 next 경로가 /reset-password로 시작하면 recovery.
  // 실패 시 /login 대신 /forgot-password로 보내 사용자가 적절한 다음 액션(재요청)을 알 수 있게 함.
  const isRecovery = type === "recovery" || next.startsWith("/reset-password");

  const supabase = createClient(await cookies());

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    if (isRecovery) {
      return NextResponse.redirect(new URL("/forgot-password?error=link-expired", request.url));
    }
    return NextResponse.redirect(new URL("/login?error=auth-code-error", request.url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    // PKCE 코드 교환 실패: 보통 cross-device 클릭이나 메일 클라이언트의 prefetch로
    // verifier 쿠키가 없어서 발생.
    if (isRecovery) {
      return NextResponse.redirect(new URL("/forgot-password?error=link-expired", request.url));
    }
    // signup 확인 흐름이면 Supabase 서버 측 이메일 인증은 이미 완료됐을 가능성이 높으므로
    // 일반 에러가 아닌 "로그인해 주세요" 안내로 노출.
    return NextResponse.redirect(new URL("/login?verified=pending", request.url));
  }

  if (isRecovery) {
    return NextResponse.redirect(new URL("/forgot-password?error=link-expired", request.url));
  }
  return NextResponse.redirect(new URL("/login?error=auth-code-error", request.url));
}
