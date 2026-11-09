# Wallio launch video script

**Total: 4:15**

Every line below has been checked against the code and the live deployment (8 Nov 2026). The
changes from the first draft, and why, are at the end.

| Who | Parts | Time |
|---|---|---|
| **Abhi** (on camera) | Opening, listener in the skit, the answer and trying it, callback | ~1:27 |
| **Adhvik** (on camera) | The problem, "This is Wallio", pitcher in the skit, containment, callback | ~1:27 |
| **Anish** (voice-over only) | The app in depth, Vultr, tagline | ~1:23 |

---

**0:00–0:28** · **Abhi**

It all started with one AI tool.

Then ten.

Then a hundred.

Now there's a new AI tool every morning.

*(on screen)* Which AI tools are you actually using?

---

**0:28–0:55** · **Adhvik**

We collect AI subscriptions like streaming services. One for writing. One for code. Twenty dollars each. And a free trial we forgot to cancel.

Then a new AI tool launches. And you wonder, is it better than the one I pay for?

To find out, you open twenty tabs. And you lose the afternoon.

*(on screen)* We have wallets for our money. Nothing for our AI.

---

**0:55–1:05** · **Adhvik** · *outside*

So we built one.

This is Wallio. A wallet for your AI.

---

**1:05–1:25** · *skit: match cut to the office, same person, same pose*

**Adhvik (pitcher):** It tells you what to keep, what to try, and what to—

**Abhi (listener):** *(hand up)* Wait, wait, wait. I don't need another Ramp or Datadog that takes hours to set up.

**Adhvik (pitcher):** Nothing to set up. Tell it what you pay for, and it does the rest.

**Abhi (listener):** *(beat)* ...Okay. Show me.

---

**1:25–1:50** · **Anish (VO)** · *match cut back outside, then into the app (onboarding, then Home)*

First, tell Wallio the tools you pay for. The plan, the price, when it renews.

Wallio adds it up, and shows you what renews next.

Point it at a public GitHub repo, and it learns how you work.

Every guess is marked as a guess. Nothing counts until you say yes.

---

**1:50–2:02** · **Anish (VO)** · *Compare page*

Curious about a new tool? Wallio compares it with the one you pay for.

Every claim cites its source. If it can't cite one, it doesn't say it.

And it tells you what it couldn't find out.

---

**2:02–2:22** · **Anish (VO)** · *Compare page, live run*

Then it checks for itself.

A real browser, running on Vultr, reads only each tool's official pages. It saves a screenshot of every page it reads.

Then it runs a real coding test in the sandbox. A Vultr model fixes a bug, and the browser checks the fix.

Every screenshot is a receipt.

---

**2:22–2:35** · **Abhi**

Then you get a clear answer. Keep it, try the new one, or replace it after a test.

Sometimes the answer is to keep what you have. Wallio tells you that too.

And if your plan renews soon, it tells you to decide before it does.

---

**2:35–3:00** · **Abhi** · *signup cards (keep the "Runner sample" tag in shot), then the trial request*

Ready to try it? Wallio gets the signup ready.

It fills in what it safely can. Never your password. Never your card.

And it stops where only you can finish: signing in, paying, the link in your email.

You watch it happen, live. And you make the final click.

---

**3:00–3:30** · **Adhvik** · *Compare page, "Run the containment test"*

Of course, an agent that browses for you needs a short leash.

Every browser session gets its own sandbox on Vultr.

Three minutes. Twenty actions. Official sites only.

Then the sandbox is destroyed, and we check that it's gone.

Watch. This page tries to break into our private network. Three clicks, refused. Nine hidden requests, blocked. Our tripwire never fires.

And nothing is ever submitted without you. You approve it once. Try it twice, and it's refused.

*(on screen)* Blast radius: zero.

---

**3:30–3:50** · **Anish (VO)**

All of Wallio runs on Vultr. We built it for the Vultr Agent Rush.

Our app runs on Vultr Cloud Compute.

Every AI call goes through Vultr Serverless Inference.

And the browser lives on its own Vultr machine, reachable only over a private network.

Vultr doesn't just host Wallio. It's where every run is contained.

---

**3:50–3:55** · *skit payoff: back in the office*

**Abhi (listener):** *(leans forward)* ...Okay. Where do I sign up?

---

**3:55–4:05**

