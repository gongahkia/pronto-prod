export type FeedbackAnchor={selector:string;label:string;quote:string;x:number;y:number;tag?:string;feedbackId?:string};
export type FeedbackThread={id:string;page_path:string;anchor:FeedbackAnchor;status:'open'|'resolved';created_at:string;updated_at:string;comment_count?:number;
 comments:{id:string;author_name:string;author_user_id:string|null;body:string;created_at:string}[]};
