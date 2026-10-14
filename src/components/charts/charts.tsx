"use client";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { MetricFormat } from "@/lib/engine/metrics";
import { fmtMetric, fmtPct, fmtUsd } from "@/lib/format";

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "#e87ba4", "#6250d6"];
// Recharts needs concrete colors for some props; mirror of the CSS tokens.
export const SERIES_HEX = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];
const MUTED = "#c3c9d4";
const GRID = "#eceef2";
const AXIS = "#8a93a3";
const NEG = "#be3426";
const POS = "#047857";

function axisFmt(format: MetricFormat) {
  return (v: number) => {
    if (format === "usd") return Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v.toFixed(0)}M`;
    if (format === "pct") return `${(v * 100).toFixed(0)}%`;
    if (format === "pp") return `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}pp`;
    return String(v);
  };
}

interface TipPayload {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}
function ChartTooltip({ active, payload, label, format, labels }: { active?: boolean; payload?: TipPayload[]; label?: string; format: MetricFormat; labels?: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  const title = (payload[0]?.payload?.fullLabel as string) ?? label;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {payload
        .filter((p) => p.dataKey !== "base")
        .map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color === MUTED ? AXIS : p.color }} />
            <span className="text-muted">{labels?.[String(p.dataKey)] ?? p.name}</span>
            <span className="num ml-auto pl-4 font-medium text-ink">{fmtMetric(p.value ?? null, format, { signed: format === "pp" })}</span>
          </div>
        ))}
    </div>
  );
}

/** Portfolio trend: bars for amounts, a line for ratios. Single series, slot 1. */
export function TrendChart({
  data,
  dataKey,
  format,
  height = 260,
  name,
  highlightLast = true,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  format: MetricFormat;
  height?: number;
  name: string;
  highlightLast?: boolean;
}) {
  const isRatio = format === "pct" || format === "pp";
  return (
    <ResponsiveContainer width="100%" height={height}>
      {isRatio ? (
        <LineChart data={data} margin={{ top: 16, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11 }} interval={0} />
          <YAxis tickFormatter={axisFmt(format)} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
          <Tooltip content={<ChartTooltip format={format} labels={{ [dataKey]: name }} />} />
          <Line type="monotone" dataKey={dataKey} name={name} stroke={SERIES_HEX[0]} strokeWidth={2} dot={{ r: 3, fill: SERIES_HEX[0], strokeWidth: 0 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} animationDuration={400}>
            <LabelList dataKey={dataKey} position="top" content={(p) => lastLabel(p, data.length, format)} />
          </Line>
        </LineChart>
      ) : (
        <BarChart data={data} margin={{ top: 16, right: 16, left: 4, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11 }} interval={0} />
          <YAxis tickFormatter={axisFmt(format)} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<ChartTooltip format={format} labels={{ [dataKey]: name }} />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
          <ReferenceLine y={0} stroke={AXIS} strokeWidth={1} />
          <Bar dataKey={dataKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={highlightLast && i === data.length - 1 ? SERIES_HEX[0] : "#9ec5f4"} />
            ))}
            <LabelList dataKey={dataKey} position="top" content={(p) => lastLabel(p, data.length, format)} />
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

/** Category tick that never wraps (Recharts wraps long labels by default). */
function NoWrapTick(props: unknown) {
  const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
  const v = payload.value.length > 24 ? payload.value.slice(0, 23) + "…" : payload.value;
  return (
    <text x={x - 6} y={y + 4} textAnchor="end" fontSize={11.5} fill="#343c4d">
      {v}
    </text>
  );
}

function lastLabel(p: unknown, n: number, format: MetricFormat) {
  const { index, x, y, width, value } = p as { index: number; x: number; y: number; width?: number; value: number };
  if (index !== n - 1 || value === null || value === undefined) return null;
  return (
    <text x={x + (width ?? 0) / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0d1220">
      {fmtMetric(value, format)}
    </text>
  );
}

/** Company time series with optional second series (e.g. labor vs revenue). Two series → legend. */
export function SeriesChart({
  data,
  series,
  format,
  height = 240,
  kind = "line",
  indexed = false,
}: {
  data: Record<string, unknown>[];
  series: { key: string; name: string; color?: string }[];
  format: MetricFormat;
  height?: number;
  kind?: "line" | "bar";
  indexed?: boolean;
}) {
  const tf = indexed ? (v: number) => v.toFixed(0) : axisFmt(format);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 0 }} barCategoryGap="24%" barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tickFormatter={tf} tickLine={false} axisLine={false} width={50} domain={kind === "line" ? ["auto", "auto"] : [0, "auto"]} />
        <Tooltip
          content={<ChartTooltip format={indexed ? "ratio" : format} labels={Object.fromEntries(series.map((s) => [s.key, s.name]))} />}
          cursor={kind === "bar" ? { fill: "rgba(15,23,42,0.04)" } : { stroke: AXIS, strokeWidth: 1 }}
        />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />}
        {series.map((s, i) =>
          kind === "bar" ? (
            <Bar key={s.key} dataKey={s.key} name={s.name} isAnimationActive={false} fill={s.color ?? SERIES_HEX[i]} radius={[3, 3, 0, 0]} maxBarSize={22} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? SERIES_HEX[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} animationDuration={400} />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranking bars. Emphasis: subject highlighted, everything else muted; optional reference (median). */
export function RankBars({
  data,
  format,
  highlight,
  reference,
  referenceLabel,
  onSelect,
  height,
  colorBySign = false,
}: {
  data: { label: string; value: number | null; id?: string; note?: string }[];
  format: MetricFormat;
  highlight?: string[];
  reference?: number | null;
  referenceLabel?: string;
  onSelect?: (id: string) => void;
  height?: number;
  colorBySign?: boolean;
}) {
  const rows = data.filter((d) => d.value !== null).map((d) => ({ ...d, fullLabel: d.label }));
  const h = height ?? Math.max(120, rows.length * 30 + 36);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 22, right: 56, left: 8, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={axisFmt(format)} tickLine={false} axisLine={false} domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} />
        <YAxis type="category" dataKey="label" width={142} tickLine={false} axisLine={false} tick={NoWrapTick} interval={0} />
        <Tooltip content={<ChartTooltip format={format} labels={{ value: "Value" }} />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
        <ReferenceLine x={0} stroke={AXIS} />
        {reference !== undefined && reference !== null && (
          <ReferenceLine x={reference} stroke="#0d1220" strokeWidth={1.25} label={{ value: referenceLabel ? `${referenceLabel} ${fmtMetric(reference, format)}` : "", position: "top", fontSize: 10.5, fill: "#626b7c" }} />
        )}
        <Bar dataKey="value" radius={4} maxBarSize={16} isAnimationActive={false} onClick={(d: { id?: string }) => d?.id && onSelect?.(d.id)} cursor={onSelect ? "pointer" : undefined}>
          {rows.map((r, i) => (
            <Cell
              key={i}
              fill={
                colorBySign
                  ? (r.value as number) < 0
                    ? NEG
                    : POS
                  : !highlight || highlight.length === 0 || (r.id && highlight.includes(r.id))
                    ? SERIES_HEX[0]
                    : MUTED
              }
            />
          ))}
          <LabelList dataKey="value" position="right" content={(p) => valueLabel(p, format)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function valueLabel(p: unknown, format: MetricFormat) {
  const { x, y, width, height, value } = p as { x: number; y: number; width: number; height: number; value: number };
  if (value === null || value === undefined) return null;
  const neg = value < 0;
  return (
    <text x={neg ? x + width - 6 : x + width + 6} y={y + height / 2 + 4} textAnchor={neg ? "end" : "start"} fontSize={11} fill="#343c4d" className="num">
      {fmtMetric(value, format, { signed: format === "pp" })}
    </text>
  );
}

/** Two measures per company side by side (e.g. labor growth vs revenue growth). Same unit, one axis. */
export function PairedBars({
  data,
  a,
  b,
  format,
  highlight,
  onSelect,
  height,
}: {
  data: { label: string; id: string; a: number | null; b: number | null }[];
  a: string;
  b: string;
  format: MetricFormat;
  highlight?: string[];
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const h = height ?? Math.max(160, data.length * 44 + 50);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data.map((d) => ({ ...d, fullLabel: d.label }))} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap={10} barGap={2}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={axisFmt(format)} tickLine={false} axisLine={false} domain={[(min: number) => Math.min(0, min), "auto"]} />
        <YAxis type="category" dataKey="label" width={142} tickLine={false} axisLine={false} tick={NoWrapTick} interval={0} />
        <Tooltip content={<ChartTooltip format={format} labels={{ a, b }} />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "a" ? a : b)} />
        <ReferenceLine x={0} stroke={AXIS} />
        <Bar dataKey="a" name="a" radius={3} maxBarSize={12} isAnimationActive={false} fill={SERIES_HEX[1]} onClick={(d: { id?: string }) => d?.id && onSelect?.(d.id)} cursor={onSelect ? "pointer" : undefined}>
          {data.map((d, i) => (
            <Cell key={i} fillOpacity={!highlight?.length || highlight.includes(d.id) ? 1 : 0.35} />
          ))}
          <LabelList dataKey="a" position="right" content={(p) => valueLabel(p, format)} />
        </Bar>
        <Bar dataKey="b" name="b" radius={3} maxBarSize={12} isAnimationActive={false} fill={SERIES_HEX[0]} onClick={(d: { id?: string }) => d?.id && onSelect?.(d.id)} cursor={onSelect ? "pointer" : undefined}>
          {data.map((d, i) => (
            <Cell key={i} fillOpacity={!highlight?.length || highlight.includes(d.id) ? 1 : 0.35} />
          ))}
          <LabelList dataKey="b" position="right" content={(p) => valueLabel(p, format)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Revenue growth (x) vs labor growth (y) with the parity line: points above the line = labor outpacing revenue. */
export function GrowthScatter({
  data,
  highlight,
  onSelect,
  height = 300,
}: {
  data: { id: string; label: string; x: number; y: number; size: number }[];
  highlight?: string[];
  onSelect?: (id: string) => void;
  height?: number;
}) {
  if (!data.length) return null;
  const all = data.flatMap((d) => [d.x, d.y]);
  const lo = Math.floor((Math.min(0, ...all) - 0.01) * 20) / 20;
  const hi = Math.ceil((Math.max(...all) + 0.02) * 20) / 20;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.1) ticks.push(Math.round(t * 100) / 100);
  const labelled = new Set(highlight?.length ? highlight : []);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 12, right: 24, left: 4, bottom: 16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="x" name="Revenue growth" domain={[lo, hi]} ticks={ticks} tickFormatter={axisFmt("pct")} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: "Revenue growth (YoY)", position: "insideBottom", offset: -8, fontSize: 11, fill: AXIS }} />
        <YAxis type="number" dataKey="y" name="Labor cost growth" domain={[lo, hi]} ticks={ticks} tickFormatter={axisFmt("pct")} tickLine={false} axisLine={false} width={48} label={{ value: "Labor growth", angle: -90, position: "insideLeft", offset: 12, fontSize: 11, fill: AXIS }} />
        <ZAxis type="number" dataKey="size" range={[60, 360]} />
        <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={AXIS} strokeWidth={1} label={{ value: "Labor = revenue growth", position: "insideTopLeft", fontSize: 10.5, fill: AXIS }} />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as { label: string; x: number; y: number };
            return (
              <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                <div className="mb-1 font-semibold text-ink">{d.label}</div>
                <div className="flex justify-between gap-4"><span className="text-muted">Revenue growth</span><span className="num">{fmtPct(d.x)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted">Labor growth</span><span className="num">{fmtPct(d.y)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted">Gap</span><span className="num font-medium">{fmtMetric(d.y - d.x, "pp")}</span></div>
              </div>
            );
          }}
        />
        <Scatter data={data} onClick={(d: { id?: string }) => d?.id && onSelect?.(d.id)} cursor={onSelect ? "pointer" : undefined}>
          {data.map((d) => (
            <Cell key={d.id} fill={!highlight?.length || highlight.includes(d.id) ? (d.y - d.x > 0.08 ? SERIES_HEX[1] : SERIES_HEX[0]) : MUTED} stroke="#fff" strokeWidth={2} />
          ))}
          <LabelList
            dataKey="label"
            content={(p) => {
              const { x, y, value, index } = p as { x: number; y: number; value: string; index: number };
              if (!labelled.has(data[index]?.id)) return null;
              return (
                <text x={x + 12} y={y + 4} fontSize={11} fontWeight={600} fill="#0d1220">
                  {value}
                </text>
              );
            }}
          />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Budget-to-actual bridge (waterfall). Floating bars on an invisible base; favorable = green, unfavorable = red. */
export function Waterfall({ steps, height = 240 }: { steps: { label: string; value: number; kind: "total" | "delta" }[]; height?: number }) {
  let running = 0;
  const rows = steps.map((s) => {
    if (s.kind === "total") {
      running = s.value;
      return { label: s.label, base: Math.min(0, s.value), bar: Math.abs(s.value), raw: s.value, kind: s.kind };
    }
    const start = running;
    running += s.value;
    return { label: s.label, base: Math.min(start, running), bar: Math.abs(s.value), raw: s.value, kind: s.kind };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 20, right: 16, left: 4, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11 }} interval={0} />
        <YAxis tickFormatter={axisFmt("usd")} tickLine={false} axisLine={false} width={52} />
        <Tooltip
          cursor={{ fill: "rgba(15,23,42,0.04)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as { label: string; raw: number; kind: string };
            return (
              <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                <div className="font-semibold text-ink">{d.label}</div>
                <div className="num">{d.kind === "total" ? fmtUsd(d.raw) : fmtUsd(d.raw, { signed: true })}</div>
              </div>
            );
          }}
        />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="bar" stackId="w" radius={[3, 3, 3, 3]} maxBarSize={56}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.kind === "total" ? SERIES_HEX[0] : r.raw >= 0 ? POS : NEG} />
          ))}
          <LabelList
            dataKey="raw"
            position="top"
            content={(p) => {
              const { x, y, width, value } = p as { x: number; y: number; width: number; value: number };
              return (
                <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0d1220">
                  {fmtUsd(value, { signed: false })}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Multi-company line comparison (≤ 6 series, fixed slot per entity). */
export function MultiLine({
  data,
  series,
  format,
  height = 260,
}: {
  data: Record<string, unknown>[];
  series: { key: string; name: string; color: string }[];
  format: MetricFormat;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={axisFmt(format)} tickLine={false} axisLine={false} width={50} domain={["auto", "auto"]} />
        <Tooltip content={<ChartTooltip format={format} labels={Object.fromEntries(series.map((s) => [s.key, s.name]))} />} cursor={{ stroke: AXIS, strokeWidth: 1 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} animationDuration={400} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
