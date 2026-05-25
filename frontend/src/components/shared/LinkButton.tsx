import type React from "react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LinkButton({
  to,
  children,
  variant = "default",
  size
}: {
  to: string;
  children: React.ReactNode;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "xs" | "sm" | "lg";
}) {
  return (
    <Link to={to} className={cn(buttonVariants({ variant, size }))}>
      {children}
    </Link>
  );
}
