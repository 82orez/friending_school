import "server-only";
import { SolapiMessageService } from "solapi";

// SMS 발송 (Solapi/CoolSMS). 전화번호 인증 OTP용.
// 환경 변수:
// - SOLAPI_API_KEY / SOLAPI_API_SECRET (필수) — 미설정 시 발송 생략(false 반환)
// - SOLAPI_SENDER (필수) — 발신번호. Solapi에 사전등록된 번호여야 함(한국 규정).
// 메일러와 달리 OTP는 발송 성공 여부가 인증 진행에 필요하므로 boolean 반환.

const API_KEY = process.env.SOLAPI_API_KEY;
const API_SECRET = process.env.SOLAPI_API_SECRET;
const SENDER = process.env.SOLAPI_SENDER;

// to/from은 하이픈 없는 숫자열 권장.
export async function sendSms(to: string, text: string): Promise<boolean> {
  if (!API_KEY || !API_SECRET || !SENDER) {
    console.warn("[sms] SOLAPI 환경 변수 미설정 — 발송 생략");
    return false;
  }
  try {
    const service = new SolapiMessageService(API_KEY, API_SECRET);
    const res: any = await service.send({ to: to.replace(/\D/g, ""), from: SENDER.replace(/\D/g, ""), text });

    // ⚠️ send()는 "접수(등록) 성공"이지 "발송 성공"이 아님 — 발신번호 미등록·잔액 부족 등은
    // 예외가 아니라 groupInfo.count.registeredFailed / failedMessageList에만 담긴다.
    const count = res?.groupInfo?.count ?? {};
    const failedList = res?.failedMessageList ?? [];
    console.log("[sms] send 응답:", JSON.stringify({ groupId: res?.groupInfo?.groupId, count, failedList }));

    const registeredSuccess = Number(count.registeredSuccess ?? 0);
    const registeredFailed = Number(count.registeredFailed ?? 0);
    if (registeredSuccess < 1 || registeredFailed > 0 || failedList.length > 0) {
      console.error("[sms] 접수 실패(미발송) — 발신번호 등록/잔액/계정 상태 확인 필요:", JSON.stringify({ count, failedList }));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[sms] 발송 예외", e);
    return false;
  }
}
