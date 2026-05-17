"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";

/**
 * 비밀번호 입력 중 Caps Lock 상태 감지용 훅.
 * 반환된 `capsLockHandlers`를 input에 spread하면 onKeyDown/onKeyUp/onBlur가 자동 연결됨.
 * Blur 시 상태가 false로 리셋되어 다른 필드로 포커스 이동 시 잔여 경고가 사라짐.
 */
export function useCapsLockWarning() {
  const [capsLockOn, setCapsLockOn] = useState(false);

  const capsLockHandlers = {
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => setCapsLockOn(e.getModifierState("CapsLock")),
    onKeyUp: (e: KeyboardEvent<HTMLInputElement>) => setCapsLockOn(e.getModifierState("CapsLock")),
    onBlur: (_e: FocusEvent<HTMLInputElement>) => setCapsLockOn(false),
  };

  return { capsLockOn, capsLockHandlers };
}
