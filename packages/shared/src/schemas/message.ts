import { z } from 'zod';
import { MESSAGE_FEEDBACKS, type MessageFeedback } from '../constants';

const feedbackSchema = z.enum([...MESSAGE_FEEDBACKS] as [
  MessageFeedback,
  ...MessageFeedback[],
]);

/** 消息反馈请求体：up/down 打分，null 取消反馈（再次点击同项） */
export const messageFeedbackSchema = z.object({
  feedback: feedbackSchema.nullable(),
});
export type MessageFeedbackInput = z.infer<typeof messageFeedbackSchema>;
