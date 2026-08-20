import { cn } from "@/lib/utils";

type GroupLogoProps = {
  src: string;
  className?: string;
  title?: string;
  eager?: boolean;
};

export function GroupLogo({
  src,
  className,
  title = "Stellar Society Group",
  eager = false,
}: GroupLogoProps) {
  return (
    <img
      src={src}
      alt={title}
      title={title}
      loading={eager ? "eager" : "lazy"}
      className={cn("object-contain", className)}
    />
  );
}
