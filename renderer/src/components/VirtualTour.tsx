import { useState } from 'react';
import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';

interface VirtualTourProps {
  run: boolean;
  onFinish: () => void;
}

export function VirtualTour({ run, onFinish }: VirtualTourProps) {
  const [steps] = useState<Step[]>([
    {
      target: '#tour-repo-header',
      content: 'Welcome to Gitzen! The header is your command center. You can open terminals, push, pull, and fetch from your remote repositories right from here.',
      placement: 'bottom',
    },
    {
      target: '#tour-repo-selector',
      content: 'The Repository Selector allows you to quickly switch between your recent projects. You can also click "Open New Repository" here to clone or initialize a brand new Git project from scratch.',
      placement: 'bottom',
    },
    {
      target: '#tour-branches-panel',
      content: 'This is the Branch Management panel. View your local branches, remote branches, and stashes. Right-click any branch to rename it, push/pull, delete, or initialize a Git Flow workflow.',
      placement: 'right',
    },
    {
      target: '#tour-commit-graph',
      content: 'The interactive Commit Graph provides a beautiful visualization of your Git history. Right-click on any commit node to access advanced operations like cherry-picking, reverting, or hard resetting your branch to that state.',
      placement: 'auto',
    },
    {
      target: '#tour-commit-panel',
      content: "Your Staging Area. This panel lets you precisely stage or unstage modified files. Don't want to write a commit message? Just click the sparkles icon to have our local AI generate a concise, conventional commit message based on your exact diffs.",
      placement: 'left',
    },
    {
      target: '#tour-activity-log',
      content: 'The Activity Log. Gitzen is fully transparent—every Git command executed under the hood is logged here in real-time. If an operation fails, check here for the exact error output.',
      placement: 'top',
    },
    {
      target: '#tour-agent-button',
      content: 'Need help coding? Click the Agent button to summon your own AI Coding Assistant. It can write code, resolve merge conflicts, and answer questions directly within your repository context.',
      placement: 'bottom',
    },
    {
      target: '#tour-settings',
      content: "Finally, access app settings here to configure AI providers (like Ollama, Claude, or Copilot), switch themes, or view the keyboard shortcuts cheat sheet. That's it for the tour! Enjoy Gitzen.",
      placement: 'bottom',
    }
  ]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    
    if (finishedStatuses.includes(status)) {
      onFinish();
    }
  };

  const GitzenBeacon = (props: any) => {
    return (
      <div 
        {...props} 
        className="flex items-center justify-center w-12 h-12 cursor-pointer relative"
      >
        <style>
          {`
            @keyframes beacon-heartbeat {
              0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
              70% { transform: scale(1.1); box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
              100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
            }
            .animate-beacon-heartbeat {
              animation: beacon-heartbeat 2s infinite ease-in-out;
            }
          `}
        </style>
        <img 
          src="/icon.png" 
          alt="Gitzen Tour" 
          className="w-full h-full object-cover rounded-full bg-white animate-beacon-heartbeat border-2 border-primary" 
        />
      </div>
    );
  };

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      disableBeacon={false}
      disableOverlayClose={true}
      beaconComponent={GitzenBeacon}
      steps={steps}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#3b82f6', // blue-500
          backgroundColor: '#1f2937', // gray-800
          textColor: '#f3f4f6', // gray-100
          arrowColor: '#1f2937',
          overlayColor: 'rgba(0, 0, 0, 0.5)',
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        buttonNext: {
          backgroundColor: '#3b82f6',
        },
        buttonBack: {
          marginRight: 10,
          color: '#9ca3af',
        },
        buttonSkip: {
          color: '#9ca3af',
        }
      }}
    />
  );
}
