// types.d.ts - Message contract for VTF Audio Extension

interface VTFMessage {
  source: 'vtf-inject' | 'vtf-content' | 'vtf-background';
  type: string;
  data: any;
  timestamp: number;
  priority?: 'normal' | 'high';
  messageId?: string; // For request/response matching
} 