import type { Metadata } from "next";

import LegalDocument from "@/components/legal/LegalDocument";
import { LEGAL_DOCS } from "@/data/legal";

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  return <LegalDocument doc={LEGAL_DOCS.privacy} />;
}
