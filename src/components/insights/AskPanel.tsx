"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, ChevronDown, ChevronRight, Compass, CornerDownRight, MessageSquareText, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { describeFilters } from "@/lib/engine/filters";
import { answerQuestion, type Answer, type AnswerColumn, type AnswerRow } from "@/lib/query/answer";
import { INTENT_LABELS, parseQuestion, SUGGESTED_QUESTIONS, type ParsedQuery } from "@/lib/query/parser";
import { fmtMetric } from "@/lib/format";
import { useScope } from "@/lib/state/hooks";
import { useApp, type ChatTurn } from "@/lib/state/store";
import { getData } from "@/lib/data";
import { PairedBars, RankBars, SeriesChart } from "../charts/charts";
import { Badge, Button } from "../ui/primitives";

const SIGNED_PCT = new Set(["growth", "organic", "change", "varPct", "labor", "revenue", "cfoGrowth", "ebitdaGrowth", "arrGrowth", "revenueGrowth"]);

function Cell({ v, col, row }: { v: number | string | null | undefined; col: AnswerColumn; row: AnswerRow }) {
  if (typeof v === "string") return <span>{v}</span>;
  const fmt = row.rowFormat && (col.format === "pct" || col.format === "pp") && col.key !== "delta" ? row.rowFormat : col.format;
  if (fmt === "text") return <span>{v ?? ""}</span>;
  const signed = fmt === "pp" || (fmt === "pct" && SIGNED_PCT.has(col.key)) || col.key === "varAbs";
  // No sign-based colouring: whether negative is good depends on the metric; row tone carries the judgement.
  return <span className={cn("num", (v === null || v === undefined) && "text-faint")}>{fmtMetric(v ?? null, fmt, { signed })}</span>;
}

