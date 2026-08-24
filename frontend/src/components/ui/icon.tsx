import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Aplica o contrato visual padrão aos ícones: stroke consistente,
 * tamanho controlado e aria-hidden (ícones são decorativos).
 */
export function Icon({
  IconComponent,
  className,
  size = 16,
  strokeWidth = 1.75,
  ...props
}: {
  IconComponent: React.ComponentType<LucideProps>;
  className?: string;
  size?: number;
} & Omit<LucideProps, "ref">) {
  return (
    <IconComponent
      aria-hidden="true"
      className={cn("shrink-0", className)}
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}