**Abhi:** I'm Abhi. I designed and built the app.

**Anish (VO):** I'm Anish. I built the backend and the AI.

**Adhvik:** I'm Adhvik. I built the browser, and its leash.

---

**4:05–4:15**

**Abhi:** It started with one AI tool. Then ten. Then a hundred.

**Adhvik:** You don't need all of them. Just the right ones.

**Anish (VO):** Wallio. Your AI, accounted for.

---

## What changed from the first draft, and why

| Draft line | Changed to | Why (where in the code) |
|---|---|---|
| "You connect what you already use" / "connect the tools you already use" | "Tell it what you pay for" | There is no connections API; the panel is hidden (`web/src/components/my-ai/my-ai-view.tsx`). Tools are entered in onboarding or My AI. |
| "It watches how much you actually use them. Your messages. Your tokens." | Removed | Wallio doesn't track usage, and the app says so (`web/src/components/home/stack-panel.tsx`). |
| "Paying for the top plan but barely using it? … a cheaper plan is enough" | Removed | Depends on usage tracking, which doesn't exist. |
| "It spots the tools that do the same job" | Removed | Overlap only appears in sample data; live Home sets it to null (`home-live.tsx`). |
| "Wallio learns what you pay, and when it renews" | "Tell Wallio … Wallio adds it up, and shows you what renews next" | You enter price and renewal; the API totals them and lists upcoming renewals (`GET /api/inventory`). |
| "It learns how you work. If it's not sure, it asks you." | "Point it at a public GitHub repo … Nothing counts until you say yes" | Inferred facts come from a public repo, each with a source and confidence, and you keep or remove each one (`web/src/lib/onboarding.ts`). |
| "It finds tools that fit … Not the ones that paid to be on a list. Each one tells you why it fits." | "Wallio compares it … Every claim cites its source" | Discover is sample data (labelled in the app). Live comparisons reject uncited statements and list what's missing. |
| "Pick one, and Wallio tests it for you … It runs your actual task" | "Reads only each tool's official pages … A Vultr model fixes a bug, and the browser checks the fix" | The owned test is Wallio's sample bug fixed by a Vultr model. It does not test the commercial product or the user's code (`packages/api/src/eval/harness.ts`). |
| "You can watch the whole thing back. Every recording is a receipt." | "It saves a screenshot of every page it reads. Every screenshot is a receipt." | There is no video recording; each page read is stored as evidence with a text hash and a screenshot. |
| "Keep, try, or switch" | "Keep it, try the new one, or replace it after a test" | The app's actions are Keep, Try, Replace after a test, Compare further, Review the renewal (`live-panels.tsx`). |
| "When prices change later, it only pings you if it matters" | "If your plan renews soon, it tells you to decide before it does" | There is no price monitoring. Review-the-renewal is a real recommendation (`packages/api/src/domain/recommend.ts`). |
| "It signs you up … It cancels the old one … moves your prompts, your settings and your files" | "Gets the signup ready … stops where only you can finish" | Wallio never signs up, cancels or migrates. The signup flow is a labelled runner sample that stops at sign-in, payment and email checks; the live submit is Wallio's own trial form, approval-gated. |
| "You can stop it anytime" | Removed | The API can cancel a run (`POST /api/runs/:id/cancel`), but no button in the app calls it yet. |
| "Every run gets its own sandbox" | "Every browser session gets its own sandbox" | One sandbox per purpose: a comparison uses three, one after another. |
| "Three tries. Three blocks." | "Three clicks, refused. Nine hidden requests, blocked. Our tripwire never fires." | Every live rehearsal: 3 refused by API policy, 9 denied by the proxy, sentinel at 0 (`docs/RUNNER_TEST_REPORT.md`). |
| "Sealed off from everything else" / "keeps every run fast, private and safe" | "Reachable only over a private network" / "It's where every run is contained" | The runner is reached over the Vultr VPC with a pinned certificate and token; the closing line now makes no speed claim. |

Unchanged and verified: the 3-minute and 20-action limits (`packages/contracts/src/runner.ts`), official sites only (per-tool allowlists), sandbox teardown with a verified check, the approve-once replay refusal (409), every AI call through Vultr Serverless Inference (`packages/api/src/inference/config.ts` refuses any other URL), and the browser on its own Vultr VM.
