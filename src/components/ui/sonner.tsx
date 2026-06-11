"use client";

import { Toaster as SonnerToaster } from "sonner";

// 전역 토스트. 다크모드 미구현이라 next-themes 없이 라이트 고정.
function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  return <SonnerToaster theme="light" position="top-center" richColors closeButton toastOptions={{ className: "font-sans" }} {...props} />;
}

export { Toaster };
