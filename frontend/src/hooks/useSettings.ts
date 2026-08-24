import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SettingItem } from "@/types";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: api.settings,
    staleTime: 30_000,
  });
}

export function useOpenRouterModels(enabled: boolean) {
  return useQuery({
    queryKey: ["openrouter-models"],
    queryFn: () => api.models(),
    enabled,
    staleTime: 15 * 60_000,
    retry: 1,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => api.updateSettings(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["health"] });
    },
  });
}

export function useResetSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetSettings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["health"] });
    },
  });
}

export const UNCHANGED = "__unchanged__";

export function buildPatch(items: SettingItem[], values: Record<string, string>, touched: Set<string>) {
  const patch: Record<string, unknown> = {};
  const itemsMap = new Map(items.map((it) => [it.key, it]));
  const allKeys = new Set([...items.map((i) => i.key), ...Object.keys(values), ...Array.from(touched)]);

  for (const key of allKeys) {
    const item = itemsMap.get(key);
    const raw = values[key] ?? "";
    const isSecret = item ? item.secret : (key.endsWith("_key") || key.includes("secret") || key.includes("token"));

    if (isSecret) {
      if (touched.has(key)) {
        if (raw !== "") {
          patch[key] = raw;
        }
      } else {
        patch[key] = UNCHANGED;
      }
      continue;
    }

    if (!touched.has(key) && values[key] === undefined && item) {
      continue;
    }

    if (item?.type === "int") patch[key] = raw === "" ? null : Number(raw);
    else if (item?.type === "float") patch[key] = raw === "" ? null : Number(raw);
    else if (item?.type === "bool") patch[key] = raw === "1" || raw === "true";
    else patch[key] = raw;
  }
  return patch;
}