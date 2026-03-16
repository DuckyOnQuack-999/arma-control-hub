import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = forwardRef<HTMLDivElement, { className?: string }>(
  ({ className }, ref) => {
    return (
      <div ref={ref} className={className || 'flex items-center justify-center py-12'}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
);

LoadingSpinner.displayName = 'LoadingSpinner';
