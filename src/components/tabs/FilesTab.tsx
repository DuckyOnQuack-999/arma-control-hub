import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listFiles, readFile, writeFile, renameFile, deleteFile, createDirectory } from '@/lib/supabaseApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  Folder, File, ChevronRight, ArrowLeft, Save, X,
  Edit2, Trash2, FolderPlus, FilePlus, RefreshCw, Home
} from 'lucide-react';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

interface Props {
  serverId: number;
  agentUrl: string | null;
}

const FilesTab = ({ serverId, agentUrl }: Props) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newItemType, setNewItemType] = useState<'file' | 'directory' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: files = [], isLoading, refetch } = useQuery({
    queryKey: ['files', serverId, currentPath],
    queryFn: () => listFiles(serverId, currentPath),
    enabled: !!agentUrl,
  });

  const navigateTo = useCallback((path: string) => {
    setEditingFile(null);
    setCurrentPath(path);
  }, []);

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  const handleOpenFile = async (name: string) => {
    const filePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      const result = await readFile(serverId, filePath);
      setEditingFile({ path: filePath, content: result.content });
      setEditContent(result.content);
    } catch (err: any) {
      toast({ title: 'Failed to read file', description: err?.message, variant: 'destructive' });
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setSaving(true);
    try {
      await writeFile(serverId, editingFile.path, editContent);
      setEditingFile({ ...editingFile, content: editContent });
      toast({ title: 'File saved', description: editingFile.path });
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (oldName: string) => {
    if (!renameValue.trim()) return;
    const oldFull = currentPath === '/' ? `/${oldName}` : `${currentPath}/${oldName}`;
    const newFull = currentPath === '/' ? `/${renameValue}` : `${currentPath}/${renameValue}`;
    try {
      await renameFile(serverId, oldFull, newFull);
      toast({ title: 'Renamed', description: `${oldName} → ${renameValue}` });
      setRenamingItem(null);
      refetch();
    } catch (err: any) {
      toast({ title: 'Rename failed', description: err?.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const fullPath = currentPath === '/' ? `/${deleteTarget}` : `${currentPath}/${deleteTarget}`;
    try {
      await deleteFile(serverId, fullPath);
      toast({ title: 'Deleted', description: deleteTarget });
      setDeleteTarget(null);
      refetch();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    }
  };

  const handleCreateItem = async () => {
    if (!newItemName.trim() || !newItemType) return;
    const fullPath = currentPath === '/' ? `/${newItemName}` : `${currentPath}/${newItemName}`;
    try {
      if (newItemType === 'directory') {
        await createDirectory(serverId, fullPath);
        toast({ title: 'Directory created', description: fullPath });
      } else {
        await writeFile(serverId, fullPath, '');
        toast({ title: 'File created', description: fullPath });
      }
      setNewItemType(null);
      setNewItemName('');
      refetch();
    } catch (err: any) {
      toast({ title: 'Create failed', description: err?.message, variant: 'destructive' });
    }
  };

  if (!agentUrl) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <Folder className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <h3 className="font-display text-lg font-bold mb-1">No Agent Connected</h3>
        <p className="text-sm text-muted-foreground">
          File management requires a host agent. Set up an agent in the Agent Wizard to browse and edit server files.
        </p>
      </div>
    );
  }

  if (editingFile) {
    const hasChanges = editContent !== editingFile.content;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditingFile(null)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <span className="font-mono text-sm text-muted-foreground">{editingFile.path}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && <span className="text-xs text-neon-red">• Unsaved changes</span>}
            <Button size="sm" onClick={handleSaveFile} disabled={saving || !hasChanges}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
          </div>
        </div>
        <Textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="font-mono text-xs min-h-[500px] bg-background border-border"
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" onClick={() => navigateTo('/')} className="px-2">
            <Home className="h-4 w-4" />
          </Button>
          {breadcrumbs.map((seg, i) => {
            const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
            return (
              <span key={path} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <Button variant="ghost" size="sm" className="px-2 text-xs font-mono" onClick={() => navigateTo(path)}>
                  {seg}
                </Button>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => { setNewItemType('file'); setNewItemName(''); }}>
            <FilePlus className="h-4 w-4 mr-1" /> New File
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setNewItemType('directory'); setNewItemName(''); }}>
            <FolderPlus className="h-4 w-4 mr-1" /> New Folder
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* New item inline form */}
      {newItemType && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-card p-2">
          {newItemType === 'directory' ? <Folder className="h-4 w-4 text-primary" /> : <File className="h-4 w-4 text-muted-foreground" />}
          <Input
            autoFocus
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder={`New ${newItemType} name...`}
            className="h-8 text-sm font-mono"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateItem(); if (e.key === 'Escape') setNewItemType(null); }}
          />
          <Button size="sm" variant="default" onClick={handleCreateItem} disabled={!newItemName.trim()}>
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNewItemType(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* File listing */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading files…</div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Empty directory</div>
        ) : (
          <div className="divide-y divide-border">
            {currentPath !== '/' && (
              <button
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                onClick={() => {
                  const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
                  navigateTo(parent);
                }}
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">..</span>
              </button>
            )}
            {(files as FileEntry[])
              .sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
              })
              .map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors group"
                >
                  {entry.type === 'directory' ? (
                    <Folder className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}

                  {renamingItem === entry.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="h-7 text-sm font-mono"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(entry.name); if (e.key === 'Escape') setRenamingItem(null); }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleRename(entry.name)}>✓</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenamingItem(null)}>✕</Button>
                    </div>
                  ) : (
                    <>
                      <button
                        className="flex-1 text-left text-sm font-mono truncate"
                        onClick={() => {
                          if (entry.type === 'directory') {
                            const next = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
                            navigateTo(next);
                          } else {
                            handleOpenFile(entry.name);
                          }
                        }}
                      >
                        {entry.name}
                      </button>
                      {entry.size !== undefined && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}
                        </span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); setRenamingItem(entry.name); setRenameValue(entry.name); }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry.name); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete File"
        description={`Are you sure you want to delete "${deleteTarget}"? This cannot be undone.`}
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default FilesTab;
