import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={className || 'flex items-center justify-center py-12'}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
