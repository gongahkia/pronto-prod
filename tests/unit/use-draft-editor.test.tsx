import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDraftEditor } from "@/components/use-draft-editor";
afterEach(()=>{cleanup();vi.restoreAllMocks();document.body.innerHTML="";});
describe("unsaved draft edit protection",()=>{
 it("warns before reload while dirty and stops warning after saving",()=>{
  const {result}=renderHook(()=>useDraftEditor({tone:"courteous"},0));
  act(()=>result.current.setValue({tone:"warm"}));
  const event=new Event("beforeunload",{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
  act(()=>result.current.saved(2));
  const saved=new Event("beforeunload",{cancelable:true});window.dispatchEvent(saved);expect(saved.defaultPrevented).toBe(false);
  expect(result.current.value.tone).toBe("warm");expect(result.current.version).toBe(2);
 });
 it("allows cancelling navigation without losing edits",()=>{
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
  const {result}=renderHook(()=>useDraftEditor("original",1));act(()=>result.current.setValue("edited"));
  const anchor=document.createElement("a");anchor.href="/client/inbox";document.body.append(anchor);
  expect(fireEvent.click(anchor)).toBe(false);expect(confirm).toHaveBeenCalledOnce();expect(result.current.value).toBe("edited");
 });
 it("keeps unsaved edits and their old save version when another user changes this card",()=>{
  const {result,rerender}=renderHook(({value,version})=>useDraftEditor(value,version),{initialProps:{value:"original",version:2}});
  act(()=>result.current.setValue("my edit"));rerender({value:"someone else's edit",version:3});
  expect(result.current.value).toBe("my edit");expect(result.current.version).toBe(2);
  act(()=>result.current.reset());expect(result.current.value).toBe("someone else's edit");expect(result.current.dirty).toBe(false);
 });
 it("accepts a newer version from another card without discarding this card's edits",()=>{
  const {result,rerender}=renderHook(({version})=>useDraftEditor("original",version),{initialProps:{version:2}});
  act(()=>result.current.setValue("my edit"));rerender({version:3});
  expect(result.current.value).toBe("my edit");expect(result.current.version).toBe(3);
 });
});
