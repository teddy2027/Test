"use client";
import * as React from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import * as RPopover from "@radix-ui/react-popover";
import * as RDialog from "@radix-ui/react-dialog";
import * as RTabs from "@radix-ui/react-tabs";
import { Check, ChevronDown, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { METRICS } from "@/lib/engine/metrics";

/* ---------------------------------- Button ---------------------------------- */
type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong border border-brand-strong/40 shadow-sm",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-subtle shadow-card",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink border border-transparent",
  subtle: "bg-brand-soft text-brand-ink hover:bg-brand-soft/70 border border-brand/15",
  danger: "bg-neg text-white hover:bg-neg/90 border border-neg",
};
export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "xs" | "sm" | "md" }
>(function Button({ className, variant = "secondary", size = "sm", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50",
        size === "xs" && "h-6 px-2 text-xs",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-9 px-4 text-sm",
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  );
});

/* ---------------------------------- Badge ---------------------------------- */
export type Tone = "neutral" | "brand" | "pos" | "neg" | "warn" | "info" | "outline";
const BADGE: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-2 border-line",
  brand: "bg-brand-soft text-brand-ink border-brand/15",
  pos: "bg-pos-soft text-pos border-pos/15",
  neg: "bg-neg-soft text-neg border-neg/15",
  warn: "bg-warn-soft text-warn border-warn/20",
  info: "bg-info-soft text-info border-info/15",
  outline: "bg-surface text-ink-2 border-line-strong",
};
export function Badge({ tone = "neutral", className, children, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-px text-2xs font-medium leading-4", BADGE[tone], className)} {...rest}>
      {children}
    </span>
  );
}

/* ----------------------------------- Card ----------------------------------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...props} />;
}
export function CardHeader({
  title,
  description,
  actions,
  className,
  info,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  info?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {title}
          {info && <InfoTip text={info} />}
        </h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------- Tooltip --------------------------------- */
export const TooltipProvider = RTooltip.Provider;
export function Tip({ content, children, side = "top", className }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  if (!content) return <>{children}</>;
  return (
    <RTooltip.Root delayDuration={150}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn("z-[80] max-w-xs rounded-md bg-ink px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-pop animate-in", className)}
        >
          {content}
          <RTooltip.Arrow className="fill-ink" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
export function InfoTip({ text, className }: { text: React.ReactNode; className?: string }) {
  return (
    <Tip content={text}>
      {/* span (not button) so it can sit inside clickable headers without invalid nesting */}
      <span role="button" tabIndex={0} aria-label="Definition" className={cn("inline-flex cursor-help text-faint hover:text-muted", className)} onClick={(e) => e.stopPropagation()}>
        <Info className="h-3.5 w-3.5" />
      </span>
    </Tip>
  );
}
/** Metric label with its registry definition as a tooltip. */
export function MetricLabel({ k, label, className }: { k: string; label?: string; className?: string }) {
  const def = METRICS[k];
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {label ?? def?.label ?? k}
      {def && <InfoTip text={<><span className="font-semibold">{def.label}.</span> {def.definition}</>} />}
    </span>
  );
}

/* --------------------------------- Popover --------------------------------- */
export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;
export function PopoverContent({ className, align = "start", ...props }: RPopover.PopoverContentProps) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cn("z-[70] rounded-lg border border-line bg-surface p-1 shadow-pop animate-in focus:outline-none", className)}
        {...props}
      />
    </RPopover.Portal>
  );
}

/* --------------------------------- Dialog ---------------------------------- */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  footer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-[1px] animate-in" />
        <RDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[61] flex max-h-[88vh] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-pop animate-in focus:outline-none",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RDialog.Title className="text-base font-semibold text-ink">{title}</RDialog.Title>
              {description ? <RDialog.Description className="mt-0.5 text-sm text-muted">{description}</RDialog.Description> : <RDialog.Description className="sr-only">Dialog</RDialog.Description>}
            </div>
            <RDialog.Close className="rounded p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </RDialog.Close>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 640,
  headerExtra,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  headerExtra?: React.ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[60] bg-ink/25 animate-in" />
        <RDialog.Content
          style={{ width: `min(${width}px, 100vw)` }}
          className="fixed bottom-0 right-0 top-0 z-[61] flex flex-col border-l border-line bg-canvas shadow-pop animate-in focus:outline-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
            <div className="min-w-0">
              <RDialog.Title className="text-base font-semibold text-ink">{title}</RDialog.Title>
              {description ? <RDialog.Description className="mt-0.5 text-sm text-muted">{description}</RDialog.Description> : <RDialog.Description className="sr-only">Panel</RDialog.Description>}
              {headerExtra}
            </div>
            <RDialog.Close className="rounded p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close panel">
              <X className="h-4 w-4" />
            </RDialog.Close>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ---------------------------------- Tabs ----------------------------------- */
