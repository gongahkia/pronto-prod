import { plainMessageText } from "@/lib/message-text";

export function MessageText({ text, fromCustomer = false }: { text: string; fromCustomer?: boolean }) {
  const value = fromCustomer ? text : plainMessageText(text);
  return <>{value.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return <span key={index}>{part}</span>;
    const url = part.replace(/[).,;!?]+$/, "");
    return <span key={index}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">{url}</a>{part.slice(url.length)}</span>;
  })}</>;
}
