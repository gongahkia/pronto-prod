⏺ Here's the audit. Direct, no fluff.                                 
                                                                      
  High-severity issues                                                
                                                                      
  1. New components ship with dead Tailwind classes (visual           
  regressions everywhere)                                             
                                                                      
  My recent work uses classes that don't exist in this theme. They    
  silently render no styles, so panels look broken in dark mode and   
  badly contrasted in light mode.                                     
                                                                      
  - border-border, divide-border → should be border-line, divide-line.
   (integrations-panel.tsx, bulk-escalation-list.tsx,                 
  monthly-report/page.tsx, trace/page.tsx,                        
  operator/escalations/page.tsx)                                      
  - bg-surface-2 → should be bg-surface. (same files)
  - text-red-500, text-emerald-500, text-yellow-500 → should be       
  text-danger, text-success, text-warning. The semantic tokens    
  auto-adapt to dark mode; the raw Tailwind ones don't match the
  palette.
  - ui-input → not defined in globals.css. Inputs get default styling 
  because globals.css styles bare input/select/textarea, but the class
   itself does nothing. Either define .ui-input in @layer components  
  or drop it.                                                     
                                                                      
  Concrete fix: a single search-replace pass on the five new files. I
  should not have introduced these.                                   
                                                                  
  2. Channel filter dropdown is now stale                             
                                          
  reporting-panels.tsx:64-67 hard-codes console / whatsapp / telegram.
   Messenger, Instagram, and email — which I just added end-to-end —  
  are invisible in the conversation filter. So an operator who wires a
   Postmark email channel can't filter for it.                        
                                                                  
  Fix: source the option list from ChannelKind (or a single exported  
  constant in lib/channels) and have both the filter and webhook copy
  share it.
                                                                      
  3. Operator channel-setup webhook hint hides v2 channels
                                                                      
  operator-panels.tsx:150-167 only renders the webhook            
  URL/instructions block when channel.kind === "whatsapp" ||          
  channel.kind === "telegram". For a freshly-created
  messenger/instagram/email channel the operator gets no instructions 
  — they have to dig in the docs to find the webhook path. Should 
  branch on all five kinds.                                           
                                                                  
  4. Channel credentials/settings are edited as raw JSON in a textarea
                                          
  operator-panels.tsx:205-210 and the matching settings textarea
  expose JSONB columns as a free-text textarea. One typo (, after the 
  last key, smart-quote paste) and the save 400s with "Invalid JSON".
  For non-engineering operators, this is hostile. Worse, secrets like 
  accessToken are rendered into the DOM as defaultValue → they appear
  in client-side React props, in browser DevTools, and in HTTP        
  responses to anyone who can view source.                        

  Fix: replace with structured fields per channel kind (the same shape
   IntegrationsPanel uses for integrations). Mask secret fields as
  type="password". Never round-trip the existing secret back to the
  client — accept blanks to mean "no change".                         
  
  5. Initial-password input is type="text"                            
                                                                  
  /operator/clients/new/page.tsx:148 says "Initial password" but
  renders type="text". The password is visible while typing, gets     
  autocomplete-saved as a generic text field, and ends up in browser
  auto-fill memory. Set type="password" + autocomplete="new-password".
                                                                  
  6. CSRF defense relies on SameSite=Lax alone                        
                                                                  
  All state-changing API routes (/api/escalations, /api/operator/*,
  /api/auth/login) read cookies and depend purely on sameSite: "lax"
  for CSRF defense. Next.js' built-in Origin/Host check only runs for
  Server Actions, not for raw API routes. SameSite=Lax is good but not
   sufficient for state-changing GETs and is missing the
  belt-and-braces Origin/Host comparison.                             
                                                                  
  What to add:
  - An Origin header check on every POST/DELETE route (reject if
  Origin's host ≠ Host header / APP_BASE_URL).                  
  - Or move mutations to Server Actions (which get this for free).
                                                                  
  Reference: Next.js Data Security guide and LogRocket's CSRF         
  deep-dive.                                  
                                                                      
  7. No error boundary, no loading boundary anywhere                  
                                                                      
  There is no error.tsx, loading.tsx, or not-found.tsx anywhere in    
  src/app. Per Next.js conventions:                                   
  - Any throw in a server component (e.g., DB transiently down, query
  failure) bubbles to the framework default page → users see a        
  stack-traceless "Application error" screen with no client context,
  and the AppShell/sidebar disappears.                                
  - No skeleton/loader during the multi-Promise.all dashboard fetches 
  (overview page makes 9 parallel queries before painting).
                                                                      
  Add at minimum:                                                 
  - src/app/error.tsx — branded error with retry button and
  Sentry/error_events ID.                                             
  - src/app/loading.tsx — skeleton matching AppShell so the sidebar
  stays.                                                              
  - src/app/not-found.tsx for notFound() calls (used in 9 routes).    
                                          
  8. confirm() for destructive operations                             
                                                                      
  integrations-panel.tsx:91 uses the browser-native confirm("Delete X 
  credential?"). That dialog:                                         
  - Cannot be styled to match the product.                        
  - Is unreachable from keyboard-only flows on some Firefox           
  configurations.                                                 
  - Is dismissed by some accessibility tools.                         
  - Can be globally disabled by the user/extensions, in which case it 
  silently returns false.                                            
                                                                      
  Replace with a proper <dialog> element or a small confirm component
  using role="alertdialog". Per the W3C ARIA APG modal pattern, the   
  native <dialog> element gives focus-trap and Escape-to-dismiss for  
  free.
                                                                      
  9. Login UI leaks seed credentials in production builds         
                                                                      
  /login/page.tsx:75-79 renders:                                  
                                                                      
  ▎ Seed credentials after pnpm db:seed:      
  ▎ operator@pronto.sg / pronto-operator                              
  ▎ owner@northbridgenasi.sg / pronto-client                      
                                                                      
  These are static literals shipped to every login page render. If the
   seed data also exists in production (or the same seeded operator   
  account exists), this is a credential disclosure. At minimum, gate  
  on process.env.NODE_ENV !== "production".                           
                                                                      
  10. Date formatting via toLocaleDateString("en-SG", …) and new      
  Date().toISOString() in server components causes hydration mismatch

  bulk-escalation-list.tsx:211 and trace page emit new                
  Date(escalation.created_at).toISOString() inside what's effectively
  a server-rendered list (the bulk list is client, but the trace page 
  is server). On hydration boundaries with server-rendered new Date() 
  (e.g., validAsOf in monthly-report page when asOfParam is absent)
  the server and client render different strings → React 18+ logs a   
  hydration warning and may discard the markup.                   

  Fix: pass an ISO string from server to client and format on mount,
  or use suppressHydrationWarning selectively.

  Medium-severity                                                     
                                          
  11. No pagination anywhere                                          
                                                                      
  Every list view uses a fixed LIMIT 20/50/75. With one client past
  pilot scale, the operator inbox silently truncates.                 
  /operator/conversations caps at 75;                             
  /operator/clients/[id]/escalations shows top 20 from                
  getOpenEscalations and that's it. Beyond that, you can't see them.
  Need cursor- or page-based pagination on:                           
  - getFilteredConversations                                      
  - getOpenEscalations                        
  - getKnowledgeGapReport                 
  - getAuditLogs (if exposed)
                                                                      
  12. No live updates                         
                                                                      
  Operator + client dashboards rely on full-page navigation to see new
   escalations/conversations. For a customer-service tool, the inbox  
  should auto-refresh. Either:
  - Polling (every 15-30s in client component using useEffect),       
  - Server-Sent Events on /api/escalations/stream (cheap, plays well
  with Next.js),                                                      
  - Or router.refresh() on a setInterval (server components re-render
  their data fetchers).                                               
                                              
  13. Accessibility surface is thin                                   
                                                                  
  Only ~13 ARIA attributes across ~60 components/buttons (grep numbers
   above). Concrete gaps:                                         
  - Decorative <ChevronDown> icons in sidebar have no aria-hidden.    
  Screen readers announce them.                                       
  - MockAiBanner has no role="status" / aria-live="polite". When mock 
  mode flips off after env change, AT users don't get notified.       
  - Form inputs use wrapping <label> but the form-level validation    
  messages are not connected via aria-describedby, and validation is
  browser-only (no consistent error rendering pattern).               
  - No skip-link to main content; sidebars are first in tab order.    
  - Focus state is the default Tailwind ring on most things, but the
  destructive bulk-resolve button has the same affordance as          
  bulk-claim. Destructive actions should be visually distinct.    
                                                                      
  Refs: Next.js accessibility docs, Vercel a11y article.              
                                                                      
  14. No security headers / CSP                                       
                                                                      
  next.config.ts is empty. There's no Content-Security-Policy, no     
  Strict-Transport-Security, no X-Frame-Options/frame-ancestors
  (clickjacking risk on the operator/client dashboards), no           
  Permissions-Policy. For a customer-service product handling PII,    
  this is below floor.
                                                                      
  Reference: Next.js Security Headers docs.                       
                                          
  15. force-dynamic on every page is wasteful 
                                                                      
  31 of 31 pages set export const dynamic = "force-dynamic". That
  defeats the React/Next.js render cache entirely. Operator dashboard,
   knowledge source detail, etc. don't need fresh data per request —
  they can use revalidate = 5 or noStore() only on the truly real-time
   bits. This is mostly a perf concern, but page latency is currently
  9 parallel DB queries on every operator load.                       
                                                                  
  16. No mobile-first thinking in dense tables
                                          
  /operator/page.tsx PortfolioMetric grid drops to sm:grid-cols-3
  which means at 640px you get a 3-column row inside a list row that's
   already inside a card → things wrap badly. The client overview's
  xl:grid-cols-[1fr_0.42fr] only kicks in at 1280px so the middle     
  tablet range looks awkward.                                     
                                                                      
  17. The integration test console returns the raw API key inside the 
  result JSON metadata in some failures   

  POST /api/operator/integrations/test returns the error from fetch if
   it includes the URL with a query-string-embedded token. Less likely
   than I feared after re-reading, but: when the underlying adapter   
  throws Calendly availability fetch failed: HTTP 401, the message    
  doesn't include the key. OK. But Messenger send failed: ${status} 
  ${body} (messenger.ts:104) returns the provider response body       
  verbatim, which Meta sometimes echoes part of the access token into.
   Sanitize before returning.

  18. Knowledge ingestion form has no file-size hint or pre-validation
                                          
  /client/knowledge lets the user upload PDFs/DOCX. There's no
  client-side size limit shown, and the server returns 413 if it      
  exceeds Next's body cap. Add a max-file-size UI hint and reject
  visibly client-side.                                                
                                                                  
  19. Sidebars are hidden below 1024px without a hamburger replacement
                                                                  
  The desktop sidebar is lg:flex only. On mobile we get a top header
  strip with the mobile nav, but it's a horizontal scroller of section
   pills — there's no client-workspace switcher, no logout button on
  operator mobile (the mobile header logout is gated to lg:hidden     
  correctly, but the menu is sparse). For someone triaging from a 
  phone (the realistic SME owner scenario), the IA collapses.         
                                                                  
  20. The escalations list in bulk-escalation-list.tsx uses fragile 
  inline <input type="checkbox"> without role/group semantics

  It looks like a multi-select but is just a list of unrelated        
  checkboxes. Should be wrapped in <ul role="listbox" 
  aria-multiselectable="true"> with each row role="option"            
  aria-selected={selected.has(id)} and arrow-key navigation, or be    
  acknowledged as a checkbox list with a <fieldset> and <legend>.
  Currently a screen reader user can't tell that "Select all" governs 
  the items below.                                                

  Lower severity / nits

  - MockAiBanner is rendered for every page (incl. login) because it's
   in the root layout. It says "Dev mock AI active" which leaks the
  deployment posture to anyone visiting the login page. Move it below
  the auth gate.                                                      
  - The bulk-action error renders the server's raw text response body.
   If a hook ever returns a stack trace, it ends up in the toast.     
  - formatWhen(value: Date | null) in /operator/page.tsx:156 calls
  value.toLocaleDateString("en-SG") server-side. Across timezones the
  date can flip; locale-fix it server-side or render in UTC           
  explicitly.
  - assistant-dock.tsx is 832 lines in a single client component. It  
  needs to be split.                                              
  - triage-flow-editor.tsx is 1454 lines and shipped client-side.     
  Bundle impact is real on the first dashboard paint.             
  - The operator client overview row uses a single nested <Link> for
  the whole card, which prevents per-cell ARIA labelling and breaks
  middle-click "open in new tab" for the metric chips (only the outer 
  card link is reachable).
  - Hardcoded "en-SG" in date formatting locks the UI even for a      
  Malaysia/Indonesia rollout the roadmap explicitly mentions.     
