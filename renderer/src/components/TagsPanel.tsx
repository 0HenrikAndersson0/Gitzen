import { useState, useEffect, useCallback } from 'react';
import { Tag, Trash2, Plus, CloudUpload } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { CreateTagDialog } from './CreateTagDialog';

interface TagItem {
  name: string;
  commit: string;
  date: Date;
  isPushed?: boolean;
}

interface TagsPanelProps {
  onDeleteTag?: (tag: string) => void;
  onSetLoading?: (loading: boolean, message?: string) => void;
}

export function TagsPanel({
  onDeleteTag,
  onSetLoading,
}: TagsPanelProps) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [hasRemote, setHasRemote] = useState(false);

  const loadTags = useCallback(async (showLoading: boolean = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [localResult, remoteResult, remoteUrlResult] = await Promise.all([
        window.electronAPI.getTags(),
        window.electronAPI.getRemoteTags('origin'),
        window.electronAPI.getRemoteUrl('origin')
      ]);
      
      const remoteExists = !!remoteUrlResult.url;
      setHasRemote(remoteExists);

      const remoteTags = new Set(remoteResult.success && remoteResult.tags ? remoteResult.tags : []);

      if (localResult.success && localResult.tags) {
        const newTags = localResult.tags.map((tag) => ({
          name: tag.name,
          commit: tag.commit,
          date: new Date(tag.date),
          isPushed: remoteExists ? remoteTags.has(tag.name) : undefined,
        }));
        
        setTags((prev) => {
          const prevIdentifier = prev.map(t => `${t.name}-${t.isPushed}`).sort().join(',');
          const newIdentifier = newTags.map(t => `${t.name}-${t.isPushed}`).sort().join(',');
          
          if (prevIdentifier !== newIdentifier) {
            return newTags;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
      if (showLoading) {
        toast.error('Failed to load tags');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTags(true);
  }, [loadTags]);

  useAutoRefresh({
    enabled: true,
    intervalMs: 10000,
    refreshFunctions: [() => loadTags(false)],
  });

  const handleCreateTagClick = () => {
    setShowCreateDialog(true);
  };

  const handlePushTag = async (tagName: string) => {
    onSetLoading?.(true, `Pushing tag ${tagName}...`);
    try {
      const result = await window.electronAPI.pushTag(tagName);
      if (result.success) {
        toast.success(`Tag ${tagName} pushed successfully`);
        await loadTags(true);
      } else {
        toast.error(result.error || 'Failed to push tag');
      }
    } catch (error) {
        toast.error('Failed to push tag');
    } finally {
        onSetLoading?.(false);
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    setDeleteDialog(tagName);
  };

  const confirmDelete = async () => {
    if (!deleteDialog) return;

    const tagName = deleteDialog;
    setDeleteDialog(null);
    onSetLoading?.(true, `Deleting tag ${tagName}...`);

    try {
      const result = await window.electronAPI.deleteTag(tagName);
      if (result.success) {
        toast.success(`Deleted tag ${tagName}`);
        onDeleteTag?.(tagName);
        await loadTags(true);
      } else {
        toast.error(result.error || 'Failed to delete tag');
      }
    } catch (error) {
      toast.error(`Failed to delete tag`);
    } finally {
      onSetLoading?.(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 flex flex-col">
      <div className="border-b border-zinc-800 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-100">
          <Tag className="size-4" />
          <h3 className="font-semibold text-sm">Tags</h3>
        </div>
        <button
          onClick={handleCreateTagClick}
          className="flex items-center gap-1.5 rounded-md bg-amber-600/10 px-2 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-600/20"
        >
          <Plus className="size-3" />
          New
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {loading && tags.length === 0 ? (
          <div className="p-4 text-center text-sm text-zinc-500">Loading...</div>
        ) : tags.length === 0 ? (
          <div className="p-4 text-center text-sm text-zinc-500">No tags</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {tags.map((tag) => (
              <div
                key={tag.name}
                className="group flex items-center justify-between p-2.5 transition-colors hover:bg-zinc-800/50"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <Tag className="size-3.5 flex-shrink-0 mt-0.5 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-zinc-300">
                      {tag.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="font-mono">{tag.commit.substring(0, 7)}</span>
                      <span>•</span>
                      <span>{tag.date.toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {hasRemote && tag.isPushed === false && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePushTag(tag.name);
                            }}
                            title="Push to origin"
                            className="p-1 rounded-md hover:bg-zinc-700 text-blue-400 hover:text-blue-300"
                        >
                            <CloudUpload className="size-3.5" />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTag(tag.name);
                        }}
                        title="Delete tag"
                        className="p-1 rounded-md hover:bg-zinc-700 text-red-400 hover:text-red-300"
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-red-400 flex items-center gap-2">
              <Trash2 className="size-5" />
              Delete Tag
            </DialogTitle>
            <DialogDescription className="text-zinc-400 mt-3 text-base">
              Are you sure you want to delete the tag <span className="font-mono font-semibold text-zinc-300">{deleteDialog}</span>? 
              <br />
              <span className="text-sm text-zinc-500 mt-2 block">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(null)}
              className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateTagDialog 
        open={showCreateDialog} 
        onOpenChange={setShowCreateDialog} 
        onTagCreated={() => loadTags(true)} 
      />
    </div>
  );
}
