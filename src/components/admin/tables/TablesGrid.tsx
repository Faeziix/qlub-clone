"use client";

import * as React from "react";
import {
  Plus,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  KeyRound,
  Users,
  MapPin,
  QrCode,
} from "lucide-react";
import { Card, StatusPill, EmptyRow } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import {
  createTable,
  updateTableStatus,
  deleteTable,
} from "@/app/admin/tables/actions";

interface TableRow {
  id: string;
  code: string;
  label: string;
  area: string;
  seats: number;
  passcode: string;
  status: string;
}

interface TablesGridProps {
  vendorId: string;
  country: string;
  slug: string;
  theme: string;
  tables: TableRow[];
}

const STATUS_OPTIONS = ["available", "occupied", "bill-requested"] as const;

function buildCustomerUrl(
  country: string,
  slug: string,
  code: string,
  theme: string
) {
  const base = `/qr/${country}/${slug}?table=${encodeURIComponent(code)}`;
  return theme ? `${base}&theme=${encodeURIComponent(theme)}` : base;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink",
        copied && "border-success/40 text-success"
      )}
      aria-label={copied ? "Copied" : "Copy link"}
      title={copied ? "Copied" : "Copy link"}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

function TableCard({
  table,
  origin,
  customerUrl,
}: {
  table: TableRow;
  origin: string;
  customerUrl: string;
}) {
  const [isPending, startTransition] = React.useTransition();
  const fullUrl = origin ? `${origin}${customerUrl}` : customerUrl;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=4&data=${encodeURIComponent(
    fullUrl
  )}`;

  function cycleStatus() {
    const idx = STATUS_OPTIONS.indexOf(
      table.status as (typeof STATUS_OPTIONS)[number]
    );
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    startTransition(() => {
      void updateTableStatus(table.id, next);
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Delete ${table.label}? Its QR code will stop working immediately.`
      )
    )
      return;
    startTransition(() => {
      void deleteTable(table.id);
    });
  }

  const busy = isPending;

  return (
    <Card className={cn("flex flex-col gap-4", busy && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold">{table.label}</h3>
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">
              {table.code}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} /> {table.area}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {table.seats} seats
            </span>
            <span className="inline-flex items-center gap-1">
              <KeyRound size={12} /> {table.passcode}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={cycleStatus}
          disabled={busy}
          title="Click to change status"
          className="shrink-0 disabled:pointer-events-none"
        >
          <StatusPill status={table.status} />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="grid h-[120px] w-[120px] shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt={`QR code for ${table.label}`}
            width={112}
            height={112}
            className="h-28 w-28"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Customer link
          </p>
          <p className="mb-2 break-all font-mono text-xs leading-snug text-ink/80">
            {customerUrl}
          </p>
          <div className="flex items-center gap-2">
            <CopyButton value={fullUrl} />
            <a
              href={customerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-soft px-3 text-sm font-semibold text-brand transition-opacity hover:opacity-90"
            >
              <ExternalLink size={15} /> View menu
            </a>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-3">
        <button
          type="button"
          onClick={cycleStatus}
          disabled={busy}
          className="text-xs font-semibold text-muted transition-colors hover:text-ink disabled:pointer-events-none"
        >
          Toggle status
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-semibold text-danger transition-opacity hover:opacity-80 disabled:pointer-events-none"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </Card>
  );
}

export function TablesGrid({
  vendorId,
  country,
  slug,
  theme,
  tables,
}: TablesGridProps) {
  const [open, setOpen] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [code, setCode] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [area, setArea] = React.useState("Main");
  const [seats, setSeats] = React.useState(2);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function resetForm() {
    setCode("");
    setLabel("");
    setArea("Main");
    setSeats(2);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Table code is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createTable(vendorId, {
          code: code.trim(),
          label: label.trim(),
          seats,
          area: area.trim(),
        });
        resetForm();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add table.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {tables.length} {tables.length === 1 ? "table" : "tables"} configured
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus size={16} /> Add table
        </Button>
      </div>

      {tables.length === 0 ? (
        <EmptyRow>
          No tables yet. Add your first table to generate a pay-at-table QR code.
        </EmptyRow>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tables.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              origin={origin}
              customerUrl={buildCustomerUrl(country, slug, t.code, theme)}
            />
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Add table"
        height="auto"
      >
        <form onSubmit={submit} className="space-y-4 px-5 pb-8 pt-2">
          <div className="flex items-center gap-2 rounded-xl bg-brand-soft/60 p-3 text-xs text-brand">
            <QrCode size={16} className="shrink-0" />
            <span>
              A unique passcode and scan-to-pay QR code are generated
              automatically.
            </span>
          </div>

          <div>
            <label
              htmlFor="table-code"
              className="mb-1 block text-sm font-semibold"
            >
              Table code
            </label>
            <input
              id="table-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. T12"
              autoFocus
              className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Used in the customer URL. Keep it short and unique.
            </p>
          </div>

          <div>
            <label
              htmlFor="table-label"
              className="mb-1 block text-sm font-semibold"
            >
              Label
            </label>
            <input
              id="table-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Window booth"
              className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Optional. Defaults to &ldquo;Table {code || "…"}&rdquo;.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="table-area"
                className="mb-1 block text-sm font-semibold"
              >
                Area
              </label>
              <input
                id="table-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Main"
                className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-brand"
              />
            </div>
            <div>
              <label
                htmlFor="table-seats"
                className="mb-1 block text-sm font-semibold"
              >
                Seats
              </label>
              <input
                id="table-seats"
                type="number"
                min={1}
                max={40}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-brand"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth loading={isPending}>
            Add table
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
