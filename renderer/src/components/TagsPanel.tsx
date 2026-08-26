import { useState, useEffect, useCallback, memo } from 'react';
import { Tag, Trash2, Plus, CloudUpload, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';

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
  repoPath?: string;
}

export const TagsPanel = memo(function TagsPanel({
  onDeleteTag,
  onSetLoading,
  repoPath,
}: TagsPanelProps) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [hasRemote, setHasRemote] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState('');

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
          const prevIdentifier = prev.map(t => `${t.name}-${t.commit}-${t.isPushed}`).sort().join(',');
          const newIdentifier = newTags.map(t => `${t.name}-${t.commit}-${t.isPushed}`).sort().join(',');

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
  }, [loadTags, repoPath]);

  useEffect(() => {
    const removeListener = window.electronAPI.onRepoChanged(() => {
      loadTags(false);
    });

    return () => {
      if (typeof removeListener === 'function') {
        removeListener();
      }
    };
  }, [loadTags]);

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
    <div className="rounded-lg border border-border bg-card/50 flex flex-col">
      <div className="border-b border-border p-3 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-2 text-foreground">
          {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          <Tag className="size-4" />
          <h3 className="font-semibold text-sm">Tags</h3>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCreateTagClick();
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors bg-secondary text-foreground hover:bg-muted dark:bg-amber-600/10 dark:text-amber-400 dark:hover:bg-amber-600/20"
        >
          <Plus className="size-3" />
          New
        </button>
      </div>
      {isExpanded && (
        <div className="flex flex-col">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter tags..."
                className="h-7 pl-7 text-xs bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-zinc-700"
              />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {loading && tags.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="divide-y divide-border">
                {tags
                  .filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
                  .map((tag) => (
                    <div
                      key={tag.name}
                      className="group flex items-center justify-between p-2.5 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <Tag className="size-3.5 flex-shrink-0 mt-0.5 text-black dark:text-amber-400" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-foreground">
                            {tag.name}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
                            className="p-1 rounded-md hover:bg-muted text-foreground hover:text-muted-foreground"
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
                          className="p-1 rounded-md hover:bg-muted text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-red-400 flex items-center gap-2">
              <Trash2 className="size-5" />
              Delete Tag
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-3 text-base">
              Are you sure you want to delete the tag <span className="font-mono font-semibold text-foreground">{deleteDialog}</span>?
              <br />
              <span className="text-sm text-muted-foreground mt-2 block">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(null)}
              className="bg-secondary border-border text-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium"
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
});
