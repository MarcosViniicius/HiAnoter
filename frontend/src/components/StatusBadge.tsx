import { STATUS_META, type StatusTone } from "@/lib/status";
import { Badge } from "./ui/badge";
import type { RecordingStatus } from "@/types";

const TONE_TO_VARIANT: Record<StatusTone, "neutral" | "accent" | "success" | "danger" | "warn"> = {
  neutral: "neutral",
  accent: "accent",
  success: "success",
  danger: "danger",
  warn: "warn",
};

export function StatusBadge({
  status,
  className,
  withDescription,
}: {
  status: RecordingStatus;
  className?: string;
  withDescription?: boolean;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.QUEUED;
  return (
    <Badge
      variant={TONE_TO_VARIANT[meta.tone]}
      dot
      pulse={meta.pulse}
      title={withDescription ? meta.description : undefined}
      className={className}
    >
      {meta.label}
    </Badge>
  );
}