export const Tabs = RTabs.Root;
export function TabsList({ className, ...p }: RTabs.TabsListProps) {
  return <RTabs.List className={cn("flex items-center gap-1 border-b border-line", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: RTabs.TabsTriggerProps) {
  return (
    <RTabs.Trigger
      className={cn(
        "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink",
        className,
      )}
      {...p}
    />
  );
}
export const TabsContent = RTabs.Content;

/* ------------------------------- Segmented ------------------------------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string; disabled?: boolean }[];
  size?: "xs" | "sm";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-md border border-line bg-subtle p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            size === "xs" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
            value === o.value ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Native select ------------------------------ */
export function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  prefix,
  compactPrefix,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Options with a `group` are rendered under that heading (optgroup). */
  options: { value: string; label: string; disabled?: boolean; group?: string }[];
  className?: string;
  ariaLabel: string;
  prefix?: React.ReactNode;
  /** Hide the prefix label below 2xl to keep dense toolbars on one row. */
  compactPrefix?: boolean;
}) {
  return (
    <label className={cn("relative inline-flex h-8 items-center rounded-md border border-line-strong bg-surface text-sm shadow-card hover:bg-subtle", className)}>
      {prefix && <span className={cn("pl-2.5 text-xs text-muted", compactPrefix && "hidden 2xl:inline")}>{prefix}</span>}
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full cursor-pointer appearance-none bg-transparent pl-2 pr-7 text-sm font-medium text-ink focus:outline-none"
      >
        {[...new Set(options.map((o) => o.group))].map((g) => {
          const opts = options
            .filter((o) => o.group === g)
            .map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ));
          return g ? (
            <optgroup key={g} label={g}>
              {opts}
            </optgroup>
          ) : (
            opts
          );
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted" />
    </label>
  );
}

/* ------------------------------- MultiSelect ------------------------------- */
export function MultiSelect<T extends string | number>({
  label,
  values,
  onChange,
  options,
  testId,
}: {
  label: string;
  values: T[];
  onChange: (v: T[]) => void;
  options: { value: T; label: string; hint?: string }[];
  testId?: string;
}) {
  const active = values.length > 0;
  const summary = !active ? "All" : values.length === 1 ? options.find((o) => o.value === values[0])?.label ?? String(values[0]) : `${values.length} selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-testid={testId}
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm shadow-card transition-colors",
            active ? "border-brand/40 bg-brand-soft text-brand-ink" : "border-line-strong bg-surface text-ink hover:bg-subtle",
          )}
        >
          <span className={cn("text-xs", active ? "text-brand-ink/80" : "text-muted")}>{label}</span>
          <span className="max-w-[140px] truncate font-medium">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
          {active && (
            <button className="text-xs font-medium text-brand hover:underline" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {options.map((o) => {
            const checked = values.includes(o.value);
            return (
              <button
                key={String(o.value)}
                role="menuitemcheckbox"
                aria-checked={checked}
                onClick={() => onChange(checked ? values.filter((v) => v !== o.value) : [...values, o.value])}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-subtle"
              >
                <span className={cn("flex h-4 w-4 items-center justify-center rounded border", checked ? "border-brand bg-brand text-white" : "border-line-strong bg-surface")}>
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1 text-ink">{o.label}</span>
                {o.hint && <span className="text-xs text-faint">{o.hint}</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------- Misc pieces ------------------------------- */
export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-line/70", className)} />;
}

export function SectionTitle({ children, className, aside }: { children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{children}</h2>
      {aside}
    </div>
  );
}
