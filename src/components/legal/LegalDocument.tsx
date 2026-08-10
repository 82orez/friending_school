import Link from "next/link";

import type { LegalBlock, LegalDoc } from "@/data/legal";

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    return <p className="text-ink-soft leading-relaxed">{block}</p>;
  }

  if ("list" in block) {
    return (
      <ol className="space-y-2">
        {block.list.map((item, j) => {
          const isString = typeof item === "string";
          const text = isString ? item : item.text;
          return (
            <li key={j} className="text-ink-soft flex gap-2 leading-relaxed">
              <span className="text-muted-fg shrink-0">{j + 1}.</span>
              <div className="space-y-1">
                <span>{text}</span>
                {!isString && item.note && <p className="text-muted-fg">{item.note}</p>}
                {!isString && item.sub && (
                  <ol className="space-y-1 pt-0.5">
                    {item.sub.map((s, k) => (
                      <li key={k} className="flex gap-2">
                        <span className="text-muted-fg shrink-0">{k + 1})</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  if ("bullets" in block) {
    return (
      <ul className="space-y-1.5">
        {block.bullets.map((item, j) => {
          const isString = typeof item === "string";
          const text = isString ? item : item.text;
          return (
            <li key={j} className="text-ink-soft flex gap-2 leading-relaxed">
              <span className="text-muted-fg shrink-0">•</span>
              <div className="space-y-1">
                <span>{text}</span>
                {!isString && item.sub && (
                  <ul className="space-y-1 pt-0.5">
                    {item.sub.map((s, k) => (
                      <li key={k} className="flex gap-2">
                        <span className="text-muted-fg shrink-0">◦</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  // table
  return (
    <div className="overflow-x-auto">
      <table className="text-ink-soft w-full border-collapse text-sm">
        <thead>
          <tr>
            {block.table.headers.map((h, j) => (
              <th key={j} className="border-rule text-ink border bg-white px-3 py-2 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border-rule border px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Blocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

export default function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-[880px] px-5 py-12 md:py-16">
        <h1 className="text-ink text-2xl font-bold md:text-3xl">{doc.title}</h1>
        {doc.effectiveDate && <p className="text-muted-fg mt-2 text-sm">시행일: {doc.effectiveDate}</p>}
        {doc.intro && <p className="text-ink-soft mt-6 leading-relaxed">{doc.intro}</p>}

        {doc.status === "preparing" || !doc.sections ? (
          <div className="mt-16 mb-12 flex flex-col items-center gap-4 text-center">
            <p className="text-ink-soft text-lg">현재 페이지를 준비 중입니다.</p>
            <p className="text-muted-fg text-sm">빠른 시일 내에 내용을 제공해 드리겠습니다.</p>
            <Link href="/" className="text-accent-blue-ink mt-2 text-sm font-medium hover:underline">
              홈으로 돌아가기
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {doc.sections.map((section, i) => (
              <section key={i}>
                <h2 className="text-ink mb-3 text-lg font-semibold">{section.heading}</h2>
                <Blocks blocks={section.blocks} />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
