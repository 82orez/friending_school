import type { Metadata } from "next";

import LegalDocument from "@/components/legal/LegalDocument";
import { LEGAL_DOCS } from "@/data/legal";

export const metadata: Metadata = {
  title: "회원이용약관",
};

export default function TermsPage() {
  return <LegalDocument doc={LEGAL_DOCS.terms} />;
}
