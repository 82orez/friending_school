import Link from "next/link";
import { Mail, MapPin, Phone, Play } from "lucide-react";

export default function Footer() {
  return (
    <footer id="contact" className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-10">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Company */}
          <div>
            <h3 className="mb-4 text-lg font-bold text-white">(주)프렌딩</h3>
            <ul className="space-y-2 text-sm text-[#888]">
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
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>경기도 용인시 기흥구 동백5로 17, 805호의 13호(중동)</span>
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
            <h3 className="mb-4 text-lg font-bold text-white">공지사항</h3>
            <p className="text-sm text-[#888]">등록된 공지 사항이 없습니다.</p>
          </div>

          {/* Other INFO */}
          <div>
            <h3 className="mb-4 text-lg font-bold text-white">Other INFO</h3>
            <ul className="space-y-2 text-sm text-[#888]">
              <li>
                <Link href="#" className="transition-colors hover:text-white">
                  회원이용약관
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-white">
                  개인정보처리방침
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-white">
                  환불 정책
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* 하단 */}
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-white/10 pt-5 text-center md:flex-row md:justify-between md:text-left">
          <p className="text-[13px] text-[#888]">Copyright © 2026 (주)프렌딩, All Rights Reserved.</p>
          <Link href="/teacher/apply" className="text-[13px] text-[#888] transition-colors hover:text-white">
            Become a Teacher
          </Link>
        </div>
      </div>
    </footer>
  );
}
