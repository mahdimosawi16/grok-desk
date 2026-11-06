# Grok Desk

iPhone web app for Mahdi’s FOMO memecoin desk.

**Live data:** Supabase Realtime/REST (SELECT-only RLS). Desk box writes via `desk_write` RPC.
**Host:** GitHub Pages — static shell only; no secrets except the publishable anon key in `config.js`.

## Honesty
- Line under the name shows `LIVE · Stack $X` / `PAPER · Stack $X` (desk stack). FOMO wallet balance is **not** readable.
- Green **Run/Pause** opens Telegram `@mahdi06_desk_bot` (Pages cannot write). Desk never places orders.

## Open
https://mahdimosawi16.github.io/grok-desk/#/home
