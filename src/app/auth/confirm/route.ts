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

  const supabase = createClient(await cookies());

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    return NextResponse.redirect(new URL("/login?error=auth-code-error", request.url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    // PKCE 코드 교환 실패: 보통 cross-device 클릭이나 메일 클라이언트의 prefetch로
    // verifier 쿠키가 없어서 발생. Supabase 서버 측 이메일 인증은 이미 완료된
    // 상태일 가능성이 높으므로, 일반 에러가 아닌 "로그인해 주세요" 안내로 안내.
    return NextResponse.redirect(new URL("/login?verified=pending", request.url));
  }

  return NextResponse.redirect(new URL("/login?error=auth-code-error", request.url));
}
