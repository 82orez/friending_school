import Link from "next/link";

import type { LegalBlock, LegalDoc } from "@/data/legal";

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    return <p className="leading-relaxed text-ink-soft">{block}</p>;
  }

  if ("list" in block) {
    return (
      <ol className="space-y-2">
        {block.list.map((item, j) => {
          const isString = typeof item === "string";
          const text = isString ? item : item.text;
          return (
            <li key={j} className="flex gap-2 leading-relaxed text-ink-soft">
              <span className="shrink-0 text-muted-fg">{j + 1}.</span>
              <div className="space-y-1">
                <span>{text}</span>
                {!isString && item.note && <p className="text-muted-fg">{item.note}</p>}
                {!isString && item.sub && (
                  <ol className="space-y-1 pt-0.5">
                    {item.sub.map((s, k) => (
                      <li key={k} className="flex gap-2">
                        <span className="shrink-0 text-muted-fg">{k + 1})</span>
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
            <li key={j} className="flex gap-2 leading-relaxed text-ink-soft">
              <span className="shrink-0 text-muted-fg">•</span>
              <div className="space-y-1">
                <span>{text}</span>
                {!isString && item.sub && (
                  <ul className="space-y-1 pt-0.5">
                    {item.sub.map((s, k) => (
                      <li key={k} className="flex gap-2">
                        <span className="shrink-0 text-muted-fg">◦</span>
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
      <table className="w-full border-collapse text-sm text-ink-soft">
        <thead>
          <tr>
            {block.table.headers.map((h, j) => (
              <th key={j} className="border border-rule bg-white px-3 py-2 text-left font-semibold text-ink">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border border-rule px-3 py-2 align-top">
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
        <h1 className="text-2xl font-bold text-ink md:text-3xl">{doc.title}</h1>
        {doc.effectiveDate && <p className="mt-2 text-sm text-muted-fg">시행일: {doc.effectiveDate}</p>}
        {doc.intro && <p className="mt-6 leading-relaxed text-ink-soft">{doc.intro}</p>}

        {doc.status === "preparing" || !doc.sections ? (
          <div className="mt-16 mb-12 flex flex-col items-center gap-4 text-center">
            <p className="text-lg text-ink-soft">현재 페이지를 준비 중입니다.</p>
            <p className="text-sm text-muted-fg">빠른 시일 내에 내용을 제공해 드리겠습니다.</p>
            <Link href="/" className="mt-2 text-sm font-medium text-accent-blue-ink hover:underline">
              홈으로 돌아가기
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {doc.sections.map((section, i) => (
              <section key={i}>
                <h2 className="mb-3 text-lg font-semibold text-ink">{section.heading}</h2>
                <Blocks blocks={section.blocks} />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
