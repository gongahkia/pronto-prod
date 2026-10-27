import type {FeedbackAnchor} from './types';

// Pins are anchored to the most stable thing available (data-feedback-id, data-testid, a hand-written id or a
// landmark's aria-label) plus a short structural path from it. Every pin also remembers what it pointed at (tag and
// label), so when the page changes we can relocate it, warn that it changed, or say it is gone instead of silently
// landing on a different component.
export const PAGE_LABEL='This page';
export type AnchorState='ok'|'relocated'|'changed'|'missing'|'hidden';
export type ResolvedAnchor={element:Element|null;state:AnchorState};

const LANDMARKS=new Set(['section','nav','aside','form','header','footer','main','dialog']);
const INTERACTIVE='button,a[href],input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"]';
const TEXTUAL='label,h1,h2,h3,h4,h5,h6,p,li,td,th,img,figcaption,blockquote';
const MAX_SELECTOR=700,MAX_DEPTH=30;

export function escapeIdent(value:string){
 const css=(globalThis as {CSS?:{escape?:(v:string)=>string}}).CSS;
 return css?.escape?css.escape(value):value.replace(/[^a-zA-Z0-9_\u00a0-\uffff-]/g,c=>`\\${c}`).replace(/^(\d)/,'\\3$1 ');
}
const quote=(value:string)=>`"${value.replace(/["\\]/g,'\\$&')}"`;
// React useId, Radix and similar libraries mint ids that change between renders; they are not anchors.
const looksGenerated=(id:string)=>/^(:|«|radix-|headlessui-|react-aria|__)/.test(id)||/[:«»]/.test(id);

export function stableKey(element:Element):{selector:string;value:string}|null{
 const feedbackId=element.getAttribute('data-feedback-id');
 if(feedbackId)return {selector:`[data-feedback-id=${quote(feedbackId)}]`,value:feedbackId};
 const testId=element.getAttribute('data-testid');
 if(testId)return {selector:`[data-testid=${quote(testId)}]`,value:testId};
 if(element.id&&!looksGenerated(element.id))return {selector:`#${escapeIdent(element.id)}`,value:element.id};
 const aria=element.getAttribute('aria-label');
 const tag=element.tagName.toLowerCase();
 if(aria&&LANDMARKS.has(tag))return {selector:`${tag}[aria-label=${quote(aria)}]`,value:aria};
 return null;
}

export function labelFor(element:Element){
 return (element.getAttribute('aria-label')||element.getAttribute('placeholder')||element.textContent||element.tagName).trim().replace(/\s+/g,' ').slice(0,120)||'Page element';
}

export function selectorFor(element:Element){
 const parts:string[]=[];let node:Element|null=element;
 for(let depth=0;node&&depth<MAX_DEPTH;depth+=1){
  const key=stableKey(node);if(key){parts.unshift(key.selector);return clip(parts);}
  if(node.tagName==='BODY'){parts.unshift('body');return clip(parts);}
  if(node.tagName==='HTML'){parts.unshift('html');return clip(parts);}
  const tag=node.tagName.toLowerCase();
  const same=node.parentElement?[...node.parentElement.children].filter(e=>e.tagName===node!.tagName):[];
  parts.unshift(`${tag}:nth-of-type(${Math.max(1,same.indexOf(node)+1)})`);node=node.parentElement;
 }
 return clip(parts);
}
// Dropping the top of an over-long path keeps the stable key and the target end; the label check catches mismatches.
function clip(parts:string[]){let selector=parts.join(' > ');while(selector.length>MAX_SELECTOR&&parts.length>2){parts.splice(1,1);selector=parts.join(' > ');}return selector.slice(0,MAX_SELECTOR);}

// What the click will pin: the control or text block under the pointer, else the thing itself, never a distant section.
export function pickTarget(target:Element):Element{
 const control=target.closest(INTERACTIVE);if(control)return control;
 const tagged=target.closest('[data-feedback-id]');if(tagged)return tagged;
 return target.closest(TEXTUAL)??target;
}

export function nearestStableValue(element:Element){
 for(let node:Element|null=element,depth=0;node&&depth<MAX_DEPTH;node=node.parentElement,depth+=1){const key=stableKey(node);if(key)return key.value;}
 return undefined;
}

export function buildAnchor(element:Element,details:{quote:string;x:number;y:number}):FeedbackAnchor{
 const feedbackId=nearestStableValue(element);
 return {selector:selectorFor(element),label:labelFor(element),quote:details.quote,tag:element.tagName.toLowerCase(),...(feedbackId?{feedbackId:feedbackId.slice(0,200)}:{}),x:details.x,y:details.y};
}

const visible=(element:Element)=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0;};
const sameLabel=(element:Element,anchor:FeedbackAnchor)=>anchor.label===PAGE_LABEL||labelFor(element)===anchor.label;
const sameTag=(element:Element,anchor:FeedbackAnchor)=>!anchor.tag||element.tagName.toLowerCase()===anchor.tag;

export function resolveAnchor(anchor:FeedbackAnchor,doc:Document=document):ResolvedAnchor{
 let direct:Element|null=null;
 try{direct=doc.querySelector(anchor.selector);}catch{direct=null;}
 if(direct&&direct.closest('[data-feedback-ui]'))direct=null;
 if(direct&&!sameTag(direct,anchor))direct=null;
 if(direct&&sameLabel(direct,anchor))return {element:direct,state:visible(direct)?'ok':'hidden'};
 // The path now leads somewhere else (or nowhere): look for the one element that still carries the same label.
 if(anchor.label!==PAGE_LABEL&&anchor.label!=='Page element'){
  let matches:Element[]=[];
  try{matches=[...doc.querySelectorAll(anchor.tag??'*')].filter(e=>!e.closest('[data-feedback-ui]')&&labelFor(e)===anchor.label);}catch{matches=[];}
  if(matches.length===1)return {element:matches[0],state:visible(matches[0])?'relocated':'hidden'};
 }
 if(direct)return {element:direct,state:visible(direct)?'changed':'hidden'};
 return {element:null,state:'missing'};
}

export const anchorWarning:Record<Exclude<AnchorState,'ok'>,string>={
 relocated:'The layout changed, so this pin was moved to the element with the same label. Check that it still points at the right component.',
 changed:'The element at this location has changed since the comment was made. Check that the pin still points at the right component.',
 missing:'This comment\'s target can\'t be found on the page. It may have been moved, renamed or removed, or it belongs to a view that isn\'t showing.',
 hidden:'The target exists but isn\'t visible right now, for example inside a collapsed section or another tab.',
};

// For shared components: derive a readable, stable data-feedback-id from a title, e.g. feedbackId('stat','Open handoffs').
export function feedbackId(kind:string,title:string){return `${kind}-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`.slice(0,120);}
