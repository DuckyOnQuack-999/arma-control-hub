import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMaps, deleteMap, uploadMap } from '@/lib/supabaseApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Upload, Trash2, FileText, Map } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { MapFile } from '@/data/types';

export default function MapsTab({ serverId }: { serverId: number }) {
  const [deleteTarget, setDeleteTarget] = useState<MapFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: maps = [], isLoading } = useQuery({
    queryKey: ['maps', serverId],
    queryFn: () => getMaps(serverId),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => deleteMap(serverId, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps', serverId] });
      toast({ title: 'Map deleted' });
      setDeleteTarget(null);
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadMap(serverId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps', serverId] });
      toast({ title: 'Map uploaded' });
    },
    onError: (err: any) => toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' }),
  });

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
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
        <div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".xml,.aamap.xml,.cfg,.txt" />
          <Button size="sm" onClick={handleUpload} disabled={uploadMutation.isPending}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Upload
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>File</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
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
                <TableCell className="text-xs text-muted-foreground">{formatSize(m.size_bytes)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString()}
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
