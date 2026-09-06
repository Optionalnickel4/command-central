'use client';
import AssistantPanel from '@/components/assistant-panel';
import { SolStateProvider } from '@/components/sol-state';
import { Pane } from './primitives';
export default function AssistantWorkspace(){return <Pane title="Conversation"><div className="ax-assistant"><SolStateProvider><AssistantPanel/></SolStateProvider></div></Pane>;}
