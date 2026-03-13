// LINE Webhook Event Types (subset we need)

export interface LineEvent {
  type: string;
  replyToken?: string;
  source: {
    type: "user" | "group" | "room";
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  timestamp: number;
  message?: LineMessage;
}

export interface LineMessage {
  id: string;
  type: "text" | "image" | "video" | "audio" | "file" | "location" | "sticker";
  text?: string;
}

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

// LINE Messaging API message types

export interface LineTextMessage {
  type: "text";
  text: string;
}

export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: LineFlexContainer;
}

export interface LineFlexContainer {
  type: "bubble" | "carousel";
  [key: string]: unknown;
}

export type LineSendMessage = LineTextMessage | LineFlexMessage;
