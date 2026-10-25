import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import LoadingPage from "@/app/loading";
import BusinessError from "@/app/client/error";

afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("workspace recovery", () => {
  it("explains a slow request and replaces the unresolved skeleton with recovery actions", () => {
    vi.useFakeTimers(); render(<LoadingPage/>);
    expect(screen.getByRole("status").textContent).toContain("Checking your session");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole("status").textContent).toContain("longer than expected");
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByRole("heading").textContent).toBe("This page has not finished loading.");
    expect(screen.getByRole("link", { name: "Check sign-in" }).getAttribute("href")).toBe("/login?next=/client/inbox");
    expect(screen.getByRole("link", { name: "Reload business inbox" }).getAttribute("href")).toBe("/client/inbox");
  });
  it("offers a read-only retry without exposing server exception contents", () => {
    const retry = vi.fn(); render(<BusinessError error={new Error("sensitive connection string")} retry={retry}/>);
    expect(screen.getByRole("alert").textContent).toContain("database request failed");
    expect(screen.queryByText(/sensitive connection/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
