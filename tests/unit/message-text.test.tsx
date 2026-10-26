import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageText } from "@/components/message-text";
import { plainMessageText } from "@/lib/message-text";
describe("plain chat replies", () => {
 it("removes provider formatting without losing the address", () => {
  expect(plainMessageText("252 North Bridge Road, <strong>#03-37</strong>, Singapore 179103.")).toBe("252 North Bridge Road, #03-37, Singapore 179103.");
 });
 it("discards executable HTML and keeps readable paragraph breaks", () => {
  const text=plainMessageText('<p>Hello</p><script>alert(1)</script><p><b>Goodbye</b><img src=x onerror=alert(2)></p>');
  expect(text).toBe("Hello\nGoodbye");
  const html=renderToStaticMarkup(<MessageText text={text}/>);
  expect(html).not.toContain("<script"); expect(html).not.toContain("<img");
 });
 it("links a prefilled Chope URL with intact parameters and trims sentence punctuation", () => {
  const url="https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city?adults=4&time=7%3A00+pm";
  const html=renderToStaticMarkup(<MessageText text={`Book here: ${url}.`}/>);
  expect(html).toContain(`href="${url.replace(/&/g,"&amp;")}"`); expect(html).toContain('rel="noopener noreferrer"');
 });
 it("preserves customer text as escaped text", () => {
  const html=renderToStaticMarkup(<MessageText text="<strong>my message</strong>" fromCustomer/>);
  expect(html).toContain("&lt;strong&gt;my message&lt;/strong&gt;");
 });
});
