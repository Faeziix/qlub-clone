"use client";

import * as React from "react";
import axios from "axios";
import type { BoardOrder } from "@/components/admin/orders/OrdersBoard";

interface PollingState {
  orders: BoardOrder[];
  isLoading: boolean;
  error: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

interface UseOrdersPollingOptions {
  intervalMs?: number;
  status?: string;
  limit?: number;
}

interface AdminOrdersResponse {
  ok: boolean;
  orders: BoardOrder[];
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_INTERVAL_MS = 8_000;

export function useOrdersPolling(
  initialOrders: BoardOrder[],
  options: UseOrdersPollingOptions = {}
): PollingState & { loadMore: () => void; refresh: () => void } {
  const { intervalMs = DEFAULT_INTERVAL_MS, status, limit } = options;

  const [state, setState] = React.useState<PollingState>({
    orders: initialOrders,
    isLoading: false,
    error: null,
    nextCursor: null,
    hasMore: false,
  });

  const orderMapRef = React.useRef<Map<string, BoardOrder>>(
    new Map(initialOrders.map((o) => [o.id, o]))
  );

  const buildUrl = React.useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);
      const qs = params.toString();
      return `/api/admin/orders${qs ? `?${qs}` : ""}`;
    },
    [status, limit]
  );

  const fetchAndMerge = React.useCallback(
    async (cursor?: string | null) => {
      try {
        const { data } = await axios.get<AdminOrdersResponse>(buildUrl(cursor));
        if (!data.ok) return;

        const map = orderMapRef.current;
        for (const order of data.orders) {
          map.set(order.id, order);
        }

        const merged = Array.from(map.values()).sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setState((prev) => ({
          ...prev,
          orders: merged,
          isLoading: false,
          error: null,
          nextCursor: data.nextCursor,
          hasMore: data.hasMore,
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch orders";
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
      }
    },
    [buildUrl]
  );

  const refresh = React.useCallback(() => {
    fetchAndMerge(null);
  }, [fetchAndMerge]);

  const loadMore = React.useCallback(() => {
    if (!state.hasMore || state.isLoading) return;
    setState((prev) => ({ ...prev, isLoading: true }));
    fetchAndMerge(state.nextCursor);
  }, [state.hasMore, state.isLoading, state.nextCursor, fetchAndMerge]);

  React.useEffect(() => {
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { ...state, loadMore, refresh };
}
