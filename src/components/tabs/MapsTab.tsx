import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/data/mockApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Upload, Trash2, FileText, Map } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { MapFile } from '@/data/types';

export default function MapsTab({ serverId }: { serverId: number }) {
  const [deleteTarget, setDeleteTarget] = useState<MapFile | null>(null);
  const queryClient = useQueryClient();

  const { data: maps = [], isLoading } = useQuery({
    queryKey: ['maps', serverId],
    queryFn: () => api.getMaps(serverId),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => api.deleteMap(serverId, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps', serverId] });
      toast({ title: 'Map deleted' });
      setDeleteTarget(null);
    },
  });

  const handleUpload = () => {
    toast({ title: 'Upload triggered', description: 'File upload will be available when connected to a real backend' });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-wide">Maps & Resources</h3>
        <Button size="sm" onClick={handleUpload}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Upload
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>File</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Modified</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {maps.map(m => (
              <TableRow key={m.filename} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-2">
                    {m.filename.endsWith('.aamap.xml') ? (
                      <Map className="h-4 w-4 text-primary" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-mono text-xs">{m.filename}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatSize(m.sizeBytes)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(m.modifiedAt * 1000).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteTarget(m)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {maps.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No map files found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Map File"
        description={`Are you sure you want to delete "${deleteTarget?.filename}"? This cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.filename)}
      />
    </div>
  );
}
