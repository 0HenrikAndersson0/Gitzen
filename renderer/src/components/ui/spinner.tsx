import { cn } from "@/lib/utils"
import { Button } from "./button"
import { X } from "lucide-react"

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Spinner({ className, size = 'md', ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
    xl: 'h-16 w-16 border-4'
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-border border-t-transparent",
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
}

export function LoadingOverlay({ message, onCancel }: { message?: string, onCancel?: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center flex-col gap-4 pointer-events-auto select-none">
      <Spinner size="lg" className="border-blue-500 border-t-transparent" />
      {message && <div className="text-foreground font-medium animate-pulse">{message}</div>}
      {onCancel && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onCancel}
          className="mt-2 bg-secondary/50 border-border text-foreground hover:bg-muted"
        >
          <X className="size-4 mr-2" />
          Cancel Operation
        </Button>
      )}
    </div>
  )
}
