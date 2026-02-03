import { useTheme } from "./theme-provider";
import logoDark from "@assets/Bikri_Logo_1_1770108812464.png";
import logoLight from "@assets/Bikri_logo_Light_1770108911264.png";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className = "", size = "md" }: LogoProps) {
  const { theme } = useTheme();
  
  const sizeClasses = {
    sm: "h-6",
    md: "h-8",
    lg: "h-12",
  };

  const isDark = theme === "dark";

  return (
    <img 
      src={isDark ? logoDark : logoLight} 
      alt="Bikri" 
      className={`${sizeClasses[size]} w-auto ${className}`}
    />
  );
}
