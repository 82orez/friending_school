"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarIcon, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export default function ApplyForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [preferredTime, setPreferredTime] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!startDate) {
      document.getElementById("apply-start-date")?.focus();
      return;
    }
    setPending(true);
    console.log("[ApplyForm] submission:", { name, phone, email, startDate, preferredTime });
    setTimeout(() => {
      setPending(false);
      setSubmitted(true);
    }, 400);
  };

  if (submitted) {
    return (
      <div
        role="status"
        className="mx-auto w-full max-w-xl rounded-lg bg-white p-6 text-center text-ink shadow-sm md:p-8">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-brand-blue" />
        <p className="text-base font-extrabold md:text-lg">신청해 주셔서 감사합니다.</p>
        <p className="mt-1 text-sm text-muted-fg">입력하신 번호 {phone}로 곧 연락드릴게요.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="apply-heading"
      className="mx-auto w-full max-w-xl rounded-lg bg-white p-5 text-left text-ink shadow-sm md:p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apply-name">이름</Label>
          <Input
            id="apply-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apply-phone">전화번호</Label>
          <Input
            id="apply-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            pattern="[0-9\-\s]+"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="apply-email">
            이메일 <span className="text-xs font-normal text-muted-fg">(선택)</span>
          </Label>
          <Input
            id="apply-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apply-start-date">희망 시작 날짜</Label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger
              id="apply-start-date"
              className={cn(
                "inline-flex h-10 w-full items-center justify-start rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-sm font-normal transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                !startDate && "text-muted-foreground",
              )}>
              <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
              {startDate ? format(startDate, "yyyy년 M월 d일", { locale: ko }) : "날짜를 선택해 주세요"}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => {
                  setStartDate(date);
                  if (date) setCalendarOpen(false);
                }}
                disabled={{ before: new Date() }}
                locale={ko}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apply-preferred-time">희망 수업 시간</Label>
          <Input
            id="apply-preferred-time"
            name="preferredTime"
            type="text"
            required
            value={preferredTime}
            onChange={(e) => setPreferredTime(e.target.value)}
            placeholder="예: 평일 저녁 7-9시"
            className="h-10"
          />
        </div>
      </div>

      <Button type="submit" variant="brand-blue" disabled={pending} className="mt-5 h-11 w-full text-base font-bold">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "신청 중" : "지금 신청하기"}
      </Button>
    </form>
  );
}
