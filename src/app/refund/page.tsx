import type { Metadata } from "next";

import LegalDocument from "@/components/legal/LegalDocument";
import { LEGAL_DOCS } from "@/data/legal";

export const metadata: Metadata = {
  title: "환불 정책",
};

export default function RefundPage() {
  return <LegalDocument doc={LEGAL_DOCS.refund} />;
}
