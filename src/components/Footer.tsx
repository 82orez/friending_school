import Link from "next/link";
import { AlertTriangle, Mail, Phone, Play } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Footer() {
  return (
    <footer id="contact" className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-5 py-12 md:px-10">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Company */}
          <div>
            <h3 className="mb-5 text-lg font-bold text-white">(주)프렌딩</h3>
            <ul className="space-y-3 text-sm text-[#888]">
              <li className="flex items-center gap-2">
                <Play className="size-3 shrink-0 fill-current" />
                <span>대표 : 박민규</span>
              </li>
              <li className="flex items-center gap-2">
                <Play className="size-3 shrink-0 fill-current" />
                <span>사업자등록 : 548-86-01562</span>
              </li>
              <li className="flex items-center gap-2">
                <Play className="size-3 shrink-0 fill-current" />
                <span>통신판매업 : 20109-서울성동-0580호</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0" />
                <span>Phone: 1668-4540</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="size-4 shrink-0" />
                <span>Email: sean.friending@email.com</span>
              </li>
            </ul>
          </div>

          {/* 공지사항 */}
          <div>
            <h3 className="mb-5 text-lg font-bold text-white">공지사항</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2 text-[#888]">
                <span aria-hidden className="mt-0.5">
                  •
                </span>
                <span>프렌딩 공지사항 입니다.</span>
              </li>
              <li className="pl-4 text-[13px] italic text-[#777]">November 2, 2025</li>
            </ul>
          </div>

          {/* Other INFO */}
          <div>
            <h3 className="mb-5 text-lg font-bold text-white">Other INFO</h3>
            <ul className="space-y-3 text-sm text-[#888]">
              <li>
                <Link href="#" className="transition-colors hover:text-white">
                  회원가입약관
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-white">
                  개인정보수집및이용
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-white">
                  수강료환불약관
                </Link>
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-[#888]">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>회원이 발급받은 증명서의 발급 사실을 확인하세요.</span>
              </span>
              <a href="#" className={cn(buttonVariants({ variant: "brand-blue", size: "xs" }))}>
                발급사실조회
              </a>
            </div>
          </div>
        </div>

        {/* 하단 */}
        <div className="mt-10 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center md:flex-row md:justify-between md:text-left">
          <p className="text-[13px] text-[#888]">Copyright © 2026 (주)프렌딩, All Rights Reserved.</p>
          <Link href="/teacher/apply" className="text-[13px] text-[#888] transition-colors hover:text-white">
            Become a Teacher
          </Link>
        </div>
      </div>
    </footer>
  );
}
