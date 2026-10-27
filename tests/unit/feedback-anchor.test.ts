import {afterEach,describe,expect,it} from 'vitest';
import {buildAnchor,feedbackId,labelFor,pickTarget,resolveAnchor,selectorFor,stableKey} from '@/lib/feedback/anchor';
// jsdom has no layout, so give every element a box unless a test hides it.
const hidden=new WeakSet<Element>();
Element.prototype.getBoundingClientRect=function(this:Element){return (hidden.has(this)?{width:0,height:0}:{width:100,height:20,left:0,top:0,right:100,bottom:20,x:0,y:0})as DOMRect;};
const page=(html:string)=>{document.body.innerHTML=`<main id="main-content">${html}</main>`;};
const $=(selector:string)=>document.querySelector(selector)!;
afterEach(()=>{document.body.innerHTML='';});
const cards=`<section aria-label="Settings"><div class="card"><h3>Brand voice</h3><button>Edit voice</button></div><div class="card"><h3>Opening hours</h3><button>Edit hours</button></div></section>`;
describe('stable feedback anchors',()=>{
 it('anchors to the nearest stable identifier and not to a long structural path',()=>{
  page(`<div><div data-feedback-id="stat-open-handoffs"><p>Open handoffs</p><span>4</span></div></div>`);
  expect(selectorFor($('p'))).toBe('[data-feedback-id="stat-open-handoffs"] > p:nth-of-type(1)');
  expect(selectorFor($('[data-feedback-id]'))).toBe('[data-feedback-id="stat-open-handoffs"]');
  expect(buildAnchor($('p'),{quote:'',x:.5,y:.5})).toMatchObject({feedbackId:'stat-open-handoffs',tag:'p'});
 });
 it('ignores generated ids and uses full, uncapped paths to the page root',()=>{
  page(`<div id=":r1:"><div><div><div><div><div><div><div><div><span>deep</span></div></div></div></div></div></div></div></div></div>`);
  const selector=selectorFor($('span'));expect(selector.startsWith('#main-content > div:nth-of-type(1)')).toBe(true);expect(selector.split(' > ')).toHaveLength(11);expect(stableKey($('[id=":r1:"]'))).toBeNull();
  expect(document.querySelector(selector)).toBe($('span'));
 });
 it('keeps a pin on its component when a sibling is inserted above it, because it hangs off a stable parent',()=>{
  page(cards);const anchor=buildAnchor($('.card:nth-of-type(2) button'),{quote:'',x:.5,y:.5});
  $('section').insertAdjacentHTML('afterbegin','<div class="card"><h3>New card</h3><button>Edit new</button></div>');
  const found=resolveAnchor(anchor);expect(found.element?.textContent).toBe('Edit hours');expect(found.state).toBe('relocated');
 });
 it('warns instead of silently pointing at another component when the path now leads elsewhere',()=>{
  page(cards);const anchor=buildAnchor($('.card:nth-of-type(2) h3'),{quote:'',x:.5,y:.5});
  $('section').insertAdjacentHTML('afterbegin','<div class="card"><h3>New card</h3></div>');
  expect(resolveAnchor(anchor)).toMatchObject({state:'relocated'});
  page(cards.replace('Opening hours','Opening times'));
  expect(resolveAnchor(anchor).state).toBe('changed');
 });
 it('reports a removed target as missing and an invisible one as hidden',()=>{
  page(cards);const anchor=buildAnchor($('.card:nth-of-type(2) button'),{quote:'',x:.5,y:.5});
  hidden.add($('.card:nth-of-type(2) button'));expect(resolveAnchor(anchor).state).toBe('hidden');
  page(`<section aria-label="Settings"><div class="card"><h3>Brand voice</h3></div></section>`);expect(resolveAnchor(anchor)).toEqual({element:null,state:'missing'});
  page(`<p>unrelated</p>`);expect(resolveAnchor({...anchor,selector:'(('})).toEqual({element:null,state:'missing'});
 });
 it('does not relocate onto an ambiguous label or a different kind of element',()=>{
  page(`<div><button>Save</button><button>Save</button></div>`);const anchor={...buildAnchor($('button'),{quote:'',x:.5,y:.5})};
  page(`<div><span>Save</span><button>Save</button><button>Save</button></div>`);
  expect(resolveAnchor({...anchor,selector:'div > button:nth-of-type(9)'})).toEqual({element:null,state:'missing'});
 });
 it('treats page comments as always resolvable and never matches the feedback panel itself',()=>{
  page(`<p>Hello</p>`);expect(resolveAnchor({selector:'#main-content',label:'This page',quote:'',x:.98,y:0}).state).toBe('ok');
  document.body.insertAdjacentHTML('beforeend','<aside data-feedback-ui><button>Save</button></aside>');
  expect(resolveAnchor({selector:'aside > button',label:'Save',quote:'',x:.5,y:.5,tag:'button'}).state).toBe('missing');
 });
 it('pins the card or control that was clicked rather than its containing section',()=>{
  page(`<section><div class="card"><span class="icon">i</span> plain text</div><div class="card"><p>Text</p><button><svg></svg>Go</button></div></section>`);
  expect(pickTarget($('.card'))).toBe($('.card'));expect(pickTarget($('.icon'))).toBe($('.icon'));
  expect(pickTarget($('svg'))).toBe($('button'));expect(pickTarget($('p'))).toBe($('p'));expect(pickTarget($('section'))).toBe($('section'));
  page(`<div data-feedback-id="card-a"><div class="pad"></div></div>`);expect(pickTarget($('.pad'))).toBe($('[data-feedback-id]'));
 });
 it('builds readable ids for shared components and labels like the saved anchor',()=>{
  expect(feedbackId('stat','Open handoffs (24h)')).toBe('stat-open-handoffs-24h');
  page(`<input aria-label="Search" placeholder="x"/>`);expect(labelFor($('input'))).toBe('Search');
 });
});