function AnswerView({ a, onAsk }: { a: Answer; onAsk: (q: string) => void }) {
  const [showMethod, setShowMethod] = useState(false);
  return (
    <div className="space-y-4" data-testid="ask-answer">
      <p className={cn("text-[15px] leading-relaxed", a.supported ? "text-ink" : "text-ink-2")} data-testid="ask-direct-answer">
        {a.headline}
      </p>
      {a.kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {a.kpis.map((k) => (
            <div key={k.label} className="rounded-md border border-line bg-subtle/60 px-3 py-2">
              <div className="text-[11px] text-muted">{k.label}</div>
              <div className="num text-base font-semibold text-ink">{k.value}</div>
              {k.sub && <div className="truncate text-[11px] text-muted">{k.sub}</div>}
            </div>
          ))}
        </div>
      )}
      {a.chart && a.chart.data.length > 0 && (
        <div className="rounded-md border border-line bg-surface p-2">
          <div className="px-2 pt-1 text-xs font-medium text-ink-2">{a.chart.title}</div>
          {a.chart.type === "line" ? (
            <SeriesChart data={a.chart.data as unknown as Record<string, unknown>[]} series={[{ key: "value", name: a.chart.title }]} format={a.chart.format} height={200} />
          ) : a.chart.secondaryLabel ? (
            <PairedBars
              data={a.chart.data.map((d) => ({ label: d.label, id: d.companyId ?? d.label, a: d.value, b: d.secondary ?? null }))}
              a="Labor cost growth"
              b={a.chart.secondaryLabel}
              format={a.chart.format}
              highlight={a.rows.filter((r) => r.tone === "neg").map((r) => r.companyId!).filter(Boolean)}
            />
          ) : (
            <RankBars
              data={a.chart.data.map((d) => ({ label: d.label, value: d.value, id: d.companyId }))}
              format={a.chart.format}
              reference={a.chart.referenceValue}
              referenceLabel={a.chart.referenceLabel}
              colorBySign={a.chart.format === "pp" || (a.chart.referenceValue === 0 && a.chart.format === "pct")}
            />
          )}
        </div>
      )}
      {a.rows.length > 0 && (
        <div className="thin-scroll overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm" data-testid="ask-table">
            <thead>
              <tr className="border-b border-line bg-subtle text-xs text-muted">
                <th className="px-3 py-1.5 text-left font-medium">{a.intent === "compare_companies" || a.intent === "compare_to_cohort" ? "Metric" : "Company"}</th>
                {a.columns.map((c) => (
                  <th key={c.key} className={cn("px-3 py-1.5 font-medium", c.format === "text" ? "text-left" : "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r, i) => (
                <tr key={i} className={cn("border-b border-line/60 last:border-0", r.tone === "neg" && "bg-neg-soft/40", r.tone === "muted" && "text-muted")}>
                  <td className="px-3 py-1.5">
                    {r.companyId ? (
                      <Link href={`/companies/${r.companyId}`} className="font-medium text-ink hover:text-brand hover:underline">
                        {r.label}
                      </Link>
                    ) : (
                      <span className="text-ink-2">{r.label}</span>
                    )}
                    {r.note && <Badge tone="warn" className="ml-1.5">{r.note}</Badge>}
                  </td>
                  {a.columns.map((c) => (
                    <td key={c.key} className={cn("whitespace-nowrap px-3 py-1.5", c.format === "text" ? "text-left text-ink-2" : "text-right")}>
                      <Cell v={r.values[c.key]} col={c} row={r} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="rounded-md border-l-2 border-brand/50 bg-brand-soft/40 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink">Why it matters</div>
        <p className="mt-0.5 text-sm text-ink-2">{a.whyItMatters}</p>
      </div>
      {a.explore.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Compass className="h-3.5 w-3.5" /> Explore further
          </div>
          <div className="flex flex-wrap gap-1.5">
            {a.explore.map((e) => (
              <Link key={e.href + e.label} href={e.href} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-2 hover:border-brand/40 hover:text-brand" data-testid="ask-explore-link">
                {e.label} <ChevronRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </div>
      )}
      <div>
        <button onClick={() => setShowMethod(!showMethod)} className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink" aria-expanded={showMethod}>
          <BookOpen className="h-3.5 w-3.5" /> Methodology {showMethod ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {showMethod && (
          <ul className="mt-1.5 space-y-1 text-xs text-muted" data-testid="ask-methodology">
            <li>Scope: {a.scope}</li>
            {a.methodology.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        )}
      </div>
      {a.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.followUps.map((f) => (
            <button key={f} onClick={() => onAsk(f)} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-2 hover:border-brand/40 hover:text-brand">
              <CornerDownRight className="h-3 w-3" /> {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Interpretation({ p }: { p: ParsedQuery }) {
  const d = getData();
  const chips: string[] = [INTENT_LABELS[p.intent]];
  if (p.metric) chips.push(`metric: ${p.metric}`);
  if (p.sector) chips.push(p.sector);
  if (p.businessModel) chips.push(p.businessModel);
  if (p.fund) chips.push(d.funds.find((f) => f.id === p.fund)!.shortName);
  if (p.companies.length) chips.push(p.companies.map((c) => d.companyById.get(c)!.name).join(" + "));
  if (p.period?.quarter) chips.push(p.period.quarter.replace("-", " "));
  else if (p.period?.kind) chips.push(p.period.kind.toUpperCase());
  if (p.relativePeriod) chips.push("previous quarter");
  if (p.basis) chips.push(p.basis === "yoy" ? "YoY" : p.basis === "prior" ? "QoQ" : "vs budget");
  if (p.isFollowUp) chips.push("follow-up");
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="ask-interpretation">
      <span className="text-[11px] text-faint">Interpreted as</span>
      {chips.map((c) => (
        <span key={c} className="rounded bg-subtle px-1.5 py-px text-[11px] font-medium text-ink-2 ring-1 ring-line">
          {c}
        </span>
      ))}
    </div>
  );
}

export function AskPanel({ initialQuestion }: { initialQuestion?: string | null }) {
  const { filters, selection, basis, period, data, companies } = useScope();
  const chat = useApp((s) => s.chat);
  const pushTurn = useApp((s) => s.pushTurn);
  const updateTurn = useApp((s) => s.updateTurn);
  const clearChat = useApp((s) => s.clearChat);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const prev = [...useApp.getState().chat].reverse().find((t) => t.parsed && t.answer?.supported)?.parsed ?? null;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ctxText = `${period.label} · ${describeFilters(filters, Object.fromEntries(data.funds.map((f) => [f.id, f.shortName])))}`;
    const turn: ChatTurn = { id, question: q, parsed: null, answer: null, pending: true, context: ctxText };
    pushTurn(turn);
    setInput("");
    // Short deliberate delay so the analyst sees the request being processed; all computation is local.
    setTimeout(() => {
      const parsed = parseQuestion(q, prev);
      const answer = answerQuestion(parsed, { filters, selection, basis });
      updateTurn(id, { parsed, answer, pending: false });
    }, 450);
  };

  useEffect(() => {
    if (initialQuestion && asked.current !== initialQuestion) {
      asked.current = initialQuestion;
      ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const lastPending = chat[chat.length - 1]?.pending;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat.length, lastPending]);

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_300px]" data-testid="ask-panel">
      <div className="flex min-h-[560px] flex-col rounded-lg border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Sparkles className="h-4 w-4 text-brand" /> Ask Your Portfolio
            </div>
            <p className="text-xs text-muted">
              Plain-English questions answered by the deterministic analytics engine · respects active filters ({companies.length} companies, {period.label})
            </p>
          </div>
          {chat.length > 0 && (
            <Button size="xs" variant="ghost" onClick={clearChat}>
              <Trash2 className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
        <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4" style={{ maxHeight: "68vh" }}>
          {chat.length === 0 && (
            <div className="mx-auto max-w-xl py-8 text-center">
              <MessageSquareText className="mx-auto h-8 w-8 text-faint" />
              <p className="mt-2 text-sm font-medium text-ink">Ask about growth, margins, labor costs, budgets, cash flow or peers.</p>
              <p className="mt-1 text-sm text-muted">Every figure is computed from the portfolio dataset with an explicit cohort and period. Unsupported questions are declined, never guessed.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {SUGGESTED_QUESTIONS.slice(0, 6).map((q) => (
                  <button key={q} onClick={() => ask(q)} className="rounded-full border border-line bg-subtle px-3 py-1.5 text-xs text-ink-2 hover:border-brand/40 hover:text-brand" data-testid="suggestion-chip">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.map((t) => (
            <div key={t.id} className="space-y-2 animate-in" data-testid="chat-turn">
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg rounded-br-sm bg-ink px-3 py-2 text-sm text-white">{t.question}</div>
              </div>
              <div className="text-right text-[10.5px] text-faint">{t.context}</div>
              <div className="rounded-lg border border-line bg-surface p-4">
                {t.pending ? (
                  <div className="flex items-center gap-2 text-sm text-muted" data-testid="ask-loading">
                    <span className="flex gap-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand" style={{ animationDelay: "150ms" }} />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand" style={{ animationDelay: "300ms" }} />
                    </span>
                    Interpreting question and computing from the analytics engine…
                  </div>
                ) : (
                  t.answer && (
                    <div className="space-y-3">
                      {t.parsed && <Interpretation p={t.parsed} />}
                      <AnswerView a={t.answer} onAsk={ask} />
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form
          className="border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-card focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15">
            <textarea
              data-testid="ask-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              rows={1}
              placeholder="e.g. Which services companies have labor costs growing faster than revenue, and by how much?"
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
            />
            <Button type="submit" variant="primary" size="sm" disabled={!input.trim()} data-testid="ask-submit" aria-label="Ask">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-faint">Local, rule-based interpretation — no external AI service or API key. Follow-ups like “what about software companies?” reuse the previous question.</p>
        </form>
      </div>
      <aside className="space-y-3">
        <div className="rounded-lg border border-line bg-surface p-3 shadow-card">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Suggested questions</div>
          <div className="space-y-1">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button key={q} onClick={() => ask(q)} className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-subtle hover:text-brand">
                {q}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3 text-xs text-muted shadow-card">
          <div className="mb-1.5 font-semibold uppercase tracking-wide">How answers are produced</div>
          <ol className="list-decimal space-y-1 pl-4">
            <li>The question is mapped to an approved intent (growth, margin, ranking, peer comparison, budget variance, cash flow, labor outliers, trends, reporting status).</li>
            <li>Metric, scope, period and comparison basis are extracted; active global filters apply.</li>
            <li>The analytics engine computes every figure; the answer cites cohort, periods and exclusions.</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
