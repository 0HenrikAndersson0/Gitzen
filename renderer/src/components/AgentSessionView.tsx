import React, { useState, useEffect } from 'react';
import { AgentTerminal } from './AgentTerminal';
import { Play, Square, Trash2, Terminal as TerminalIcon, CodeSquare } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from './ui/select';
import { Button } from './ui/button';
import { AgentReviewModal } from './AgentReviewModal';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
}

export interface DraftFeedback {
  id: string;
  filePath: string;
  hunkIndex: number;
  lineIndex: number;
  lineContent: string;
  text: string;
}

interface AgentSessionViewProps {
  repoPath: string;
  currentBranch: string;
  files?: FileChange[];
  onRefresh?: () => void;
  gitOps?: any;
}

const NO_ARGS: string[] = ['-l'];

export const AgentSessionView: React.FC<AgentSessionViewProps> = ({ 
  repoPath, 
  currentBranch,
  files = []
}) => {
  const [provider, setProvider] = useState<string>('agy');
  const [isActive, setIsActive] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  // Update sessionId when branch changes
  useEffect(() => {
    if (currentBranch) {
      const newSessionId = `agent-${currentBranch.replace(/[^a-zA-Z0-9-]/g, '-')}`;
      setSessionId(newSessionId);
      
      // Check if session already exists in backend
      window.electronAPI.ptyExists(newSessionId).then(res => {
        if (res.success && res.exists) {
          setIsActive(true);
        } else {
          setIsActive(false);
        }
      });
    }
  }, [currentBranch]);

  useEffect(() => {
    async function loadModels() {
      try {
        const result = await window.electronAPI.gitGetOllamaModels();
        if (result.success && result.models) {
          setOllamaModels(result.models);
        }
      } catch (err) {
        console.error('Failed to fetch ollama models:', err);
      }
    }
    loadModels();
  }, []);

  const startSession = () => {
    setIsActive(true);
  };

  const stopSession = () => {
    setIsActive(false);
    window.electronAPI.ptyKill(sessionId);
  };

  const getInitialCommand = () => {
    if (provider.startsWith('ollama:')) {
      const modelName = provider.substring(7);
      return `ollama run ${modelName}\r`;
    }
    switch (provider) {
      case 'agy': return 'agy\r';
      case 'claude': return 'claude\r';
      case 'ollama': return 'ollama run llama3\r';
      default: return '';
    }
  };

  const shellCommand = '$SHELL';

  const handleSendAllFeedback = (feedbacks: DraftFeedback[]) => {
    if (!isActive) {
      alert("Please start the agent session first.");
      return;
    }
    if (feedbacks.length === 0) return;
    
    const byFile = feedbacks.reduce((acc, curr) => {
       if (!acc[curr.filePath]) acc[curr.filePath] = [];
       acc[curr.filePath].push(curr);
       return acc;
    }, {} as Record<string, DraftFeedback[]>);
    
    let prompt = "Here is some feedback on the recent changes:\n\n";
    for (const [file, items] of Object.entries(byFile)) {
       prompt += `File: ${file}\n`;
       items.forEach(item => {
          prompt += `Line: \`${item.lineContent.trim()}\`\n`;
          prompt += `Comment: ${item.text}\n\n`;
       });
    }
    
    window.electronAPI.ptyWrite(sessionId, prompt + '\r');
  };

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-lg overflow-hidden">
      {/* Control Header */}
      <div className="flex-none flex items-center justify-between p-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <TerminalIcon className="size-5 text-primary" />
          <h2 className="font-semibold text-foreground">Agent Session</h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {currentBranch}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {files.length > 0 && (
            <Button 
              onClick={() => setShowReviewModal(true)} 
              size="sm" 
              variant="outline" 
              className="h-8 border-white/30 text-white hover:bg-white/10"
            >
              <CodeSquare className="size-3.5 mr-1.5" />
              Start Code Review
            </Button>
          )}

          <Select value={provider} onValueChange={setProvider} disabled={isActive}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Select Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="agy">Agy (CLI)</SelectItem>
                <SelectItem value="claude">Claude (CLI)</SelectItem>
              </SelectGroup>
              
              <SelectSeparator />
              
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground font-semibold px-2 py-1">Ollama Models</SelectLabel>
                {ollamaModels.length > 0 ? (
                  ollamaModels.map(model => (
                    <SelectItem key={`ollama:${model}`} value={`ollama:${model}`} className="pl-6">
                      {model}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="ollama" className="pl-6">Ollama</SelectItem>
                )}
              </SelectGroup>
            </SelectContent>
          </Select>

          {!isActive ? (
            <Button onClick={startSession} size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!sessionId}>
              <Play className="size-3.5 mr-1.5" />
              Start Agent
            </Button>
          ) : (
            <Button onClick={stopSession} size="sm" variant="destructive" className="h-8">
              <Square className="size-3.5 mr-1.5" />
              Stop Agent
            </Button>
          )}

          <Button
            onClick={() => {
              stopSession();
              // force unmount old terminal by clearing active status, then immediately start new
              setTimeout(() => startSession(), 100);
            }}
            size="sm"
            variant="outline"
            className="h-8 px-2"
            title="Restart Session"
          >
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Main Content Area: Split Terminal and File Changes */}
      <div className="flex-1 flex min-h-0 bg-background overflow-hidden">
        {/* Terminal Area */}
        <div className="flex-1 min-w-0 p-1 bg-zinc-950 border-r border-border">
          {isActive ? (
            <AgentTerminal
              key={sessionId}
              sessionId={sessionId}
              command={shellCommand}
              args={NO_ARGS}
              cwd={repoPath}
              initialInput={getInitialCommand()}
              onExit={() => setIsActive(false)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-500 font-mono text-sm">
              <div className="text-center">
                <TerminalIcon className="size-12 mx-auto mb-4 opacity-20" />
                <p>Click "Start Agent" to initialize the session.</p>
                <p className="mt-2 opacity-50">Context: {repoPath}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Agent Review Modal */}
      {showReviewModal && (
        <AgentReviewModal
          files={files}
          onClose={() => setShowReviewModal(false)}
          onSubmitFeedback={handleSendAllFeedback}
        />
      )}
    </div>
  );
};
