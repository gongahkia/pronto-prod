import {z} from 'zod';
export const feedbackPath=z.string().min(1).max(300).regex(/^\/(?:client(?:\/|$)|demo\/customer(?:\/|$))[^?#]*$/,'Feedback must refer to a prototype page.');
export const feedbackAnchor=z.object({selector:z.string().min(1).max(700),label:z.string().min(1).max(120),quote:z.string().max(300),x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).strict();
const body=z.string().trim().min(1).max(3000);
export const feedbackMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),path:feedbackPath,anchor:feedbackAnchor,body}).strict(),
 z.object({action:z.literal('reply'),threadId:z.string().uuid(),body}).strict(),
 z.object({action:z.literal('status'),threadId:z.string().uuid(),status:z.enum(['open','resolved'])}).strict(),
]);
